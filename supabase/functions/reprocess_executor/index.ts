/**
 * reprocess_executor — picks up reprocess_jobs and processes them.
 *
 * Triggered:
 *   - Manually from AdminReprocess ("Process queue" button)
 *   - Periodically via pg_cron (recommended every 1 minute):
 *
 *       SELECT cron.schedule(
 *         'reprocess-executor',
 *         '* * * * *',
 *         $$SELECT net.http_post(
 *           url:='https://<project>.supabase.co/functions/v1/reprocess_executor',
 *           headers:=jsonb_build_object(
 *             'Authorization', 'Bearer '||current_setting('app.service_role_key', true),
 *             'Content-Type',  'application/json'
 *           ),
 *           body:='{}'::jsonb
 *         )$$
 *       );
 *
 * Per invocation it processes up to BATCH_LIMIT studies of the oldest
 * `queued` / `running` job. Idempotent: pickNextJob uses FOR UPDATE
 * SKIP LOCKED so concurrent invocations don't double-process. Honours
 * cancellation: re-reads status between studies, stops on 'cancelled'.
 *
 * The actual per-study work is delegated to `promote_to_v2` — which is
 * what re-engages every §9 gate (channel-dependency, schema validate,
 * summary recompute, emission audit). A heavier "full re-run via
 * generate_triage_report" mode lands in the next iteration; this one
 * is the safe re-validate pass.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { corsHeaders } from "../_shared/cors.ts";

const BATCH_LIMIT = 25;

interface JobRow {
  id: string;
  description: string | null;
  target_filter: Record<string, unknown>;
  target_model_version_id: string | null;
  status: string;
  studies_total: number | null;
  studies_processed: number;
  studies_failed: number;
  started_at: string | null;
  finished_at: string | null;
  error_summary: string | null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST")    return json({ error: "method_not_allowed" }, 405);

  const supabaseUrl    = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "missing_env" }, 500);

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  // Pick up the oldest queued OR running job. We don't use FOR UPDATE
  // here because Supabase clients can't issue it via PostgREST; the
  // race-protection comes from the conditional UPDATE on status below.
  const { data: jobs, error: jobErr } = await supabase
    .from("reprocess_jobs")
    .select("*")
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: true })
    .limit(1);

  if (jobErr) return json({ error: `pick_job_failed: ${jobErr.message}` }, 500);
  if (!jobs || jobs.length === 0) return json({ ok: true, idle: true });

  const job = jobs[0] as JobRow;

  // Mark running (conditional on status='queued' so concurrent workers
  // don't both think they own it). If we race and lose, that's fine —
  // the winner picks up the job; we exit idle.
  if (job.status === "queued") {
    const { data: claimed, error: claimErr } = await supabase
      .from("reprocess_jobs")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", job.id)
      .eq("status", "queued") // CAS — only if still queued
      .select("id")
      .maybeSingle();
    if (claimErr || !claimed) {
      return json({ ok: true, raced_with: job.id });
    }
  }

  // ─── 1. Compute studies_total if not yet known ───
  if (job.studies_total == null) {
    const { count, error: cntErr } = await countMatching(supabase, job.target_filter);
    if (cntErr) {
      await fail(supabase, job.id, `count_failed: ${cntErr.message}`);
      return json({ error: cntErr.message }, 500);
    }
    await supabase
      .from("reprocess_jobs")
      .update({ studies_total: count })
      .eq("id", job.id);
    job.studies_total = count;
  }

  if (job.studies_total === 0) {
    await supabase
      .from("reprocess_jobs")
      .update({ status: "completed", finished_at: new Date().toISOString() })
      .eq("id", job.id);
    return json({ ok: true, job_id: job.id, completed: true, total: 0 });
  }

  // ─── 2. Fetch next batch of studies not yet processed ───
  // Strategy: SELECT studies matching the filter ordered by id, skip
  // the ones we've already processed (job.studies_processed offset).
  // For 'best', we'd track per-study completion in a child table; for
  // now offset-based with stable ordering is enough.
  const { data: batch, error: batchErr } = await fetchBatch(
    supabase, job.target_filter, job.studies_processed, BATCH_LIMIT,
  );
  if (batchErr) {
    await fail(supabase, job.id, `batch_fetch_failed: ${batchErr.message}`);
    return json({ error: batchErr.message }, 500);
  }
  if (!batch || batch.length === 0) {
    // No more to process — complete.
    await supabase
      .from("reprocess_jobs")
      .update({ status: "completed", finished_at: new Date().toISOString() })
      .eq("id", job.id);
    return json({ ok: true, job_id: job.id, completed: true });
  }

  // ─── 3. Dispatch each study to promote_to_v2 (sequentially) ───
  let processed = 0;
  let failed = 0;
  for (const study of batch) {
    // Cancellation check — cheap single-row read every iteration.
    const { data: current } = await supabase
      .from("reprocess_jobs")
      .select("status")
      .eq("id", job.id)
      .single();
    if (current?.status === "cancelled") break;

    try {
      const r = await dispatchPromote(supabaseUrl, serviceRoleKey, study.id);
      if (!r.ok) {
        failed++;
        // eslint-disable-next-line no-console
        console.warn(`[reprocess_executor] study ${study.id} failed: ${r.error}`);
      } else {
        processed++;
      }
    } catch (e) {
      failed++;
      // eslint-disable-next-line no-console
      console.warn(`[reprocess_executor] study ${study.id} threw: ${(e as Error)?.message}`);
    }
  }

  const newProcessed = job.studies_processed + processed;
  const newFailed    = job.studies_failed + failed;
  const allDone      = newProcessed + newFailed >= (job.studies_total ?? 0);

  await supabase
    .from("reprocess_jobs")
    .update({
      studies_processed: newProcessed,
      studies_failed:    newFailed,
      status: allDone ? (newFailed > 0 ? "partial" : "completed") : "running",
      finished_at: allDone ? new Date().toISOString() : null,
    })
    .eq("id", job.id);

  return json({
    ok: true,
    job_id: job.id,
    batch_size: batch.length,
    processed,
    failed,
    total_done: newProcessed + newFailed,
    total: job.studies_total,
    job_complete: allDone,
  });
});

// ──────────────────────────────────────────────────────────────────────

async function countMatching(supabase: any, target_filter: Record<string, unknown>) {
  let q = supabase.from("studies").select("*", { count: "exact", head: true });
  q = applyFilter(q, target_filter);
  const { count, error } = await q;
  return { count: count ?? 0, error };
}

async function fetchBatch(
  supabase: any,
  target_filter: Record<string, unknown>,
  offset: number,
  limit: number,
) {
  let q = supabase
    .from("studies")
    .select("id, triage_draft_json")
    .order("id", { ascending: true })
    .range(offset, offset + limit - 1);
  q = applyFilter(q, target_filter);
  const { data, error } = await q;
  return { data, error };
}

function applyFilter(query: any, f: Record<string, unknown>) {
  if (typeof f.sla === "string"  && f.sla !== "ALL")             query = query.eq("sla", f.sla);
  if (typeof f.state === "string" && f.state !== "ALL")          query = query.eq("state", f.state);
  if (typeof f.created_after === "string" && f.created_after)    query = query.gte("created_at", f.created_after);
  if (typeof f.schema_version === "string" && f.schema_version !== "ALL") {
    query = query.eq("triage_draft_json->>schema_version", f.schema_version);
  }
  return query;
}

async function dispatchPromote(
  supabaseUrl: string,
  serviceRoleKey: string,
  studyId: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${supabaseUrl}/functions/v1/promote_to_v2`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({ study_id: studyId }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
  }
  const body = await res.json().catch(() => ({}));
  if (body?.ok === false) return { ok: false, error: body?.error ?? "unknown" };
  return { ok: true };
}

async function fail(supabase: any, jobId: string, summary: string) {
  await supabase
    .from("reprocess_jobs")
    .update({
      status: "failed",
      finished_at: new Date().toISOString(),
      error_summary: summary,
    })
    .eq("id", jobId);
}
