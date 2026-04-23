-- =============================================================================
-- 20260423030000_collapse_role_enum.sql
--
-- GOAL: `app_role` should have exactly three values and nothing else:
--   super_admin, management, clinician.
--
-- Pre-migration state (verified against prod Supabase):
--   pg_enum labels:   neurologist, clinic_admin, ops, super_admin, management, clinician
--   user_roles rows:  clinician=2, management=2, super_admin=1
--   profiles.role:    clinician=2, management=2, neurologist=1
--   clinic_memberships.role: clinician=2 (already clean)
--   46 policies + 3 functions + 10 admin_* functions + 1 view depend on app_role
--
-- Strategy (tested against prod; executed cleanly 2026-04-23):
--   1. Normalize text-column data ('neurologist'/'clinic_admin'/'ops' → 'clinician')
--   2. Tighten CHECK constraints on profiles.role + clinic_memberships.role
--   3. Rewrite 10 admin_* SQL functions that hand-cast 'ops'::app_role — the
--      runtime cast would fail once 'ops' is gone from the enum, even though
--      pg_depend doesn't flag those functions.
--   4. Drop the user_clinic_context view (it pins 'neurologist'::app_role)
--   5. Drop all 46 policies + 3 functions that have a hard catalog dependency
--      on the app_role type (enumerated via pg_depend).
--   6. Swap the enum: CREATE TYPE app_role_new AS ENUM(3 values), ALTER COLUMN
--      on user_roles, DROP old TYPE, RENAME new → app_role.
--   7. Recreate has_role / admin_grant_role / admin_revoke_role, then recreate
--      all 46 policies (two of them — profiles_admin_view, studies_select —
--      with 'ops'::app_role scrubbed from their role arrays).
--   8. Recreate user_clinic_context gated to role='clinician' only.
--   9. Sanity-check: fail if pg_enum for app_role isn't exactly the 3 survivors.
--
-- The policy/function DDL in the recreate section was generated from
-- pg_get_functiondef + pg_policies via /tmp/collapse_enum_gen.py to avoid
-- hand-writing 50+ statements. If this migration ever needs to be replayed
-- and the dependency surface has drifted, regenerate with that script.
-- =============================================================================

BEGIN;

-- ── 1. Normalize data ─────────────────────────────────────────────────────
UPDATE profiles
   SET role = 'clinician'
 WHERE role IN ('neurologist', 'clinic_admin', 'ops');

UPDATE clinic_memberships
   SET role = 'clinician'
 WHERE role IN ('neurologist', 'clinic_admin', 'ops', 'admin');

ALTER TABLE public.clinic_memberships
  DROP CONSTRAINT IF EXISTS clinic_memberships_role_check;
ALTER TABLE public.clinic_memberships
  ADD  CONSTRAINT clinic_memberships_role_check
  CHECK (role = 'clinician');

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD  CONSTRAINT profiles_role_check
  CHECK (role IN ('super_admin', 'management', 'clinician'));


-- ── 2. Rewrite admin_* functions that hand-cast 'ops'::app_role ───────────
-- Each function previously required super_admin OR ops OR management. Ops is
-- being retired, so the guard becomes super_admin OR management.

