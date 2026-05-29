# `reprocess_executor` edge function

Picks up `reprocess_jobs` rows and dispatches them.

## Deploy

```bash
npx supabase functions deploy reprocess_executor --project-ref <ref>
```

## Trigger it

### Option A — pg_cron every minute (recommended)

```sql
-- Enable pg_cron + pg_net once (Database → Extensions)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Store the service-role key in a session-scoped setting so it's not
-- in plain text in pg_cron. Alternative: hardcode it in the GUC config
-- (Database → Settings → Database settings → Custom config).
ALTER DATABASE postgres SET app.service_role_key = '<service-role-key>';

SELECT cron.schedule(
  'reprocess-executor-poll',
  '* * * * *',  -- every minute
  $$
    SELECT net.http_post(
      url:='https://<project>.supabase.co/functions/v1/reprocess_executor',
      headers:=jsonb_build_object(
        'Authorization', 'Bearer '||current_setting('app.service_role_key', true),
        'Content-Type', 'application/json'
      ),
      body:='{}'::jsonb
    )
  $$
);
```

### Option B — manual from AdminReprocess

Admins can click "Process queue" on `/admin/reprocess` to invoke once.
Useful for debugging or one-off batches.

### Option C — Database Webhook on reprocess_jobs INSERT

Wire a webhook (Database → Webhooks) that fires on INSERT to
`reprocess_jobs` and calls this function. Lower latency than cron but
won't catch jobs that get re-queued (only INSERT, not UPDATE).

## What one invocation does

```
1. Pick the oldest job where status IN ('queued', 'running').
   - Acquires it by CAS update (queued → running). Concurrent invokers
     can't double-claim.
2. If studies_total is null, count matching studies for the filter
   and write it back.
3. Fetch a batch of up to 25 studies matching target_filter, ordered
   by id, offset = studies_processed.
4. For each study:
   - Read current job.status. If 'cancelled', break the loop.
   - POST to /functions/v1/promote_to_v2 with { study_id }.
   - Increment processed or failed depending on response.
5. Update job row with new counts. If all done, set status to
   'completed' (no failures) or 'partial' (some failed).
6. Return JSON summary of the batch.
```

The function processes ≤25 studies per invocation. For a 1000-study
job, cron-every-minute completes in ~40 minutes.

## Filter syntax

`target_filter` is a JSONB object. Recognized keys:

| key              | meaning                                                  |
|------------------|----------------------------------------------------------|
| `sla`            | "STAT" / "24H" / "48H" / "ROUTINE" — exact match         |
| `state`          | studies.state value                                      |
| `created_after`  | ISO date — only studies created at-or-after              |
| `schema_version` | "mind.report.v1" / "mind.report.v2" — current payload    |

Unrecognized keys are ignored (forward-compatible).

## Health checks

```sql
-- Jobs in flight + recent throughput
SELECT
  date_trunc('hour', updated_at) AS hour,
  status, count(*)
FROM public.reprocess_jobs
WHERE created_at > now() - interval '24 hours'
GROUP BY hour, status
ORDER BY hour DESC;

-- Stuck running jobs (no progress in 30 min)
SELECT id, description, studies_processed, studies_total
FROM public.reprocess_jobs
WHERE status = 'running'
  AND started_at < now() - interval '30 minutes';
```
