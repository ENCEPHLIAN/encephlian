-- Verify the §9.1 C-Plane → channel_quality_assessments bridge after redeploy.
-- Run in Studio SQL Editor after one test study finishes C-Plane processing.
-- Pure SQL, re-runnable, no DDL. Run sections individually (highlight + Run).


-- ── 1. Most recent study + its bridge writes ──────────────────────────
SELECT
  s.id                                     AS study_id,
  s.state,
  s.original_format,
  s.created_at,
  s.meta ->> 'original_filename'           AS filename,
  (SELECT count(*) FROM channel_quality_assessments cqa
    WHERE cqa.study_id = s.id)             AS total_quality_rows,
  (SELECT count(*) FROM channel_quality_assessments cqa
    WHERE cqa.study_id = s.id AND cqa.quality_class = 'bad')      AS bad_count,
  (SELECT count(*) FROM channel_quality_assessments cqa
    WHERE cqa.study_id = s.id AND cqa.quality_class = 'missing')  AS missing_count,
  (SELECT count(*) FROM channel_quality_assessments cqa
    WHERE cqa.study_id = s.id AND cqa.quality_class = 'degraded') AS degraded_count,
  (SELECT count(*) FROM channel_quality_assessments cqa
    WHERE cqa.study_id = s.id AND cqa.quality_class = 'good')     AS good_count
FROM studies s
ORDER BY s.created_at DESC
LIMIT 1;

-- Expected after bridge deploys: total_quality_rows = 19
-- Expected on a clean test EDF: 19 good, 0 of everything else.
-- If total_quality_rows = 0 → bridge isn't firing; check C-Plane logs.


-- ── 2. Per-channel detail of the most recent study ────────────────────
SELECT
  cqa.channel_label,
  cqa.quality_class,
  cqa.source,
  cqa.source_version,
  cqa.assessed_at,
  cqa.details ->> 'normalization_median' AS norm_median,
  cqa.details ->> 'normalization_iqr'    AS norm_iqr
FROM channel_quality_assessments cqa
WHERE cqa.study_id = (SELECT id FROM studies ORDER BY created_at DESC LIMIT 1)
ORDER BY ((cqa.details ->> 'channel_index')::int);

-- Expected: 19 rows in canonical ESF channel order
-- (Fp1 Fp2 F3 F4 C3 C4 P3 P4 O1 O2 F7 F8 T3 T4 T5 T6 Fz Cz Pz)
-- source = 'aplane_canonical_v1'


-- ── 3. Bridge rollout health across last 10 studies ───────────────────
SELECT
  s.id,
  s.state,
  s.created_at,
  (SELECT count(*) FROM channel_quality_assessments cqa
    WHERE cqa.study_id = s.id)                                       AS quality_rows,
  (SELECT count(*) FROM channel_quality_assessments cqa
    WHERE cqa.study_id = s.id AND cqa.quality_class IN ('bad', 'missing'))
                                                                     AS blocking_channels
FROM studies s
ORDER BY s.created_at DESC
LIMIT 10;

-- Expected pattern:
--   Studies created AFTER redeploy → quality_rows = 19
--   Studies created BEFORE redeploy → quality_rows = 0
-- That contrast is your proof the bridge went live at the deploy boundary.


-- ── 4. Studies where the gate has actually demoted findings ───────────
SELECT
  s.id,
  s.state,
  s.created_at,
  (SELECT count(*) FROM channel_quality_assessments cqa
    WHERE cqa.study_id = s.id AND cqa.quality_class IN ('bad', 'missing'))
                                                                     AS blocking_channels,
  (SELECT count(*) FROM jsonb_path_query(
     s.triage_draft_json,
     '$.** ? (@.derived_from == "pending" && @.source == "channel_dependency_gate")'
   ))                                                                AS gate_demoted_fields
FROM studies s
WHERE s.triage_draft_json IS NOT NULL
  AND s.triage_draft_json ->> 'schema_version' = 'mind.report.v2'
ORDER BY s.created_at DESC
LIMIT 20;

-- A row with blocking_channels > 0 AND gate_demoted_fields > 0 proves §9.1
-- fired end-to-end: bad channel → row written → trigger ran → field
-- rewritten to derived_from=pending. That is the "honest output" working
-- on a real study.
