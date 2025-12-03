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
    console.log(`Creating study for file: ${fileName}, path: ${filePath}`);

    if (!filePath || !fileName) {
      return new Response(
        JSON.stringify({ error: "Missing filePath or fileName" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify file is EDF or BDF
    const lowerName = fileName.toLowerCase();
    if (!lowerName.endsWith('.edf') && !lowerName.endsWith('.bdf')) {
      return new Response(
        JSON.stringify({ error: "Only EDF and BDF files are supported" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user's clinic - fallback to default if not found
    let clinicId: string | null = null;
    
    // First try to get user's clinic via RPC
    const { data: clinicData } = await supabase.rpc("get_user_clinic_id", {
      _user_id: user.id
    });
    
    if (clinicData) {
      clinicId = clinicData;
      console.log(`Found user clinic: ${clinicId}`);
    } else {
      // Fallback: Get default Magna Neurology clinic
      const { data: defaultClinic } = await supabase
        .from("clinics")
        .select("id")
        .eq("name", "Magna Neurology")
        .maybeSingle();
      
      if (defaultClinic) {
        clinicId = defaultClinic.id;
        console.log(`Using default clinic: ${clinicId}`);
        
        // Auto-assign user to default clinic
        await supabase.from("clinic_memberships").insert({
          user_id: user.id,
          clinic_id: clinicId,
          role: "neurologist"
        });
        console.log(`Auto-assigned user ${user.id} to default clinic`);
      } else {
        // Create Magna Neurology if it doesn't exist
        const { data: newClinic, error: clinicError } = await supabase
          .from("clinics")
          .insert({ name: "Magna Neurology" })
          .select()
          .single();
        
        if (clinicError) {
          console.error("Failed to create default clinic:", clinicError);
          return new Response(
            JSON.stringify({ error: "Failed to set up clinic. Contact support." }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        clinicId = newClinic.id;
        
        // Assign user to new clinic
        await supabase.from("clinic_memberships").insert({
          user_id: user.id,
          clinic_id: clinicId,
          role: "neurologist"
        });
        console.log(`Created and assigned user to new clinic: ${clinicId}`);
      }
    }

    // Determine file type from extension
    const fileType = lowerName.endsWith('.bdf') ? 'bdf' : 'edf';

    // Create study with minimal metadata
    const studyMeta = {
      patient_name: "Patient from Upload",
      patient_id: `PT-${Date.now()}`,
      age: null,
      gender: null,
      indication: "Uploaded EEG study",
    };

    const { data: study, error: studyError } = await supabase
      .from("studies")
      .insert({
        owner: user.id,
        clinic_id: clinicId,
        state: "uploaded",
        sla: "TAT",
        meta: studyMeta,
        uploaded_file_path: filePath,
        original_format: fileType,
      })
      .select()
      .single();

    if (studyError) {
      console.error("Study creation error:", studyError);
      throw studyError;
    }

    // Create study_files record with correct kind for EEGViewer
    const { error: fileError } = await supabase
      .from("study_files")
      .insert({
        study_id: study.id,
        path: filePath,
        kind: fileType, // 'edf' or 'bdf' - matches what EEGViewer expects
      });

    if (fileError) {
      console.error("Error creating study file:", fileError);
    }

    console.log(`Study created successfully: ${study.id}`);

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
