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

    // Parse based on file type
    let metadata: any = {};
    let channels: any[] = [];
    let sampleRate = 256;
    let durationSec = 0;

    if (file_type === 'edf' || file_type === 'bdf') {
      // EDF/BDF parser (simplified)
      const buffer = await fileData.arrayBuffer();
      const header = new TextDecoder().decode(buffer.slice(0, 256));
      
      // Extract key metadata from header
      metadata = {
        patient_id: header.slice(8, 88).trim(),
        recording_id: header.slice(88, 168).trim(),
        start_date: header.slice(168, 176).trim(),
        start_time: header.slice(176, 184).trim(),
      };

      // Extract channel info
      const numChannels = parseInt(header.slice(252, 256).trim());
      channels = Array.from({ length: numChannels }, (_, i) => ({
        name: `Channel ${i + 1}`,
        index: i,
        unit: 'µV'
      }));

      sampleRate = 256; // Default, should parse from header
      durationSec = Math.floor(buffer.byteLength / (numChannels * sampleRate * 2));

    } else if (file_type === 'json') {
      // JSON parser
      const text = await fileData.text();
      const parsed = JSON.parse(text);
      
      metadata = parsed.metadata || {};
      channels = parsed.channels || [];
      sampleRate = parsed.sample_rate || 256;
      durationSec = parsed.duration || 0;

    } else if (file_type === 'csv') {
      // CSV parser (simplified)
      const text = await fileData.text();
      const lines = text.split('\n');
      const headers = lines[0].split(',');
      
      channels = headers.map((name, i) => ({
        name: name.trim(),
        index: i,
        unit: 'µV'
      }));

      sampleRate = 256;
      durationSec = Math.floor((lines.length - 1) / sampleRate);
    }

    // Generate parsed JSON
    const parsedData = {
      metadata,
      channels,
      sample_rate: sampleRate,
      duration_sec: durationSec,
      parsed_at: new Date().toISOString(),
      parser_version: '1.0.0'
    };

    // Upload parsed JSON to storage
    const jsonPath = `${study_id}/parsed.json`;
    const { error: uploadError } = await supabase
      .storage
      .from('eeg-json')
      .upload(jsonPath, JSON.stringify(parsedData, null, 2), {
        contentType: 'application/json',
        upsert: true
      });

    if (uploadError) {
      throw new Error(`Failed to upload parsed data: ${uploadError.message}`);
    }

    // Insert file record
    await supabase.from('study_files').insert({
      study_id,
      kind: 'json',
      path: jsonPath,
      size_bytes: JSON.stringify(parsedData).length,
    });

    // Update study metadata
    await supabase
      .from('studies')
      .update({
        srate_hz: sampleRate,
        duration_min: Math.ceil(durationSec / 60),
        montage: `${channels.length} channels`,
        state: 'preprocessing'
      })
      .eq('id', study_id);

    console.log(`Successfully parsed study ${study_id}`);

    return new Response(
      JSON.stringify({
        success: true,
        metadata,
        channels: channels.length,
        sample_rate: sampleRate,
        duration_sec: durationSec,
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
