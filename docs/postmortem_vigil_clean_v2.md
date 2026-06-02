# Postmortem — VIGIL + MIND Clean v2: the unvalidated-model pattern

**Date authored:** 2026-06-02
**Incident window:** ~2026-04 through 2026-06-02 (best reconstruction)
**Status:** Resolved. Both models deprecated. Structural fix (DB trigger) in production.
**Severity (retrospective):** S2 — confabulated model output served to clinicians, no patient-harm signal known, blast radius bounded by trust-tier UI surfaces.
**Authors:** ENCEPHLIAN engineering, written blamelessly.
**Audience:** Us in three months when we forget. Anyone who joins later. Future regulators if they ask.

---

## TL;DR

- Two MIND models — **VIGIL** (clinic-invariant quality estimator) and **MIND Clean v2** (artifact classifier) — were promoted to `model_versions.status='serving'` despite being structurally broken in ways a single independent-holdout check would have caught.
- VIGIL's trainer optimized a loss objective different from the contract output the model emitted at inference time; the production output was confabulated attention weights, not the trained quality estimate. Trainer-reported loss looked fine.
- Clean v2 was trained on 207,732 normal vs 101 artifact windows (**2057:1 imbalance**), with no class weighting or resampling. It learned "predict normal always," and trainer-reported ~99% raw accuracy because the validation split inherited the same imbalance. Independent TUH-Artifact-V3.0.1 holdout: 25.78% accuracy, 34% balanced accuracy.
- Both detections were **incidental**, not by any planned validation activity. VIGIL surfaced during §9.1 keystone-bridge work; Clean v2 only because writing the VIGIL deprecation prompted "what about Clean v2?".
- Fix: `model_validation_runs` table + `enforce_model_validation_for_serving` trigger. The trigger makes `status='serving'` a contractual claim ("a human attested this passes a corpus check"), not a column anyone can set. Migration applied via MCP; live since 2026-06-02.

---

## Timeline

Dates approximate. Reconstructed from commit history + memory + Supabase migration timestamps.

| Date | Event |
|---|---|
| ~2026-04 | VIGIL trained on `train_aria_vigil.py`. Output exported as per-channel quality. `mind_vigil` row added to `model_versions`. |
| ~2026-04–05 | VIGIL `status='serving'`. Frontends consuming `channel_quality_assessments` rows begin seeing VIGIL output. No corpus-validation row exists; nobody asks. |
| ~2026-05 | Clean v2 trained. ~99% raw accuracy reported. `mind_clean` v2.0.0 row added; `status='serving'`. I-Plane loads the ONNX at startup. |
| 2026-05-28 | §9 honest-output Phase 1A/1C/1E shipped. §9.1 (keystone bridge: ESF channel_quality → `channel_quality_assessments`) begins. |
| 2026-05-31 | §9.1 bridge work asks "what actually populates `channel_quality_assessments`?" Audit of `train_aria_vigil.py` reveals: 16 classes vs paper's 6, single-CE loss vs paper's 3-loss joint objective, attention weights exported as the contract output. **The loss never supervised the output.** VIGIL deprecated in `model_versions`. Per-channel quality routed to deterministic rule. |
| 2026-05-31 → 2026-06-02 | Same-pattern question raised about Clean v2. `scripts/validate_mind_clean_v2_tuh.py` written. Run against TUH-Artifact-V3.0.1: 25.78% accuracy, 34% balanced. Modal-class collapse confirmed. |
| 2026-06-02 (AM) | `supabase/migrations/20260602000000_deprecate_mind_clean_v2.sql` written. Clean v2 marked deprecated in `model_versions`. I-Plane stops loading the ONNX (commit `e349f91`). C-Plane biomarkers.json writes `artifact_classifier: {status: "deprecated_pending_aegis"}`. |
| 2026-06-02 (PM) | `supabase/migrations/20260602000100_model_validation_gate.sql` written + applied via MCP. `model_validation_runs` table + `enforce_model_validation_for_serving` trigger live. Triage v3 re-validated against TUH-Abnormal n=100 (AUC 0.870; n=40 backfilled at 0.800). Triage v3 backfilled with row `467d299c-2751-4952-9e27-9a5d34426a96` — verdict `functional`. Frontend trust panel renders Clean v2 windows as `derived_from="pending"` (commit `44cfa2b`). |

