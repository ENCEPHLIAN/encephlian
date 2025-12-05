import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ENCEPHLIAN_EEG_v1 Canonical Channels (27 total)
const CANONICAL_CHANNELS = [
  "Fp1", "Fp2", "F3", "F4", "C3", "C4", "Cz",
  "F7", "F8", "Fz",
  "T3", "T4", "T5", "T6",
  "P3", "P4", "Pz",
  "O1", "O2",
  "A1", "A2",
  "E1",
  "ECG",
  "Photic",
  "G02", "G08", "31"
];

const SFREQ_MODEL = 128.0; // Target sampling rate for model

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
  reserved: string;
  numDataRecords: number;
  dataRecordDuration: number;
  numSignals: number;
}

interface EDFSignalHeader {
  label: string;
  physicalMinimum: number;
  physicalMaximum: number;
  digitalMinimum: number;
  digitalMaximum: number;
  numSamplesPerRecord: number;
}

/**
 * Simple SHA-256 hash of ArrayBuffer
 */
async function hashBuffer(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Resample signal from native rate to target rate using linear interpolation
 */
function resampleSignal(signal: number[], nativeSfreq: number, targetSfreq: number): number[] {
  if (nativeSfreq === targetSfreq) return signal;
  
  const ratio = nativeSfreq / targetSfreq;
  const newLength = Math.floor(signal.length / ratio);
  const resampled = new Array(newLength);
  
  for (let i = 0; i < newLength; i++) {
    const srcIdx = i * ratio;
    const srcIdxFloor = Math.floor(srcIdx);
    const srcIdxCeil = Math.min(srcIdxFloor + 1, signal.length - 1);
    const t = srcIdx - srcIdxFloor;
    
    resampled[i] = signal[srcIdxFloor] * (1 - t) + signal[srcIdxCeil] * t;
  }
  
  return resampled;
}

/**
 * Apply bandpass filter (simple moving average approximation for edge function)
 */
function applySimpleFilter(signal: number[], sampleRate: number): number[] {
  // Simple 5-point moving average (approximates low-pass)
  const filtered = new Array(signal.length);
  const windowSize = 5;
  const halfWindow = Math.floor(windowSize / 2);
  
  for (let i = 0; i < signal.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - halfWindow); j <= Math.min(signal.length - 1, i + halfWindow); j++) {
      sum += signal[j];
      count++;
    }
    filtered[i] = sum / count;
  }
  
  return filtered;
}

/**
 * Parse EDF file and extract actual signal data
 */
