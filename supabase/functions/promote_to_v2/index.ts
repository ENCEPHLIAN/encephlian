/**
 * promote_to_v2 — auto-upgrades iplane's v1 triage_draft_json payloads to
 * mind.report.v2 so the §9 channel-dependency gate, schema validator,
 * summary recomputer, and emission audit actually fire on production
 * writes.
 *
 * Two call patterns:
 *
 * 1. Database Webhook (recommended): wire in Supabase Studio →
 *    Database → Webhooks. Trigger: studies, event: UPDATE,
 *    condition: <none>. The payload Supabase sends has
 *    `{ type: "UPDATE", table: "studies", record: { … new row … } }`.
 *    We detect that shape and process inline. Loop-safe: when our own
 *    write fires the webhook again, we detect schema_version='v2'
 *    and skip.
 *
 * 2. Manual call: POST { "study_id": "<uuid>" }. Used by the
 *    AdminReprocess flow and ad-hoc "Upgrade this study" actions.
 *
 * Authorization:
 *   - Webhook callers: Supabase sends with the service-role key
 *     in the `Authorization` header. We use SERVICE_ROLE_KEY for the
 *     update so RLS is bypassed (the webhook is server-side; safe).
 *   - Manual callers: must be authenticated. The auth context is
 *     forwarded; the update is still done with SERVICE_ROLE_KEY because
 *     iplane and other backends update via service role anyway, and the
 *     DB triggers do the heavy lifting (validate, gate, recompute, log).
 *
 * What happens after the update:
 *   - validate_triage_draft_json trigger runs schema validation +
 *     enforce_channel_gate + recompute_v2_summary
 *   - log_triage_emission trigger inserts an audit row with the
 *     DB-computed sha256 of the new payload
 *
 * Backend writers (iplane) can keep emitting v1; this function bridges
 * the gap until iplane upgrades to v2-native emission.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { corsHeaders } from "../_shared/cors.ts";
import { adaptV1ToV2 } from "./v1ToV2.ts";

interface PromoteResult {
  ok: boolean;
  study_id?: string;
  schema_version?: string;
  skipped?: string;
  error?: string;
}

function jsonResponse(body: PromoteResult, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json_body" }, 400);
  }

  // Detect call shape: Database Webhook vs manual.
  let studyId: string | undefined;
  let webhookPayload: any;

  if (body?.type === "UPDATE" && body?.table === "studies" && body?.record?.id) {
    // Database Webhook
    studyId = body.record.id as string;
    webhookPayload = body.record.triage_draft_json;
    // Fast-path: if the webhook payload is already v2, skip the DB
    // round-trip entirely. This is what breaks the recursion loop when
    // our own update fires the webhook a second time.
    if (webhookPayload?.schema_version === "mind.report.v2") {
      return jsonResponse({ ok: true, study_id: studyId, skipped: "already_v2" });
    }
    if (webhookPayload != null && webhookPayload?.schema_version !== "mind.report.v1") {
      return jsonResponse({ ok: true, study_id: studyId, skipped: "unknown_schema_version" });
    }
  } else if (typeof body?.study_id === "string") {
    studyId = body.study_id;
  } else {
    return jsonResponse({ ok: false, error: "expected_study_id_or_webhook_payload" }, 400);
  }

  const supabaseUrl     = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ ok: false, error: "missing_env" }, 500);
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // Re-read from the DB to get the canonical current payload (the webhook
  // record can be slightly stale and we want to act on truth).
  const { data: study, error: readErr } = await supabase
    .from("studies")
    .select("id, triage_draft_json")
    .eq("id", studyId!)
    .single();

  if (readErr) {
    return jsonResponse({ ok: false, error: `read_failed: ${readErr.message}` }, 500);
  }
  if (!study) {
    return jsonResponse({ ok: false, error: "study_not_found" }, 404);
  }

  const current = study.triage_draft_json as any;
  if (current == null) {
    return jsonResponse({ ok: true, study_id: studyId, skipped: "no_payload" });
  }
  if (current.schema_version === "mind.report.v2") {
    return jsonResponse({ ok: true, study_id: studyId, skipped: "already_v2" });
  }
  if (current.schema_version !== "mind.report.v1") {
    return jsonResponse({ ok: true, study_id: studyId, skipped: "unknown_schema_version" });
  }

  let v2: any;
  try {
    v2 = adaptV1ToV2(current, studyId!);
  } catch (e) {
    return jsonResponse({ ok: false, error: `adapter_failed: ${String((e as Error)?.message ?? e)}` }, 500);
  }

  // Write back. The DB trigger validates against the JSON Schema, runs
  // the channel-dependency gate, recomputes the summary, and the AFTER
  // trigger auto-inserts the emission_event with the DB-computed sha256.
  const { error: updateErr } = await supabase
    .from("studies")
    .update({ triage_draft_json: v2 })
    .eq("id", studyId!);

  if (updateErr) {
    return jsonResponse({ ok: false, error: `update_failed: ${updateErr.message}` }, 500);
  }

  return jsonResponse({ ok: true, study_id: studyId, schema_version: "mind.report.v2" });
});
