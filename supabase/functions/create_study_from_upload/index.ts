import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCplaneBaseUrl } from "../_shared/cplane.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { insertPipelineEvent } from "../_shared/pipeline_log.ts";

function generateEncStudyReference(): string {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const rand = crypto.randomUUID().replace(/-/g, "").slice(0, 4).toUpperCase();
  return `ENC-${yy}${mm}${dd}-${rand}`;
}

/**
 * create_study_from_upload — A5: Direct Azure Blob Upload
 *
 * Creates the Supabase study record + returns an Azure Blob SAS URL so the
 * frontend can upload the EDF/BDF directly to Azure with parallel block upload.
 * No Supabase Storage involved — EEG files go straight to Azure Blob.
 *
 * Request:  { fileName: string, contentSha256?: string }
 * Response: { studyId, sasUrl, blobPath, expiresAt } | duplicate: { studyId, duplicate: true, message }
 *
 * After upload completes, call generate_ai_report({ study_id }) to start pipeline.
 */

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

    const body = await req.json() as {
      fileName?: string;
      contentSha256?: string;
      patientMeta?: {
        patient_name?: string;
        patient_id?: string;
        patient_sex?: string;
        patient_dob?: string;
      };
    };
    const fileName = body.fileName;
    if (!fileName) return new Response(
      JSON.stringify({ error: "fileName is required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

    let contentSha256: string | null = null;
    if (typeof body.contentSha256 === "string") {
      const h = body.contentSha256.trim().toLowerCase().replace(/[^a-f0-9]/g, "");
      if (h.length > 0 && h.length !== 64) {
        return new Response(
          JSON.stringify({ error: "contentSha256 must be 64 hex characters when provided" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      contentSha256 = h.length === 64 ? h : null;
    }

    // Canonical extension list — MUST match src/shared/eegFormats.ts in the
    // frontend repo. Kept inline because edge functions can't import from /src.
    const ACCEPTED_EXT = [
      ".edf", ".bdf",                       // universal interchange
      ".e", ".erd", ".ncs",                 // Natus / NicoletOne / Xltek
      ".lay", ".vhdr", ".cnt", ".set",      // Persyst / BrainVision / Neuroscan / EEGLAB
      ".mff", ".raw",                       // EGI / Philips
      ".dap", ".rs3", ".cef",               // Compumedics Curry
      ".mefd", ".gdf", ".nwb",              // MEF3 / GDF / NWB
      ".nk", ".21e", ".rms", ".cle",        // Nihon Kohden / RMS / Clarity / proprietary EDF exporters
    ];

    const lowerName = (fileName as string).toLowerCase();
    const dotIdx = lowerName.lastIndexOf(".");
    const ext = dotIdx >= 0 ? lowerName.slice(dotIdx) : "";
    if (!ACCEPTED_EXT.includes(ext)) {
      return new Response(
        JSON.stringify({
          error: `Unsupported file type "${ext || "(no extension)"}". Supported: ${ACCEPTED_EXT.join(", ")}`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    // fileType = extension without the leading dot. Stored in studies.original_format,
    // study_files.kind, and used to derive the blob path so the SAS URL the
    // C-Plane returns lines up with the path we record.
    const fileType = ext.slice(1);

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

    const correlationId = crypto.randomUUID();

    if (contentSha256) {
      const { data: dup } = await supabase
        .from("studies")
        .select("id, state")
        .eq("clinic_id", clinicId)
        .eq("owner", user.id)
        .eq("source_content_sha256", contentSha256)
        .neq("state", "failed")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (dup?.id) {
        await insertPipelineEvent(supabase, {
          study_id: dup.id,
          step: "edge.create_study_from_upload.dedupe_hit",
          status: "info",
          source: "supabase_edge",
          correlation_id: correlationId,
          detail: { fileName, fileType, duplicate_of: dup.id, state: dup.state },
        });
        return new Response(
          JSON.stringify({
            studyId: dup.id,
            duplicate: true,
            message: "This recording is already in your workspace — opening the existing study.",
            state: dup.state,
            correlation_id: correlationId,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    const reference = generateEncStudyReference();

    // Create study record — state=pending until blob upload completes
    const { data: study, error: studyError } = await supabase
      .from("studies")
      .insert({
        owner: user.id,
        clinic_id: clinicId,
        state: "pending",
        sla: "TAT",
        reference,
        source_content_sha256: contentSha256,
        meta: {
          patient_name:   body.patientMeta?.patient_name   ?? null,
          patient_id:     body.patientMeta?.patient_id     ?? null,
          patient_sex:    body.patientMeta?.patient_sex    ?? null,
          patient_dob:    body.patientMeta?.patient_dob    ?? null,
          original_filename: fileName,
        },
        original_format: fileType,
      })
      .select().single();
    if (studyError) throw studyError;

    const studyId = study.id;
    const blobPath = `${studyId}.${fileType}`;
    console.log(`[${studyId}] Study created — fetching SAS token`);

    await insertPipelineEvent(supabase, {
      study_id: studyId,
      step: "edge.create_study_from_upload.study_row",
      status: "ok",
      source: "supabase_edge",
      correlation_id: correlationId,
      detail: { fileName, fileType, user_id: user.id },
    });

    // Get SAS token from C-Plane for direct browser->blob upload. We MUST pass
    // the file extension so the SAS URL the C-Plane mints matches the blob path
    // we record in studies.uploaded_file_path / study_files.path. Without ?ext=
    // the C-Plane defaults to .edf and any non-.edf upload lands at the wrong key.
    const sasRes = await fetch(
      `${getCplaneBaseUrl()}/upload-token/${studyId}?ext=${encodeURIComponent(fileType)}`,
      { method: "POST" },
    );

    if (!sasRes.ok) {
      const errBody = await sasRes.text().catch(() => "");
      console.error(`[${studyId}] C-Plane SAS error: ${sasRes.status}`);
      await insertPipelineEvent(supabase, {
        study_id: studyId,
        step: "edge.create_study_from_upload.sas_error",
        status: "error",
        source: "supabase_edge",
        correlation_id: correlationId,
        detail: { http_status: sasRes.status, body_preview: errBody.slice(0, 2000) },
      });
      return new Response(JSON.stringify({
        studyId, sasUrl: null, blobPath, expiresAt: null, fallback: true, correlation_id: correlationId,
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

    await insertPipelineEvent(supabase, {
      study_id: studyId,
      step: "edge.create_study_from_upload.sas_ok",
      status: "ok",
      source: "supabase_edge",
      correlation_id: correlationId,
      detail: { blobPath },
    });

    return new Response(JSON.stringify({
      studyId, sasUrl: sas_url, blobPath, expiresAt: expires_at, correlation_id: correlationId,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("create_study_from_upload:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
