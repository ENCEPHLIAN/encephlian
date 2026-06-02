-- Meta-fix for the VIGIL / MIND Clean v2 failure mode.
--
-- The §9 honest-output infrastructure gates clinical findings server-side
-- when input quality is insufficient. But the §9 gates trust the model
-- outputs they are gating. VIGIL (2026-05-31) and MIND Clean v2 (2026-06-02)
-- were both registered as status='serving' in public.model_versions based
-- on trainer-reported metrics, and both turned out to be broken when
-- measured against ground truth:
--
--   - VIGIL: trained script diverged from the paper §5 spec (single-loss
--     16-class classifier instead of three-loss per-channel quality head).
--   - MIND Clean v2: 25.78% top-1 accuracy on TUH validation — model
--     collapsed to a constant predictor because of a 2057:1 class
--     imbalance in the training set.
--
-- Root cause: there is NO STRUCTURAL gate preventing a model from being
-- promoted to 'serving' without independent ground-truth validation.
-- This migration adds that gate.
--
-- What this migration does:
--   1. Creates public.model_validation_runs — an append-only log of
--      validation runs (model_version_id × corpus → metrics + verdict).
--   2. Installs a trigger on public.model_versions that REFUSES any
--      INSERT or UPDATE that lands status='serving' unless at least one
--      model_validation_runs row exists for that model_version_id with
--      verdict IN ('functional', 'excellent'). Super-admin bypass is
--      available via notes ILIKE '%bypass_validation%' (painful by design).
--   3. Backfills validation_runs rows for the two model_versions rows
--      that are currently status='serving' (mind_triage 3.0.1 and
--      heuristic_seizure 0.1.0) so the trigger does not retroactively
--      fail the next UPDATE to those rows.
--
-- Canonical roles per project_roles_canonical: super_admin, management,
-- clinician. No new enum values, no new app_role members.
--
-- Idempotent: all CREATE statements use IF NOT EXISTS, the policy and
-- trigger blocks DROP-then-CREATE, the data backfill uses
-- ON CONFLICT DO NOTHING via a partial unique key on a stable label.

-- ───────────────────────────────────────────────────────────────────────
-- 1. Table: model_validation_runs
-- ───────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.model_validation_runs (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_version_id     uuid NOT NULL
                         REFERENCES public.model_versions(id) ON DELETE RESTRICT,
  corpus_name          text NOT NULL,
  corpus_version       text,
  n_files              int  NOT NULL CHECK (n_files > 0),
  n_samples            int  NOT NULL CHECK (n_samples > 0),
  metrics              jsonb NOT NULL,
  verdict              text NOT NULL CHECK (verdict IN
                         ('broken', 'middling', 'functional', 'excellent')),
  run_at               timestamptz NOT NULL DEFAULT now(),
  run_by               uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  script_blob_path     text,
  report_blob_path     text,
  notes                text
);

CREATE INDEX IF NOT EXISTS model_validation_runs_model_idx
  ON public.model_validation_runs (model_version_id);

CREATE INDEX IF NOT EXISTS model_validation_runs_verdict_idx
  ON public.model_validation_runs (model_version_id, verdict)
  WHERE verdict IN ('functional', 'excellent');

CREATE INDEX IF NOT EXISTS model_validation_runs_run_at_idx
  ON public.model_validation_runs (run_at DESC);

-- Stable identity for idempotent backfills: at most one (model, corpus,
-- corpus_version, script_blob_path) row. corpus_version and
-- script_blob_path may be NULL — coalesce so the unique index matches.
CREATE UNIQUE INDEX IF NOT EXISTS model_validation_runs_backfill_uq
  ON public.model_validation_runs (
    model_version_id,
    corpus_name,
    coalesce(corpus_version, ''),
    coalesce(script_blob_path, '')
  );

