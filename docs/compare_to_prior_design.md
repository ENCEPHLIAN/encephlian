# Compare-to-Prior — Design Document

**Author:** planning agent
**Date:** 2026-06-05
**Status:** Design only. No code changes implemented. Several knobs (minimum reportable delta thresholds, "same patient" join policy, prior-picker default ordering) depend on the *shape of the actual longitudinal corpus*, which we will not see until a non-trivial number of clinics have ≥3 studies per patient. Defaults below are conservative starting points, tagged as such, intended to be revised after the first 100–500 patient-with-prior pairs land.
**Companion docs:** `docs/postmortem_vigil_clean_v2.md` (validation gate context); `encephlian-core/docs/augur_integration_interface.md` (provenance + refusal idiom to mirror); `encephlian-core/docs/edit_delta_retraining_design.md` (volume-driven trigger pattern); `encephlian-core/docs/specs/esf-v1.md` (signal-level invariants the comparison depends on).

---

## TL;DR

- **Three layers of comparison, three different latencies.** Signal-level (viewer overlay, computed on read), biomarker-level (cached delta per study-pair, computed at I-Plane finalisation), finding-level (rendered into the report under a new "Compared to prior" subsection).
- **"Prior" is `(patient_id, clinic_id, signed_at < current_study.signed_at)`, most recent first.** No cross-clinic prior. No fuzzy patient match in P0. Baseline-vs-most-recent is a viewer toggle, not a separate comparison mode.
- **Honest output is non-negotiable.** Any comparison whose backing data is incomplete (different vendor, < 19 ch on the prior, prior used a deprecated model version, prior was hand-edited away from model output) emits a section-pending sentence — never a confabulated delta. This mirrors AUGUR's `derived_from="pending"` refusal idiom.
- **No new model.** Comparison is deterministic arithmetic on existing per-study artefacts. No `model_versions` row, no validation gate of its own. The biomarker delta inherits the validation status of the upstream biomarker.
- **Single new table `study_comparison_runs`,** computed at I-Plane finalisation. Per study: row carries `compared_to_study_id`, the biomarker delta matrix, per-finding change tags. Recomputed if either side's report changes; otherwise cached.
- **Minimum reportable delta is percentile-of-prior-population, not absolute µV.** Below the 25th percentile of cross-clinic biomarker variability → "no meaningful change." Above the 75th → "change."
- **Viewer UX: a "Prior" tab in the right rail.** Pilot SKU sees only the per-finding subsection in the report. Internal SKU sees signal overlay + biomarker chart + finding delta table.
- **10 open questions** for the user before P0 ships: patient-identity policy, comparison-against-baseline-vs-most-recent default, whether to surface comparisons for un-signed prior reports, edit-delta-vs-model-output as authoritative prior, and 6 others.

---

## 1. Scope — what counts as a "prior"

A "prior" study P for current study C is defined as:

```
P.patient_id          = C.patient_id            -- exact text match
AND P.clinic_id       = C.clinic_id             -- same clinic, P0
AND P.state           = 'signed'                -- prior must be finalised
AND P.signed_at       < C.signed_at             -- strict before
AND P.created_at      < C.created_at - 7 days   -- not the same physical session
AND P.created_at      > C.created_at - 24 months -- staleness ceiling
```

### Patient identity

`studies.patient_id` is a free-text field today (see `supabase/migrations/20251003122428_…sql:163`). It is operator-entered at upload, lives in `studies.meta->>patient_id`, and is the only join key available. There is no canonical patient table.

**P0 policy:** exact-text match within a clinic. No normalisation, no fuzzy matching, no cross-clinic prior. If a clinic uses `"MRD-1234"` for one upload and `"MRD 1234"` for the next, no prior is found. The "no prior available" UI is the honest answer for that case.

**P1 candidate (not in P0):** a `clinic_patient_aliases` table the clinic admin can populate (`alias_text → canonical_text`). No automatic similarity match — that produces false positives and the consequence ("you compared the wrong patient's brain") is worse than a missed comparison.

