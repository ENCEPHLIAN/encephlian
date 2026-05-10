import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCplaneBaseUrl } from "../_shared/cplane.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { insertPipelineEvent } from "../_shared/pipeline_log.ts";

/**
 * generate_ai_report — A3/A5: Trigger real C-Plane pipeline
 *
 * Called after the frontend completes direct Azure Blob upload.
 * Fires POST /process to C-Plane which runs the full ESF pipeline
 * and then triggers I-Plane for MIND®Triage inference.
 *
 * The C-Plane processes asynchronously. Study state transitions:
 *   pending → uploaded (this function) → processing → completed (I-Plane REST patch)
 *
 * Request:  { study_id: string }
 * Response: { success: true, status: "processing" }
 */

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(
      JSON.stringify({ error: "Not authenticated" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authError || !user) return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

    const { study_id, sla: requestedSla } = await req.json();
    if (!study_id) return new Response(
      JSON.stringify({ error: "study_id is required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

    const correlationId = crypto.randomUUID();

    // Verify study exists and user has access
    const { data: study, error: studyError } = await supabase
      .from("studies")
      .select("id, owner, clinic_id, state, tokens_deducted, sla_selected_at")
      .eq("id", study_id)
      .single();

    if (studyError || !study) return new Response(
      JSON.stringify({ error: "Study not found" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

    if (study.owner !== user.id) {
      const { data: membership } = await supabase
        .from("clinic_memberships")
        .select("clinic_id")
        .eq("user_id", user.id)
        .eq("clinic_id", study.clinic_id)
        .single();
      if (!membership) return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Check clinic SKU
    const { data: clinic } = await supabase
      .from("clinics")
      .select("sku")
      .eq("id", study.clinic_id)
      .single();
    const isInternal = clinic?.sku === "internal";

    // Internal users select SLA priority but pay no tokens.
    // If sla param is provided, record the selection atomically here (no deduction).
    if (isInternal && requestedSla && !study.sla_selected_at) {
      const validSlas = ["TAT", "STAT", "24H", "48H", "ROUTINE"];
      if (validSlas.includes(requestedSla)) {
        await supabase.from("studies")
          .update({ sla: requestedSla, sla_selected_at: new Date().toISOString() })
          .eq("id", study_id);
        study.sla_selected_at = new Date().toISOString();
      }
    }

    // Gate: pipeline requires an SLA selection (tokens for pilot, free for internal)
    const hasSlа = study.sla_selected_at != null;
    const hasPaidTokens = (study.tokens_deducted ?? 0) > 0;
    if (!hasSlа && !hasPaidTokens) {
      await insertPipelineEvent(supabase, {
        study_id,
        step: "edge.generate_ai_report.gate_rejected",
        status: "error",
        source: "supabase_edge",
        correlation_id: correlationId,
        detail: { user_id: user.id, state: study.state, sku: clinic?.sku },
      });
      return new Response(
        JSON.stringify({ error: "Select analysis priority before starting the pipeline." }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Idempotency — I-Plane PATCH uses state=completed (not "complete"); include legacy + review states
    const noRequeueStates = new Set([
      "processing",
      "signed",
      "completed",
      "complete",
      "in_review",
      "ai_draft",
    ]);
    if (noRequeueStates.has(study.state)) {
      await insertPipelineEvent(supabase, {
        study_id,
        step: "edge.generate_ai_report.idempotent_skip",
        status: "skipped",
        source: "supabase_edge",
        correlation_id: correlationId,
        detail: { state: study.state, user_id: user.id },
      });
      return new Response(
        JSON.stringify({
          success: true,
          status: study.state,
          message: "Pipeline already running or complete",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    await insertPipelineEvent(supabase, {
      study_id,
      step: "edge.generate_ai_report.request",
      status: "info",
      source: "supabase_edge",
      correlation_id: correlationId,
      detail: { user_id: user.id, prior_state: study.state },
    });

    // Mark as uploaded (blob arrived, pipeline starting)
    await supabase.from("studies").update({ state: "uploaded" }).eq("id", study_id);

    console.log(`[${study_id}] Triggering C-Plane pipeline`);

    await insertPipelineEvent(supabase, {
      study_id,
      step: "edge.generate_ai_report.cplane_dispatch",
      status: "info",
      source: "supabase_edge",
      correlation_id: correlationId,
      detail: { cplane_base: getCplaneBaseUrl() },
    });

    // Fire-and-forget: C-Plane runs async, I-Plane updates Supabase on completion
    const cplaneRes = await fetch(`${getCplaneBaseUrl()}/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ study_id }),
    });

    if (!cplaneRes.ok) {
      const errText = await cplaneRes.text();
      console.error(`[${study_id}] C-Plane /process error ${cplaneRes.status}: ${errText}`);
      await insertPipelineEvent(supabase, {
        study_id,
        step: "edge.generate_ai_report.cplane_http_error",
        status: "error",
        source: "supabase_edge",
        correlation_id: correlationId,
        detail: {
          http_status: cplaneRes.status,
          body_preview: errText.slice(0, 2000),
        },
      });
      // Revert state so user can retry
      await supabase.from("studies").update({ state: "pending" }).eq("id", study_id);
      return new Response(
        JSON.stringify({
          error: `Pipeline trigger failed: ${cplaneRes.status}`,
          correlation_id: correlationId,
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Align with dashboard / Lanes (triage_status mirrors C-Plane / I-Plane progress)
    await supabase.from("studies").update({
      state: "processing",
      triage_status: "processing",
      triage_progress: 10,
      triage_started_at: new Date().toISOString(),
    }).eq("id", study_id);
    console.log(`[${study_id}] C-Plane accepted — pipeline running`);

    await insertPipelineEvent(supabase, {
      study_id,
      step: "edge.generate_ai_report.cplane_queued",
      status: "ok",
      source: "supabase_edge",
      correlation_id: correlationId,
      detail: { http_status: cplaneRes.status },
    });

    return new Response(
      JSON.stringify({ success: true, status: "processing", correlation_id: correlationId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (error) {
    console.error("generate_ai_report:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
