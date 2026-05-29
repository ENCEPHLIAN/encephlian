# ENCEPHLIAN honest-output contract

Backend writers (iplane, cplane, edge functions) reference this doc.
Frontend treats it as a hard contract — the DB enforces it.

## 1. Where the contracts live

```
Canonical source         → src/shared/mindReportV2.ts            (Zod)
Generated JSON Schema    → src/shared/mindReportV2.schema.json   (zod-to-json-schema)
DB registry              → public.schema_definitions             (immutable, INSERT-only)
DB validator             → trigger validate_triage_draft_json    (uses pg_jsonschema)
Frontend boundary        → HonestReportWrap → parseMindReportV2  (Zod)
```

When the Zod schema changes, run `npm run export:v2-schema`. Both the
JSON file and a new seed migration are regenerated. Apply the seed
migration to publish the new (name, version) row — schemas are
immutable, so you always INSERT a new version, never UPDATE in place.

## 2. studies.triage_draft_json — the gated column

Every write triggers, in order:

1. **Top-level shape check.** Must be an object with a known
   `schema_version` (`mind.report.v1` or `mind.report.v2`). Anything
   else raises an exception.
2. **For v2 only — schema match.** If `pg_jsonschema` is installed
   AND a `schema_definitions` row exists for that name/version, the
   payload must satisfy `jsonb_matches_schema(<schema>, <payload>)`.
   Otherwise the trigger falls back to a hand-coded check of required
   top-level keys.
3. **study_id mirror.** `payload.study_id` must equal the row's
   `studies.id`.
4. **Channel-dependency gate.** Function `enforce_channel_gate(study_id,
   payload)` walks every FieldProposal and intersects each field's
   `required_channels` with the bad/missing channels recorded in
   `channel_quality_assessments` for this study. Any field that depends
   on a bad channel is REWRITTEN to:
   ```json
   {
     "field_id": "<unchanged>",
     "value": null,
     "provenance": {
       "derived_from": "pending",
       "source": "channel_dependency_gate",
       "pending_reason": "Required channel(s) O1 flagged BAD/MISSING — cannot assert this finding (gate=channel_dependency_v1)",
       "missing_channels": ["O1"]
     },
     "required_channels": ["<unchanged>"]
   }
   ```
   **There is no way to bypass this from the backend.** Even
   `derived_from="model"` with a high confidence gets demoted when its
   required channels are bad.
5. **Summary recompute.** `recompute_v2_summary(payload)` walks the
   payload and overwrites `summary.{asserted_count, pending_count,
   limitations_count}` with the truth. Caller-supplied counts are
   ignored.

After the trigger, the row is committed. A separate AFTER trigger
(`log_triage_emission`) computes `sha256(payload::text)` and inserts a
row into `report_emission_events`. Backend writers do NOT need to
populate the emission table themselves — and they can't lie about the
hash if they try.

## 3. mind.report.v2 contract

`schema_version: "mind.report.v2"` MUST equal that literal. Required
top-level keys: `study_id, generated_at, generated_by, summary,
limitations, signature, background_activity, interictal, ictal,
photo_modulators`.

`limitations[]` carries `{ reason, channels?, markers?, affects_fields? }`.

Every clinical claim in `signature / background_activity / interictal /
ictal / photo_modulators` is a FieldProposal:

```jsonc
{
  "field_id":          "background_activity.pdr_frequency_hz",
  "value":             9.2,                       // or null when pending
  "provenance":        { ... see below ... },
  "required_channels": ["O1", "O2"],              // gate input
  "derivation_path":   ["bs_ratio=0.012 → continuous"],
  "original_value":        null,                  // filled by frontend on edit
  "original_derived_from": null,
  "edit_timestamp":        null,
  "edited_by":             null,
  "information_value":     null
}
```

## 4. Provenance — discriminated union per kind

Each kind has its OWN required fields. Anything missing → schema
validation rejects the write.

### `derived_from: "model"`