### Clinic boundary

Cross-clinic prior is explicitly out of scope. Two reasons:
1. **RLS.** `studies` RLS today is `user_belongs_to_clinic(auth.uid(), studies.clinic_id)`. A cross-clinic prior would require either a service-role bypass (auditable) or a per-patient consent token (doesn't exist). Defer until a clinical workflow demands it.
2. **Comparable physics.** A different clinic means a different amplifier, possibly different montage convention, different impedance baseline — comparison validity drops sharply. ESF normalises to 19 ch × 250 Hz × robust-z, so most clinical signal *is* comparable, but vendor-specific artefact profiles (Persyst INI-based bandpass, Nihon Kohden DC blocker) leak through.

### Multiple priors

When P has multiple eligible priors, default to **most-recent**. The report shows "Compared to prior (study #N, YYYY-MM-DD, N days ago)". The viewer "Prior" tab has a dropdown to pick a different prior (including the first/baseline study). The dropdown is the only place baseline-vs-most-recent is selectable in P0.

### Edge cases the scope handles

- **C is the first study for the patient.** No P. Comparison UI emits the "no prior available" state explicitly. Not an error.
- **P is unsigned.** Excluded. We do not compare against a draft someone might never finalise.
- **C and P are the same upload split into two records (operator error).** The 7-day floor catches the common case. Doesn't catch a deliberate re-upload of the same recording weeks later — manual de-dup is a known gap.

---

## 2. What to compare — three levels

### 2a. Signal-level (viewer only)

The viewer can overlay the prior study's normalized signal on the current study's signal for the same montage and a comparable time window. Both signals are robust-z-normalized per ESF v1 (`docs/specs/esf-v1.md` §4.5), so amplitudes are unit-free and visually comparable — the comparison is shape-and-timing, not absolute µV.

- **Time alignment:** the prior is anchored to its own start-of-recording; current is anchored to its own. The user's cursor in the current viewer maps to the **same elapsed-time-since-recording-start** on the prior. There is no clock-time alignment because the two recordings happen on different days. The cursor sync UI is explicitly a "wall-clock offset, not aligned" affordance — the docs call out the asymmetry so clinicians don't misinterpret.
- **Montage:** must match. If the user changes the current viewer to "bipolar longitudinal", the prior overlay also goes to "bipolar longitudinal". If a channel needed for the current montage is BAD/MISSING on the prior (per `channel_quality_assessments`), the overlay for that derivation is suppressed and the row renders a "prior channel unavailable" hairline.
- **Comparable window:** the user picks the window on the current study. The prior overlay shows the same window length (e.g. 10 s) anchored at the same elapsed seconds. There is no automatic "find the comparable physiological state" — that is a research problem.
- **Rendered as a faded overlay**, default 40% opacity, semantic colour `muted-foreground` (per aesthetic norm: prior is context, not signal). Toggleable: overlay, split, off. Default off — the user opts in.

### 2b. Biomarker-level (cached)

For each biomarker emitted by `libs/esf/biomarkers.py`, compute a per-pair delta:

| Biomarker | Comparison unit | Delta semantics |
|---|---|---|
| `ripple_rate_per_min` | events / min | absolute difference + percentile rank vs prior-population variability |
| `sharp_transient_rate_per_min` | events / min | same |
| `burst_suppression_ratio` | dimensionless 0–1 | absolute difference; threshold for "meaningful" is asymmetric (any non-trivial BS in C when P was 0 is reportable) |
| `background_continuity_pct` | percentage | absolute difference; ≥10 pp threshold |
| `amplitude_asymmetry_max_index` | dimensionless 0–1 | absolute difference; ≥0.10 threshold |
| `pdr.frequency_hz_range` lower bound | Hz | absolute difference; ≥1.5 Hz threshold |
| `pdr.asymmetry_index` | dimensionless | absolute difference; ≥0.15 threshold |

Robust-z normalisation in ESF v1 + the amplitude-invariant refactor of 2026-06-02 (4.6× variance reduction cross-vendor, per the design intent) means these comparisons are roughly vendor-stable. **Roughly is not exactly** — vendor variance is reduced, not zero. See §7 for the minimum-reportable-delta framing that absorbs the residual variance.

Each biomarker delta entry carries:
- `biomarker_kind`
- `current_value`, `prior_value`
- `delta_abs`, `delta_percentile_rank_of_prior_population`
- `reportable` (bool, gated by §7 minimum-reportable-delta rule)
- `caveat` (string, populated when the comparison is suppressed for a structural reason — see §8)

### 2c. Finding-level

For each entry in `ScoreReport.findings_audit` on C, look up the corresponding entry on P (matched by `kind`). One of four states:

| State | Definition | Report rendering |
|---|---|---|
| `unchanged` | Both sides emitted with semantically equivalent value | "Persistent: <finding name> was present on the prior study and remains." |
| `new` | C emitted; P had no entry of this `kind`, or P entry had `derived_from="pending"` | "New since prior: <finding name>." |
| `resolved` | P emitted; C has no entry, or C entry has `derived_from="pending"` | "Resolved since prior: <finding name>." |
| `changed` | Both sides emitted, value differs in a clinically meaningful way (per §7) | "Changed since prior: <finding name> — was <X>, now <Y>." |

"Semantically equivalent" is a per-`kind` predicate (e.g. `background.pdr` is equivalent if the parsed lower-bound Hz is within 1.5 Hz). The predicate library lives in the proposed `libs/score/compare.py` module.

Two states are **never** emitted:
- `worsened` / `improved`. Clinical interpretation is the neurologist's job, not the engine's. We emit "asymmetry index went from 0.15 to 0.30 (above the 75th-percentile delta threshold)." The clinician decides whether that is worse.
- `equivalent` when both are `pending`. We emit "both studies have insufficient data on <finding>" instead.

---

## 3. UX in the viewer

The viewer (`src/pages/app/SignalViewer.tsx`) gains a single new affordance: a **"Prior"** tab in the right rail, sibling to `AnnotationPanel`.

```
┌─ EEG canvas ─────────────────────────┬─ Right rail ─────────┐
│                                      │  [Channels] [Annot]   │
│ ░░ prior overlay (40% opacity) ░░    │  [Prior]              │
│ ── current signal (full opacity) ──  │  ┌──────────────────┐ │
│                                      │  │ Prior            │ │
│                                      │  │ Study #2         │ │
│                                      │  │ 2026-03-12       │ │
│                                      │  │ (85 days ago)    │ │
│                                      │  │ ──────────────── │ │
│                                      │  │ Overlay: ●○○     │ │
│                                      │  │  (off/over/split)│ │
│                                      │  │ ──────────────── │ │
│                                      │  │ Same montage: ✓  │ │
│                                      │  │ Same vendor:  ✓  │ │
│                                      │  │ Channels avail:  │ │
│                                      │  │  19/19           │ │
│                                      │  └──────────────────┘ │
└──────────────────────────────────────┴───────────────────────┘
```

- **Picker:** dropdown listing all eligible priors (most-recent first), with the most-recent selected by default. Each item shows date + study handle + days-since.
- **Overlay control:** three states — off, overlay, split-view. Default off. The first time a clinician opens a study with a prior, a one-time toast informs them the affordance exists.
- **Cursor sync:** when overlay is on, the prior's render window starts at the same elapsed-seconds-from-recording-start as the current. Documented clearly: "Prior aligned by elapsed-time; the studies were not recorded simultaneously."
- **No prior available:** the Prior tab shows a single muted line: "First study on file for this patient." No empty state with a coyote-and-roadrunner illustration. The clinician needs information, not decoration.
- **Vendor / montage mismatch warning:** if the prior used a different `source_format` or has any BAD/MISSING channel needed for the current montage, the right rail shows a small amber strip: "Prior comparison limited — different vendor (Persyst → Nihon Kohden)." Overlay still works; the warning travels with it.

**Pilot SKU vs Internal SKU:**
- **Pilot:** the Prior tab is hidden. Pilot clinicians get the *report* surface (§4) but not the signal overlay. Rationale: signal overlay needs clinical interpretation that the pilot SKU's intended workflow (technician uploads → neurologist reads structured report) doesn't include in P0. Per `pilot_internal_split_design.md`, pilot is the "value-first, less chrome" tier.
- **Internal:** full Prior tab with overlay + mismatch warnings.

---

## 4. UX in the report

The report (`src/pages/app/StudyDetail.tsx` → `EditableReportV2` → AUGUR prose) gains one new section: **"Compared to prior"**, rendered between the existing "Conclusion" and "Signature" sections.

### Layout

```
─── Compared to prior ──────────────────────────────────────────
  Prior study: #STU-2026-03-12-A (signed 2026-03-12, 85 days
  ago, same clinic, same vendor).

  Findings change since prior:
    • Persistent — Posterior dominant rhythm asymmetry (left).
    • New — Sharp transients over T5 (0.4/min; absent on prior).
    • Resolved — Generalised slowing (mild-to-moderate on prior;
      not present on current).
    • Changed — Background continuity 92% → 78% (Δ −14 pp,
      above the 75th-percentile threshold for meaningful change).

  Biomarker deltas (only reportable shown):
    ripple_rate_per_min       0.8 → 1.4   (+0.6, 88th pctile)
    burst_suppression_ratio   0.00 → 0.04 (asymmetric: new BS)
    amplitude_asym_max_index  0.12 → 0.18 (+0.06, 62nd pctile)

  Items suppressed:
    • Prior used different vendor (Persyst → Nihon Kohden) —
      vendor-specific bandpass artefact may inflate sharp-
      transient count. Sharp transient comparison shown with
      a caveat strip; not in the headline list.
─────────────────────────────────────────────────────────────────
```

### Honesty interactions

- **`derived_from="pending"` on either side gates the comparison out.** If C's `background.pdr` is pending, the section omits the PDR comparison entirely (it does not say "PDR comparison pending" — that would be confabulation; we emit the per-finding pendingness on its own line up in the regular sections, and the compare section just doesn't mention PDR).
- **Model-version skew is surfaced as a caveat strip, not suppression.** If the prior's findings cite `mind_triage_v3.0.0` and the current cite `mind_triage_v3.1.0` (calibrated), the comparison still emits, with a one-liner: "Model version differs across studies (v3.0.0 → v3.1.0 calibrated). Calibration shift may account for ≤0.05 confidence delta on classifier-derived findings."
- **Hand-edited prior findings take precedence over the model's prior output** (see §8 row 6).
- **The compare section is suppressed entirely if `compared_to_study_id` is null.** No "comparison not available" banner — the absence is the message.

