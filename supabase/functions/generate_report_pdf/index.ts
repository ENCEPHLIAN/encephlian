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

    const { reportId } = await req.json();

    if (!reportId) {
      return new Response(
        JSON.stringify({ error: "Missing reportId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch report with study and profile data
    const { data: report, error: reportError } = await supabase
      .from("reports")
      .select(`
        *,
        studies!inner(
          id,
          meta,
          created_at,
          clinics(name)
        ),
        profiles!interpreter(
          full_name,
          credentials,
          medical_license_number
        )
      `)
      .eq("id", reportId)
      .single();

    if (reportError) throw reportError;

    // Generate simple HTML-based PDF (in production, use proper PDF library)
    const reportContent = report.content as any;
    const studyMeta = report.studies.meta as any;
    
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
    .header { border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 30px; }
    .clinic-name { font-size: 24px; font-weight: bold; }
    .report-id { text-align: right; color: #666; }
    .patient-info { background: #f5f5f5; padding: 15px; margin-bottom: 20px; border-radius: 5px; }
    .section { margin-bottom: 25px; }
    .section-title { font-weight: bold; font-size: 16px; margin-bottom: 10px; color: #2563eb; }
    .content { line-height: 1.6; }
    .signature { margin-top: 40px; border-top: 2px solid #333; padding-top: 20px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="clinic-name">${report.studies.clinics?.name || 'Medical Clinic'}</div>
    <div class="report-id">Report ID: ${report.id.slice(0, 8)}</div>
    <div class="report-id">Date: ${new Date(report.created_at).toLocaleDateString()}</div>
  </div>

  <h1 style="text-align: center; color: #1e40af;">ELECTROENCEPHALOGRAM REPORT</h1>

  <div class="patient-info">
    <h3>PATIENT INFORMATION</h3>
    <p><strong>Name:</strong> ${studyMeta.patient_name || 'N/A'}</p>
    <p><strong>Patient ID:</strong> ${studyMeta.patient_id || 'N/A'}</p>
    <p><strong>Age:</strong> ${studyMeta.age || 'N/A'} &nbsp;&nbsp; <strong>Gender:</strong> ${studyMeta.gender || 'N/A'}</p>
    <p><strong>Study Date:</strong> ${new Date(report.studies.created_at).toLocaleDateString()}</p>
  </div>

  <div class="section">
    <div class="section-title">BACKGROUND ACTIVITY:</div>
    <div class="content">${reportContent.background_activity || 'Not documented'}</div>
  </div>

  <div class="section">
    <div class="section-title">SLEEP STAGES:</div>
    <div class="content">${reportContent.sleep_stages || 'Not documented'}</div>
  </div>

  <div class="section">
    <div class="section-title">ABNORMALITIES:</div>
    <div class="content">${reportContent.abnormalities || 'None observed'}</div>
  </div>

  <div class="section">
    <div class="section-title">IMPRESSION:</div>
    <div class="content">${reportContent.impression || 'Not documented'}</div>
  </div>

  <div class="section">
    <div class="section-title">RECOMMENDATIONS:</div>
    <div class="content">${reportContent.recommendations || 'None at this time'}</div>
  </div>

  <div class="signature">
    <p><strong>SIGNATURE:</strong></p>
    <p>${report.profiles?.full_name || 'Neurologist'}</p>
    <p>${report.profiles?.credentials || ''}</p>
    <p>License: ${report.profiles?.medical_license_number || 'N/A'}</p>
    <p>Signed: ${new Date(report.signed_at).toLocaleString()}</p>
  </div>
</body>
</html>
    `;

    // Convert HTML to PDF using browser print (simplified for MVP)
    // In production, use proper PDF generation library
    const pdfFileName = `report-${report.studies.id}.pdf`;
    const pdfBlob = new Blob([htmlContent], { type: "text/html" });
    
    // Upload to storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("eeg-reports")
      .upload(pdfFileName, pdfBlob, {
        contentType: "text/html",
        upsert: true,
      });

    if (uploadError) throw uploadError;

    // Update report with PDF path
    const { error: updateError } = await supabase
      .from("reports")
      .update({ pdf_path: pdfFileName })
      .eq("id", reportId);

    if (updateError) throw updateError;

    console.log("PDF generated:", pdfFileName);

    return new Response(
      JSON.stringify({ 
        success: true, 
        pdfPath: pdfFileName,
        message: "PDF generated successfully"
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error generating PDF:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