---

## Blast radius

What was actually emitted to clinicians while these models were live:

- **VIGIL:** Any UI surface that consumed `channel_quality_assessments` rows rendered the model's confabulated attention weights as if they were a per-channel signal-quality assessment. Concretely: trust panel "channel quality" badges, biomarker-finding `required_channels` quality assertions, the channel-dependency gate's input itself (which means the gate may have either gated unnecessarily or, more concerning, *failed to gate* when it should have). We do not know how many studies were affected.
- **Clean v2:** Any biomarker output whose computation incorporated the artifact_classifier saw the modal-class default — effectively "no artifact detected." This meant biomarker findings that should have been suppressed or flagged were emitted as clean. Number of studies affected: unknown.
- **No known patient-harm signal.** No clinician has reported a finding traced to either model that they consider clinically incorrect. This is not proof of absence — small early-pilot sample size, and the failure mode is "lies confidently in a calm voice," which doesn't trigger an alert.
- **Bounded by trust-tier infrastructure.** Findings emitted in this window carry a `Provenance` block recording which model + version produced them. We can, post-hoc, query and flag any study whose findings cite `mind_vigil v1.*` or `mind_clean v2.*`. Pending action item: actually run this query and notify the affected clinics if the count is non-trivial.

---

## Root cause

### Proximate (technical)

Nothing in either trainer's reported metrics demanded that the output mean what the production contract said it meant.

- **VIGIL:** Loss minimized on its own (wrong) objective. CE on 16 internal classes is a perfectly tractable problem; the network learned it. Nothing connected the optimizer's gradient to the contract field `channel_quality_assessments.quality_class`.
- **Clean v2:** Loss minimized on a 2057:1 imbalanced dataset using unweighted CE. The optimum on that objective is the constant function `predict 'normal'`. The optimizer found it. Validation split inherited the imbalance, so 99% accuracy on validation == 99% prevalence of the modal class. Nothing demanded balanced accuracy.

### Structural (systemic)

`model_versions.status` was just a column. Anyone with write access could set it to `'serving'`. No row, no check, no human signature attesting that someone had run the model against data the trainer hadn't seen.

The honest-output infrastructure shipped over the prior weeks (§9 gates, channel-quality bridge, schema validation, edit-delta capture) enforces **structural honesty** — the model can't lie about what fields it produced or what its inputs were. It does **not** enforce **predictive correctness** — a model can be silently wrong about its predictions and the system will honestly serve the wrong answer.

These are different failure modes. Phase 1 fixed the first. The validation gate is Phase 1.5 for the second.

### Cultural

There was implicit deference to the trainer-reported metric in both cases. "Loss is going down" and "accuracy is 99%" both got internalized as evidence of correctness, when they were evidence of *training progress on the configured objective* — a strictly weaker claim. The gradient descent loop cannot grade its own homework; it can only report that the homework is internally consistent.

---

## Five whys

### VIGIL

1. **Why** did VIGIL ship confabulated attention? — Because the export step routed attention weights to the contract output field.
2. **Why** wasn't that caught? — Because the trainer never optimized for the contract output; nothing in CI compared training output to served output.
3. **Why** didn't we read the trainer script before shipping? — Because the paper-spec framing was trusted as proxy for the implementation.
4. **Why** was paper-spec trusted as proxy? — Because we'd written the paper; we conflated "we know what this should do" with "the code does that."
5. **Why** does that conflation persist? — Because we don't have a `validation_card.md` per model recording the gap between "what the paper says" and "what the trainer optimizes for."

### MIND Clean v2

1. **Why** does Clean v2 predict normal always? — Because the optimizer found the constant function on a 2057:1 imbalanced loss.
2. **Why** was the loss imbalanced? — Because the dataset was constructed without class weighting / resampling.
3. **Why** wasn't that flagged? — Because the trainer reported 99% raw accuracy, which looked successful.
4. **Why** did raw accuracy look successful on a 2057:1 dataset? — Because we didn't check the class distribution before believing the metric.
5. **Why** didn't we check class distribution? — Because there was no pre-promotion checklist requiring it.