### Pilot vs Internal

Pilot and Internal both see the Compared-to-prior section. The only difference: Internal sees a debug-source line ("Computed from study_comparison_runs row 4e7…, recomputed 12 minutes ago") visible only behind `?debug=1` query, matching the pattern in `StudyDetail.tsx`.

---

## 5. Data model

### New table `study_comparison_runs`

```sql
CREATE TABLE public.study_comparison_runs (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  current_study_id         uuid NOT NULL REFERENCES public.studies(id) ON DELETE CASCADE,
  prior_study_id           uuid NOT NULL REFERENCES public.studies(id) ON DELETE CASCADE,
  computed_at              timestamptz NOT NULL DEFAULT now(),
  current_report_sha       text NOT NULL,    -- sha256 of source ScoreReport
  prior_report_sha         text NOT NULL,    -- sha256 of source ScoreReport
  biomarker_deltas         jsonb NOT NULL,   -- [{kind, current, prior, delta_abs, percentile, reportable, caveat}]
  finding_changes          jsonb NOT NULL,   -- [{kind, state, current_value, prior_value, caveat}]
  caveats                  jsonb NOT NULL,   -- [{kind, reason}], e.g. {kind: "vendor_mismatch", reason: "..."}
  suppressed               boolean NOT NULL, -- true when nothing reportable; UI hides the section
  model_versions_used      jsonb NOT NULL,   -- {current: {mind_triage: 'v3.1.0', ...}, prior: {...}}
  CONSTRAINT uq_pair UNIQUE (current_study_id, prior_study_id, current_report_sha, prior_report_sha)
);

CREATE INDEX idx_scr_current ON public.study_comparison_runs(current_study_id);
CREATE INDEX idx_scr_prior   ON public.study_comparison_runs(prior_study_id);

ALTER TABLE public.study_comparison_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY scr_select ON public.study_comparison_runs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.studies s
            WHERE s.id = study_comparison_runs.current_study_id
              AND public.user_belongs_to_clinic(auth.uid(), s.clinic_id))
  );
```

