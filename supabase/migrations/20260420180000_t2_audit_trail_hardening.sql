-- =============================================================================
-- T2 · Audit trail hardening (CDSCO Class B SaMD / IEC 62304 §5.8 / DPDP 2023)
--
-- Scope:
--   1. Extend public.audit_logs with regulatory fields (actor snapshot,
--      before/after state, request correlation, tamper-evidence hash chain).
--   2. Make audit_logs append-only: INSERT allowed, UPDATE/DELETE/TRUNCATE
--      blocked at the trigger level (service_role bypasses RLS but NOT
--      triggers).
--   3. Auto-audit every mutation on eight regulated tables:
--         studies, ai_drafts, wallet_transactions, reports, study_reports,
--         review_events, user_roles, clinic_memberships
--      via AFTER INSERT OR UPDATE OR DELETE triggers that call a single
--      SECURITY DEFINER helper function.
--
-- Non-goals:
--   - We do not remove the existing admin-only SELECT policy on audit_logs.
--   - We do not migrate existing rows. All new columns are NULLABLE, so the
--     historical rows keep working unchanged.
--   - We do not audit: profiles, notes, study_files, support_tickets,
--     tfa_secrets (latter is sensitive; auditing contents would leak secrets).
-- =============================================================================

-- ── 1. Extend audit_logs with regulatory fields ──────────────────────────────
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS actor_email   text,
  ADD COLUMN IF NOT EXISTS actor_role    text,
  ADD COLUMN IF NOT EXISTS action        text,
  ADD COLUMN IF NOT EXISTS resource_type text,
  ADD COLUMN IF NOT EXISTS resource_id   text,
  ADD COLUMN IF NOT EXISTS before_state  jsonb,
  ADD COLUMN IF NOT EXISTS after_state   jsonb,
  ADD COLUMN IF NOT EXISTS request_id    text,
  ADD COLUMN IF NOT EXISTS session_id    text,
  ADD COLUMN IF NOT EXISTS db_role       text,
  ADD COLUMN IF NOT EXISTS hash_prev     text,
  ADD COLUMN IF NOT EXISTS hash_self     text;

COMMENT ON TABLE public.audit_logs IS
  'IEC 62304 §5.8 append-only audit trail. Mutation blocked by trigger. Regulatory-grade.';
COMMENT ON COLUMN public.audit_logs.actor_email IS
  'Email snapshot of actor at time of event (denormalized for audit stability)';
COMMENT ON COLUMN public.audit_logs.actor_role IS
  'Role snapshot of actor at time of event (super_admin | management | neurologist | clinician | ...)';
COMMENT ON COLUMN public.audit_logs.action IS
  'Categorical action: INSERT | UPDATE | DELETE | LOGIN | LOGOUT | EXPORT | ACCESS | ...';
COMMENT ON COLUMN public.audit_logs.resource_type IS
  'Table or entity name affected (studies | ai_drafts | wallet_transactions | ...)';
COMMENT ON COLUMN public.audit_logs.resource_id IS
  'Stringified PK of affected row (uuid::text); NULL for non-row events like LOGIN';
COMMENT ON COLUMN public.audit_logs.before_state IS
  'Row state before change (NULL on INSERT)';
COMMENT ON COLUMN public.audit_logs.after_state IS
  'Row state after change (NULL on DELETE)';
COMMENT ON COLUMN public.audit_logs.request_id IS
  'Correlation ID propagated from API request headers';
COMMENT ON COLUMN public.audit_logs.db_role IS
  'Postgres role that executed the mutation (current_user at trigger time)';

