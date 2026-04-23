import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

/**
 * create_study_from_upload — A5: Direct Azure Blob Upload
 *
 * Creates the Supabase study record + returns an Azure Blob SAS URL so the
 * frontend can upload the EDF/BDF directly to Azure with parallel block upload.
 * No Supabase Storage involved — EEG files go straight to Azure Blob.
 *
 * Request:  { fileName: string }
 * Response: { studyId, sasUrl, blobPath, expiresAt }
 *
 * After upload completes, call generate_ai_report({ study_id }) to start pipeline.
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
    if (!authHeader) throw new Error("No authorization header");
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authError || !user) throw new Error("Unauthorized");

    const { fileName } = await req.json();
    if (!fileName) return new Response(
      JSON.stringify({ error: "fileName is required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

    const lowerName = (fileName as string).toLowerCase();
    const isBdf = lowerName.endsWith(".bdf");
    if (!lowerName.endsWith(".edf") && !isBdf) return new Response(
      JSON.stringify({ error: "Only .edf and .bdf files are supported" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
    const fileType = isBdf ? "bdf" : "edf";

    // Resolve clinic
    let clinicId: string | null = null;
    const { data: clinicViaRpc } = await supabase.rpc("get_user_clinic_id", { _user_id: user.id });
    if (clinicViaRpc) {
      clinicId = clinicViaRpc;
    } else {
      const { data: m } = await supabase
        .from("clinic_memberships").select("clinic_id")
        .eq("user_id", user.id).limit(1).maybeSingle();
      clinicId = m?.clinic_id ?? null;
    }

    if (!clinicId) return new Response(
      JSON.stringify({ error: "No clinic configured. Contact admin." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

    // Create study record — state=pending until blob upload completes
    const { data: study, error: studyError } = await supabase
      .from("studies")
      .insert({
        owner: user.id,
        clinic_id: clinicId,
        state: "pending",
        sla: "TAT",
        meta: { patient_name: "Pending", patient_id: `PT-${Date.now()}`, original_filename: fileName },
        original_format: fileType,
      })
      .select().single();
    if (studyError) throw studyError;

    const studyId = study.id;
    const blobPath = `${studyId}.${fileType}`;
    console.log(`[${studyId}] Study created — fetching SAS token`);

    // Get SAS token from C-Plane for direct browser->blob upload
    const sasRes = await fetch(`${CPLANE_URL}/upload-token/${studyId}`, { method: "POST" });

    if (!sasRes.ok) {
      console.error(`[${studyId}] C-Plane SAS error: ${sasRes.status}`);
      return new Response(JSON.stringify({
        studyId, sasUrl: null, blobPath, expiresAt: null, fallback: true,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { sas_url, expires_at } = await sasRes.json();
    await supabase.from("studies").update({ uploaded_file_path: blobPath }).eq("id", studyId);
    const { error: studyFilesErr } = await supabase.from("study_files").insert({
      study_id: studyId,
      path: blobPath,
      kind: fileType,
    });
    if (studyFilesErr) {
      console.error(`[${studyId}] study_files insert:`, studyFilesErr);
      // Non-fatal — study row + SAS are the critical path; log for ops.
    }

    return new Response(JSON.stringify({
      studyId, sasUrl: sas_url, blobPath, expiresAt: expires_at,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("create_study_from_upload:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
