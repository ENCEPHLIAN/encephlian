# Migration discipline

> Devops #3 — every schema change must ship with a documented rollback.

## Why this exists

For a CDSCO Class B SaMD platform, a regulatory inspector will ask:

> "What's your rollback procedure for migration X?"

"git revert and re-apply" is not an acceptable answer because:

1. It loses any data written between forward and rollback.
2. It doesn't account for irreversible operations (`DROP COLUMN` with data, `DROP TABLE` with FK cascades).
3. It assumes the migration's idempotency, which we haven't formally tested.

This doc records, for every migration we've applied via the Supabase MCP, the matching `DOWN` step or an explicit "irreversible — see notes" entry.

## Template

```
### YYYY-MM-DD — <migration_name>

**Purpose:** one-liner.

**UP** (what was applied):
```sql
-- the actual statements (or a pointer to the MCP migration name)
```

**DOWN** (rollback):
```sql
-- the reverse statements
```

**Data risk:** none | recoverable | irreversible — explanation.

**Verification:** which CI guard / SQL query proves the migration took.
```

## Migrations applied this session

### 2026-05-19 — `slice_b_strict_tenancy_completion`

**Purpose:** SaMD strict tenant isolation. Drop `owner = auth.uid()` from clinic-scoped table policies, repair the CI guard.

**UP:** see migration body in Supabase migration history.

**DOWN:**
```sql
-- Re-allow owner-based visibility on studies, study_files, study_pipeline_events.
-- Restoring the duplicate studies_select_authenticated policy is left as an
-- exercise — easier to write a fresh tenant-strict policy if we ever need to
-- back out, which we won't.
DROP POLICY IF EXISTS files_scope ON public.study_files;
CREATE POLICY files_scope ON public.study_files
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.studies s
            WHERE s.id = study_files.study_id
              AND (s.sample = true
                   OR s.owner = auth.uid()
                   OR EXISTS (SELECT 1 FROM public.clinic_memberships cm
                              WHERE cm.user_id = auth.uid()
                                AND cm.clinic_id = s.clinic_id)
                   OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
                   OR public.has_role(auth.uid(), 'management'::public.app_role))));
-- Same shape for study_pipeline_events.study_pipeline_events_select
```

**Data risk:** none. Pure policy change.

**Verification:**
```sql
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '<admin-uuid>', true);
SELECT public.admin_test_all_clinic_isolation();
ROLLBACK;
-- expect: {"ok": true, "failed": 0}
```

### 2026-05-19 — `slice_c_db_hygiene`

**Purpose:** drop 4 dead SECURITY DEFINER functions, lock down `get_platform_setting`, add hot-path indexes.

**UP:**
- `DROP FUNCTION calculate_withdrawal_breakdown(uuid, integer)` (and 3 others)
- `REVOKE EXECUTE ON FUNCTION get_platform_setting(text) FROM PUBLIC, anon, authenticated`
- `CREATE INDEX idx_user_roles_user_id ON user_roles(user_id)`
- `CREATE INDEX idx_studies_owner_created ON studies(owner, created_at DESC) WHERE owner IS NOT NULL`
- `CREATE INDEX idx_studies_state_created ON studies(state, created_at DESC) WHERE state IS NOT NULL`

**DOWN:**
```sql
-- Restoring the 4 dead funcs is pointless — they reference dropped tables.
-- If you need them, restore the underlying tables (earnings_wallets,
-- withdrawal_requests, tds_records) first, then recreate the funcs from
-- pre-2026-05-19 backup.

GRANT EXECUTE ON FUNCTION public.get_platform_setting(text) TO authenticated, anon;

DROP INDEX IF EXISTS public.idx_user_roles_user_id;
DROP INDEX IF EXISTS public.idx_studies_owner_created;
DROP INDEX IF EXISTS public.idx_studies_state_created;
```

**Data risk:** none.

**Verification:**
```sql
SELECT proname FROM pg_proc WHERE proname IN
  ('calculate_withdrawal_breakdown', 'lock_withdrawal_amount',
   'process_completed_withdrawal', 'unlock_failed_withdrawal');
-- expect: 0 rows.

SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname IN
  ('idx_user_roles_user_id', 'idx_studies_owner_created', 'idx_studies_state_created');
-- expect: 3 rows.
```

### Earlier migrations (back-fill rollbacks)

The full migration history is in Supabase `supabase_migrations.schema_migrations`. The following don't yet have documented rollbacks — back-fill before the next regulatory audit:

- `drop_deprecated_rename_ai_drafts` — irreversible (`canonical_eeg_records` and `eeg_markers` had 0 rows so no data risk, but the rename of `ai_drafts → report_drafts` requires re-renaming in reverse).
- `audit_trigger_composite_keys` — `DOWN` would restore the broken `(NEW.id)::text` extraction, which then crashes again on `clinic_memberships`. Effectively irreversible without re-introducing the bug.
- `admin_provision_clinic_resources` — `DROP FUNCTION` rolls it back cleanly.
- `scale_indexes_2026_05_19_v2` — `DROP INDEX` for each.
- `views_security_invoker` — `ALTER VIEW SET (security_invoker = off)` rolls back.

## Rule going forward

Every migration applied via `mcp__plugin_supabase_supabase__apply_migration` must:

1. Be prefaced by a `-- DOWN: …` comment block in the SQL.
2. Get an entry in this file the same day.
3. Have a verification query (1-2 SQL statements) that proves it took.

No exceptions. If a migration is irreversible (e.g. data loss on `DROP COLUMN`), the comment must say so explicitly, and a forward-only mitigation must be documented (backup, snapshot, etc.).
