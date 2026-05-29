# Phase 1D — calibration measurement: why deferred

The `model_calibration_runs` table, the `AdminCalibration` page, and
the `calibrated_confidence` column on every model FieldProposal are
all live. What's NOT live yet is the executor that populates
`model_calibration_runs`.

## Why deferred (the honest version)

"Best foundation" means the calibration gate eventually demotes
fields whose `calibrated_confidence` is below some threshold. To act
on calibration, the system needs accurate calibration numbers per
model_version. There are two paths to those numbers:

### Path A — real held-out validation set (preferred)

When iplane / VERTEX heads ship, the training pipeline emits the
model + a held-out test set with ground-truth labels. The measurement
executor:

1. Runs the model on the holdout
2. Computes Expected Calibration Error (ECE) directly: bin by
   predicted confidence, measure observed accuracy per bin, take the
   weighted mean of |observed − predicted|
3. Fits Platt scaling: logistic regression on raw logits → calibrated
   probabilities
4. Inserts a row tagged `holdout_set_label = 'tuab_v3.0.1_holdout'`
   (or similar canonical name)

Clean. Unbiased. Acts on real ground truth.

### Path B — `clinician_edit_deltas` as a proxy (today-feasible, noisy)

Take every signed study from the last N days. For each
FieldProposal where `derived_from = 'model'` and the model matches:

- Look for a clinician_edit_deltas row for that (study, field_id)
  with `edit_type IN ('edit', 'clear', 'reject')`
- If yes → treat as "model wrong" (the clinician overrode)
- If no  → treat as "model right" (the clinician accepted)

Bin by raw confidence and compute the proxy ECE.

**The problem with Path B**: clinician edit ≠ model wrong. Clinicians
sometimes edit correct outputs to add polish, clarify wording, or to
match a preferred style. Sometimes they accept wrong outputs because
the field isn't where their attention was. The signal-to-noise ratio
on this proxy is unknown and varies by field type. Acting on this
noisy ECE through a calibration gate would silently demote fields the
model actually got right — corrupting the foundation we just built.

## What needs to happen before Path A ships

- Iplane / VERTEX heads emit a holdout slice during training (a
  small JSONL of `(input_features_sha256, predicted_score, true_label)`
  tuples per model_version, stored in blob)
- Backend team agrees on the holdout label naming convention so the
  same dataset is comparable across rebuilds

When both are true, the measurement executor is ~200 lines of
Deno/Python (depending on whose hands it lives in) and lands without
any further foundation changes. The table accepts it; the gate plugs
in trivially.

## What needs to happen before Path B ships (if we go that way)

A user-visible decision: "we're OK acting on calibration estimated
from clinician override rate, accepting the bias." If you decide
yes, the executor lands the same way — just tagged
`holdout_set_label = 'edit_delta_proxy_<date>'` so anyone reading
`model_calibration_runs` can filter out proxy rows.

## Why not just ship Path B silently and document?

Because the foundation we just built was specifically about NOT
silently substituting weak signal for strong signal. Doing it here
would undermine its own contract.

## Status of the surface in the meantime

`AdminCalibration` correctly shows the empty state:
> "Until any rows land, the calibration gate inside
> enforce_channel_gate can only act on per-field calibrated_confidence
> embedded in the payload, not on a model-wide threshold."

Operators see the truth. The system doesn't fake calibration.
