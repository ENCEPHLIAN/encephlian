-- Compare-to-Prior (P0) — study_comparison_runs table + RLS + indices.
--
-- A "prior" study P for current study C is defined per
-- docs/compare_to_prior_design.md §1: same patient_id, same clinic, P signed
-- strictly before C, ≥7 days older, ≤24 months older. The compare row is
-- computed at I-Plane report finalisation (deterministic arithmetic on
-- already-validated upstream model outputs), keyed by content shas so re-
-- runs append a new row (audit), not overwrite the old one.
--
-- No model_versions row, no model_validation_runs requirement: comparison
-- is arithmetic, not a learned function. The validation gate fires on
-- model_versions only.
--
-- Idempotent: CREATE TABLE / CREATE INDEX use IF NOT EXISTS, policy blocks
-- DROP-then-CREATE.

-- ───────────────────────────────────────────────────────────────────────
-- 1. Table
-- ───────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.study_comparison_runs (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  current_study_id         uuid NOT NULL
                             REFERENCES public.studies(id) ON DELETE CASCADE,
  prior_study_id           uuid NOT NULL
                             REFERENCES public.studies(id) ON DELETE CASCADE,
  computed_at              timestamptz NOT NULL DEFAULT now(),
  current_report_sha       text NOT NULL,
  prior_report_sha         text NOT NULL,
  biomarker_deltas         jsonb NOT NULL DEFAULT '[]'::jsonb,
  finding_changes          jsonb NOT NULL DEFAULT '[]'::jsonb,
  caveats                  jsonb NOT NULL DEFAULT '[]'::jsonb,
  suppressed               boolean NOT NULL DEFAULT false,
  model_versions_used      jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Defence in depth: never compare a study against itself even if the
  -- I-Plane filter is somehow defeated. Design §8 row 7.
  CONSTRAINT scr_self_pair_blocked CHECK (current_study_id <> prior_study_id),

  -- Re-runs of the same (current, prior) pair append a new row when either
  -- side's report sha changes; identical input shas dedupe.
  CONSTRAINT uq_scr_pair UNIQUE (
    current_study_id, prior_study_id,
    current_report_sha, prior_report_sha
  )
);

CREATE INDEX IF NOT EXISTS idx_scr_current
  ON public.study_comparison_runs (current_study_id, computed_at DESC);

CREATE INDEX IF NOT EXISTS idx_scr_prior
  ON public.study_comparison_runs (prior_study_id);

CREATE INDEX IF NOT EXISTS idx_scr_computed_at
  ON public.study_comparison_runs (computed_at DESC);

COMMENT ON TABLE public.study_comparison_runs IS
  'Per-(current, prior) study-pair comparison row. Computed at I-Plane '
  'report finalisation; cached on (current_report_sha, prior_report_sha) '
  'so re-runs append, never overwrite. Pure arithmetic on already-'
  'validated upstream model outputs — no new validation gate. See '
  'docs/compare_to_prior_design.md.';

COMMENT ON COLUMN public.study_comparison_runs.biomarker_deltas IS
  'Array of {biomarker_kind, current_value, prior_value, delta_abs, '
  'percentile_rank, reportable, caveat}. Empty when no biomarker is '
  'reportable.';

COMMENT ON COLUMN public.study_comparison_runs.finding_changes IS
  'Array of {kind, state, current_value, prior_value, caveat} where '
  'state ∈ {unchanged, new, resolved, changed}. derived_from=pending '
  'on either side suppresses that kind entirely.';

COMMENT ON COLUMN public.study_comparison_runs.caveats IS
  'Array of {kind, reason} structural caveats (vendor_mismatch, '
  'channel_gate_prior, model_version_skew, prior_hand_edited, etc.). '
  'UI renders these above the biomarker/findings tables.';

COMMENT ON COLUMN public.study_comparison_runs.suppressed IS
  'True when nothing reportable remains after gating. UI hides the '
  'Compared-to-prior section in that case.';

-- ───────────────────────────────────────────────────────────────────────
-- 2. RLS — mirror studies_select; the row is visible iff the caller can
--    read the *current* study (the prior is only joined for context).
-- ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.study_comparison_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "study_comparison_runs_select" ON public.study_comparison_runs;
CREATE POLICY "study_comparison_runs_select"
  ON public.study_comparison_runs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.studies s
       WHERE s.id = study_comparison_runs.current_study_id
         AND (
           s.sample = true
           OR EXISTS (
             SELECT 1 FROM public.clinic_memberships cm
              WHERE cm.user_id = auth.uid()
                AND cm.clinic_id = s.clinic_id
           )
           OR has_role(auth.uid(), 'super_admin'::app_role)
           OR has_role(auth.uid(), 'management'::app_role)
         )
    )
  );

-- INSERT/UPDATE/DELETE: service-role only (the I-Plane writes; nobody
-- mutates from the client). Explicitly revoke so the API surface cannot
-- expose write paths even if a future policy is added by accident.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON public.study_comparison_runs FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON public.study_comparison_runs FROM anon;
-- service_role retains everything (I-Plane writes via service key).

-- ───────────────────────────────────────────────────────────────────────
-- 3. Verification — table + 3 indices + RLS policy exist.
-- ───────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  tbl_present    int;
  rls_enabled    boolean;
  policy_present int;
  idx_count      int;
BEGIN
  SELECT count(*) INTO tbl_present
    FROM information_schema.tables
   WHERE table_schema='public' AND table_name='study_comparison_runs';
  IF tbl_present <> 1 THEN
    RAISE EXCEPTION 'POST-MIGRATION FAIL: study_comparison_runs table missing';
  END IF;

  SELECT relrowsecurity INTO rls_enabled
    FROM pg_class
   WHERE relname='study_comparison_runs' AND relnamespace='public'::regnamespace;
  IF NOT rls_enabled THEN
    RAISE EXCEPTION 'POST-MIGRATION FAIL: RLS not enabled on study_comparison_runs';
  END IF;

  SELECT count(*) INTO policy_present
    FROM pg_policies
   WHERE schemaname='public' AND tablename='study_comparison_runs'
     AND policyname='study_comparison_runs_select';
  IF policy_present <> 1 THEN
    RAISE EXCEPTION 'POST-MIGRATION FAIL: select policy missing';
  END IF;

  SELECT count(*) INTO idx_count
    FROM pg_indexes
   WHERE schemaname='public' AND tablename='study_comparison_runs'
     AND indexname IN ('idx_scr_current', 'idx_scr_prior', 'idx_scr_computed_at');
  IF idx_count <> 3 THEN
    RAISE EXCEPTION 'POST-MIGRATION FAIL: expected 3 indices, found %', idx_count;
  END IF;

  RAISE NOTICE 'VERIFY PASS: study_comparison_runs table + RLS + 3 indices installed.';
END
$$;