### Why a table, not on-the-fly

Latency. The finding-change diff is cheap (microseconds). The biomarker percentile-rank lookup needs the cross-clinic prior-population distribution, which is a per-biomarker percentile table maintained by a nightly job. Reading it inline on every viewer load is wasteful. Cached row + sha-based invalidation gives us the right shape.

### Invalidation

The `(current_report_sha, prior_report_sha)` UNIQUE constraint is the invalidation key. When either side's `ScoreReport` is regenerated (re-run pipeline, clinician edit, model promotion), the report sha changes, the row is recomputed by the I-Plane finaliser. Stale rows are kept for audit — we never delete a `study_comparison_runs` row; we INSERT a new one.

### Provenance into the existing report

Add one optional field to `ScoreReport`:

```python
@dataclass
class ScoreReport:
    ...
    compared_to_study_id: Optional[str] = None   # null when no prior available
    comparison_run_id:    Optional[str] = None   # FK to study_comparison_runs.id; null when no prior
```

No change to `findings_audit` schema. The per-finding change tag lives in the `study_comparison_runs` row, not in the finding itself. Rationale: a finding's audit entry is about *how the finding came to exist*; comparison is about *the relationship to another study*. Different concerns; different rows.

### Migration list

1. `2026MMDD000000_study_comparison_runs.sql` — table + RLS + indices.
2. `libs/score/schema.py` — add `compared_to_study_id`, `comparison_run_id` to `ScoreReport`.
3. `libs/score/compare.py` — new module: predicate library + delta computation.
4. `apps/iplane/main_onnx.py` — at report finalisation, lookup eligible prior, compute comparison, write row, set `compared_to_study_id` on the emitted report.

