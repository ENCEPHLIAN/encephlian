-- Deprecate VIGIL the trained model and FORGE v1 in the model registry.
--
-- Architectural decision recorded 2026-05-31 after a full audit of the
-- methods paper vs the actual training scripts and shipped code:
--
-- VIGIL — the trained artifact (vigil_v1) diverges from the paper §5
-- specification. The paper specifies 6 discrete degradation conditions,
-- a per-channel binary quality-mask head, and a three-loss joint objective
-- (CE on degradation type + MSE on severity + BCE on per-channel quality).
-- The training script apps/training/train_aria_vigil.py instead trains
-- 16 classes (5 conditions × 3 severities + 1 clean), uses a single
-- classification loss, and exposes per-channel "quality" as the sigmoid
-- of cross-channel attention logits — which the loss never supervises.
-- The trained per-channel output is a confabulated attention pattern, not
-- a per-channel quality signal. The architectural error cannot be fixed
-- by more epochs.
--
-- What replaces VIGIL in v1: rule-based per-channel quality assessment
-- in libs/esf/convert.py:_assess_quality and
-- libs/canonical/vendors/natus.py:_compute_quality_flags. Both produce
-- the GOOD/NOISY/BAD/MISSING vector the rest of the system reads. The
-- bridge from canonical metadata to channel_quality_assessments rows
-- ships in encephlian-core commit cd792a1.
--
-- VIGIL the concept (per-channel quality flag consumed by C-Plane CAR,
-- FORGE channel masking, VERTEX attention masking, AUGUR finding-channel
-- dependency gate) remains valid. The output format is unchanged. Only
-- the trained producer is deprecated. A future VIGIL v2 retrained to
-- the actual paper spec can register as a new model_versions row when
-- there is empirical evidence that the rule-based replacement misses
-- real clinic failures.
--
-- FORGE v1 — single-level domain-adversarial against k-means pseudo-
-- clinics, per paper §6.1: "the pseudo-clinics were not real clinics …
-- the adversary learned nothing useful." The paper itself deprecates
-- this design in favour of FORGE v2 (hierarchical contrastive at patient,
-- session, and clinic scope). Marking dead so no caller accidentally
-- references the v1 weights.

UPDATE public.model_versions
   SET status = 'deprecated',
       deprecated_at = now(),
       notes = coalesce(notes, '') || E'\n\n'
            || '— DEPRECATED 2026-05-31 — trained script (apps/training/'
            || 'train_aria_vigil.py) diverges from paper §5 spec: no '
            || 'per-channel quality head, single-loss classification, '
            || 'attention-as-quality. Per-channel output is unreliable. '
            || 'Replaced by rule-based per-channel quality from '
            || 'libs/esf/convert.py:_assess_quality and '
            || 'libs/canonical/vendors/natus.py:_compute_quality_flags, '
            || 'written to channel_quality_assessments by C-Plane '
            || '(source=aplane_canonical_v1). See '
            || 'supabase/functions/_shared/HONEST_OUTPUT_CONTRACT.md '
            || 'and supabase/functions/_shared/PHASE_1D_DEFERRAL.md.'
 WHERE name = 'vigil'
   AND status <> 'deprecated';

-- FORGE v1 may or may not exist in the registry (the seed migration
-- inserted only forge v2.0.0). Use a defensive INSERT-or-UPDATE.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.model_versions
     WHERE name = 'forge' AND version LIKE '1.%'
  ) THEN
    UPDATE public.model_versions
       SET status = 'deprecated',
           deprecated_at = now(),
           notes = coalesce(notes, '') || E'\n\n'
                || '— DEPRECATED 2026-05-31 — single-level domain-'
                || 'adversarial against k-means pseudo-clinics; paper '
                || '§6.1 explains why this objective collapses. '
                || 'Superseded by FORGE v2 (hierarchical contrastive '
                || 'at patient/session/clinic scope with GRL on clinic).'
     WHERE name = 'forge' AND version LIKE '1.%';
    RAISE NOTICE 'DEPRECATED: FORGE v1 marked';
  ELSE
    RAISE NOTICE 'No FORGE v1 row found — nothing to deprecate';
  END IF;
END
$$;

-- Verification: no longer-serving VIGIL row, no FORGE v1 except deprecated.
DO $$
DECLARE
  bad_vigil int;
  bad_forge_v1 int;
BEGIN
  SELECT count(*) INTO bad_vigil
    FROM public.model_versions
   WHERE name = 'vigil' AND status NOT IN ('deprecated', 'failed');
  IF bad_vigil > 0 THEN
    RAISE EXCEPTION 'POST-MIGRATION FAIL: % vigil row(s) still non-deprecated', bad_vigil;
  END IF;
  SELECT count(*) INTO bad_forge_v1
    FROM public.model_versions
   WHERE name = 'forge' AND version LIKE '1.%' AND status <> 'deprecated';
  IF bad_forge_v1 > 0 THEN
    RAISE EXCEPTION 'POST-MIGRATION FAIL: % forge v1 row(s) still non-deprecated', bad_forge_v1;
  END IF;
  RAISE NOTICE 'VERIFY PASS: vigil + forge v1 deprecated';
END
$$;
