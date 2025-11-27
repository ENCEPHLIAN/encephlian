import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

/**
 * Generate placeholder PDF report for sample/demo EEG studies
 * This creates a simple triage report to demonstrate the workflow
 */

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    const { study_id } = await req.json();

    if (!study_id) {
      return new Response(
        JSON.stringify({ error: "study_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get study details
    const { data: study, error: studyError } = await supabase
      .from("studies")
      .select("*")
      .eq("id", study_id)
      .single();

    if (studyError) throw studyError;

    // Generate placeholder report content
    const reportContent = {
      study_id,
      patient_name: (study.meta as any)?.patient_name || "Sample Patient",
      study_date: new Date(study.created_at).toLocaleDateString(),
      indication: study.indication || "Routine EEG",
      findings: {
        background: "Normal posterior dominant rhythm at 9-10 Hz.",
        epileptiform: "No epileptiform discharges observed.",
        artifacts: "Minimal muscle and movement artifact.",
      },
      impression: "NORMAL AWAKE EEG",
      notes: "This is a placeholder report generated for demonstration purposes.",
    };

    // Store as AI draft
    const { error: draftError } = await supabase
      .from("ai_drafts")
      .insert({
        study_id,
        draft: reportContent,
        model: "placeholder",
        version: "1.0",
      });

    if (draftError) throw draftError;

    // Update study state
    await supabase
      .from("studies")
      .update({ 
        state: "draft_ready",
        ai_draft_json: reportContent 
      })
      .eq("id", study_id);

    console.log("Placeholder report generated:", study_id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        study_id,
        report: reportContent 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error generating placeholder report:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