No `model_versions` row, no validation gate. See §9.

---

## 6. Where the join happens

Three options were considered:

| Option | Where | Latency | Verdict |
|---|---|---|---|
| C-Plane during canonicalisation | After ESF write | Adds vendor-aware canonicalisation step before inference | Rejected. C-Plane has no concept of "report"; only signal. Cannot do finding-level compare. |
| I-Plane at report finalisation | After full SCORE report is built | ~50–200 ms (one extra Supabase SELECT + arithmetic) | **Recommended.** I-Plane already sees the full report and has Supabase access. |
| Frontend on study load | E-Plane, react-query | 200–500 ms first paint | Rejected for biomarker delta (percentile lookup is heavy). Acceptable for the signal overlay (no DB hit beyond `studies` row). |

Hybrid: biomarker-level + finding-level cache in I-Plane (Option 2). Signal-level lazy in the frontend (Option 3). The `study_comparison_runs` row contains everything the report needs; the viewer reads `studies.meta` + `study_files` for the prior on demand.

**Latency budget at I-Plane:** ≤300 ms additional. The lookup is one Supabase SELECT to find the prior, one SELECT to read the prior's `ScoreReport`, one arithmetic pass to compute deltas. Percentile-rank lookups are precomputed nightly and read from a small in-memory table loaded at I-Plane startup.

---

## 7. Statistical handling

### Minimum reportable delta — percentile-of-prior-population framing