CREATE OR REPLACE FUNCTION public.admin_delete_clinic(p_clinic_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE v_clinic_name text;
BEGIN
  IF NOT (has_role(auth.uid(), 'super_admin'::app_role)
          OR has_role(auth.uid(), 'management'::app_role)) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  SELECT name INTO v_clinic_name FROM clinics WHERE id = p_clinic_id;
  IF v_clinic_name IS NULL THEN RAISE EXCEPTION 'Clinic not found'; END IF;

  DELETE FROM study_files        WHERE study_id IN (SELECT id FROM studies WHERE clinic_id = p_clinic_id);
  DELETE FROM studies            WHERE clinic_id = p_clinic_id;
  DELETE FROM clinic_memberships WHERE clinic_id = p_clinic_id;
  DELETE FROM user_roles         WHERE clinic_id = p_clinic_id;
  DELETE FROM clinics            WHERE id = p_clinic_id;

  INSERT INTO audit_logs (user_id, event_type, event_data)
  VALUES (auth.uid(), 'clinic_deleted',
          jsonb_build_object('clinic_id', p_clinic_id, 'clinic_name', v_clinic_name));
  RETURN jsonb_build_object('success', true);
END;
$fn$;


CREATE OR REPLACE FUNCTION public.admin_delete_test_files(p_file_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE v_deleted_count integer := 0; v_file_paths text[];
BEGIN
  IF NOT (has_role(auth.uid(), 'super_admin'::app_role)
          OR has_role(auth.uid(), 'management'::app_role)) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;
  SELECT array_agg(path) INTO v_file_paths FROM study_files WHERE id = ANY(p_file_ids);
  DELETE FROM study_files WHERE id = ANY(p_file_ids);
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  INSERT INTO audit_logs (user_id, event_type, event_data)
  VALUES (auth.uid(), 'cleanup_deleted_files',
          jsonb_build_object('file_ids', p_file_ids, 'file_paths', v_file_paths,
                             'deleted_count', v_deleted_count));
  RETURN jsonb_build_object('success', true, 'deleted_count', v_deleted_count);
END;
$fn$;


CREATE OR REPLACE FUNCTION public.admin_get_all_clinics()
RETURNS TABLE(id uuid, name text, city text, is_active boolean, created_at timestamptz,
              study_count bigint, member_count bigint, sku text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  IF NOT (has_role(auth.uid(), 'super_admin'::app_role)
          OR has_role(auth.uid(), 'management'::app_role)) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;
  RETURN QUERY
  SELECT c.id, c.name, c.city, c.is_active, c.created_at,
         (SELECT COUNT(*) FROM studies s WHERE s.clinic_id = c.id)              AS study_count,
         (SELECT COUNT(*) FROM clinic_memberships cm WHERE cm.clinic_id = c.id) AS member_count,
         c.sku
  FROM clinics c
  ORDER BY c.created_at DESC;
END;
$fn$;


CREATE OR REPLACE FUNCTION public.admin_get_all_studies()
RETURNS SETOF studies LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  IF NOT (has_role(auth.uid(), 'super_admin'::app_role)
          OR has_role(auth.uid(), 'management'::app_role)) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;
  RETURN QUERY SELECT * FROM studies ORDER BY created_at DESC;
END;
$fn$;


CREATE OR REPLACE FUNCTION public.admin_get_dashboard_stats()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE v_stats jsonb;
BEGIN
  IF NOT (has_role(auth.uid(), 'super_admin'::app_role)
          OR has_role(auth.uid(), 'management'::app_role)) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;
  SELECT jsonb_build_object(
    'total_clinics',          (SELECT COUNT(*) FROM clinics),
    'total_studies',          (SELECT COUNT(*) FROM studies),
    'studies_by_state',       (SELECT jsonb_object_agg(COALESCE(state, 'unknown'), cnt)
                               FROM (SELECT state, COUNT(*) cnt FROM studies GROUP BY state) sub),
    'total_tokens_sold',      (SELECT COALESCE(SUM(credits_purchased), 0) FROM payments WHERE status = 'captured'),
    'total_tokens_consumed',  (SELECT COALESCE(SUM(c.amount_inr / 200), 0) FROM commissions c),
    'active_users',           (SELECT COUNT(DISTINCT w.user_id)
                               FROM wallets w
                               WHERE w.updated_at > NOW() - INTERVAL '30 days'
                                 AND NOT EXISTS (SELECT 1 FROM user_roles ur
                                                 WHERE ur.user_id = w.user_id
                                                   AND ur.role = 'super_admin'::app_role))
  ) INTO v_stats;
  RETURN v_stats;
END;
$fn$;


CREATE OR REPLACE FUNCTION public.admin_get_recent_audit_logs(p_limit integer DEFAULT 50)
RETURNS TABLE(id uuid, actor_id uuid, actor_email text, event_type text,
              event_data jsonb, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  IF NOT (has_role(auth.uid(), 'super_admin'::app_role)
          OR has_role(auth.uid(), 'management'::app_role)) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;
  IF has_role(auth.uid(), 'super_admin'::app_role) THEN
    RETURN QUERY
    SELECT al.id, al.user_id AS actor_id, p.email AS actor_email,
           al.event_type, al.event_data, al.created_at
    FROM audit_logs al LEFT JOIN profiles p ON p.id = al.user_id
    ORDER BY al.created_at DESC LIMIT p_limit;
  ELSE
    RETURN QUERY
    SELECT al.id, al.user_id AS actor_id, p.email AS actor_email,
           al.event_type, al.event_data, al.created_at
    FROM audit_logs al LEFT JOIN profiles p ON p.id = al.user_id
    WHERE NOT EXISTS (SELECT 1 FROM user_roles ur
                      WHERE ur.user_id = al.user_id AND ur.role = 'super_admin'::app_role)
      AND NOT (al.event_data->>'target_user_id' IS NOT NULL
               AND EXISTS (SELECT 1 FROM user_roles ur
                           WHERE ur.user_id = (al.event_data->>'target_user_id')::uuid
                             AND ur.role = 'super_admin'::app_role))
    ORDER BY al.created_at DESC LIMIT p_limit;
  END IF;
END;
$fn$;


CREATE OR REPLACE FUNCTION public.admin_log_event(p_study_id uuid, p_event text,
                                                  p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  IF NOT (has_role(auth.uid(), 'super_admin'::app_role)
          OR has_role(auth.uid(), 'management'::app_role)) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;
  INSERT INTO review_events (study_id, actor, event, payload)
  VALUES (p_study_id, auth.uid(), p_event, p_payload);
  RETURN jsonb_build_object('success', true);
END;
$fn$;


CREATE OR REPLACE FUNCTION public.admin_scan_test_files()
RETURNS TABLE(file_id uuid, study_id uuid, file_path text, file_kind text,
              clinic_name text, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  IF NOT (has_role(auth.uid(), 'super_admin'::app_role)
          OR has_role(auth.uid(), 'management'::app_role)) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;
  RETURN QUERY
  SELECT sf.id AS file_id, sf.study_id, sf.path AS file_path, sf.kind AS file_kind,
         c.name AS clinic_name, sf.created_at
  FROM study_files sf
  JOIN studies s ON s.id = sf.study_id
  JOIN clinics c ON c.id = s.clinic_id
  WHERE lower(sf.path) LIKE '%sample%'
     OR lower(sf.path) LIKE '%demo%'
     OR lower(sf.path) LIKE '%test%'
     OR lower(sf.path) LIKE '%example%'
     OR s.sample = true
  ORDER BY sf.created_at DESC;
END;
$fn$;


CREATE OR REPLACE FUNCTION public.admin_update_study(p_study_id uuid, p_updates jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  IF NOT (has_role(auth.uid(), 'super_admin'::app_role)
          OR has_role(auth.uid(), 'management'::app_role)) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;
  UPDATE studies
     SET report_locked = COALESCE((p_updates->>'report_locked')::boolean, report_locked),
         state         = COALESCE(p_updates->>'state', state),
         sla           = COALESCE(p_updates->>'sla', sla)
   WHERE id = p_study_id;
  INSERT INTO audit_logs (user_id, event_type, event_data)
  VALUES (auth.uid(), 'admin_study_update',
          jsonb_build_object('study_id', p_study_id, 'updates', p_updates));
  RETURN jsonb_build_object('success', true);
END;
$fn$;


CREATE OR REPLACE FUNCTION public.admin_update_ticket_status(p_ticket_id uuid, p_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  IF NOT (has_role(auth.uid(), 'super_admin'::app_role)
          OR has_role(auth.uid(), 'management'::app_role)) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;
  IF p_status NOT IN ('open', 'in_progress', 'resolved', 'closed') THEN
    RAISE EXCEPTION 'Invalid status: must be open, in_progress, resolved, or closed';
  END IF;
  UPDATE support_tickets
     SET status = p_status, updated_at = NOW()
   WHERE id = p_ticket_id;
  INSERT INTO audit_logs (user_id, event_type, event_data)
  VALUES (auth.uid(), 'admin_ticket_update',
          jsonb_build_object('ticket_id', p_ticket_id, 'new_status', p_status));
  RETURN jsonb_build_object('success', true, 'status', p_status);
END;
$fn$;


-- 1. Drop the view that pins the old enum labels
DROP VIEW IF EXISTS public.user_clinic_context;

-- 2. Drop all policies + functions that depend on app_role
DROP POLICY IF EXISTS "drafts_scope" ON "public"."ai_drafts";
DROP POLICY IF EXISTS "audit_logs_admin_only" ON "public"."audit_logs";
DROP POLICY IF EXISTS "canonical_eeg_delete" ON "public"."canonical_eeg_records";
DROP POLICY IF EXISTS "canonical_eeg_insert" ON "public"."canonical_eeg_records";
DROP POLICY IF EXISTS "canonical_eeg_scope" ON "public"."canonical_eeg_records";
DROP POLICY IF EXISTS "canonical_eeg_update" ON "public"."canonical_eeg_records";
DROP POLICY IF EXISTS "cm_admin_delete" ON "public"."clinic_memberships";
DROP POLICY IF EXISTS "cm_admin_insert" ON "public"."clinic_memberships";
DROP POLICY IF EXISTS "cm_admin_update" ON "public"."clinic_memberships";
DROP POLICY IF EXISTS "cm_admin_view" ON "public"."clinic_memberships";
DROP POLICY IF EXISTS "admin_full_access_clinics" ON "public"."clinics";
DROP POLICY IF EXISTS "clinics_scope" ON "public"."clinics";
DROP POLICY IF EXISTS "markers_scope" ON "public"."eeg_markers";
DROP POLICY IF EXISTS "payments_scope" ON "public"."payments";
DROP POLICY IF EXISTS "Admins can insert platform settings" ON "public"."platform_settings";
DROP POLICY IF EXISTS "Admins can read platform settings" ON "public"."platform_settings";
DROP POLICY IF EXISTS "Admins can update platform settings" ON "public"."platform_settings";
DROP POLICY IF EXISTS "profiles_admin_view" ON "public"."profiles";
DROP POLICY IF EXISTS "report_attachments_own_clinic" ON "public"."report_attachments";
DROP POLICY IF EXISTS "Allow admins to manage templates" ON "public"."report_templates";
DROP POLICY IF EXISTS "reports_scope" ON "public"."reports";
DROP POLICY IF EXISTS "events_scope" ON "public"."review_events";
DROP POLICY IF EXISTS "admin_health_logs_read" ON "public"."service_health_logs";
DROP POLICY IF EXISTS "admin_health_logs_update" ON "public"."service_health_logs";
DROP POLICY IF EXISTS "admin_health_logs_write" ON "public"."service_health_logs";
DROP POLICY IF EXISTS "lifecycle_policies_admin_only" ON "public"."storage_lifecycle_policies";
DROP POLICY IF EXISTS "admin_full_access_studies" ON "public"."studies";
DROP POLICY IF EXISTS "studies_select" ON "public"."studies";
DROP POLICY IF EXISTS "studies_select_authenticated" ON "public"."studies";
DROP POLICY IF EXISTS "studies_update" ON "public"."studies";
DROP POLICY IF EXISTS "files_delete_admin" ON "public"."study_files";
DROP POLICY IF EXISTS "files_insert" ON "public"."study_files";
DROP POLICY IF EXISTS "files_scope" ON "public"."study_files";
DROP POLICY IF EXISTS "files_update_admin" ON "public"."study_files";
DROP POLICY IF EXISTS "admin_study_reports_all" ON "public"."study_reports";
DROP POLICY IF EXISTS "support_tickets_admin_select" ON "public"."support_tickets";
DROP POLICY IF EXISTS "support_tickets_admin_update" ON "public"."support_tickets";
DROP POLICY IF EXISTS "tfa_secrets_admin_reset_only" ON "public"."tfa_secrets";
DROP POLICY IF EXISTS "Admins can manage roles" ON "public"."user_roles";
DROP POLICY IF EXISTS "Admins can view all user roles" ON "public"."user_roles";
DROP POLICY IF EXISTS "Users can view own roles" ON "public"."user_roles";
DROP POLICY IF EXISTS "Admins can insert transactions" ON "public"."wallet_transactions";
DROP POLICY IF EXISTS "Admins can view all transactions" ON "public"."wallet_transactions";
DROP POLICY IF EXISTS "admin_wallet_adjust" ON "public"."wallets";
DROP POLICY IF EXISTS "wallet_update" ON "public"."wallets";
DROP POLICY IF EXISTS "wallets_admin_update" ON "public"."wallets";
DROP FUNCTION IF EXISTS public.admin_grant_role(p_user_id uuid, p_role app_role, p_clinic_id uuid);
DROP FUNCTION IF EXISTS public.admin_revoke_role(p_user_id uuid, p_role app_role);
DROP FUNCTION IF EXISTS public.has_role(_user_id uuid, _role app_role);

-- 3. Swap the enum
CREATE TYPE public.app_role_new AS ENUM ('super_admin', 'management', 'clinician');

ALTER TABLE public.user_roles
  ALTER COLUMN role TYPE public.app_role_new
  USING role::text::public.app_role_new;

DROP TYPE public.app_role;
ALTER TYPE public.app_role_new RENAME TO app_role;

-- 4. Recreate all dependent objects against the new 3-value enum
CREATE OR REPLACE FUNCTION public.admin_grant_role(p_user_id uuid, p_role app_role, p_clinic_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_caller_id uuid;
BEGIN
  v_caller_id := auth.uid();
  IF NOT (has_role(v_caller_id, 'super_admin'::app_role) OR has_role(v_caller_id, 'management'::app_role)) THEN RAISE EXCEPTION 'Forbidden: Admin access required'; END IF;
  IF has_role(v_caller_id, 'management'::app_role) AND NOT has_role(v_caller_id, 'super_admin'::app_role) THEN
    IF p_role IN ('management'::app_role, 'super_admin'::app_role) THEN RAISE EXCEPTION 'Management users cannot grant system-level roles'; END IF;
  END IF;
  INSERT INTO user_roles (user_id, role, clinic_id) VALUES (p_user_id, p_role, p_clinic_id) ON CONFLICT (user_id, role) DO NOTHING;
  INSERT INTO audit_logs (user_id, event_type, event_data) VALUES (v_caller_id, 'role_granted', jsonb_build_object('target_user', p_user_id, 'role', p_role::text, 'clinic_id', p_clinic_id));
  RETURN jsonb_build_object('success', true);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.admin_revoke_role(p_user_id uuid, p_role app_role)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role)) THEN RAISE EXCEPTION 'Unauthorized: Admin access required'; END IF;
  IF p_user_id = auth.uid() AND p_role = 'super_admin'::app_role THEN RAISE EXCEPTION 'Cannot revoke your own super_admin role'; END IF;
  IF has_role(auth.uid(), 'management'::app_role) AND NOT has_role(auth.uid(), 'super_admin'::app_role) AND (p_role = 'management'::app_role OR p_role = 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Management users cannot revoke management or super_admin roles';
  END IF;
  DELETE FROM user_roles WHERE user_id = p_user_id AND role = p_role;
  INSERT INTO audit_logs (user_id, event_type, event_data) VALUES (auth.uid(), 'admin_role_revoked', jsonb_build_object('target_user_id', p_user_id, 'role', p_role));
  RETURN jsonb_build_object('success', true);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$function$
;
CREATE POLICY "drafts_scope"
  ON "public"."ai_drafts"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM studies s
  WHERE s.id = ai_drafts.study_id AND ((EXISTS ( SELECT 1
           FROM clinic_memberships cm
          WHERE cm.user_id = auth.uid() AND cm.clinic_id = s.clinic_id)) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role)))));
CREATE POLICY "audit_logs_admin_only"
  ON "public"."audit_logs"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role));
CREATE POLICY "canonical_eeg_delete"
  ON "public"."canonical_eeg_records"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role));
