import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

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

  const ns = Math.min(header.numSignals, 128); // Limit channels for safety
  let offset = 256;

  // Parse signal headers
  const labels: string[] = [];
  for (let i = 0; i < ns; i++) {
    labels.push(readString(offset + i * 16, 16));
  }
  offset += ns * 16;

  // Skip transducer types (80 chars each)
  offset += ns * 80;
  // Skip physical dimensions (8 chars each)
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

  // Skip prefiltering (80 chars each)
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
          
          // EDF: 16-bit signed integers (little-endian)
          const digitalValue = view.getInt16(byteOffset, true);
          const physicalValue = (digitalValue * scaling.gain) + scaling.offset;
          
          // Clamp to reasonable µV range
          signals[signal][signalOffset + sample] = Math.max(-500, Math.min(500, physicalValue));
          byteOffset += 2;
        }
      }
    }
  } catch (e) {
    console.error("Error parsing data records:", e);
  }

  // Calculate derived values
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

    let parsedData: {
      signals: number[][];
      channelLabels: string[];
      sampleRate: number;
      duration: number;
      metadata: Record<string, any>;
    };

    if (file_type === 'edf' || file_type === 'bdf') {
      // Parse EDF/BDF with actual signal extraction
      const buffer = await fileData.arrayBuffer();
      parsedData = parseEDFBuffer(buffer);
      console.log(`Parsed ${parsedData.channelLabels.length} channels, ${parsedData.duration}s duration`);
    } else if (file_type === 'json') {
      // JSON parser
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
      // CSV parser
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

    // Prepare output JSON
    const outputJson = {
      signals: parsedData.signals,
      channelLabels: parsedData.channelLabels,
      sampleRate: parsedData.sampleRate,
      duration: parsedData.duration,
      metadata: parsedData.metadata,
      parsed_at: new Date().toISOString(),
      parser_version: '2.0.0'
    };

    // Upload parsed JSON to storage
    const jsonPath = `${study_id}/parsed.json`;
    const jsonString = JSON.stringify(outputJson);
    
    const { error: uploadError } = await supabase
      .storage
      .from('eeg-json')
      .upload(jsonPath, jsonString, {
        contentType: 'application/json',
        upsert: true
      });

    if (uploadError) {
      throw new Error(`Failed to upload parsed data: ${uploadError.message}`);
    }

    // Insert/update file record
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
        srate_hz: parsedData.sampleRate,
        duration_min: Math.ceil(parsedData.duration / 60),
        montage: `${parsedData.channelLabels.length} channels`,
        state: 'preprocessing'
      })
      .eq('id', study_id);

    console.log(`Successfully parsed study ${study_id}: ${parsedData.channelLabels.length} channels, ${parsedData.duration}s`);

    return new Response(
      JSON.stringify({
        success: true,
        metadata: parsedData.metadata,
        channels: parsedData.channelLabels.length,
        sample_rate: parsedData.sampleRate,
        duration_sec: parsedData.duration,
        json_path: jsonPath
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