```json
{
  "derived_from": "model",
  "source": "mind_triage_v3",
  "model_name": "mind_triage",
  "model_version": "3.0.1",
  "model_run_id": "run_xxxxxxxx",       // optional
  "confidence": 0.87,                    // raw [0,1], optional
  "calibrated_confidence": 0.81          // post-Platt, optional
}
```
- `model_name` + `model_version` are REQUIRED.
- `model_name` SHOULD match a `model_versions.name` row (advisory; not
  yet FK-enforced).

### `derived_from: "rule"`

```json
{
  "derived_from": "rule",
  "source": "score_engine_v1",
  "rule_name": "pdr_from_occipital_alpha",
  "rule_version": "1.0",                 // optional
  "confidence": 0.85                     // optional
}
```
- `rule_name` is REQUIRED.

### `derived_from: "biomarker"`

```json
{
  "derived_from": "biomarker",
  "source": "biomarkers.burst_suppression_ratio",
  "confidence": 0.8                      // optional
}
```
- `source` is REQUIRED. No other fields.

### `derived_from: "pending"`

```json
{
  "derived_from": "pending",
  "source": "v1_adapter",
  "pending_reason": "PDR frequency not measured — eyes-closed posterior alpha epoch insufficient",
  "missing_channels": ["O1", "O2"],     // optional
  "missing_markers":  ["photic_driver"] // optional
}
```
- `pending_reason` is REQUIRED, must be non-empty.
- When `derived_from = "pending"`, `value` MUST be null. The frontend
  Zod superRefine enforces this on parse.

### `derived_from: "clinician"`

```json
{
  "derived_from": "clinician",
  "source": "clinician",
  "edited_by": "<auth.users.id>",
  "edit_timestamp": "<ISO 8601>"
}
```

## 5. What backend should populate (and what it shouldn't)

### Backend writes:
- `studies.triage_draft_json` — v1 or v2 payload.
- `channel_quality_assessments` — one row per (channel, source). Use
  UPSERT (`ON CONFLICT (study_id, channel_label, source, source_version)
  DO UPDATE`) when re-running. VIGIL is the canonical `source`.
- `model_versions` (super_admin/management only) — when a new model is
  registered.
- `model_calibration_runs` (super_admin/management only) — when
  calibration is measured.

### Backend does NOT write:
- `report_emission_events` — the trigger does this automatically with a
  DB-computed sha256. If you try to INSERT directly with a fabricated
  hash, the trigger will not overwrite it; the CHECK constraint may
  still pass, but downstream audit will diverge from reality.
- `clinician_edit_deltas` — frontend only. Append-only at PG level
  (REVOKE UPDATE, DELETE).
- `schema_definitions` after first INSERT — IMMUTABLE. To publish a
  revision, INSERT a new (name, version) row.

## 6. Roles (canonical)

The `app_role` enum has exactly three values: `super_admin`,
`management`, `clinician`. RLS policies on the new tables grant
admin-like access to `super_admin OR management`. Do NOT reference
`ops`, `admin`, `clinic_admin`, `neurologist` — all dead.

## 7. State machine

`studies.state` enum (rename in 20260528000000):
- `uploaded` — file in blob, no SLA chosen yet
- `awaiting_sla` — file uploaded, awaiting SLA selection
- `processing` — iplane is running
- `triage_draft` — iplane done, clinician hasn't started review
- `in_review` — clinician is editing
- `signed` — locked
- `failed` — processing error
- `complete` / `completed` — legacy, treat as `signed`

Backend MUST write `'triage_draft'` not `'ai_draft'` (the legacy value
was removed by `ALTER TYPE … RENAME VALUE`).

## 8. Verifying the contract is enforced

Run `supabase/migrations/verify_honest_output.sql` against your DB. It
asserts every contract surface — schema validation rejects bad payloads,
channel gate demotes bad-channel fields, summary recompute overwrites
caller counts, emission trigger fires automatically. Any failure
RAISEs and stops.

```bash
psql <conn> -f supabase/migrations/verify_honest_output.sql
```