The two "fifth whys" converge: there is no pre-promotion gate that forces the right questions to be asked.

---

## Detection narrative — what we got lucky on

Neither failure was caught by a planned validation activity. Both detections were side effects of unrelated work.

- **VIGIL** surfaced because §9.1 keystone-bridge work asked "what actually populates `channel_quality_assessments`?" — a question motivated by needing the channel-dependency gate to fire on real signal, not by suspicion of VIGIL. If §9.1 had been deferred, VIGIL would still be live.
- **Clean v2** surfaced because writing the VIGIL deprecation prompted "same pattern, what else is live without a validation row?" — a hypothesis-driven sweep that took an hour. If the VIGIL incident hadn't happened, Clean v2 would still be live too.

Two failures, one incidental detection that surfaced one of them, and a fast follow-up sweep that caught the other. We were one unrelated workstream away from neither being detected. This is the load-bearing observation for the action items below.

---

## Action items

| # | Action | Owner | Due | Status |
|---|---|---|---|---|
| 1 | Apply `model_validation_runs` migration | H | 2026-06-02 | **DONE** (MCP, `20260602000100`) |
| 2 | Deprecate Clean v2 in `model_versions` | H | 2026-06-02 | **DONE** (`20260602000000`) |
| 3 | I-Plane stop loading Clean v2 ONNX at startup | H | 2026-06-02 | **DONE** (`e349f91`) |
| 4 | Frontend honest-render Clean v2 windows as `pending` | H | 2026-06-02 | **DONE** (`44cfa2b`) |
| 5 | Backfill Triage v3 validation row | H | 2026-06-02 | **DONE** (`467d299c-…`, AUC 0.870 @ n=100) |
| 6 | Re-validate Triage v3 at n=100 (not n=40) | H | 2026-06-02 | **DONE** (`f84a3f8`) |
| 7 | Audit other `serving` models for missing validation rows | H | 2026-06-04 | **PENDING** — known: `mind_heuristic_seizure`, any other rows where `status='serving'` AND no `model_validation_runs` join |
| 8 | Smoke test that proves trigger rejects bad inserts | H | 2026-06-04 | **PENDING** — tracked as task #80; target: `scripts/test_validation_gate_blocks.py` |
| 9 | AEGIS validation harness | H | 2026-06-02 | **DONE** (`scripts/validate_aegis_tuh.py`, 34 unit tests pass) |
| 10 | VERTEX per-head validation plan | H | when training starts | **DONE — design only** ([`docs/vertex_heads_design.md`](../../encephlian-core/docs/vertex_heads_design.md)) |
| 11 | Pre-promotion validation runbook | H | 2026-06-09 | **PENDING** — short doc enumerating: holdout choice, class-distribution check, asymmetry-per-task metric pick, verdict assignment |
| 12 | Query studies with findings citing deprecated model versions; notify clinics if count is non-trivial | H | 2026-06-04 | **PENDING** |
| 13 | Per-model `validation_card.md` template (paper-vs-trainer-vs-contract gap) | H | 2026-06-09 | **PENDING** |
| 14 | Integration-level validation design for composite systems (ensemble emergent behavior) | H | when ensemble ships | **OPEN** |

---

## Process changes — how we work going forward

Distinct from the trigger; these are the habits the trigger formalizes.

1. **Trainer-reported metrics are advisory, not authoritative.** The trainer reports what the optimizer saw. The validator reports what the world looks like. Different jobs.
2. **Class-distribution check before training.** A 30-second look at `Counter(y_train)` would have killed Clean v2 deployment. Add to every training script's first log line.
3. **Pick the task-appropriate asymmetry up front.** Triage models are sensitivity-asymmetric (false negative on a sick patient is worse than false positive). Quality classifiers are precision-asymmetric. Decide before training, name in the `validation_card.md`, validate against it.
4. **Independent holdout per model family, rotated.** Reusing the same TUH subcorpus across generations turns it into training data. Per-model-family holdout assignment recorded in the validation row's `notes`.
5. **Validation card written before the model is registered.** Not after, not in parallel. The act of writing what success looks like surfaces ambiguity (or absence of an answer) before the model is even trained.