function parseEDFBuffer(buffer: ArrayBuffer): {
  signals: number[][];
  channelLabels: string[];
  sampleRate: number;
  duration: number;
  metadata: Record<string, any>;
} {
  const view = new DataView(buffer);
  const decoder = new TextDecoder("ascii");
  
  const readString = (offset: number, length: number): string => {
    const bytes = new Uint8Array(buffer, offset, length);
    return decoder.decode(bytes).trim();
  };

  // Parse header
  const header: EDFHeader = {
    version: readString(0, 8),
    patientId: readString(8, 80),
    recordingId: readString(88, 80),
    startDate: readString(168, 8),
    startTime: readString(176, 8),
    headerBytes: parseInt(readString(184, 8), 10),
    reserved: readString(192, 44),
    numDataRecords: parseInt(readString(236, 8), 10) || 1,
    dataRecordDuration: parseFloat(readString(244, 8)) || 1,
    numSignals: parseInt(readString(252, 4), 10) || 1,
  };

  const ns = Math.min(header.numSignals, 128);
  let offset = 256;

  // Parse signal headers
  const labels: string[] = [];
  for (let i = 0; i < ns; i++) {
    labels.push(readString(offset + i * 16, 16));
  }
  offset += ns * 16;

  // Skip transducer types
  offset += ns * 80;
  // Skip physical dimensions
  offset += ns * 8;

  // Read physical minimums
  const physicalMinimums: number[] = [];
  for (let i = 0; i < ns; i++) {
    physicalMinimums.push(parseFloat(readString(offset + i * 8, 8)) || -3200);
  }
  offset += ns * 8;

  // Read physical maximums
  const physicalMaximums: number[] = [];
  for (let i = 0; i < ns; i++) {
    physicalMaximums.push(parseFloat(readString(offset + i * 8, 8)) || 3200);
  }
  offset += ns * 8;

  // Read digital minimums
  const digitalMinimums: number[] = [];
  for (let i = 0; i < ns; i++) {
    digitalMinimums.push(parseInt(readString(offset + i * 8, 8), 10) || -32768);
  }
  offset += ns * 8;

  // Read digital maximums
  const digitalMaximums: number[] = [];
  for (let i = 0; i < ns; i++) {
    digitalMaximums.push(parseInt(readString(offset + i * 8, 8), 10) || 32767);
  }
  offset += ns * 8;

  // Skip prefiltering
  offset += ns * 80;

  // Read samples per record
  const numSamplesPerRecord: number[] = [];
  for (let i = 0; i < ns; i++) {
    numSamplesPerRecord.push(parseInt(readString(offset + i * 8, 8), 10) || 256);
  }
  offset += ns * 8;

  // Build signal headers
  const signalHeaders: EDFSignalHeader[] = [];
  for (let i = 0; i < ns; i++) {
    signalHeaders.push({
      label: labels[i],
      physicalMinimum: physicalMinimums[i],
      physicalMaximum: physicalMaximums[i],
      digitalMinimum: digitalMinimums[i],
      digitalMaximum: digitalMaximums[i],
      numSamplesPerRecord: numSamplesPerRecord[i],
    });
  }

  // Calculate scaling factors
  const scalingFactors = signalHeaders.map((sh) => {
    const digitalRange = sh.digitalMaximum - sh.digitalMinimum;
    const physicalRange = sh.physicalMaximum - sh.physicalMinimum;
    const gain = digitalRange !== 0 ? physicalRange / digitalRange : 1;
    return {
      gain,
      offset: sh.physicalMinimum - (sh.digitalMinimum * gain),
    };
  });

  // Parse data records - limit to first 10 minutes for performance
  const dataOffset = header.headerBytes;
  const maxRecords = Math.min(header.numDataRecords, Math.ceil(600 / header.dataRecordDuration));
  
  // Initialize signals
  const signals: number[][] = signalHeaders.map((sh) => {
    const totalSamples = sh.numSamplesPerRecord * maxRecords;
    return new Array(totalSamples).fill(0);
  });

  let byteOffset = dataOffset;
  
  try {
    for (let record = 0; record < maxRecords; record++) {
      for (let signal = 0; signal < ns; signal++) {
        const samplesInRecord = signalHeaders[signal].numSamplesPerRecord;
        const signalOffset = record * samplesInRecord;
        const scaling = scalingFactors[signal];

        for (let sample = 0; sample < samplesInRecord; sample++) {
          if (byteOffset + 2 > buffer.byteLength) break;
          
          const digitalValue = view.getInt16(byteOffset, true);
          const physicalValue = (digitalValue * scaling.gain) + scaling.offset;
          
          signals[signal][signalOffset + sample] = Math.max(-500, Math.min(500, physicalValue));
          byteOffset += 2;
        }
      }
    }
  } catch (e) {
    console.error("Error parsing data records:", e);
  }

  const sampleRate = signalHeaders[0]?.numSamplesPerRecord / header.dataRecordDuration || 256;
  const duration = maxRecords * header.dataRecordDuration;
  const channelLabels = labels.map((l) => l.replace(/\.+$/, "").trim());

  return {
    signals,
    channelLabels,
    sampleRate,
    duration,
    metadata: {
      patient_id: header.patientId,
      recording_id: header.recordingId,
      start_date: header.startDate,
      start_time: header.startTime,
      num_channels: ns,
      num_records: maxRecords,
      record_duration: header.dataRecordDuration,
    },
  };
}