Absolute thresholds are wrong because biomarker variance shifts with population. A 0.3 events/min delta in ripple rate means very different things in a paediatric epilepsy clinic vs an adult routine clinic. We instead use a per-biomarker percentile cutoff:

```
For biomarker B:
  Let D = distribution of |delta| values across all (current, prior) pairs
          in the trailing 90 days, same biomarker, all clinics.
  P50, P75 = 50th and 75th percentile of D.

  reportable(delta) := |delta| >= P75    -- "above the 75th percentile of typical change"
  noteworthy(delta) := P50 <= |delta| < P75    -- shown with a fainter strip
  noise(delta)      := |delta| < P50    -- suppressed entirely
```

P50 and P75 are recomputed nightly by a Supabase scheduled edge function (or, simpler, a cron job on the existing Azure VM). For the first 30 days of production, with no historical distribution yet available, conservative literature-derived defaults apply (named in the proposed `libs/score/compare_thresholds.py`, with `source = "literature_default_v0"` and a TODO to recompute).

### Per-biomarker thresholds (initial defaults)

| Biomarker | P75 default | Source | Confidence |
|---|---|---|---|
| `ripple_rate_per_min` | 0.6 events/min | Internal TUH calibration | low — will recalibrate after 30 days |
| `sharp_transient_rate_per_min` | 0.4 events/min | Internal | low |
| `burst_suppression_ratio` | 0.03 | Asymmetric: any new BS in C when P was 0 is reportable regardless | high |
| `background_continuity_pct` | 10 pp | Clinical convention | medium |
| `amplitude_asymmetry_max_index` | 0.10 | Internal | medium |
| `pdr.frequency_hz_range` lower bound | 1.5 Hz | Beniczky / SCORE | high |

### Model-version skew

The validation gate (`postmortem_vigil_clean_v2.md`) makes every `model_versions` row a contractual claim. Comparison must handle the case where prior's `mind_triage v3.0.0` and current's `mind_triage v3.1.0` agree on a finding but the score band differs (e.g. v3.0.0 was uncalibrated; v3.1.0 has Platt calibration).

Policy:
- **Comparison still runs.** The output emits the *finding-level* change (which is calibration-invariant: "abnormal" is "abnormal"), not the *score-level* change.
- **A caveat row is added** to `caveats` JSONB: `{"kind": "model_version_skew", "current": "mind_triage_v3.1.0", "prior": "mind_triage_v3.0.0", "reason": "calibration update; ≤0.05 confidence delta expected"}`.
- **Findings whose prior cited a deprecated model** (e.g. Clean v2, VIGIL) are excluded from comparison. The caveat strip says: "Prior finding cited mind_clean v2 (deprecated 2026-06-02). Comparison suppressed."

---

## 8. Edge cases