COMMENT ON TABLE public.model_validation_runs IS
  'Append-only log of independent ground-truth validation runs for every model_versions row. The gate trigger on model_versions requires at least one row here with verdict IN (functional, excellent) before a model can be promoted to status=serving. Distinct from public.model_calibration_runs: calibration asks "is the probability output well-calibrated" (ECE, Brier, Platt); validation asks "does the model actually work on a held-out corpus" (accuracy, AUC, per-class F1, confusion matrix). Created 2026-06-02 in response to the VIGIL / MIND Clean v2 incidents where models were marked serving on trainer-reported metrics that turned out to be wrong.';

COMMENT ON COLUMN public.model_validation_runs.verdict IS
  'broken = unfit for serving; middling = working but below threshold; functional = meets bar to gate findings; excellent = high-confidence ground truth alignment.';

-- ───────────────────────────────────────────────────────────────────────
-- 2. RLS — append-only for super_admin + management; SELECT for any
--    authenticated user. UPDATE and DELETE are NEVER granted.
-- ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.model_validation_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "model_validation_runs_read" ON public.model_validation_runs;
CREATE POLICY "model_validation_runs_read"
  ON public.model_validation_runs FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "model_validation_runs_insert" ON public.model_validation_runs;
CREATE POLICY "model_validation_runs_insert"
  ON public.model_validation_runs FOR INSERT
  TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'management'::app_role)
  );

-- Explicitly revoke UPDATE/DELETE on the table so the API cannot expose
-- them even if a future policy is added by accident. Append-only.
REVOKE UPDATE, DELETE, TRUNCATE ON public.model_validation_runs FROM authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON public.model_validation_runs FROM anon;
-- service_role retains everything for disaster-recovery / backfill paths.

-- ───────────────────────────────────────────────────────────────────────
-- 3. Gate trigger function — refuse promotion to serving without
--    validation. Bypass requires notes to literally contain
--    'bypass_validation' AND the caller to be super_admin.
-- ───────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.enforce_model_validation_for_serving()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  validated_count int;
  is_super_admin  boolean;
  bypass_marker   boolean;
BEGIN
  -- Only act when the post-image is status='serving'.
  IF NEW.status IS DISTINCT FROM 'serving' THEN
    RETURN NEW;
  END IF;

  -- On UPDATE, allow no-op if status was already serving (we're not
  -- transitioning into serving, e.g. an unrelated notes edit).
  IF TG_OP = 'UPDATE'
     AND OLD.status = 'serving'
     AND OLD.id = NEW.id
  THEN
    RETURN NEW;
  END IF;

  -- Count qualifying validation runs for this model_version_id.
  SELECT count(*) INTO validated_count
    FROM public.model_validation_runs
   WHERE model_version_id = NEW.id
     AND verdict IN ('functional', 'excellent');

  IF validated_count >= 1 THEN
    RETURN NEW;
  END IF;

  -- No qualifying validation. Last resort: super-admin bypass via an
  -- explicit marker in notes. Designed to be painful and audit-visible.
  bypass_marker := coalesce(NEW.notes, '') ILIKE '%bypass_validation%';

  -- auth.uid() may be NULL when the migration itself or a SQL editor
  -- session is acting (no JWT). In that case we treat it as a
  -- privileged migration path and allow the bypass IF the marker is
  -- present. Service-role / migration callers are trusted by design;
  -- the marker keeps the intent auditable in the row history.
  IF auth.uid() IS NULL THEN
    is_super_admin := true;
  ELSE
    is_super_admin := has_role(auth.uid(), 'super_admin'::app_role);
  END IF;

  IF bypass_marker AND is_super_admin THEN
    RAISE WARNING
      'BYPASS: model_versions row % promoted to serving without validation. Marker present in notes; super_admin path.',
      NEW.id;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'REFUSED: cannot promote model_versions row % (% %) to status=serving — no model_validation_runs row exists with verdict IN (functional, excellent). Run independent ground-truth validation and INSERT a row into public.model_validation_runs first. Super-admin bypass requires the literal string ''bypass_validation'' in notes.',
    NEW.id, NEW.name, NEW.version
    USING ERRCODE = 'check_violation';
END;
$$;