CREATE POLICY "canonical_eeg_insert"
  ON "public"."canonical_eeg_records"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM studies s
  WHERE s.id = canonical_eeg_records.study_id AND (s.owner = auth.uid() OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role)))));
CREATE POLICY "canonical_eeg_scope"
  ON "public"."canonical_eeg_records"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM studies s
  WHERE s.id = canonical_eeg_records.study_id AND (s.sample = true OR s.owner = auth.uid() OR (EXISTS ( SELECT 1
           FROM clinic_memberships cm
          WHERE cm.user_id = auth.uid() AND cm.clinic_id = s.clinic_id)) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role)))));
CREATE POLICY "canonical_eeg_update"
  ON "public"."canonical_eeg_records"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM studies s
  WHERE s.id = canonical_eeg_records.study_id AND (s.owner = auth.uid() OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role)))));
CREATE POLICY "cm_admin_delete"
  ON "public"."clinic_memberships"
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role));
CREATE POLICY "cm_admin_insert"
  ON "public"."clinic_memberships"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role));
CREATE POLICY "cm_admin_update"
  ON "public"."clinic_memberships"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role));
CREATE POLICY "cm_admin_view"
  ON "public"."clinic_memberships"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role));
CREATE POLICY "admin_full_access_clinics"
  ON "public"."clinics"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role));
