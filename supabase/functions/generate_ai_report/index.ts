import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

/**
 * generate_ai_report — A3/A5: Trigger real C-Plane pipeline
 *
 * Called after the frontend completes direct Azure Blob upload.
 * Fires POST /process to C-Plane which runs the full ESF pipeline
 * and then triggers I-Plane for MIND®Triage inference.
 *
 * The C-Plane processes asynchronously. Study state transitions:
 *   pending → uploaded (this function) → processing → complete (I-Plane)
 *
 * Request:  { study_id: string }
 * Response: { success: true, status: "processing" }
 */

const CPLANE_URL = "https://encephlian-cplane.whitecoast-5be3fbc0.centralindia.azurecontainerapps.io";

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

    const { study_id } = await req.json();
    if (!study_id) return new Response(
      JSON.stringify({ error: "study_id is required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

    // Verify study exists and user has access
    const { data: study, error: studyError } = await supabase
      .from("studies")
      .select("id, owner, clinic_id, state")
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

    // Idempotency: if already processing, complete, or signed — do not re-run
    if (study.state === "processing" || study.state === "complete" || study.state === "signed") {
      return new Response(
        JSON.stringify({ success: true, status: study.state, message: "Pipeline already running or complete" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Mark as uploaded (blob arrived, pipeline starting)
    await supabase.from("studies").update({ state: "uploaded" }).eq("id", study_id);

    console.log(`[${study_id}] Triggering C-Plane pipeline`);

    // Fire-and-forget: C-Plane runs async, I-Plane updates Supabase on completion
    const cplaneRes = await fetch(`${CPLANE_URL}/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ study_id }),
    });

    if (!cplaneRes.ok) {
      const errText = await cplaneRes.text();
      console.error(`[${study_id}] C-Plane /process error ${cplaneRes.status}: ${errText}`);
      // Revert state so user can retry
      await supabase.from("studies").update({ state: "pending" }).eq("id", study_id);
      return new Response(
        JSON.stringify({ error: `Pipeline trigger failed: ${cplaneRes.status}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Update to processing — I-Plane will set "complete" when done
    await supabase.from("studies").update({ state: "processing" }).eq("id", study_id);
    console.log(`[${study_id}] C-Plane accepted — pipeline running`);

    return new Response(
      JSON.stringify({ success: true, status: "processing" }),
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