---

## Tested-but-prevented examples

The trigger went live 2026-06-02 PM. As of this writing (~hours later), no production `status='serving'` write has been attempted. Action item #8 (smoke test) will artificially attempt an invalid insert and assert that the trigger rejects it. Until that test exists and runs in CI, we have a deployed-but-unproven guard rail.

**Proposed smoke test** (target: `scripts/test_validation_gate_blocks.py`):

```sql
-- Setup: create a temporary model_versions row in 'development'
-- Attempt 1: UPDATE to 'serving' without a model_validation_runs row.
-- Expected: RAISE EXCEPTION 'model_versions.status=serving requires a passing model_validation_runs row'.
-- Attempt 2: INSERT a model_validation_runs row with verdict='weak'.
--           UPDATE to 'serving' again.
-- Expected: same EXCEPTION (weak verdict not sufficient).
-- Attempt 3: UPDATE the validation_runs row to verdict='functional'.
--           UPDATE model_versions to 'serving' again.
-- Expected: success.
-- Cleanup: delete the temporary rows.
```

This belongs in the next deploy. Until run, the trigger is faith, not fact.

---

## What the trigger does NOT protect against

The validation gate is a pre-launch gate. Things outside its scope, in scope-creep order:

1. **Calibration drift.** A model that worked at launch and drifted as the population shifted is `model_calibration_runs` territory (Phase 1D, deferred).
2. **Distribution shift over time.** Same as drift, but covering input distribution rather than output calibration. Tracked by edit-delta accept rates per finding kind (see [`docs/edit_delta_retraining_design.md`](../../encephlian-core/docs/edit_delta_retraining_design.md) §2 Trigger B).
3. **Composite / ensemble emergent behavior.** The trigger fires per `model_version`. An ensemble (AEGIS + Triage v3 + a deterministic rule) has emergent behavior that per-model validations don't capture. Integration-level validation is a later problem and an open action item.
4. **Grandfathered serving models.** The trigger only fires on UPDATE. Models already at `serving` before 2026-06-02 still need a validation row before any future status change. Triage v3 done; `mind_heuristic_seizure` open.
5. **Holdout contamination.** Reusing the same TUH subcorpus across model generations turns it into training data. Document holdout choice in the validation row's `notes` field; rotate across families.
6. **Models that pass validation but fail on a specific subpopulation.** TUH-Abnormal averages across many sites. A model can be 0.87 AUC overall and 0.45 on a single clinic's equipment. Per-clinic stratified validation is the next phase, tied to per-clinic ops dashboard work (task #61).
7. **Models that pass validation on one task and are misused for another.** Triage v3 is a triage model. It is not a localization model. Nothing in the trigger prevents the frontend from rendering a `localized_at` field derived from Triage v3 — that's a frontend/contract problem, not a validation gate problem.

---

## Lessons learned

Distinct from action items. Phrased generally so they apply to the next similar pattern.

1. **Structural honesty (§9 gates) is not the same as predictive correctness.** §9 stops the model from lying about *what* it produced. Validation stops it from being silently wrong about *predictions*. Both are required; one does not imply the other.
2. **The validator must be independent of the trainer.** Same script, same author, same week is not independence. Different data, different reviewer, different time pressure is.
3. **A column is not an enforcement mechanism.** Triggers + DB constraints are. The pattern generalizes: every claim a row makes about external reality (`status='serving'`, `verified=true`, `approved=true`) needs a structural guard rail, or it is a soft promise that someone in a hurry will break.
4. **The gradient descent loop cannot grade its own homework.** Loss going down is a claim about training, not about the world. Always separate "did training converge" from "is the model correct."
5. **When a metric looks too good, check the class distribution.** 99% on a binary classifier means either you've cured cancer or one class is 99% of the data. The second is more common.
6. **Incidental detection is not a strategy.** If both incidents were caught by sideline work on a different problem, the next one might not be. The trigger replaces "we'll notice eventually" with "the next mistake will halt at the DB layer."

---

## Glossary

