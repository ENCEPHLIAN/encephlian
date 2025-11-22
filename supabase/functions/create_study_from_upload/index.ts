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

    const { filePath, fileName } = await req.json();

    if (!filePath || !fileName) {
      return new Response(
        JSON.stringify({ error: "Missing filePath or fileName" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify file is EDF
    if (!fileName.toLowerCase().endsWith('.edf')) {
      return new Response(
        JSON.stringify({ error: "Only EDF files are supported" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user's clinic
    const { data: clinicData } = await supabase.rpc("get_user_clinic_id", {
      _user_id: user.id
    });

    if (!clinicData) {
      return new Response(
        JSON.stringify({ error: "User clinic not found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create study with minimal metadata (EDF parsing would go here in production)
    const studyMeta = {
      patient_name: "Patient from Upload",
      patient_id: `PT-${Date.now()}`,
      age: null,
      gender: null,
      indication: "Uploaded EDF study",
    };

    const { data: study, error: studyError } = await supabase
      .from("studies")
      .insert({
        owner: user.id,
        clinic_id: clinicData,
        state: "uploaded",
        sla: "TAT",
        meta: studyMeta,
        uploaded_file_path: filePath,
        original_format: "edf",
      })
      .select()
      .single();

    if (studyError) throw studyError;

    // Create study_files record
    const { error: fileError } = await supabase
      .from("study_files")
      .insert({
        study_id: study.id,
        path: filePath,
        kind: "eeg_raw",
      });

    if (fileError) console.error("Error creating study file:", fileError);

    console.log("Study created:", study.id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        studyId: study.id,
        message: "Study created successfully"
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error creating study:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
