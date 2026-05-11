import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { insertPipelineEvent } from "../_shared/pipeline_log.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ParseRequest {
  study_id: string;
  file_path: string;
  file_type: 'edf' | 'bdf' | 'csv' | 'json';
}

interface EDFHeader {
  version: string;
  patientId: string;
  recordingId: string;
  startDate: string;
  startTime: string;
  headerBytes: number;
  numDataRecords: number;
  dataRecordDuration: number;
  numSignals: number;
}

/**
 * Lightweight EDF metadata extractor - ONLY extracts headers, no signal data
 * This avoids memory limits in edge functions
 */
function parseEDFMetadata(buffer: ArrayBuffer): {
  header: EDFHeader;
  channelLabels: string[];
  sampleRate: number;
  duration: number;
  numSamplesPerRecord: number[];
} {
  const decoder = new TextDecoder("ascii");
  
  const readString = (offset: number, length: number): string => {
    const bytes = new Uint8Array(buffer, offset, Math.min(length, buffer.byteLength - offset));
    return decoder.decode(bytes).trim();
  };

  // Parse fixed header (256 bytes)
  const header: EDFHeader = {
    version: readString(0, 8),
    patientId: readString(8, 80),
    recordingId: readString(88, 80),
    startDate: readString(168, 8),
    startTime: readString(176, 8),
    headerBytes: parseInt(readString(184, 8), 10) || 256,
    numDataRecords: parseInt(readString(236, 8), 10) || 1,
    dataRecordDuration: parseFloat(readString(244, 8)) || 1,
    numSignals: parseInt(readString(252, 4), 10) || 1,
  };

  const ns = Math.min(header.numSignals, 128); // Cap at 128 channels
  let offset = 256;

  // Read channel labels only (16 chars each)
  const labels: string[] = [];
  for (let i = 0; i < ns; i++) {
    labels.push(readString(offset + i * 16, 16));
  }
  offset += ns * 16;

  // Skip to samples per record (skip transducer, physical dim, min/max, digital min/max, prefiltering)
  offset += ns * 80; // transducer
  offset += ns * 8;  // physical dimension
  offset += ns * 8;  // physical min
  offset += ns * 8;  // physical max
  offset += ns * 8;  // digital min
  offset += ns * 8;  // digital max
  offset += ns * 80; // prefiltering

  // Read samples per record
  const numSamplesPerRecord: number[] = [];
  for (let i = 0; i < ns; i++) {
    numSamplesPerRecord.push(parseInt(readString(offset + i * 8, 8), 10) || 256);
  }

  const sampleRate = numSamplesPerRecord[0] / header.dataRecordDuration || 256;
  const duration = header.numDataRecords * header.dataRecordDuration;
  const channelLabels = labels.map((l) => l.replace(/\.+$/, "").trim());

  return {
    header,
    channelLabels,
    sampleRate,
    duration,
    numSamplesPerRecord,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let study_id: string | undefined;
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Authenticate user
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const body: ParseRequest = await req.json();
    study_id = body.study_id;
    const { file_path, file_type } = body;

    console.log(`Parsing ${file_type} metadata for study: ${study_id}, file: ${file_path}`);

    // Download only the first 64KB for header parsing (EDF headers are at most ~8KB)
    // Try eeg-uploads bucket first (where wizard-uploaded files live), fall back to eeg-raw
    let fileData: Blob | null = null;
    let downloadError: Error | null = null;
    const bucketsToTry = ['eeg-uploads', 'eeg-raw'];
    for (const bucket of bucketsToTry) {
      const { data, error } = await supabase.storage.from(bucket).download(file_path);
      if (!error && data) {
        fileData = data;
        break;
      }
      downloadError = error as Error;
    }
    if (!fileData) {

      throw new Error(`Failed to download file: ${downloadError?.message}`);
    }

    // Only read first 64KB for metadata extraction
    const fullBuffer = await fileData.arrayBuffer();
    const headerBuffer = fullBuffer.slice(0, Math.min(65536, fullBuffer.byteLength));

    let metadata: {
      channelLabels: string[];
      sampleRate: number;
      duration: number;
      patient_id?: string;
      recording_id?: string;
      start_date?: string;
      start_time?: string;
      num_channels?: number;
    };

    if (file_type === 'edf' || file_type === 'bdf') {
      const parsed = parseEDFMetadata(headerBuffer);
      metadata = {
        channelLabels: parsed.channelLabels,
        sampleRate: parsed.sampleRate,
        duration: parsed.duration,
        patient_id: parsed.header.patientId,
        recording_id: parsed.header.recordingId,
        start_date: parsed.header.startDate,
        start_time: parsed.header.startTime,
        num_channels: parsed.channelLabels.length,
      };
      console.log(`Extracted metadata: ${metadata.num_channels} channels, ${metadata.duration}s @ ${metadata.sampleRate}Hz`);
    } else if (file_type === 'json') {
      const text = await fileData.text();
      const parsed = JSON.parse(text);
      metadata = {
        channelLabels: parsed.channelLabels || parsed.channels?.map((c: any) => c.name) || [],
        sampleRate: parsed.sampleRate || parsed.sample_rate || 256,
        duration: parsed.duration || parsed.duration_sec || 0,
      };
    } else {
      throw new Error(`Unsupported file type: ${file_type}`);
    }

    // Build lightweight JSON (metadata only - no signal data!)
    const metadataJson = {
      study_id,
      file_path,
      file_type,
      channelLabels: metadata.channelLabels,
      sampleRate: metadata.sampleRate,
      duration: metadata.duration,
      patient_id: metadata.patient_id,
      recording_id: metadata.recording_id,
      start_date: metadata.start_date,
      start_time: metadata.start_time,
      num_channels: metadata.num_channels || metadata.channelLabels.length,
      // Flag indicating browser should parse signals directly from EDF
      signals_source: 'edf_direct',
      parsed_at: new Date().toISOString(),
    };

    // Upload metadata JSON to eeg-json bucket
    const jsonPath = `${study_id}/metadata.json`;
    const { error: uploadError } = await supabase
      .storage
      .from('eeg-json')
      .upload(jsonPath, JSON.stringify(metadataJson, null, 2), {
        contentType: 'application/json',
        upsert: true,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      throw new Error(`Failed to upload metadata: ${uploadError.message}`);
    }

    console.log(`Uploaded metadata to ${jsonPath}`);

    await insertPipelineEvent(supabase, {
      study_id,
      step: "edge.parse_eeg_study.complete",
      status: "ok",
      source: "supabase_edge",
      detail: {
        user_id: user.id,
        file_type,
        num_channels: metadataJson.num_channels,
        sample_rate: metadataJson.sampleRate,
      },
    });

    // Merge patient fields from EDF header into studies.meta (only fill null/missing slots)
    if (metadata.patient_id) {
      try {
        const rawPatient = metadata.patient_id.trim();
        const parts = rawPatient.split(/\s+/);
        const edfCode = parts[0] !== "X" ? parts[0] : null;
        const edfSex  = parts[1] === "M" ? "M" : parts[1] === "F" ? "F" : null;
        const edfDob  = parts[2] && parts[2] !== "X" ? parts[2] : null;
        const edfName = parts.slice(3).join(" ").replace(/_/g, " ").trim() || null;

        const { data: row } = await supabase.from("studies").select("meta").eq("id", study_id).single();
        const cur = (row?.meta ?? {}) as Record<string, string | null>;

        const patch: Record<string, string | null> = {};
        const isEmpty = (v: string | null | undefined) => !v || v === "Pending" || v.startsWith("PT-") || v === "X";

        if (edfName && isEmpty(cur.patient_name))  patch.patient_name = edfName;
        if (edfCode && isEmpty(cur.patient_id))    patch.patient_id   = edfCode;
        if (edfSex  && !cur.patient_sex)           patch.patient_sex  = edfSex;
        if (edfDob  && !cur.patient_dob)           patch.patient_dob  = edfDob;

        if (metadata.start_date && metadata.start_time && !cur.recording_date) {
          patch.recording_date = `${metadata.start_date} ${metadata.start_time}`;
        }

        if (Object.keys(patch).length > 0) {
          await supabase.from("studies").update({ meta: { ...cur, ...patch } }).eq("id", study_id);
        }
      } catch (metaErr) {
        console.warn("[parse_eeg_study] meta merge non-fatal:", metaErr);
      }
    }

    // Update study state
    await supabase
      .from('studies')
      .update({
        state: 'parsed',
        srate_hz: metadata.sampleRate,
        duration_min: Math.round(metadata.duration / 60),
      })
      .eq('id', study_id);

    // Upsert study_files record for the metadata
    await supabase
      .from('study_files')
      .upsert({
        study_id,
        kind: 'json',
        path: jsonPath,
      }, {
        onConflict: 'study_id,kind',
      });

    return new Response(
      JSON.stringify({
        success: true,
        json_path: jsonPath,
        metadata: metadataJson,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('Parse error:', error);
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      if (study_id) {
        const svc = createClient(supabaseUrl, supabaseKey);
        await insertPipelineEvent(svc, {
          study_id,
          step: "edge.parse_eeg_study.error",
          status: "error",
          source: "supabase_edge",
          detail: { message: String(error?.message ?? error) },
        });
      }
    } catch {
      // ignore secondary logging failures
    }
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