- **VIGIL** — `mind_vigil` model family; clinic-invariant signal-quality estimator. Deprecated 2026-05-31.
- **MIND Clean v2** — `mind_clean` v2.0.0; artifact classifier. Deprecated 2026-06-02. v1 (deterministic rule) still serving.
- **MIND Triage v3** — `mind_triage` v3.x; abnormal/normal classifier. Currently serving, AUC 0.870 @ TUH-Abnormal n=100.
- **`model_versions`** — Supabase table; one row per model checkpoint. `status ∈ {development, validated, serving, deprecated}`.
- **`model_validation_runs`** — new table (2026-06-02). One row per independent-holdout evaluation. Columns: `model_version_id`, `corpus`, `n_studies`, `n_files`, `metrics jsonb`, `verdict ∈ {failed, weak, functional, excellent}`, `notes`, `run_at`, `run_by_user_id`.
- **`enforce_model_validation_for_serving`** — BEFORE UPDATE trigger on `model_versions`. Raises EXCEPTION when `NEW.status='serving'` unless a `model_validation_runs` row exists with `verdict ∈ {functional, excellent}`.
- **Verdict** — human-assigned judgment, not auto-computed. `functional` requires naming the task's correct asymmetry was met. `excellent` requires substantially exceeding the bar. `weak` and `failed` are honest options.
- **§9 gates** — honest-output infrastructure ensuring outputs declare provenance + pendingness; does not validate correctness.
- **`channel_quality_assessments`** — table populated by C-Plane from ESF channel_quality side-channel. Was being filled by VIGIL attention weights; now filled by deterministic rule pending AEGIS.
- **Attention weights vs quality output** — VIGIL's bug: attention weights from internal self-attention layers were exported as the per-channel quality contract field. Different semantic, different scale, different optimizer-supervision status.
- **Modal-class collapse** — when an imbalanced-class trainer learns to always predict the majority class because it minimizes unweighted cross-entropy. Clean v2's exact failure.
- **Independent-holdout** — corpus the trainer has never seen, ideally from a different distribution. TUH-Abnormal for Triage; TUH-Artifact-V3.0.1 for Clean v2 validation.

---

## References

- Migration: `supabase/migrations/20260602000100_model_validation_gate.sql` — the table + trigger DDL.
- Migration: `supabase/migrations/20260602000000_deprecate_mind_clean_v2.sql` — Clean v2 deprecation marker.
- I-Plane: `apps/iplane/main_onnx.py` — Clean v2 used to be loaded here at startup. As of commit `e349f91`, `CLEAN_MODEL` stays `None` and all call sites are guarded.
- C-Plane: `apps/cplane/main.py` — biomarkers.json now writes `artifact_classifier: {status: "deprecated_pending_aegis"}` instead of attempting Clean v2 inference.
- Trainer (broken): `encephlian-core/apps/training/train_aria_vigil.py` — historical reference. Scripts diverged from the paper §5 spec.
- Validator (discovery): `encephlian-core/scripts/validate_mind_clean_v2_tuh.py` — the 100-line script that surfaced Clean v2's 25.78% accuracy.
- Validator (template): `encephlian-core/scripts/validate_aegis_tuh.py` — pattern to mirror for every future model family. Five gates (G1–G5), verdict tiering, posts to `model_validation_runs`.
- Validator (re-validation): `encephlian-core/scripts/validate_mind_triage_v3_tuh.py` — Triage v3 re-validation at n=100.
- Frontend: `src/components/report/TrustAuditPanel.tsx` — Clean v2 rows render as pending.
- Frontend: `src/pages/admin/AdminValidationRuns.tsx` — admin viewer for `model_validation_runs`.
- Companion design: [`docs/vertex_heads_design.md`](../../encephlian-core/docs/vertex_heads_design.md) — how the same validation gate applies to the next four task heads.
- Companion design: [`docs/edit_delta_retraining_design.md`](../../encephlian-core/docs/edit_delta_retraining_design.md) — how drift detection complements the launch-time gate.
- Companion design: [`docs/augur_integration_interface.md`](../../encephlian-core/docs/augur_integration_interface.md) — how AUGUR (next major model) inherits this contract.

---

*Postmortem ends. Read it in three months. Or sooner, if `model_versions.status='serving'` ever changes without a `model_validation_runs` row to back it.*
