import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

/**
 * Process EEG Upload - Alternative endpoint for EEG file processing
 * Creates a study record and triggers canonicalization
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

    const { file_path, file_name, sla = 'TAT' } = await req.json();

    if (!file_path || !file_name) {
      throw new Error("Missing file_path or file_name");
    }

    console.log("Processing EEG upload:", file_name);

    // Validate file extension
    const lowerName = file_name.toLowerCase();
    if (!lowerName.endsWith('.edf') && !lowerName.endsWith('.bdf')) {
      throw new Error("Only EDF and BDF files are supported");
    }

    // Get user's clinic - fallback to default if not found
    let clinicId: string | null = null;
    
    const { data: clinicData } = await supabase.rpc("get_user_clinic_id", {
      _user_id: user.id
    });
    
    if (clinicData) {
      clinicId = clinicData;
      console.log(`Found user clinic: ${clinicId}`);
    } else {
      // Fallback: Get or create default Magna Neurology clinic
      const { data: defaultClinic } = await supabase
        .from("clinics")
        .select("id")
        .eq("name", "Magna Neurology")
        .maybeSingle();
      
      if (defaultClinic) {
        clinicId = defaultClinic.id;
      } else {
        const { data: newClinic, error: clinicError } = await supabase
          .from("clinics")
          .insert({ name: "Magna Neurology" })
          .select()
          .single();
        
        if (clinicError) throw clinicError;
        clinicId = newClinic.id;
      }

      // Auto-assign user to clinic (ignore if already exists)
      const { error: membershipError } = await supabase.from("clinic_memberships").insert({
        user_id: user.id,
        clinic_id: clinicId,
        role: "neurologist"
      });

      if (membershipError && !membershipError.message.includes('duplicate')) {
        console.warn("Membership insert warning:", membershipError.message);
      }

      console.log(`User assigned to clinic: ${clinicId}`);
    }

    // Extract patient info from filename if present
    const patientIdMatch = file_name.match(/[A-Z]\d{3,}/);
    const patientId = patientIdMatch ? patientIdMatch[0] : `P${Date.now().toString().slice(-6)}`;
    const fileType = lowerName.endsWith('.bdf') ? 'bdf' : 'edf';

    // Create study record
    const { data: study, error: studyError } = await supabase
      .from("studies")
      .insert({
        owner: user.id,
        clinic_id: clinicId,
        uploaded_file_path: file_path,
        original_format: fileType,
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
      kind: fileType,
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
        message: "Study created. Use parse_eeg_study to canonicalize."
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
