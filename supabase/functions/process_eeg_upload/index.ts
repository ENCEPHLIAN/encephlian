import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

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

    const { file_path, file_name, sla = 'TAT' } = await req.json();

    if (!file_path || !file_name) {
      throw new Error("Missing file_path or file_name");
    }

    console.log("Processing EEG upload:", file_name);

    // Get user's clinic
    const { data: clinicData } = await supabase
      .from("user_clinic_context")
      .select("clinic_id")
      .eq("user_id", user.id)
      .single();

    if (!clinicData?.clinic_id) {
      throw new Error("User clinic not found");
    }

    // Extract patient info from filename if present
    const patientIdMatch = file_name.match(/[A-Z]\d{3,}/);
    const patientId = patientIdMatch ? patientIdMatch[0] : `P${Date.now().toString().slice(-6)}`;

    // Create study record
    const { data: study, error: studyError } = await supabase
      .from("studies")
      .insert({
        owner: user.id,
        clinic_id: clinicData.clinic_id,
        uploaded_file_path: file_path,
        original_format: file_name.endsWith('.edf') ? 'edf' : 'unknown',
        sla: sla,
        state: 'uploaded',
        meta: {
          patient_id: patientId,
          uploaded_filename: file_name,
          upload_timestamp: new Date().toISOString(),
        },
      })
      .select()
      .single();

    if (studyError) throw studyError;

    console.log("Study created:", study.id);

    // Create study file record
    await supabase.from("study_files").insert({
      study_id: study.id,
      kind: "edf",
      path: file_path,
    });

    // Log review event
    await supabase.from("review_events").insert({
      study_id: study.id,
      actor: user.id,
      event: "upload",
      payload: { file_name, file_path },
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        study_id: study.id,
        patient_id: patientId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error processing EEG upload:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