CREATE POLICY "clinics_scope"
  ON "public"."clinics"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM clinic_memberships cm
  WHERE cm.user_id = auth.uid() AND cm.clinic_id = clinics.id)) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role));
CREATE POLICY "markers_scope"
  ON "public"."eeg_markers"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM studies s
  WHERE s.id = eeg_markers.study_id AND (s.sample = true OR s.owner = auth.uid() OR (EXISTS ( SELECT 1
           FROM clinic_memberships cm
          WHERE cm.user_id = auth.uid() AND cm.clinic_id = s.clinic_id)) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role)))));
CREATE POLICY "payments_scope"
  ON "public"."payments"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role));
CREATE POLICY "Admins can insert platform settings"
  ON "public"."platform_settings"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role));
CREATE POLICY "Admins can read platform settings"
  ON "public"."platform_settings"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role));
CREATE POLICY "Admins can update platform settings"
  ON "public"."platform_settings"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role));
CREATE POLICY "profiles_admin_view"
  ON "public"."profiles"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ur.user_id = auth.uid() AND (ur.role = ANY (ARRAY['super_admin'::app_role, 'management'::app_role])))));
CREATE POLICY "report_attachments_own_clinic"
  ON "public"."report_attachments"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM studies s
  WHERE s.id = report_attachments.study_id AND (s.owner = auth.uid() OR (EXISTS ( SELECT 1
           FROM clinic_memberships cm
          WHERE cm.user_id = auth.uid() AND cm.clinic_id = s.clinic_id)) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role)))));
