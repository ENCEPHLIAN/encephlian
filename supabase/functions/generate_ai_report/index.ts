import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { study_id } = await req.json();

    if (!study_id) {
      return new Response(JSON.stringify({ error: "study_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get auth user and verify identity
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify user from token
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch study details
    const { data: study, error: studyError } = await supabase
      .from("studies")
      .select("*, clinic_id")
      .eq("id", study_id)
      .single();

    if (studyError || !study) {
      console.error("Study fetch error:", studyError);
      return new Response(JSON.stringify({ error: "Study not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Authorization check: user must own the study OR be a member of the study's clinic
    if (study.owner !== user.id) {
      const { data: membership } = await supabase
        .from("clinic_memberships")
        .select("clinic_id")
        .eq("user_id", user.id)
        .eq("clinic_id", study.clinic_id)
        .single();

      if (!membership) {
        console.error("Authorization failed: user does not have access to study");
        return new Response(JSON.stringify({ error: "Unauthorized: You do not have access to this study" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Fetch user markers
    const { data: markers, error: markersError } = await supabase
      .from("eeg_markers")
      .select("*")
      .eq("study_id", study_id)
      .order("timestamp_sec");

    if (markersError) {
      console.error("Markers fetch error:", markersError);
    }

    // Determine template type (simple heuristic)
    const hasAbnormalMarkers = markers?.some((m: any) => 
      ['seizure', 'spike', 'sharp', 'abnormal'].some(term => 
        m.marker_type?.toLowerCase().includes(term) || 
        m.label?.toLowerCase().includes(term)
      )
    );
    const templateType = hasAbnormalMarkers ? 'abnormal' : 'normal';

    // Generate placeholder report (no external AI call)
    const reportSections = generatePlaceholderReport(study, markers || [], templateType);

    // Store AI draft
    const { error: draftError } = await supabase.from("ai_drafts").insert({
      study_id: study_id,
      draft: reportSections,
      model: "placeholder-v1",
      version: "1.0",
    });

    if (draftError) {
      console.error("Draft save error:", draftError);
      throw new Error("Failed to save report");
    }

    // Update study state to ai_draft
    await supabase.from("studies").update({ 
      state: "ai_draft",
      ai_draft_json: reportSections 
    }).eq("id", study_id);

    return new Response(JSON.stringify({ 
      success: true, 
      report: reportSections,
      message: "Report generated successfully",
      template_used: templateType
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error in generate-ai-report:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Generate placeholder report based on study data
function generatePlaceholderReport(study: any, markers: any[], templateType: string): any {
  const meta = study.meta || {};
  const patientName = meta.patient_name || "Unknown Patient";
  const patientId = meta.patient_id || study.id.slice(0, 8);
  const age = meta.age || "N/A";
  const gender = meta.gender || "N/A";
  
  const isAbnormal = templateType === 'abnormal';
  
  // Build findings from markers
  const markerSummary = markers.length > 0 
    ? markers.map(m => `${m.marker_type}: ${m.label || 'No label'}${m.severity ? ` (${m.severity})` : ''}`).join('; ')
    : 'No annotations recorded';

  return {
    clinical_indication: study.indication || "Routine EEG evaluation",
    technical_details: `Recording Duration: ${study.duration_min || 30} minutes. Sampling Rate: ${study.srate_hz || 256} Hz. Montage: ${study.montage || "10-20 International System"}. Reference: ${study.reference || "Average reference"}.`,
    patient_info: {
      name: patientName,
      id: patientId,
      age: age,
      gender: gender
    },
    background_activity: isAbnormal 
      ? "The posterior dominant rhythm consists of 8-9 Hz alpha activity, attenuated with eye opening. Some asymmetry noted with intermittent left temporal slowing."
      : "The posterior dominant rhythm consists of 9-10 Hz alpha activity at 40-60 μV, which is reactive to eye opening and symmetric. Beta activity is within normal limits. No focal slowing observed.",
    sleep_architecture: "Patient remained awake throughout recording. No sleep stages captured.",
    activation_procedures: {
      hyperventilation: "Hyperventilation performed for 3 minutes. Normal buildup and resolution. No epileptiform activity provoked.",
      photic_stimulation: "Photic stimulation performed at 1-30 Hz. Normal photic driving response. No photoparoxysmal response."
    },
    abnormalities: isAbnormal 
      ? `Intermittent epileptiform discharges observed. ${markerSummary}`
      : "No epileptiform discharges. No focal slowing. No periodic patterns.",
    artifacts: "Minimal muscle artifact and electrode pop artifacts. Technical quality is adequate for interpretation.",
    impression: isAbnormal 
      ? "ABNORMAL EEG - Clinical correlation recommended. Findings may support diagnosis of epilepsy."
      : "NORMAL AWAKE EEG - No epileptiform abnormalities identified.",
    correlation: isAbnormal
      ? "Findings should be correlated with clinical history and seizure semiology. Consider repeat EEG with sleep deprivation if clinical suspicion remains high."
      : "This normal EEG does not exclude epilepsy. If clinical suspicion persists, consider repeat EEG with sleep deprivation or ambulatory monitoring.",
    recommendations: isAbnormal
      ? "1. Clinical correlation recommended\n2. Consider neuroimaging if not already performed\n3. Follow-up EEG may be beneficial"
      : "1. No immediate follow-up required based on EEG findings\n2. Clinical correlation as needed",
    montages_used: ["Longitudinal Bipolar (Double Banana)", "Transverse Bipolar", "Average Reference"],
    annotations_summary: markerSummary,
    generated_at: new Date().toISOString(),
    model_version: "placeholder-v1"
  };
}