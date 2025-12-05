import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

/**
 * Convert legacy EEG formats (.e, .eeg, .cnt, etc.) to EDF
 * 
 * Note: Full conversion is not implemented in Edge Functions due to
 * complexity of binary format parsing. Users should pre-convert
 * files using MNE-Python or similar tools.
 * 
 * This endpoint provides guidance and logs conversion requests.
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

    const { filePath, targetFormat = 'edf' } = await req.json();

    if (!filePath) {
      return new Response(
        JSON.stringify({ error: "Missing filePath" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Conversion requested: ${filePath} -> ${targetFormat}`);

    // Get file extension to provide specific guidance
    const ext = filePath.split('.').pop()?.toLowerCase() || '';
    
    let conversionGuide = "";
    switch (ext) {
      case 'e':
        conversionGuide = "Nicolet .e files can be converted using: mne.io.read_raw_nicolet()";
        break;
      case 'eeg':
        conversionGuide = "Neuroscan .eeg files can be converted using: mne.io.read_raw_cnt()";
        break;
      case 'cnt':
        conversionGuide = "Neuroscan .cnt files can be converted using: mne.io.read_raw_cnt()";
        break;
      case 'set':
        conversionGuide = "EEGLAB .set files can be converted using: mne.io.read_raw_eeglab()";
        break;
      case 'fif':
        conversionGuide = "FIF files can be loaded directly using: mne.io.read_raw_fif()";
        break;
      default:
        conversionGuide = "Use MNE-Python to convert: raw = mne.io.read_raw_*(); raw.export('output.edf')";
    }

    // Log the conversion request for analytics
    await supabase.from("review_events").insert({
      actor: user.id,
      event: "conversion_requested",
      payload: { 
        source_path: filePath,
        source_format: ext,
        target_format: targetFormat,
        requested_at: new Date().toISOString()
      }
    });

    return new Response(
      JSON.stringify({ 
        error: "Automatic conversion not available for this format",
        message: `Please convert the file to EDF format using MNE-Python or your EEG acquisition software.`,
        guidance: conversionGuide,
        pythonExample: `
import mne
raw = mne.io.read_raw_${ext === 'e' ? 'nicolet' : ext === 'cnt' ? 'cnt' : ext}('${filePath}', preload=True)
raw.export('output.edf', fmt='edf')
`,
        supportedFormats: ['edf', 'bdf'],
        conversionNeeded: true
      }),
      { status: 501, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in conversion:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