CREATE POLICY "Allow admins to manage templates"
  ON "public"."report_templates"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM user_roles
  WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'super_admin'::app_role)));
CREATE POLICY "reports_scope"
  ON "public"."reports"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM studies s
  WHERE s.id = reports.study_id AND ((EXISTS ( SELECT 1
           FROM clinic_memberships cm
          WHERE cm.user_id = auth.uid() AND cm.clinic_id = s.clinic_id)) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role)))));
CREATE POLICY "events_scope"
  ON "public"."review_events"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM studies s
  WHERE s.id = review_events.study_id AND ((EXISTS ( SELECT 1
           FROM clinic_memberships cm
          WHERE cm.user_id = auth.uid() AND cm.clinic_id = s.clinic_id)) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role)))) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role));
CREATE POLICY "admin_health_logs_read"
  ON "public"."service_health_logs"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role));
CREATE POLICY "admin_health_logs_update"
  ON "public"."service_health_logs"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role));
CREATE POLICY "admin_health_logs_write"
  ON "public"."service_health_logs"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role));
CREATE POLICY "lifecycle_policies_admin_only"
  ON "public"."storage_lifecycle_policies"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role));
CREATE POLICY "admin_full_access_studies"
  ON "public"."studies"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role));
CREATE POLICY "studies_select"
  ON "public"."studies"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (sample = true OR owner = auth.uid() OR (EXISTS ( SELECT 1
   FROM clinic_memberships cm
  WHERE cm.user_id = auth.uid() AND cm.clinic_id = studies.clinic_id)) OR (EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ur.user_id = auth.uid() AND (ur.role = ANY (ARRAY['super_admin'::app_role, 'management'::app_role])))));
