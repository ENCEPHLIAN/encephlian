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

    // Get auth user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch study details
    const { data: study, error: studyError } = await supabase
      .from("studies")
      .select("*")
      .eq("id", study_id)
      .single();

    if (studyError || !study) {
      console.error("Study fetch error:", studyError);
      return new Response(JSON.stringify({ error: "Study not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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

    // Build AI prompt
    const patientInfo = `
Patient Name: ${study.meta?.patient_name || "Unknown"}
Patient ID: ${study.meta?.patient_id || "N/A"}
Age: ${study.meta?.age || "N/A"}
Gender: ${study.meta?.gender || "N/A"}
`;

    const studyInfo = `
Study Duration: ${study.duration_min || "N/A"} minutes
Sampling Rate: ${study.srate_hz || "N/A"} Hz
Indication: ${study.indication || "N/A"}
Montage: ${study.montage || "Standard"}
Reference: ${study.reference || "Standard"}
`;

    const markersInfo = markers && markers.length > 0
      ? `
Neurologist Annotations (${markers.length} markers):
${markers.map((m: any) => 
  `- [${m.timestamp_sec}s] ${m.marker_type.toUpperCase()}: ${m.label}${m.severity ? ` (${m.severity})` : ""}${m.notes ? `\n  Notes: ${m.notes}` : ""}`
).join("\n")}
`
      : "\nNo manual annotations provided.";

    const systemPrompt = `You are an expert neurologist specializing in EEG interpretation. Generate a comprehensive EEG report based on the provided study information and annotations.`;

    const userPrompt = `Please generate a comprehensive EEG report for the following study:

${patientInfo}

STUDY DETAILS:
${studyInfo}

${markersInfo}

Generate a structured report with the following sections:
1. BACKGROUND ACTIVITY: Describe the background EEG activity (frequency, amplitude, symmetry, reactivity)
2. SLEEP STAGES: If applicable, describe sleep architecture
3. ABNORMALITIES: List any epileptiform discharges, sharp waves, spikes, or other abnormalities
4. ARTIFACTS: Note any technical artifacts or movement artifacts
5. IMPRESSION: Provide clinical interpretation and diagnostic impression
6. RECOMMENDATIONS: Suggest follow-up or additional studies if needed

Format the response as a professional medical report. Be thorough but concise.`;

    // Call Lovable AI
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI API error:", aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const reportContent = aiData.choices?.[0]?.message?.content;

    if (!reportContent) {
      return new Response(JSON.stringify({ error: "No report generated" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse the report content into structured sections
    const reportSections = {
      background_activity: extractSection(reportContent, ["BACKGROUND ACTIVITY", "Background"]),
      sleep_stages: extractSection(reportContent, ["SLEEP STAGES", "Sleep"]),
      abnormalities: extractSection(reportContent, ["ABNORMALITIES", "Abnormal"]),
      artifacts: extractSection(reportContent, ["ARTIFACTS", "Artifact"]),
      impression: extractSection(reportContent, ["IMPRESSION", "Clinical Impression"]),
      recommendations: extractSection(reportContent, ["RECOMMENDATIONS", "Follow-up"]),
    };

    // Store AI draft
    const { error: draftError } = await supabase.from("ai_drafts").insert({
      study_id: study_id,
      draft: reportSections,
      model: "google/gemini-2.5-flash",
      version: "1.0",
    });

    if (draftError) {
      console.error("Draft save error:", draftError);
      return new Response(JSON.stringify({ error: "Failed to save report" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update study state to ai_draft
    const { error: updateError } = await supabase
      .from("studies")
      .update({ state: "ai_draft" })
      .eq("id", study_id);

    if (updateError) {
      console.error("Study update error:", updateError);
    }

    return new Response(JSON.stringify({ 
      success: true, 
      report: reportSections,
      message: "AI report generated successfully" 
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

// Helper function to extract sections from AI response
function extractSection(content: string, keywords: string[]): string {
  for (const keyword of keywords) {
    const regex = new RegExp(`${keyword}:?\\s*([\\s\\S]*?)(?=\\n\\n[A-Z]|$)`, "i");
    const match = content.match(regex);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  return "";
}
