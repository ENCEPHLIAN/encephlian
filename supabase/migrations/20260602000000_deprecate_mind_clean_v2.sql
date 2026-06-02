-- Deprecate MIND Clean v2 in the model registry.
--
-- Architectural decision recorded 2026-06-02 after TUH validation of the
-- shipped mind_clean_v2 ONNX showed it is non-functional:
--
-- Validation result:
--   - Top-1 accuracy        : 25.78% (chance = 20% on 5-class problem)
--   - Balanced accuracy     : 34%
--   - Behaviour             : model collapses to predicting "electrode" or
--                             "eye_movement" regardless of input window.
--
-- Root cause: catastrophic class imbalance in the training corpus. The
-- training set composed by apps/training/train_clean_v2.py had 207,732
-- normal windows vs 101 artifact windows (a 2057:1 ratio). The model
-- learned the prior, not the discriminative features. Same failure mode
-- as VIGIL (deprecated 2026-05-31): trained artifact diverges from a
-- usable producer of the signal the rest of the system reads.
--
-- The current row in public.model_versions for (name='mind_clean',
-- version='2.0.0') also carries a stale notes string describing it as
-- an "ICA-based artifact rejector". That description is wrong — the
-- shipped artifact is a 5-class MLP over 133 ESF-derived features
-- (see apps/training/train_clean_v2.py). The notes are corrected
-- in the append below so the registry stops lying about the model.
--
-- Replacement plan: Tier 3 / AEGIS architecture is being scoped in
-- parallel. The user has explicitly declined a Tier 1 rule-based
-- artifact classifier — the viewer will render an empty-state for
-- the artifact-overlay panel until AEGIS lands. C-Plane stops
-- invoking the model in the matching encephlian-core change; the
-- biomarkers.json blob now carries a
--   "artifact_classifier": {"status": "deprecated_pending_aegis", ...}
-- metadata field so downstream consumers see an explicit refusal
-- rather than a missing field.
--
-- Canonical roles per project_roles_canonical: this migration only
-- updates a data row, so no role grants are introduced. No new
-- enum values, RPCs, or policies — pure UPDATE on an existing row.

UPDATE public.model_versions
   SET status = 'deprecated',
       deprecated_at = now(),
       notes = coalesce(notes, '') || E'\n\n'
            || '— DEPRECATED 2026-06-02 — TUH validation: top-1 25.78% '
            || '(chance 20%), balanced 34%. Model collapses to '
            || '"electrode"/"eye_movement" regardless of input. Root '
            || 'cause: training-set class imbalance — 207,732 normal '
            || 'windows vs 101 artifact windows (2057:1) in '
            || 'apps/training/train_clean_v2.py corpus. The model '
            || 'learned the prior, not the discriminator. Note: prior '
            || 'description as "ICA-based artifact rejector" was '
            || 'incorrect — shipped artifact is a 5-class MLP over '
            || '133 ESF-derived features, not ICA. Replacement: Tier 3 '
            || '/ AEGIS being scoped in parallel; viewer renders '
            || 'empty-state for artifact overlay until AEGIS lands. '
            || 'C-Plane no longer invokes mind_clean v2; biomarkers.json '
            || 'now carries explicit '
            || '"artifact_classifier.status=deprecated_pending_aegis" '
            || 'metadata so downstream surfaces see refusal, not silence.'
 WHERE name = 'mind_clean'
   AND version = '2.0.0'
   AND status <> 'deprecated';

-- Verification: no longer-serving mind_clean v2 row.
DO $$
DECLARE
  bad_clean int;
BEGIN
  SELECT count(*) INTO bad_clean
    FROM public.model_versions
   WHERE name = 'mind_clean'
     AND version = '2.0.0'
     AND status NOT IN ('deprecated', 'failed');
  IF bad_clean > 0 THEN
    RAISE EXCEPTION 'POST-MIGRATION FAIL: % mind_clean v2.0.0 row(s) still non-deprecated', bad_clean;
  END IF;
  RAISE NOTICE 'VERIFY PASS: mind_clean v2.0.0 deprecated';
END
$$;