-- Useful lookup indexes for audit queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource
  ON public.audit_logs (resource_type, resource_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_created
  ON public.audit_logs (user_id, created_at DESC);


-- ── 2. Make audit_logs append-only ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.audit_logs_block_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'audit_logs is append-only (IEC 62304 §5.8). % on this table is forbidden.', TG_OP
    USING HINT = 'Insert a new row; never mutate history.',
          ERRCODE = 'insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS audit_logs_block_update ON public.audit_logs;
CREATE TRIGGER audit_logs_block_update
  BEFORE UPDATE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.audit_logs_block_mutation();

DROP TRIGGER IF EXISTS audit_logs_block_delete ON public.audit_logs;
CREATE TRIGGER audit_logs_block_delete
  BEFORE DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.audit_logs_block_mutation();

DROP TRIGGER IF EXISTS audit_logs_block_truncate ON public.audit_logs;
CREATE TRIGGER audit_logs_block_truncate
  BEFORE TRUNCATE ON public.audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION public.audit_logs_block_mutation();


-- ── 3. Central audit-emitter helper function ─────────────────────────────────
-- SECURITY DEFINER: runs with owner privileges so it can insert into
-- audit_logs even when the triggering role has no direct INSERT grant.
-- search_path is pinned to public/pg_temp to neutralise search-path attacks.
CREATE OR REPLACE FUNCTION public.tg_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_action        text;
  v_before        jsonb;
  v_after         jsonb;
  v_resource_id   text;
  v_actor_id      uuid;
  v_actor_email   text;
  v_request_id    text;
BEGIN
  -- auth.uid() returns NULL for service_role / trigger-from-cron paths.
  BEGIN
    v_actor_id := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_actor_id := NULL;
  END;

  BEGIN
    v_actor_email := auth.email();
  EXCEPTION WHEN OTHERS THEN
    v_actor_email := NULL;
  END;

  -- Optional correlation header surfaced via request.jwt.claim pattern or a
  -- custom GUC (app.request_id). Callers can `SET LOCAL app.request_id = ...`.
  BEGIN
    v_request_id := current_setting('app.request_id', true);
  EXCEPTION WHEN OTHERS THEN
    v_request_id := NULL;
  END;

  IF TG_OP = 'INSERT' THEN
    v_action      := 'INSERT';
    v_before      := NULL;
    v_after       := to_jsonb(NEW);
    v_resource_id := (NEW.id)::text;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action      := 'UPDATE';
    v_before      := to_jsonb(OLD);
    v_after       := to_jsonb(NEW);
    v_resource_id := (NEW.id)::text;
  ELSIF TG_OP = 'DELETE' THEN
    v_action      := 'DELETE';
    v_before      := to_jsonb(OLD);
    v_after       := NULL;
    v_resource_id := (OLD.id)::text;
  END IF;

  INSERT INTO public.audit_logs (
    user_id,
    actor_email,
    event_type,
    event_data,
    action,
    resource_type,
    resource_id,
    before_state,
    after_state,
    request_id,
    db_role
  ) VALUES (
    v_actor_id,
    v_actor_email,
    TG_TABLE_NAME || '.' || lower(v_action),
    jsonb_build_object(
      'schema', TG_TABLE_SCHEMA,
      'table',  TG_TABLE_NAME,
      'op',     TG_OP
    ),
    v_action,
    TG_TABLE_NAME,
    v_resource_id,
    v_before,
    v_after,
    v_request_id,
    current_user
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;


-- ── 4. Attach triggers to regulated tables ───────────────────────────────────
-- Each trigger is DROP-then-CREATE so this migration is idempotent.

DO $$
DECLARE
  v_table text;
  v_tables text[] := ARRAY[
    'studies',
    'ai_drafts',
    'wallet_transactions',
    'reports',
    'study_reports',
    'review_events',
    'user_roles',
    'clinic_memberships'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS audit_%1$s_trg ON public.%1$I;', v_table
    );
    EXECUTE format(
      'CREATE TRIGGER audit_%1$s_trg
         AFTER INSERT OR UPDATE OR DELETE ON public.%1$I
         FOR EACH ROW EXECUTE FUNCTION public.tg_audit_mutation();', v_table
    );
  END LOOP;
END
$$;


-- ── 5. Smoke assertion: confirm blocker raises on UPDATE ─────────────────────
-- Insert a canary row, then attempt to mutate it. If the mutation succeeds
-- the migration fails loud. The canary row is preserved as part of the
-- audit trail (audit_logs is intentionally non-retractable).
DO $$
DECLARE
  v_err_caught boolean := false;
BEGIN
  INSERT INTO public.audit_logs (event_type, event_data, action, resource_type)
  VALUES ('t2.smoke', jsonb_build_object('note','migration canary'),
          'INSERT', 'audit_logs_smoke');

  BEGIN
    UPDATE public.audit_logs
       SET event_type = 't2.smoke.mutated'
     WHERE event_type = 't2.smoke';
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_err_caught := true;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION
      'T2 smoke failed: expected insufficient_privilege on UPDATE of audit_logs.';
  END IF;

  RAISE NOTICE 'T2 audit-hardening smoke passed: UPDATE blocked as expected.';
END
$$;
