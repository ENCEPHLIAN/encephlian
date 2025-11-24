import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import jsPDF from "https://esm.sh/jspdf@2.5.2";

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

    // Generate professional PDF using jsPDF
    const reportContent = report.content as any;
    const studyMeta = report.studies.meta as any;
    
    // Create PDF document
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    // Set default font
    pdf.setFont('helvetica');

    // Header - Clinic Name and Report Info
    pdf.setFontSize(18);
    pdf.setFont('helvetica', 'bold');
    pdf.text(report.studies.clinics?.name || 'MEDICAL CLINIC', 105, 20, { align: 'center' });
    
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Report ID: ${report.id.slice(0, 8)}`, 20, 30);
    pdf.text(`Date: ${new Date(report.created_at).toLocaleDateString()}`, 150, 30);
    
    // Title
    pdf.setFontSize(16);
    pdf.setFont('helvetica', 'bold');
    pdf.text('ELECTROENCEPHALOGRAM REPORT', 105, 45, { align: 'center' });

    // Patient Info Box
    pdf.setFillColor(245, 245, 245);
    pdf.rect(15, 55, 180, 35, 'F');
    pdf.setDrawColor(0, 0, 0);
    pdf.rect(15, 55, 180, 35);
    
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.text('PATIENT INFORMATION', 20, 62);
    
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Name: ${studyMeta.patient_name || 'N/A'}`, 20, 70);
    pdf.text(`Patient ID: ${studyMeta.patient_id || 'N/A'}`, 20, 76);
    pdf.text(`Age: ${studyMeta.age || 'N/A'}`, 120, 70);
    pdf.text(`Gender: ${studyMeta.gender || 'N/A'}`, 120, 76);
    pdf.text(`Study Date: ${new Date(report.studies.created_at).toLocaleDateString()}`, 20, 82);

    let yPos = 100;

    // Helper function to add section
    const addSection = (title: string, content: string) => {
      if (yPos > 260) {
        pdf.addPage();
        yPos = 20;
      }
      
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.text(title.toUpperCase(), 20, yPos);
      yPos += 6;
      
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      const splitText = pdf.splitTextToSize(content || 'Not documented', 170);
      pdf.text(splitText, 20, yPos);
      yPos += (splitText.length * 5) + 8;
    };

    // Add report sections
    addSection('Technical Details', reportContent.technical_details ? 
      `Montage: ${reportContent.technical_details.montage || 'Standard'}\n` +
      `Duration: ${reportContent.technical_details.duration || 'N/A'}\n` +
      `Channels: ${reportContent.technical_details.channels || '21-channel 10-20 system'}` : 
      'Standard EEG recording');
    
    addSection('Background Activity', reportContent.background_activity);
    addSection('Sleep Architecture', reportContent.sleep_stages || reportContent.sleep_architecture);
    addSection('Activation Procedures', reportContent.activation_procedures ? 
      `Hyperventilation: ${reportContent.activation_procedures.hyperventilation || 'Not performed'}\n` +
      `Photic Stimulation: ${reportContent.activation_procedures.photic_stimulation || 'Not performed'}` :
      'Not performed');
    addSection('Abnormalities', reportContent.abnormalities);
    addSection('Impression', reportContent.impression);
    addSection('Clinical Correlation', reportContent.correlation || reportContent.clinical_correlation);
    addSection('Recommendations', reportContent.recommendations);

    // Signature Block
    if (yPos > 240) {
      pdf.addPage();
      yPos = 20;
    }
    
    yPos += 10;
    pdf.setDrawColor(0, 0, 0);
    pdf.line(20, yPos, 190, yPos);
    yPos += 8;
    
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.text('ELECTRONIC SIGNATURE', 20, yPos);
    yPos += 8;
    
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.text(`${report.profiles?.full_name || 'Neurologist'}`, 20, yPos);
    yPos += 5;
    if (report.profiles?.credentials) {
      pdf.text(report.profiles.credentials, 20, yPos);
      yPos += 5;
    }
    if (report.profiles?.medical_license_number) {
      pdf.text(`License: ${report.profiles.medical_license_number}`, 20, yPos);
      yPos += 5;
    }
    pdf.text(`Electronically signed: ${new Date(report.signed_at).toLocaleString()}`, 20, yPos);

    // Generate PDF as ArrayBuffer
    const pdfArrayBuffer = pdf.output('arraybuffer');
    
    // Get user ID for path
    const userId = report.studies.owner || user.id;
    const pdfFileName = `${userId}/report-${report.id}.pdf`;
    
    // Upload to storage with user-specific path
    const { error: uploadError } = await supabase.storage
      .from("eeg-reports")
      .upload(pdfFileName, pdfArrayBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) throw uploadError;

    // Update report with PDF path
    const { error: updateError } = await supabase
      .from("reports")
      .update({ pdf_path: pdfFileName })
      .eq("id", reportId);

    if (updateError) throw updateError;

    console.log("PDF generated successfully:", pdfFileName);

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