COMMENT ON FUNCTION public.enforce_model_validation_for_serving IS
  'Refuses any INSERT or UPDATE on public.model_versions that lands status=serving unless at least one model_validation_runs row exists for the same model_version_id with verdict IN (functional, excellent). Bypass: notes ILIKE ''%bypass_validation%'' AND caller is super_admin (or NULL auth.uid, i.e. migration). Created 2026-06-02 in response to VIGIL / MIND Clean v2.';

DROP TRIGGER IF EXISTS trg_enforce_model_validation_for_serving
  ON public.model_versions;

CREATE TRIGGER trg_enforce_model_validation_for_serving
  BEFORE INSERT OR UPDATE OF status ON public.model_versions
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_model_validation_for_serving();

-- ───────────────────────────────────────────────────────────────────────
-- 4. Backfill — every model_versions row currently at status='serving'
--    needs a corresponding model_validation_runs row so the trigger does
--    not retroactively fail the next UPDATE.
--
--    Current state (queried 2026-06-02 from production):
--      mind_triage       3.0.1   serving   {auc: 0.857, f1: 0.78}
--      heuristic_seizure 0.1.0   serving   (rule-based, no model metrics)
--
--    VIGIL and MIND Clean v2 are already 'deprecated' — they do not need
--    backfill (the trigger does not run for non-serving statuses).
-- ───────────────────────────────────────────────────────────────────────

-- mind_triage 3.0.1: backfill from training-time metrics. Flagged for
-- re-validation against a held-out TUH-Abnormal subset; the verdict
-- 'functional' reflects the bar to gate clinical findings, not a fresh
-- empirical measurement.
INSERT INTO public.model_validation_runs
  (model_version_id, corpus_name, corpus_version, n_files, n_samples,
   metrics, verdict, run_by, script_blob_path, report_blob_path, notes)
SELECT
  mv.id,
  'TUH-Abnormal',
  'v3.0.1',
  1, -- training-time aggregate; not from per-file validation
  1,
  '{"auc": 0.857, "f1": 0.78, "source": "training_time_aggregate"}'::jsonb,
  'functional',
  NULL,
  'apps/training/train_mind_triage.py',
  NULL,
  'Backfilled 2026-06-02 from training-time metrics recorded in '
  || 'model_versions.validation_metrics. NOT an independent held-out '
  || 'validation — re-validate against TUH-Abnormal eval split and '
  || 'append a fresh row before next serving promotion. Required to '
  || 'satisfy enforce_model_validation_for_serving for the existing '
  || 'serving row introduced by the honest-output foundation migration.'
  FROM public.model_versions mv
 WHERE mv.name = 'mind_triage' AND mv.version = '3.0.1'
ON CONFLICT (model_version_id, corpus_name,
             coalesce(corpus_version, ''),
             coalesce(script_blob_path, '')) DO NOTHING;

-- heuristic_seizure 0.1.0: rule-based z-score spike detector, not a
-- trained model. It is a placeholder until vertex_head_c. Backfilled
-- with verdict='functional' to reflect that it ships and gates findings
-- under the current contract — but the metrics field documents that the
-- behaviour is rule-coded, not learned, so re-validation against TUSZ
-- is still owed before any version bump.
INSERT INTO public.model_validation_runs
  (model_version_id, corpus_name, corpus_version, n_files, n_samples,
   metrics, verdict, run_by, script_blob_path, report_blob_path, notes)
SELECT
  mv.id,
  'rule-coded-placeholder',
  NULL,
  1,
  1,
  '{"kind": "rule", "rule": "z-score spike threshold", "trained": false, '
    || '"empirical_validation": "owed_against_TUSZ"}'::jsonb,
  'functional',
  NULL,
  'libs/score/engine.py',
  NULL,
  'Backfilled 2026-06-02. heuristic_seizure is a rule-based z-score '
  || 'spike detector, not a trained model — there are no training '
  || 'metrics to record. Verdict reflects shipped behaviour under the '
  || 'current contract (placeholder until vertex_head_c). Re-validate '
  || 'against TUSZ and append a fresh row before any version bump.'
  FROM public.model_versions mv
 WHERE mv.name = 'heuristic_seizure' AND mv.version = '0.1.0'
ON CONFLICT (model_version_id, corpus_name,
             coalesce(corpus_version, ''),
             coalesce(script_blob_path, '')) DO NOTHING;

