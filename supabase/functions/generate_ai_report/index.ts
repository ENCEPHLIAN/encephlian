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

    // Determine template type (simple heuristic - can be enhanced)
    const hasAbnormalMarkers = markers?.some((m: any) => 
      ['seizure', 'spike', 'sharp', 'abnormal'].some(term => 
        m.marker_type?.toLowerCase().includes(term) || 
        m.label?.toLowerCase().includes(term)
      )
    );
    const templateType = hasAbnormalMarkers ? 'abnormal' : 'normal';

    // Fetch appropriate template
    const { data: template, error: templateError } = await supabase
      .from('report_templates')
      .select('*')
      .eq('type', templateType)
      .single();

    if (templateError) {
      console.error("Template fetch error:", templateError);
      // Continue without template
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
Indication: ${study.indication || "Routine EEG monitoring"}
Montage: ${study.montage || "Standard 10-20 system"}
Reference: ${study.reference || "Average reference"}
`;

    const markersInfo = markers && markers.length > 0
      ? `
Neurologist Annotations (${markers.length} markers):
${markers.map((m: any) => 
  `- [${m.timestamp_sec}s] ${m.marker_type.toUpperCase()}: ${m.label}${m.severity ? ` (${m.severity})` : ""}${m.notes ? `\n  Notes: ${m.notes}` : ""}`
).join("\n")}
`
      : "\nNo manual annotations provided.";

    const systemPrompt = `You are a board-certified neurologist with 20+ years of EEG interpretation experience. Generate a professional, clinical-grade EEG report following Natus NeuroWorks format standards. Ensure all findings are specific, use proper medical terminology, and include montage information.`;

    let userPrompt = `Generate a comprehensive EEG report for the following study:

${patientInfo}

STUDY DETAILS:
${studyInfo}

${markersInfo}
`;

    if (template) {
      userPrompt += `

TEMPLATE STRUCTURE TO FOLLOW:
${JSON.stringify(template.template_content, null, 2)}

INSTRUCTIONS:
1. Follow the exact section structure from the template above
2. Replace ALL placeholder values ({{...}}) with actual study-specific findings
3. Use the template's language style and level of detail
4. For normal studies: Use conservative, professional language describing normal patterns
5. For abnormal studies: Be specific about location (channel/region), morphology, frequency, and amplitude
6. Include montage information: ${template.template_content.montages_used?.join(', ') || 'Longitudinal bipolar, referential'}
7. Use proper medical units (μV for amplitude, Hz for frequency, ms for duration)
8. Format impression as numbered list if multiple significant findings
9. Recommendations must be clinically actionable and specific

Generate the complete report now in structured JSON format matching the template sections.`;
    } else {
      // Fallback prompt without template
      userPrompt += `

Generate a structured report with the following sections:
1. TECHNICAL_DETAILS: Montage, filters, duration, channels (10-20 system)
2. BACKGROUND_ACTIVITY: Describe the background EEG (frequency, amplitude, symmetry, reactivity)
3. SLEEP_ARCHITECTURE: If applicable, describe sleep stages and architecture
4. ACTIVATION_PROCEDURES: Results of hyperventilation and photic stimulation
5. ABNORMALITIES: List any epileptiform discharges, sharp waves, spikes, focal slowing
6. ARTIFACTS: Note technical or movement artifacts
7. IMPRESSION: Clinical interpretation and diagnostic impression
8. CORRELATION: Clinical context and significance
9. RECOMMENDATIONS: Follow-up or additional studies
10. MONTAGES_USED: List montages used for analysis

Format as professional medical report with proper medical terminology.`;
    }

    // Call Lovable AI with retry logic
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("AI service not configured");
    }

    const MAX_RETRIES = 3;
    let aiResponse;
    let attempt = 0;

    while (attempt < MAX_RETRIES) {
      attempt++;
      try {
        aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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

        if (aiResponse.ok) {
          console.log(`AI response successful on attempt ${attempt}`);
          break;
        }

        if (aiResponse.status === 429 || aiResponse.status >= 500) {
          // Retry on rate limit or server errors
          if (attempt < MAX_RETRIES) {
            const backoff = Math.pow(2, attempt) * 1000; // Exponential backoff
            console.log(`Retrying after ${backoff}ms (attempt ${attempt})`);
            await new Promise(resolve => setTimeout(resolve, backoff));
            continue;
          }
        }

        // For other errors, throw immediately
        const errorText = await aiResponse.text();
        console.error("AI API error:", aiResponse.status, errorText);
        throw new Error(`AI service error: ${aiResponse.status}`);

      } catch (error) {
        console.error(`Attempt ${attempt} failed:`, error);
        if (attempt === MAX_RETRIES) {
          throw error;
        }
        const backoff = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, backoff));
      }
    }

    if (!aiResponse || !aiResponse.ok) {
      // Use fallback template if AI fails after all retries
      console.log("AI failed after retries, using template fallback");
      const fallbackContent = template?.template_content || {
        background_activity: "Unable to generate AI analysis. Manual review required.",
        impression: "AI GENERATION FAILED - MANUAL REVIEW REQUIRED",
        recommendations: "Clinical review and manual report generation recommended."
      };

      const { error: draftError } = await supabase.from("ai_drafts").insert({
        study_id: study_id,
        draft: fallbackContent,
        model: "fallback-template",
        version: "1.0",
      });

      if (draftError) {
        console.error("Fallback draft save error:", draftError);
      }

      await supabase.from("studies").update({ state: "ai_draft" }).eq("id", study_id);

      return new Response(JSON.stringify({ 
        success: true, 
        report: fallbackContent,
        message: "Fallback template used - manual review required",
        fallback: true
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const reportContent = aiData.choices?.[0]?.message?.content;

    if (!reportContent) {
      throw new Error("No report generated by AI");
    }

    // Parse the report content into structured sections
    const reportSections = template ? 
      parseTemplateBasedReport(reportContent) :
      parseStandardReport(reportContent);

    // Store AI draft
    const { error: draftError } = await supabase.from("ai_drafts").insert({
      study_id: study_id,
      draft: reportSections,
      model: "google/gemini-2.5-flash",
      version: "1.0",
    });

    if (draftError) {
      console.error("Draft save error:", draftError);
      throw new Error("Failed to save report");
    }

    // Update study state to ai_draft
    await supabase.from("studies").update({ state: "ai_draft" }).eq("id", study_id);

    return new Response(JSON.stringify({ 
      success: true, 
      report: reportSections,
      message: "AI report generated successfully",
      template_used: template?.name || "Standard format"
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

// Parse template-based AI response
function parseTemplateBasedReport(content: string): any {
  try {
    // Try to parse as JSON first
    return JSON.parse(content);
  } catch {
    // Fall back to standard parsing
    return parseStandardReport(content);
  }
}

// Parse standard format AI response
function parseStandardReport(content: string): any {
  return {
    clinical_indication: extractSection(content, ["CLINICAL INDICATION", "Indication"]),
    technical_details: extractSection(content, ["TECHNICAL DETAILS", "Technical"]),
    background_activity: extractSection(content, ["BACKGROUND ACTIVITY", "Background"]),
    sleep_architecture: extractSection(content, ["SLEEP ARCHITECTURE", "SLEEP STAGES", "Sleep"]),
    activation_procedures: extractSection(content, ["ACTIVATION PROCEDURES", "Activation"]),
    abnormalities: extractSection(content, ["ABNORMALITIES", "Abnormal"]),
    artifacts: extractSection(content, ["ARTIFACTS", "Artifact"]),
    impression: extractSection(content, ["IMPRESSION", "Clinical Impression"]),
    correlation: extractSection(content, ["CORRELATION", "Clinical Context"]),
    recommendations: extractSection(content, ["RECOMMENDATIONS", "Follow-up"]),
    montages_used: extractSection(content, ["MONTAGES USED", "Montages"]),
  };
}

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