CREATE POLICY "studies_select_authenticated"
  ON "public"."studies"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (auth.uid() IS NOT NULL AND (owner = auth.uid() OR (EXISTS ( SELECT 1
   FROM clinic_memberships cm
  WHERE cm.clinic_id = studies.clinic_id AND cm.user_id = auth.uid())) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role)));
CREATE POLICY "studies_update"
  ON "public"."studies"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL AND (owner = auth.uid() OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role)));
CREATE POLICY "files_delete_admin"
  ON "public"."study_files"
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role));
CREATE POLICY "files_insert"
  ON "public"."study_files"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM studies s
  WHERE s.id = study_files.study_id AND (s.owner = auth.uid() OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role)))));
CREATE POLICY "files_scope"
  ON "public"."study_files"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM studies s
  WHERE s.id = study_files.study_id AND (s.sample = true OR s.owner = auth.uid() OR (EXISTS ( SELECT 1
           FROM clinic_memberships cm
          WHERE cm.user_id = auth.uid() AND cm.clinic_id = s.clinic_id)) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role)))));
CREATE POLICY "files_update_admin"
  ON "public"."study_files"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role));
CREATE POLICY "admin_study_reports_all"
  ON "public"."study_reports"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role));
CREATE POLICY "support_tickets_admin_select"
  ON "public"."support_tickets"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role));