| # | Case | Behaviour |
|---|---|---|
| 1 | First study for patient | `compared_to_study_id = null`. No `study_comparison_runs` row written. Compare section omitted from report. |
| 2 | Prior from different vendor | Comparison runs. Caveat `{kind: "vendor_mismatch", current: "edf", prior: "persyst_lay"}` added. Sharp-transient and ripple comparisons specifically demoted to "noteworthy" tier regardless of magnitude (vendor-bandpass affects these most). |
| 3 | Prior has <19 channels (BAD/MISSING) | Per-finding: if any required_channel for a biomarker or rule is BAD/MISSING on the prior, that specific comparison is suppressed with caveat `{kind: "channel_gate_prior", offending: ["T5","T6"]}`. Other comparisons proceed. |
| 4 | Patient moved clinics | P0: cross-clinic prior is not searched. Compare section says nothing. P1: if `clinic_patient_aliases` exists, cross-clinic prior may be eligible with an explicit `{kind: "cross_clinic", reason: "alias mapping"}` caveat. |
| 5 | Model version skew (Triage v3.0.0 → v3.1.0) | Comparison runs. Caveat `{kind: "model_version_skew"}` added. |
| 6 | Prior was hand-edited by clinician | Use the edited values (the signed `reports` row's structured fields), not the original model output. This is the principle the rest of the pipeline already follows for edit-deltas; we extend it here. Caveat `{kind: "prior_hand_edited", reason: "compared against signed-by-clinician values"}` added only when the edit changed any value that's part of the comparison. |
| 7 | Prior is the current study (operator re-uploaded) | The 7-day floor in §1 catches this. If somehow defeated, the UNIQUE constraint on `(current_study_id, prior_study_id)` permits self-pair but the I-Plane finaliser must check `current_study_id != prior_study_id` (defence in depth). |
| 8 | Prior's `compared_to_study_id` is also set | We compute compare against the *most recent prior*, not against a transitive chain. Reasoning is per-pair. A "trend across 3 studies" view is P2. |
| 9 | Clinician deletes the prior study | `ON DELETE CASCADE` on `study_comparison_runs.prior_study_id` cleans up. Current study's `comparison_run_id` becomes a dangling FK — handled by the I-Plane on next read by recomputing (now finding no eligible prior, so emitting null). |
| 10 | Prior is in `state='in_review'` but never signs | Excluded by §1's `state='signed'` filter. |

---

## 9. Validation gate interaction

Compare-to-prior emits no model output. It emits *arithmetic on already-validated model outputs*. The arithmetic itself does not warrant a `model_validation_runs` row — there is no learned function to validate.

What does warrant guard rails:
- **The biomarker percentile-rank table.** This is a derived artefact recomputed nightly. Its correctness is a function of (a) the upstream biomarker correctness (already validated per biomarker model) and (b) the percentile computation itself (deterministic arithmetic on a known distribution).
- **The finding-level change predicates.** These live in `libs/score/compare.py` and need unit tests (mirror `libs/score/__tests__/` pattern). Per-`kind` test cases: known-equivalent values, known-changed values, edge cases (one side `pending`).

Specifically:
- No new `model_versions` row.
- No new `model_validation_runs` requirement.
- One new test script: `libs/score/__tests__/test_compare.py` — unit tests for each predicate, plus a property test that "compare(A, A) returns all-unchanged for any well-formed report A".
- The §9.1 honest-output infrastructure (channel-quality gate, `derived_from="pending"` provenance) is the ambient honesty layer. Comparison inherits it.

The risk model worth naming: **comparison is a higher-level claim than either model in isolation.** A neurologist reading "asymmetry index +0.20, above the 75th percentile" infers more than either side carries in isolation. Mitigation: the per-finding rendering is descriptive, not interpretive (we say "+0.20 above P75 threshold", not "asymmetry worsened"). The clinical interpretation stays with the clinician — same principle as AUGUR's grammar-first refusal idiom.

---

## 10. Implementation phases

### P0 — ship before pilot scale-up (≤2 weeks)

| Task | Effort | Owner |
|---|---|---|
| `study_comparison_runs` migration + RLS | 0.5 day | infra |
| `libs/score/compare.py` predicate + delta module | 1.5 days | core |
| Per-predicate unit tests | 1 day | core |
| I-Plane finaliser hook: prior lookup → write row | 1 day | I-Plane |
| `ScoreReport.compared_to_study_id` schema addition | 0.5 day | core |
| Compare section in report renderer (text-only) | 1 day | frontend |
| StudyDetail UI: read `comparison_run_id`, render Compare section | 1 day | frontend |
| "No prior available" + caveats UI | 0.5 day | frontend |
| Pilot-vs-Internal SKU gating for signal overlay | 0.5 day | frontend |
| Nightly percentile-rank job (cron on Azure VM, P0 fallback to literature defaults) | 1 day | infra |

P0 explicitly does NOT include: signal overlay in viewer, baseline-vs-most-recent picker, trend across ≥3 studies, cross-clinic priors, automatic AUGUR prose generation for the Compare section (P0 uses a template).

### P1 — first month of pilot

- Signal overlay in `SignalViewer.tsx` with cursor sync.
- Prior picker dropdown (most-recent / baseline / explicit selection).
- `clinic_patient_aliases` table for fuzzy patient-identity recovery.
- AUGUR prose generation for the Compare section (with refusal predicates per §6 in the AUGUR doc).
- Percentile-rank recomputation moves from literature defaults to actual prior-population distribution.

### P2 — later

- Trend rendering across N≥3 studies (sparklines per biomarker).
- Cross-clinic prior with explicit consent token.
- Patient-level dashboard ("all studies for patient X with cross-study summary").
- Compare-export to PDF as a separate trend page.

---

## 11. Open questions (only the user can answer)

1. **Patient identity policy.** Exact-text match within clinic in P0 is conservative but loses comparisons for spelling drift. Acceptable, or do you want `clinic_patient_aliases` in P0 too?
2. **Baseline vs most-recent default.** When a patient has 3+ priors, default the report's Compare section to "vs most recent" or "vs first" (baseline)? Recommendation: most-recent. Want to confirm or override?
3. **Hand-edited prior values as authoritative.** §8 row 6 proposes that when the prior was hand-edited, the edited values (not the model's prior output) drive the comparison. This is the right answer for clinical reasoning but means a clinician edit retroactively changes what "the comparison" says. Confirm acceptable?
4. **Pilot SKU visibility of signal overlay.** Recommendation: hide overlay in pilot, show Compare section in report for both. Do you want pilot to also get the overlay, or stay hidden until they're paying for the additional surface?
5. **Suppression threshold for "noisy" findings.** P50 cutoff suppresses ~half of all measured deltas as noise. If a clinician explicitly asks "what changed?", do they expect to see suppressed-as-noise items too (perhaps in a "see all" expander)?
6. **Cross-vendor caveat severity.** §8 row 2 says vendor mismatch demotes sharp-transient and ripple comparisons. Other biomarkers (continuity, asymmetry) are emitted with no demotion. Is that the right asymmetry?
7. **"Prior" eligibility for unsigned drafts.** P0 excludes drafts. A clinician working through a backlog might want to see a comparison against an unsigned-but-mostly-done prior. Worth a UI toggle, or stay strict?
8. **Percentile-rank table — clinic-stratified?** A high-volume paediatric clinic will skew the cross-clinic distribution. P0 plan is global. Should it be per-clinic in P1, or per-clinic-type (paediatric / adult / ICU)?
9. **Trigger for recomputation on prior edit.** When a clinician edits a *prior* study's report (re-signs after a correction), do all of that patient's later studies' `study_comparison_runs` rows get re-marked stale? P0 plan: yes, by sha changing on the prior, but this means a prior edit can ripple. Confirm acceptable.
10. **Compare section in the signed PDF.** The Compare section is dynamic — adding a new prior later changes the section. Once a report is signed, do we (a) freeze the Compare section into the PDF (no longer updates), (b) keep it dynamic in-app but freeze in PDF, or (c) keep it dynamic everywhere with a "computed-at" timestamp? Recommendation: (b).

---

### Critical Files for Implementation

- `/Users/h/encephlian-core/libs/score/compare.py` (new) — per-predicate comparison library + delta computation + percentile-rank lookup.
- `/Users/h/encephlian-core/libs/score/schema.py` — add `compared_to_study_id` and `comparison_run_id` fields to `ScoreReport`.
- `/Users/h/encephlian-core/apps/iplane/main_onnx.py` — at report finalisation, look up eligible prior, compute comparison, persist `study_comparison_runs` row, stamp `compared_to_study_id`.
- `/Users/h/encephlian/src/pages/app/StudyDetail.tsx` — render the new "Compared to prior" section from `study_comparison_runs` payload; gate signal overlay by SKU.
- `/Users/h/encephlian/src/pages/app/SignalViewer.tsx` — add Prior tab + overlay control + cursor sync (P1).
- `/Users/h/encephlian/supabase/migrations/<datestamp>_study_comparison_runs.sql` (new) — table, RLS, indices.