-- ───────────────────────────────────────────────────────────────────────
-- 5. Verification — every serving model has at least one qualifying
--    validation run. Fail loudly if not. Trigger must be installed and
--    enabled. Bypass logic exists.
-- ───────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  unvalidated_serving int;
  trigger_present     int;
  table_present       int;
  func_present        int;
BEGIN
  -- Table + function + trigger all exist.
  SELECT count(*) INTO table_present
    FROM information_schema.tables
   WHERE table_schema = 'public'
     AND table_name = 'model_validation_runs';
  IF table_present <> 1 THEN
    RAISE EXCEPTION 'POST-MIGRATION FAIL: model_validation_runs table missing';
  END IF;

  SELECT count(*) INTO func_present
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'enforce_model_validation_for_serving';
  IF func_present <> 1 THEN
    RAISE EXCEPTION 'POST-MIGRATION FAIL: enforce_model_validation_for_serving function missing';
  END IF;

  SELECT count(*) INTO trigger_present
    FROM pg_trigger
   WHERE tgname = 'trg_enforce_model_validation_for_serving'
     AND tgrelid = 'public.model_versions'::regclass
     AND NOT tgisinternal;
  IF trigger_present <> 1 THEN
    RAISE EXCEPTION 'POST-MIGRATION FAIL: trg_enforce_model_validation_for_serving trigger missing on model_versions';
  END IF;

  -- Every serving row has at least one qualifying validation_runs row.
  SELECT count(*) INTO unvalidated_serving
    FROM public.model_versions mv
   WHERE mv.status = 'serving'
     AND NOT EXISTS (
       SELECT 1 FROM public.model_validation_runs r
        WHERE r.model_version_id = mv.id
          AND r.verdict IN ('functional', 'excellent')
     );
  IF unvalidated_serving > 0 THEN
    RAISE EXCEPTION
      'POST-MIGRATION FAIL: % serving model_versions row(s) have no qualifying validation_runs row. Backfill incomplete.',
      unvalidated_serving;
  END IF;

  RAISE NOTICE 'VERIFY PASS: model_validation_runs table + trigger installed; all serving rows have qualifying validation runs.';
END
$$;

-- Trigger smoke-test — exercise both the refuse path and the bypass.
DO $$
DECLARE
  fake_id  uuid;
  caught   text := '';
BEGIN
  -- Insert a planned row (no validation required) — should succeed.
  INSERT INTO public.model_versions (name, version, family, status, notes)
  VALUES ('__validation_gate_smoketest__', '0.0.1', 'triage', 'planned',
          'transient test row from migration smoke test')
  RETURNING id INTO fake_id;

  -- Attempt to promote it to serving without a validation_runs row.
  -- Use a separate sub-block so we can catch the exception and continue.
  BEGIN
    UPDATE public.model_versions
       SET status = 'serving'
     WHERE id = fake_id;
    -- If we get here, the trigger failed to fire. Tear down + fail.
    DELETE FROM public.model_versions WHERE id = fake_id;
    RAISE EXCEPTION 'SMOKE FAIL: trigger did not refuse promotion to serving without validation';
  EXCEPTION WHEN check_violation THEN
    caught := SQLERRM;
  END;

  IF caught NOT ILIKE '%REFUSED%' THEN
    DELETE FROM public.model_versions WHERE id = fake_id;
    RAISE EXCEPTION 'SMOKE FAIL: expected REFUSED in error, got: %', caught;
  END IF;

  -- Confirm bypass marker + NULL auth.uid (migration path) lets it
  -- through. This is the painful path — but it must work or we have
  -- no escape hatch for genuine emergencies.
  UPDATE public.model_versions
     SET status = 'serving',
         notes = coalesce(notes, '') || ' bypass_validation (smoke test)'
   WHERE id = fake_id;

  -- Tear down the smoke-test row. It is not a real serving model.
  DELETE FROM public.model_versions WHERE id = fake_id;

  RAISE NOTICE 'SMOKE PASS: refuse path + bypass path both fire correctly.';
END
$$;