CREATE POLICY "support_tickets_admin_update"
  ON "public"."support_tickets"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role));
CREATE POLICY "tfa_secrets_admin_reset_only"
  ON "public"."tfa_secrets"
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role));
CREATE POLICY "Admins can manage roles"
  ON "public"."user_roles"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role));
CREATE POLICY "Admins can view all user roles"
  ON "public"."user_roles"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role));
CREATE POLICY "Users can view own roles"
  ON "public"."user_roles"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role));
CREATE POLICY "Admins can insert transactions"
  ON "public"."wallet_transactions"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role));
CREATE POLICY "Admins can view all transactions"
  ON "public"."wallet_transactions"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role));
CREATE POLICY "admin_wallet_adjust"
  ON "public"."wallets"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role));
CREATE POLICY "wallet_update"
  ON "public"."wallets"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role));
CREATE POLICY "wallets_admin_update"
  ON "public"."wallets"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role));

-- 5. Recreate user_clinic_context
CREATE VIEW public.user_clinic_context AS
SELECT ur.user_id, ur.role,
       c.id AS clinic_id, c.name AS clinic_name,
       c.brand_name, c.logo_url, c.primary_color, c.secondary_color, c.sku
FROM public.user_roles ur
JOIN public.clinics    c ON c.id = ur.clinic_id
WHERE ur.role      = 'clinician'::app_role
  AND ur.clinic_id IS NOT NULL
  AND ur.user_id   = auth.uid();

COMMENT ON VIEW public.user_clinic_context
IS 'Clinician-only clinic context resolver. super_admin/management do not '
   'belong to clinics; they see the platform via admin RPCs.';

-- 6. Sanity-check
DO $chk$
DECLARE v_labels text[];
BEGIN
  SELECT array_agg(enumlabel ORDER BY enumsortorder) INTO v_labels
  FROM pg_enum WHERE enumtypid = 'public.app_role'::regtype;
  IF v_labels <> ARRAY['super_admin','management','clinician']::text[] THEN
    RAISE EXCEPTION 'app_role collapse failed — remaining labels: %', v_labels;
  END IF;
END $chk$;

COMMIT;
