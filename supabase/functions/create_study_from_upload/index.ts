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

    // Get user's clinic - ONLY use existing clinic, never create new one
    let clinicId: string | null = null;
    
    // First try to get user's clinic via RPC
    const { data: clinicData } = await supabase.rpc("get_user_clinic_id", {
      _user_id: user.id
    });
    
    if (clinicData) {
      clinicId = clinicData;
      console.log(`Found user clinic: ${clinicId}`);
    } else {
      // Check clinic_memberships directly
      const { data: membership } = await supabase
        .from("clinic_memberships")
        .select("clinic_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      
      if (membership?.clinic_id) {
        clinicId = membership.clinic_id;
        console.log(`Found clinic via membership: ${clinicId}`);
      } else {
        // Get default Magna Neurology clinic - NEVER create a new one
        const { data: defaultClinic } = await supabase
          .from("clinics")
          .select("id")
          .eq("name", "Magna Neurology")
          .maybeSingle();
        
        if (defaultClinic) {
          clinicId = defaultClinic.id;
          console.log(`Using default clinic: ${clinicId}`);
          
          // Auto-assign user to default clinic
          const { error: membershipError } = await supabase
            .from("clinic_memberships")
            .insert({
              user_id: user.id,
              clinic_id: clinicId,
              role: "neurologist"
            })
            .select()
            .maybeSingle();
          
          if (membershipError && !membershipError.message.includes('duplicate')) {
            console.error("Failed to create membership:", membershipError);
          } else {
            console.log(`Auto-assigned user ${user.id} to default clinic`);
          }
        } else {
          // No clinic exists - this should be handled by admin
          console.error("No default clinic found - admin needs to create one");
          return new Response(
            JSON.stringify({ error: "No clinic configured. Please contact admin to set up your clinic." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
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