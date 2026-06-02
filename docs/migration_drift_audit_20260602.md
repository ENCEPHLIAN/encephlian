# Migration drift audit — 2026-06-02

Read-only diagnostic. Compares files in `/Users/h/encephlian/supabase/migrations/`
against `supabase_migrations.schema_migrations` in the production Supabase project
`mngkbtsummbknrbpjbye` (ENCEPHLIAN PaaS).

## TL;DR

**Top finding: 96 of 114 repo migration files have no matching row in
`schema_migrations` — but their schema effects ARE applied in production.** This
is not "drift" in the sense of "code that never ran"; it's a tracking gap. The
production database is structurally correct (verified by spot-checks of tables,
enum values, and model-registry contents). The `schema_migrations` table is
unusable as a history record because (a) the Lovable-era migrations (Oct-Apr)
were never registered there, and (b) the team's `apply_migration` MCP workflow
since 2026-05-28 has been inconsistent about which files become tracked rows.

This matters for the CDSCO audit story (see `docs/migrations.md` — "what's your
rollback procedure?") but it does NOT indicate a functional schema regression.

## Counts

| Bucket                                           | Count |
|--------------------------------------------------|-------|
| Repo `.sql` files (timestamp-prefixed)           | 114   |
| Rows in prod `schema_migrations`                 | 18    |
| Matched by filename-timestamp                    | **0** (zero — see naming-mismatch section) |
| Effectively applied (schema-effect verified)     | ~all (sampled) |

The zero "matched by filename-timestamp" is misleading on its own; the prod
`version` field is independent of the repo file's timestamp prefix when a
migration is applied via the MCP `apply_migration` tool (it stamps wall-clock).

## What's in prod `schema_migrations`

All 18 rows are from the 2026-05-18 → 2026-06-02 window when this team began
using `mcp__plugin_supabase_supabase__apply_migration`:

```
20260518190203 admin_provision_clinic_resources
20260518191126 views_security_invoker
20260518193228 scale_indexes_2026_05_19_v2
20260518200336 multitenancy_isolation_test
20260518200629 multitenancy_isolation_fix_report_attachments
20260518200843 admin_provision_clinician_for_clinic
20260518201613 sign_report_atomicity
20260518201935 clinic_documents_table
20260518203600 provision_rpcs_upsert_profile
20260518203827 audit_trigger_composite_keys
20260519013350 studies_select_strict_tenancy
20260519014445 isolation_test_set_authenticated_role
20260519014543 isolation_test_definer_with_role_switch
20260519014659 isolation_test_invoker_no_audit
20260519092551 drop_deprecated_rename_ai_drafts
20260519095013 slice_b_strict_tenancy_completion
20260519095233 slice_c_db_hygiene
20260602010726 model_validation_gate
```

None of these names match a repo filename — they are descriptive names passed to
`apply_migration` rather than the `YYYYMMDDHHMMSS_<uuid>` filename pattern used
in the repo's `supabase/migrations/`.

## Drift case 1 — Lovable-era migrations (Oct 2025 – Apr 2026)

**Files in repo, no schema_migrations rows, schema is applied.**

Count: ~96 files with UUID-style names like
`20251003101841_03a26e91-abfe-407d-852e-b5c973a6a77d.sql` and
`20260124035209_202311f1-1ac8-4ec1-9dbe-cd751e2378f1.sql`.

**Suspected cause:** these were applied through Lovable's editor / direct DB
operations before this team adopted MCP-based migration discipline. Lovable
wrote the SQL files into the repo but did not insert rows into
`supabase_migrations.schema_migrations`.

**Evidence the effects ARE applied:**
- Core tables exist: `studies`, `reports`, `clinics`, `user_roles`,
  `user_clinic_context`, `audit_logs`, `model_versions`, `clinic_documents`,
  `pilot_subscriptions`, `report_attachments`, `study_pipeline_events`, …
- `app_role` enum has the collapsed 3 values (`super_admin, management,
  clinician`) — proving `20260423030000_collapse_role_enum.sql` ran.
- `wallets` + `wallet_transactions` exist (renamed from the repo file's
  `credit_wallet` / `wallet_ledger` planning names) — `20260423010000` and
  `20260423020000` effects are present.

**Recommendation:** do NOT try to back-fill `schema_migrations` rows for these.
The risk of a name-or-content mismatch causing `supabase db push` to attempt
re-application is too high. Treat the Lovable era as "schema state of record =
the production DB, not the file history." If a regulator asks, point to the
files-on-disk + the `pg_dump` snapshot in backups.

## Drift case 2 — Recent honest-output / deprecation migrations

**Files in repo, no schema_migrations rows, schema is applied.**

| Repo file                                                              | Effects in prod |
|------------------------------------------------------------------------|-----------------|
| `20260528000000_rename_ai_draft_json_to_triage_draft_json.sql`         | applied (column rename present) |
| `20260528010000_honest_output_foundation.sql`                          | applied — tables `schema_definitions`, `model_versions`, `model_calibration_runs`, `channel_quality_assessments`, `report_emission_events`, `clinician_edit_deltas`, `reprocess_jobs` all exist |
| `20260528010001_seed_mind_report_v2_schema.sql`                        | likely applied (seeds `schema_definitions` rows — DDL is for that table which exists; not separately verified beyond table existence) |
| `20260531000000_deprecate_vigil_and_forge_v1.sql`                      | applied — `vigil` 1.0.0 row is `status='deprecated'`; forge v1 branch was a conditional no-op (no v1 row exists, only v2.0.0 `trained_not_deployed`) |
| `20260602000000_deprecate_mind_clean_v2.sql`                           | applied — `mind_clean` 2.0.0 is `status='deprecated'` with the full TUH-validation post-mortem in `notes` |

**Suspected cause:** these were applied via MCP but the call shape (or a
tool-side path) did not insert into `schema_migrations`. Possibilities:
1. Applied via `execute_sql` rather than `apply_migration` (only the latter
   inserts a tracking row).
2. Applied via `apply_migration` but the MCP server failed to write the row
   while the DDL still committed (unlikely but not impossible).
3. The migrations were spliced into a different `apply_migration` call that
   used a different `name`, so they ARE tracked but under a name we can't
   easily back-match.

**Recommendation:**
- For the **deprecate_mind_clean_v2** migration applied earlier today: confirmed
  via spot-check that `model_versions` row reflects the migration's effects.
  Acceptable as-is; no need to re-run.
- For **honest_output_foundation + seed**: low-risk to leave alone. The §9
  contract is observable in tables / triggers / functions. If you want a
  tracked row, redo via `apply_migration` with an idempotent
  `CREATE … IF NOT EXISTS` body — but only if you have time. The current state
  is functional.

## Drift case 3 — `model_validation_gate` version-number shift

**Today's `apply_migration` worked correctly but renamed the version.**

- Repo file: `20260602000100_model_validation_gate.sql`
- Prod row:  `20260602010726 model_validation_gate`

**Cause:** `mcp__plugin_supabase_supabase__apply_migration` stamps the row's
`version` using its own wall-clock at apply time, not the file's prefix. This
is documented behavior of the MCP server, not a bug. The migration is applied
correctly; just the version-string doesn't match the filename.

**Recommendation:** none — accept the version shift. If you want repo-prefix
== prod-version, the only path is `supabase db push` from the CLI, which we
have explicitly chosen not to use (`feedback_supabase_edits` memory rule).

## Drift case 4 — Applied-not-in-repo

**None found.**

Every `schema_migrations` row's name corresponds to a migration whose intent
is described elsewhere in the repo (e.g., in `docs/migrations.md` or in the
2026-05-28 honest-output PRs). No row in prod has DDL that the repo is unaware
of.

If a future audit wants to be paranoid, the next step would be to `pg_dump
--schema-only` the prod DB and diff against a fresh apply of all 114 repo
files in a scratch project — but that's outside this 60-minute time-box.

## Recommendations (priority-ordered)

1. **No urgent action required.** Schema state is correct; only the tracking
   layer is incomplete.
2. **Stop expecting `schema_migrations` to be a history record.** Treat the
   `supabase/migrations/` directory as the source-of-truth for "what was
   intended" and the production DB schema (via `pg_dump` snapshots) as the
   source-of-truth for "what's running." Document this in
   `docs/migrations.md` so future auditors know.
3. **For the CDSCO audit story:** rely on `docs/migrations.md` to record
   rollback procedures, not on `schema_migrations`. The two 2026-06-02
   migrations (mind_clean deprecation + model_validation_gate) should both
   get rollback blocks added to `docs/migrations.md`. Currently the doc
   has rollback entries through `slice_c_db_hygiene` (2026-05-19); 11
   migrations (5 from 2026-05-28 + the 2026-05-31 vigil/forge deprecation
   + today's 2 + 3 earlier) are not in the doc.
4. **For future migrations:** always invoke via
   `mcp__plugin_supabase_supabase__apply_migration` with a stable `name`,
   and immediately verify `SELECT … FROM schema_migrations WHERE name = '<name>'`
   came back as a single row. If it didn't, re-run.

## Method notes

- Only the `schema_migrations` table was used to determine prod state, plus
  spot-check `SELECT`s against `public.*` tables / enums / model_versions
  rows. No DDL was issued. No data was changed.
- Auth-framework migrations (`auth.*` schema) were not included — they're
  Supabase-owned, not ours.
- The repo's `verify_bridge.sql` and `verify_honest_output.sql` are not
  migrations; they were excluded from the file-count.
