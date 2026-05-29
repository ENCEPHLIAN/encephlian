# `promote_to_v2` edge function

Auto-upgrades `studies.triage_draft_json` from `mind.report.v1` to
`mind.report.v2` so the §9 honest-output gates engage on every iplane
write. Until iplane emits v2 natively, this is what closes the loop
between the foundation and production traffic.

## What you need to do once

### 1. Deploy the function

```bash
npx supabase functions deploy promote_to_v2 --project-ref <ref>
```

### 2. Wire the Database Webhook (Supabase Studio)

1. Open **Database → Webhooks → Create a new hook**
2. Name: `promote_v1_to_v2_on_studies_update`
3. Table: `studies`
4. Events: ✓ `UPDATE`
5. Type: **Supabase Edge Functions**
6. Edge Function: `promote_to_v2`
7. HTTP Method: `POST`
8. HTTP Headers: leave default (Supabase will add the service-role
   Authorization automatically)
9. HTTP Params: leave empty
10. Click **Create webhook**

The webhook fires for every studies UPDATE — including the function's
own write-back. The function's first check (`schema_version === v2`)
short-circuits the recursion, so there's no infinite loop.

### 3. (Optional) Backfill existing v1 rows

For studies that already have v1 payloads, run:

```sql
-- This dispatches one async invocation per study. The function picks
-- them up via the webhook OR you can call it directly per row.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT id FROM public.studies
     WHERE triage_draft_json->>'schema_version' = 'mind.report.v1'
  LOOP
    -- Re-update the row in place to trigger the webhook (no semantic
    -- change; the webhook handler upgrades to v2 server-side).
    UPDATE public.studies
       SET triage_draft_json = triage_draft_json
     WHERE id = r.id;
  END LOOP;
END $$;
```

Or call the function directly per study from an admin script:

```bash
curl -X POST '<project>.supabase.co/functions/v1/promote_to_v2' \
  -H 'Authorization: Bearer <service-role-key>' \
  -H 'Content-Type: application/json' \
  -d '{"study_id": "<uuid>"}'
```

## What happens on a v1 write

```
iplane → studies.triage_draft_json (v1 payload)
  ├─ BEFORE trigger validate_triage_draft_json
  │    schema_version='v1' → passes through unchanged
  ├─ AFTER trigger log_triage_emission
  │    inserts emission row (schema_name='mind.report.v1')
  └─ Database Webhook fires →
       promote_to_v2 edge function
         ├─ reads payload, runs adapter
         ├─ UPDATE studies SET triage_draft_json = <v2>
         │    ├─ BEFORE trigger validate_triage_draft_json
         │    │    schema_version='v2'
         │    │    → pg_jsonschema validation
         │    │    → enforce_channel_gate (channel-dependency)
         │    │    → recompute_v2_summary
         │    └─ AFTER trigger log_triage_emission
         │         inserts emission row (schema_name='mind.report.v2',
         │         payload_sha256 = DB-computed sha256 of stored v2)
         └─ Database Webhook fires AGAIN →
              promote_to_v2 edge function
                detects schema_version='v2' → skipped: already_v2
```

Net result: every v1 emission is paired with a corresponding v2 emission
in `report_emission_events`. The v2 row is the gated truth.

## Health check

After enabling the webhook, run:

```sql
SELECT schema_name, count(*)
  FROM public.report_emission_events
 WHERE emitted_at > now() - interval '24 hours'
 GROUP BY schema_name;
```

You should see both `mind.report.v1` and `mind.report.v2` rows. If you
only see v1, the function isn't firing — check Database → Webhooks →
the hook's logs.

## Sync the adapter

`v1ToV2.ts` mirrors `src/lib/mindReportV2Adapter.ts`. When you change
the canonical TypeScript adapter, mirror the change here too. To detect
drift:

```bash
npm run check-adapter-drift  # planned: diffs the two mk()/mkPending() shapes
```
