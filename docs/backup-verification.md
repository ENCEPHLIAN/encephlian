# Backup verification

> Devops #5 — Supabase backs up automatically. We need to prove restore actually works.

## What Supabase does for us

- **Daily logical backups** (point-in-time recovery up to 7 days for Pro tier)
- **Read replicas in the same region** (Mumbai ap-south-1)
- **Storage redundancy** (LRS in Central India for the Storage buckets you provision yourself; not the same as the DB tier)

Source: <https://supabase.com/docs/guides/platform/backups>

## What Supabase does NOT do

- Doesn't restore Azure Blob (where ENCEPHLIAN keeps EEG raw + derived + signed PDFs). That's your responsibility.
- Doesn't tell you when the last successful restore happened — there isn't one until you run one.
- Doesn't preserve `auth.users` perfectly if you point-in-time recover (the gotrue schema is partially managed; restore may lose session tokens — acceptable, users re-login).

## Quarterly restore drill — the actual procedure

Schedule this every 90 days. Owner: **you** (CEO/CTO). Successor: any team member who can run a fork/branch.

### Drill steps

1. **Pick a non-prod target.** Either:
   - Create a Supabase branch off `main` (Pro tier feature) — fastest.
   - OR spin a fresh free-tier Supabase project as `encephlian-drill-YYYYMM`.

2. **Restore from a 24h-old snapshot** into the target. Dashboard → Database → Backups → Restore to new project.

3. **Verify integrity:**
   ```sql
   SELECT
     (SELECT count(*) FROM clinics)                        AS clinics,
     (SELECT count(*) FROM profiles)                       AS profiles,
     (SELECT count(*) FROM studies)                        AS studies,
     (SELECT count(*) FROM reports WHERE status='signed')  AS signed_reports,
     (SELECT count(*) FROM audit_logs)                     AS audit_rows,
     (SELECT max(created_at) FROM studies)                 AS latest_study,
     (SELECT max(created_at) FROM audit_logs)              AS latest_audit;
   ```
   Compare against prod numbers from before the snapshot. The deltas should match what happened in the missing window.

4. **Re-run the multitenancy guard** on the restored DB:
   ```sql
   BEGIN;
   SET LOCAL ROLE authenticated;
   SELECT set_config('request.jwt.claim.sub', '<some super_admin uuid>', true);
   SELECT public.admin_test_all_clinic_isolation();
   ROLLBACK;
   -- expect ok=true
   ```

5. **Verify edge functions deployed.** Look for `admin_provision_clinic`, `admin_create_clinician`, `sign_report`, `create_study_from_upload`. Edge functions deploy with the project — if migrating across orgs you may need to redeploy.

6. **Verify storage buckets.** Buckets are project-scoped — `clinic-documents` and `eeg-reports` should exist. If they don't, you're restoring DB-only; storage is a separate restore path.

7. **Drop the drill project** (or revert the branch). Don't leave drill DBs running and accruing cost.

8. **Record the drill outcome** in this file. One line per drill:

```
YYYY-MM-DD | restored 24h-old snapshot | rows match | guard PASS | drill DB dropped
```

## Azure Blob restore

Run separately. We keep the EEG raw + derived + signed PDFs there, not in Supabase Storage.

1. Pick a study with a known reference (e.g. `ENC-260519-MYXG`).
2. Verify the raw blob exists: `eeg-raw/<study_id>.<ext>`
3. Verify the derived ESF zarr: `eeg-canonical/<study_id>/...`
4. Verify the signed PDF if status='signed': `eeg-reports/<study_id>/signed_*.pdf`

Run via Azure CLI:
```bash
az storage blob list --account-name encephblob --container-name eeg-raw \
  --prefix "<study_id>" --query "[].name" -o tsv
```

If a study is referenced in `studies.uploaded_file_path` but the blob is missing → that's a drift bug, not a backup issue. Open a ticket against the C-Plane.

## Drill log

```
2026-05-19 | initial setup, no drill yet — schedule first one in <90d>
```

After every drill, append a line. If a drill ever fails, that's a P0 — stop everything else, fix the gap, retry within 7 days.

## Regulatory note

For CDSCO Class B SaMD post-market surveillance, expect the inspector to ask "when did you last verify your backup procedure works?" The audit-trail answer is this file + the dated lines.
