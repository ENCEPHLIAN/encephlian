# ENCEPHLIAN honest-output contract — Phase 1A

Backend writers (iplane, cplane, edge functions) reference this doc when
deciding what to emit. The frontend treats these as hard contracts and
will refuse payloads that don't match.

## 1. Where the contracts live

```
Canonical Zod schemas (TypeScript) → src/shared/mindReportV2.ts
Canonical JSON Schemas (DB row)    → public.schema_definitions(name, version)
Shape-check trigger (DB)           → studies.triage_draft_json (BEFORE INSERT/UPDATE)
Boundary validator (frontend)      → parseMindReportV2() at HonestReportWrap
```

When the contract changes, all four move together.

## 2. What goes into `studies.triage_draft_json`

A single JSON object matching exactly one of:

| `schema_version`     | Status      | Notes                                                                  |
|----------------------|-------------|------------------------------------------------------------------------|
| `"mind.report.v1"`   | Legacy      | What iplane emits today. Frontend adapter promotes to v2 on read.      |
| `"mind.report.v2"`   | Current     | What backend should target for new code. Frontend validates strictly. |

The DB trigger rejects anything else.

### v2 required top-level keys

```
schema_version, study_id, generated_at, generated_by, summary,
limitations, signature, background_activity, interictal, ictal,
photo_modulators
```

`study_id` MUST equal the row's `studies.id` — the trigger enforces this.
`summary.{asserted_count,pending_count,limitations_count}` are required
integers and the frontend recomputes them; if you send wrong counts the
frontend overwrites them silently (don't depend on them).

### Provenance for every clinical claim (FieldProposal)

Every leaf clinical claim is a FieldProposal:

```jsonc
{
  "field_id": "background_activity.pdr_frequency_hz",  // stable dot-path
  "value":    9.2,                                      // or null
  "provenance": {
    "derived_from":  "rule",                            // model | rule | biomarker | pending | clinician
    "source":        "score_engine_v1",                 // required
    "version":       "1.2.0",                           // optional
    "model_version": null,                              // required if derived_from='model'
    "model_run_id":  null,                              // optional, audit linkage
    "rule_name":     "score_pdr_v1",                    // required if derived_from='rule'
    "rule_version":  "1.0",
    "confidence":           0.85,                       // raw [0,1], optional
    "calibrated_confidence": null,                      // post-Platt, optional
    "pending_reason":  null,                            // required if derived_from='pending'
    "missing_channels": null,                           // required if derived_from='pending' and a channel issue
    "missing_markers":  null                            // required if derived_from='pending' and a marker issue
  },
  "required_channels": ["O1", "O2"],                    // channel-dependency gate input
  "derivation_path":   ["bs_ratio=0.012 → continuous"],// optional human trace
  // edit metadata (filled by frontend on clinician override):
  "original_value":        null,
  "original_derived_from": null,
  "edit_timestamp":        null,
  "edited_by":             null,
  "information_value":     null
}
```

If `derived_from = "pending"`, `value` MUST be null. `pending_reason` MUST
be a non-empty human-readable string.

## 3. Tables backend writers should populate

When iplane completes a triage:

```
1. studies.triage_draft_json  ← v1 or v2 payload (above)
2. report_emission_events     ← one row per emission
3. (later) channel_quality_assessments  ← when VIGIL ships
```

### `report_emission_events` insert template

```jsonc
{
  "study_id":         "<study uuid>",
  "emitted_by":       "iplane:9375a0b",       // pipeline_name + ":" + git_sha
  "schema_name":      "mind.report.v1",        // matches studies.triage_draft_json.schema_version
  "schema_version":   "1.0.0",                 // matches schema_definitions.version for that name
  "model_version_id": "<uuid from model_versions>",  // null if heuristic
  "payload_sha256":   "<sha256 of the JSON payload as text>",
  "payload_preview":  {"triage": "...", "biomarkers": "..."},  // top-level keys only, no values
  "request_id":       "iplane_xxxxxxxx"        // optional correlation id
}
```

This row is the audit trail. Without it, the frontend can show the report
but operators can't tell which model version produced what claim.

### `channel_quality_assessments` insert template (VIGIL output)

```jsonc
{
  "study_id":         "<study uuid>",
  "channel_label":    "O1",
  "source":           "vigil",
  "source_version":   "1.0.0",
  "source_model_id":  "<uuid from model_versions where name='vigil'>",
  "quality_class":    "good",   // good | degraded | bad | missing
  "confidence":       0.92,
  "details":          { "spectral_artifact_score": 0.04 }
}
```

UNIQUE on `(study_id, channel_label, source, source_version)` — re-runs
must use UPSERT (`ON CONFLICT DO UPDATE`) or a new source_version.

## 4. Model identity is content-addressable

Every model in `model_versions` has a `weights_sha256`. Backend SHOULD
compute the sha256 of the model weights file at deploy time and write it
back to the row. This lets any consumer verify "the report I'm looking
at was produced by exactly THIS model" without trusting a name string.

## 5. State machine

`studies.state` enum values (rename in 20260528000000):
- `uploaded`        — file in blob, no SLA chosen yet
- `awaiting_sla`    — file uploaded, awaiting SLA selection
- `processing`      — iplane is running
- `triage_draft`    — iplane done, clinician hasn't started review (was `ai_draft`)
- `in_review`       — clinician is editing
- `signed`          — locked
- `failed`          — processing error
- `complete` / `completed` — legacy, treat as `signed`

iplane MUST write `'triage_draft'` (not `'ai_draft'`). The DB trigger
auto-rewrites legacy 'ai_draft' for safety but logs are cleaner if
backend uses the correct value directly.

## 6. Versioning policy

- The schema_version string in the payload is the CONTRACT. Increment
  when the SHAPE of FieldProposal or section structure changes.
- The schema_definitions.version (e.g. `2.0.0`) tracks evolution of the
  same contract — minor for backward-compat additions, major for breaks.
- A backend writer SHOULD reference the schema definition row by
  `(name, version)` so we know exactly which evolution they targeted.

## 7. Information value (post-v1)

`clinician_edit_deltas.information_value` is computed offline by the
training pipeline (paper §10.3 / §12.3). Backend should leave it null on
insert. The pipeline backfills it via UPDATE. RLS allows UPDATE only by
super_admin/ops, so backend writers can't accidentally clobber.

## 8. What backend should NOT do

- Don't write to `studies.ai_draft_json` directly. The column exists for
  back-compat but the trigger mirrors writes to `triage_draft_json` and
  the old column will be dropped in a follow-up migration. Use the new
  column directly.
- Don't write to `audit_logs` for clinician feedback events — use
  `clinician_edit_deltas` (proper canonical sink).
- Don't bypass the shape-check trigger. If you need to write a malformed
  payload for debugging, write to a separate table.