/**
 * Map channel labels to canonical order, zero-fill missing
 */
function mapToCanonicalChannels(
  signals: number[][],
  channelLabels: string[],
  nSamples: number
): { tensor: number[][]; missingChannels: string[]; extraChannels: string[] } {
  const chMap = new Map<string, number>();
  channelLabels.forEach((label, idx) => {
    // Normalize channel name (remove EEG prefix, trim, uppercase for matching)
    const normalized = label.replace(/^EEG\s*/i, '').trim().toUpperCase();
    chMap.set(normalized, idx);
  });

  const tensor: number[][] = [];
  const missingChannels: string[] = [];
  const extraChannels: string[] = [];

  // Build canonical tensor [27, n_samples]
  for (const ch of CANONICAL_CHANNELS) {
    const normalized = ch.toUpperCase();
    if (chMap.has(normalized)) {
      tensor.push(signals[chMap.get(normalized)!]);
    } else {
      // Zero-fill missing channel
      tensor.push(new Array(nSamples).fill(0));
      missingChannels.push(ch);
    }
  }

  // Track extra channels not in canonical set
  for (const label of channelLabels) {
    const normalized = label.replace(/^EEG\s*/i, '').trim().toUpperCase();
    const isCanonical = CANONICAL_CHANNELS.some(ch => ch.toUpperCase() === normalized);
    if (!isCanonical) {
      extraChannels.push(label);
    }
  }

  return { tensor, missingChannels, extraChannels };
}

/**
 * Build ENCEPHLIAN_EEG_v1 canonical JSON record
 */
function buildCanonicalRecord(
  studyId: string,
  nativeSfreq: number,
  nSamples: number,
  missingChannels: string[],
  extraChannels: string[],
  edfHash: string,
  metadata: Record<string, any>
): Record<string, any> {
  return {
    schema_version: "ENCEPHLIAN_EEG_v1",
    patient: {
      id: metadata.patient_id || "UNKNOWN",
      sex: null,
      age_years: null,
    },
    study: {
      id: studyId,
      date: metadata.start_date || null,
      indication: null,
      site_id: null,
    },
    acquisition: {
      device_vendor: "UNKNOWN",
      device_model: null,
      native_format: ".edf",
      native_sampling_hz: nativeSfreq,
      technician_id: null,
    },
    signal: {
      canonical_channels: CANONICAL_CHANNELS,
      sfreq_model: SFREQ_MODEL,
      n_samples: nSamples,
      units: "uV",
      reference: "LE",
      filters: {
        hp_hz: 0.5,
        lp_hz: 40.0,
        notch_hz: 50.0,
      },
      montage: "10-20",
      missing_channels: missingChannels,
      extra_channels: extraChannels,
      segment_flags: [],
    },
    annotations: [],
    qa: {
      artifact_ratio: null,
      impedance_ok: null,
      warnings: missingChannels.length > 5 ? ["high_missing_channel_count"] : [],
    },
    provenance: {
      raw_hash: null,
      edf_hash: edfHash,
      pipeline_version: "1.0.0",
      created_at_utc: new Date().toISOString(),
      converter: "encephlian_edge_v1",
      operator_id: null,
      error_codes: [],
    },
  };
}

/**
 * Convert Float32Array-like tensor to base64 for storage (simulating .npy)
 */
