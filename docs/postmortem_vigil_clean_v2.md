# VIGIL + MIND Clean v2 — the unvalidated-model pattern

**Date:** 2026-06-02
**Status:** Both models deprecated. Validation gate trigger live in production.
**Audience:** Us, in three months, when we forget. Anyone who joins later.

---

## What happened

Two MIND models were trained, registered in `model_versions`, marked `status='serving'`, and shipped. Both were broken in ways a held-out corpus check would have caught immediately. Neither got that check.

- **VIGIL trained model** (deprecated 2026-05-31). Paper audit found `apps/training/train_aria_vigil.py` used 16 classes vs the paper's 6, a single classification loss instead of the paper's three-loss joint objective (CE on degradation class + MSE on severity + BCE on per-channel quality mask), and exported attention weights as the per-channel quality output. **The loss never supervised the contract output.** Production was emitting confabulated attention.

- **MIND Clean v2** (deprecated 2026-06-02). TUH-Artifact-V3.0.1 holdout: 25.78% accuracy, 34% balanced accuracy. Training set was 207,732 normal vs 101 artifact windows — **2057:1 imbalance**. No class weighting, no focal loss, no resampling. The model converged on "predict normal always." Trainer reported ~99% raw accuracy because the validation split had the same imbalance.

Different surfaces. Same pattern: trained → registered → marked serving → no independent validation → silent failure in production.

## Root cause

**Proximate (technical):** nothing in the trainer's reported metrics demanded that the output mean what the production contract said it meant.

- VIGIL: trainer's loss was low on its own (wrong) objective. Nobody asked "did the loss actually optimize for the contract."
- Clean v2: trainer reported 99% accuracy. Nobody asked "is accuracy the right metric on a 2057:1 imbalance" — obviously no, but nobody asked.

**Structural (systemic):** `model_versions.status` was just a column. Anyone could set it to `serving`. No row, no check, no human signature required attesting that someone had validated the model on data the trainer hadn't seen. The honest-output infrastructure (§9 gates, channel-quality bridge, schema validation, edit-delta capture) enforces **structural honesty** — the model can't lie about what it produced. It does not enforce **predictive correctness** — the model can be silently wrong and the system will honestly serve the wrong answer.

## Why we didn't catch it sooner

VIGIL: we trusted the paper-spec framing without reading the script. The disconnect was visible in `train_aria_vigil.py`, but nothing forced us to look until the §9.1 keystone bridge made us ask "what actually populates `channel_quality_assessments`."

Clean v2: we trusted the trainer's reported accuracy. The class imbalance was visible in the preprocessing logs. A two-minute look at the training data shape would have killed deployment.

**Trainer-reported metrics are never sufficient.** The gradient descent loop is incentivized to look good on its own objective. The trainer cannot grade its own homework.

## The fix (validation gate)

New table `public.model_validation_runs` (columns: `id`, `model_version_id`, `corpus`, `n_studies`, `metrics jsonb`, `verdict ∈ failed|weak|functional|excellent`, `notes`, `run_at`, `run_by_user_id`).

Trigger `enforce_validation_before_serving` on `model_versions` BEFORE UPDATE OF status, fires when `NEW.status='serving'`, raises EXCEPTION unless a `model_validation_runs` row exists for the model with `verdict IN ('functional', 'excellent')`. Verdicts are human-assigned — the table records the human's judgment, not an auto-pass heuristic.

MIND Triage v3 backfilled with row `467d299c-2751-4952-9e27-9a5d34426a96`: AUC 0.800 on TUH-Abnormal n=40, sensitivity 0.90, specificity 0.55, verdict `functional` (right asymmetry for triage).

## Why this won't happen again

1. **The trigger raises.** If anyone tries to set status=serving without a validation row, the transaction rolls back. Load-bearing. Doesn't rely on memory or discipline.
2. **The verdict semantics force the question.** `functional` requires naming the task's correct asymmetry. `excellent` requires substantially exceeding the bar. `failed` and `weak` are honest options so nobody feels pressured to inflate. You can't ship without first deciding what you're claiming.
3. **This document exists.** When we forget — we will — someone re-reads this and remembers why the trigger is there. The trigger is the load-bearing part; the document is the explanation for the next person tempted to bypass it.

## Open questions

- **Grandfathered serving models.** Trigger only fires on UPDATE, so models already at `serving` before 2026-06-02 still need a validation row before any future status change. Triage v3 done; mind_heuristic_seizure open; AEGIS in scope when it ships.
- **Calibration drift.** Validation is a pre-launch check. A model that worked at launch and drifted as the population shifted is `model_calibration_runs` (Phase 1D, deferred).
- **Holdout contamination.** Reusing the same TUH subcorpus across generations turns it into training data. Document holdout choice in the validation row's `notes`. Rotate when possible.
- **Composite systems.** Trigger fires per model_version. An ensemble (AEGIS + Triage v3 + a rule) has emergent behavior per-model validations don't capture. Integration-level validation is a later problem.

**The discipline:** read the data shape. Pick a holdout the trainer hasn't seen. Compute task-appropriate metrics (balanced accuracy on imbalanced classes; AUC + the right asymmetry per task). Assign a verdict honestly. Write the row. Then ship. If any of those four can't be done, stay at `development`, write down why, come back when the gap closes.