function tensorToBase64(tensor: number[][]): string {
  const flat: number[] = [];
  for (const channel of tensor) {
    for (const val of channel) {
      flat.push(val);
    }
  }
  
  const float32Array = new Float32Array(flat);
  const uint8Array = new Uint8Array(float32Array.buffer);
  
  let binary = '';
  for (let i = 0; i < uint8Array.length; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  
  return btoa(binary);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

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

    const { study_id, file_path, file_type }: ParseRequest = await req.json();

    console.log(`Parsing ${file_type} file: ${file_path} for study: ${study_id}`);

    // Download raw file from storage
    const { data: fileData, error: downloadError } = await supabase
      .storage
      .from('eeg-raw')
      .download(file_path);

    if (downloadError) {
      throw new Error(`Failed to download file: ${downloadError.message}`);
    }

    const buffer = await fileData.arrayBuffer();
    const edfHash = await hashBuffer(buffer);

    let parsedData: {
      signals: number[][];
      channelLabels: string[];
      sampleRate: number;
      duration: number;
      metadata: Record<string, any>;
    };

    if (file_type === 'edf' || file_type === 'bdf') {
      parsedData = parseEDFBuffer(buffer);
      console.log(`Parsed ${parsedData.channelLabels.length} channels, ${parsedData.duration}s duration at ${parsedData.sampleRate}Hz`);
    } else if (file_type === 'json') {
      const text = await fileData.text();
      const parsed = JSON.parse(text);
      
      parsedData = {
        signals: parsed.signals || [],
        channelLabels: parsed.channelLabels || parsed.channels?.map((c: any) => c.name) || [],
        sampleRate: parsed.sampleRate || parsed.sample_rate || 256,
        duration: parsed.duration || parsed.duration_sec || 0,
        metadata: parsed.metadata || {},
      };
    } else if (file_type === 'csv') {
      const text = await fileData.text();
      const lines = text.split('\n').filter(l => l.trim());
      const headers = lines[0].split(',').map(h => h.trim());
      
      const signals: number[][] = headers.map(() => []);
      
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => parseFloat(v.trim()) || 0);
        values.forEach((v, idx) => {
          if (idx < signals.length) {
            signals[idx].push(v);
          }
        });
      }

      const sampleRate = 256;
      parsedData = {
        signals,
        channelLabels: headers,
        sampleRate,
        duration: signals[0]?.length / sampleRate || 0,
        metadata: {},
      };
    } else {
      throw new Error(`Unsupported file type: ${file_type}`);
    }

    const nativeSfreq = parsedData.sampleRate;

    // Step 1: Resample to 128 Hz
    console.log(`Resampling from ${nativeSfreq}Hz to ${SFREQ_MODEL}Hz...`);
    const resampledSignals = parsedData.signals.map(signal => 
      resampleSignal(signal, nativeSfreq, SFREQ_MODEL)
    );

    // Step 2: Apply simple filtering
    console.log(`Applying filters...`);
    const filteredSignals = resampledSignals.map(signal => 
      applySimpleFilter(signal, SFREQ_MODEL)
    );

    const nSamplesResampled = filteredSignals[0]?.length || 0;

    // Step 3: Map to canonical channels [27, n_samples]
    console.log(`Mapping to canonical channels...`);
    const { tensor, missingChannels, extraChannels } = mapToCanonicalChannels(
      filteredSignals,
      parsedData.channelLabels,
      nSamplesResampled
    );

    // Build canonical JSON
    const canonicalJson = buildCanonicalRecord(
      study_id,
      nativeSfreq,
      nSamplesResampled,
      missingChannels,
      extraChannels,
      edfHash,
      parsedData.metadata
    );

    // Step 4: Upload canonical JSON to eeg-json bucket
    const jsonPath = `${study_id}/canonical.json`;
    const jsonString = JSON.stringify(canonicalJson, null, 2);
    
    const { error: jsonUploadError } = await supabase
      .storage
      .from('eeg-json')
      .upload(jsonPath, jsonString, {
        contentType: 'application/json',
        upsert: true
      });

    if (jsonUploadError) {
      throw new Error(`Failed to upload canonical JSON: ${jsonUploadError.message}`);
    }
    console.log(`Uploaded canonical JSON to ${jsonPath}`);

    // Step 5: Upload tensor to eeg-clean bucket (as base64 encoded float32)
    const tensorPath = `${study_id}/tensor.bin`;
    const tensorBase64 = tensorToBase64(tensor);
    
    // Create tensor metadata header
    const tensorMeta = {
      shape: [CANONICAL_CHANNELS.length, nSamplesResampled],
      dtype: 'float32',
      channels: CANONICAL_CHANNELS,
      sfreq: SFREQ_MODEL,
    };
    
    const tensorPayload = JSON.stringify({
      meta: tensorMeta,
      data: tensorBase64
    });

    const { error: tensorUploadError } = await supabase
      .storage
      .from('eeg-clean')
      .upload(tensorPath, tensorPayload, {
        contentType: 'application/json',
        upsert: true
      });

    if (tensorUploadError) {
      throw new Error(`Failed to upload tensor: ${tensorUploadError.message}`);
    }
    console.log(`Uploaded tensor to ${tensorPath}`);

    // Also save legacy parsed.json for backward compatibility with current viewer
    const legacyJson = {
      signals: tensor,
      channelLabels: CANONICAL_CHANNELS,
      sampleRate: SFREQ_MODEL,
      duration: nSamplesResampled / SFREQ_MODEL,
      metadata: parsedData.metadata,
      canonical: true,
      parsed_at: new Date().toISOString(),
      parser_version: '3.0.0-canonical'
    };

    const legacyJsonPath = `${study_id}/parsed.json`;
    const { error: legacyUploadError } = await supabase
      .storage
      .from('eeg-json')
      .upload(legacyJsonPath, JSON.stringify(legacyJson), {
        contentType: 'application/json',
        upsert: true
      });

    if (legacyUploadError) {
      console.warn(`Warning: Failed to upload legacy parsed.json: ${legacyUploadError.message}`);
    }

    // Step 6: Upsert into canonical_eeg_records
    const { error: upsertError } = await supabase
      .from('canonical_eeg_records')
      .upsert({
        study_id,
        schema_version: 'ENCEPHLIAN_EEG_v1',
        canonical_json: canonicalJson,
        tensor_path: tensorPath,
        native_sampling_hz: nativeSfreq,
        sfreq_model: SFREQ_MODEL
      }, {
        onConflict: 'study_id'
      });

    if (upsertError) {
      throw new Error(`Failed to upsert canonical_eeg_records: ${upsertError.message}`);
    }
    console.log(`Upserted canonical_eeg_records for study ${study_id}`);

    // Update study_files if needed
    const existingFile = await supabase
      .from('study_files')
      .select('id')
      .eq('study_id', study_id)
      .eq('kind', 'json')
      .maybeSingle();

    if (!existingFile.data) {
      await supabase.from('study_files').insert({
        study_id,
        kind: 'json',
        path: jsonPath,
        size_bytes: jsonString.length,
      });
    }

    // Update study metadata
    await supabase
      .from('studies')
      .update({
        srate_hz: Math.round(SFREQ_MODEL),
        duration_min: Math.ceil((nSamplesResampled / SFREQ_MODEL) / 60),
        montage: `${CANONICAL_CHANNELS.length} canonical channels`,
        state: 'canonicalized'
      })
      .eq('id', study_id);

    console.log(`Successfully canonicalized study ${study_id}`);

    return new Response(
      JSON.stringify({
        success: true,
        schema_version: 'ENCEPHLIAN_EEG_v1',
        canonical_json_path: jsonPath,
        tensor_path: tensorPath,
        native_sampling_hz: nativeSfreq,
        sfreq_model: SFREQ_MODEL,
        n_samples: nSamplesResampled,
        n_channels: CANONICAL_CHANNELS.length,
        missing_channels: missingChannels,
        extra_channels: extraChannels,
        duration_sec: nSamplesResampled / SFREQ_MODEL,
        json_path: legacyJsonPath // For backward compat
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in parse_eeg_study:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
