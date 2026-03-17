import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import jsPDF from "https://esm.sh/jspdf@2.5.2";

/* ─────────────────────────────────────────────
   MIND®Triage PDF Generator
   Renders structured ai_draft_json into a
   clinical-grade downloadable PDF.
───────────────────────────────────────────── */

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) throw new Error("Unauthorized");

    const { reportId } = await req.json();
    if (!reportId) {
      return new Response(
        JSON.stringify({ error: "Missing reportId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch report + study + profile
    const { data: report, error: reportError } = await supabase
      .from("reports")
      .select(`
        *,
        studies!inner(id, meta, created_at, ai_draft_json, clinics(name)),
        profiles!interpreter(full_name, credentials, medical_license_number)
      `)
      .eq("id", reportId)
      .single();

    if (reportError) throw reportError;

    const reportContent = report.content as any;
    const studyMeta = report.studies.meta as any;
    const triageData = report.studies.ai_draft_json as any;

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    pdf.setFont("helvetica");

    const pageW = 210;
    const margin = 15;
    const contentW = pageW - margin * 2;
    let y = 0;

    // ── Helpers ──
    const checkPage = (needed = 30) => {
      if (y > 270 - needed) { pdf.addPage(); y = 20; }
    };

    const heading = (text: string, size = 11) => {
      checkPage(20);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(size);
      pdf.text(text.toUpperCase(), margin, y);
      y += 2;
      pdf.setDrawColor(0); pdf.setLineWidth(0.3);
      pdf.line(margin, y, margin + contentW, y);
      y += 5;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
    };

    const kv = (label: string, value: string) => {
      checkPage(6);
      pdf.setFont("helvetica", "bold"); pdf.setFontSize(9);
      pdf.text(`${label}:`, margin, y);
      pdf.setFont("helvetica", "normal");
      pdf.text(value, margin + 35, y);
      y += 5;
    };

    const wrappedText = (text: string) => {
      checkPage(10);
      pdf.setFontSize(10);
      const lines = pdf.splitTextToSize(text || "Not documented", contentW);
      pdf.text(lines, margin, y);
      y += lines.length * 4.5 + 3;
    };

    // ── Header ──
    y = 18;
    pdf.setFontSize(16); pdf.setFont("helvetica", "bold");
    pdf.text(report.studies.clinics?.name || "MEDICAL CLINIC", pageW / 2, y, { align: "center" });
    y += 8;

    pdf.setFontSize(14); pdf.setFont("helvetica", "bold");
    pdf.text("MIND\u00AETriage Report", pageW / 2, y, { align: "center" });
    y += 6;

    pdf.setFontSize(8); pdf.setFont("helvetica", "normal");
    pdf.text(`Report ID: ${report.id.slice(0, 8)}`, margin, y);
    pdf.text(`Date: ${new Date(report.created_at).toLocaleDateString()}`, pageW - margin, y, { align: "right" });
    y += 8;

    // ── Patient Info ──
    pdf.setFillColor(245, 245, 245);
    pdf.rect(margin, y, contentW, 22, "F");
    pdf.setDrawColor(200); pdf.rect(margin, y, contentW, 22);
    y += 5;
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(10);
    pdf.text("PATIENT INFORMATION", margin + 3, y); y += 5;
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(9);
    pdf.text(`Name: ${studyMeta?.patient_name || "N/A"}`, margin + 3, y);
    pdf.text(`Age: ${studyMeta?.age || "N/A"}`, margin + 90, y);
    y += 4;
    pdf.text(`Patient ID: ${studyMeta?.patient_id || "N/A"}`, margin + 3, y);
    pdf.text(`Gender: ${studyMeta?.gender || "N/A"}`, margin + 90, y);
    y += 4;
    pdf.text(`Study Date: ${new Date(report.studies.created_at).toLocaleDateString()}`, margin + 3, y);
    y += 8;

    // ── If MIND®Triage data exists, render structured tables ──
    if (triageData) {
      const sq = triageData.signal_quality || {};
      const spectral = triageData.spectral_power || [];
      const asymmetry = triageData.asymmetry || [];
      const markers = triageData.markers || [];
      const rec = triageData.recording_info || {};
      const pipeline = triageData.pipeline || [];

      // Recording Info
      heading("Recording Details");
      kv("Channels", `${rec.channels || 21}ch`);
      kv("Sample Rate", `${rec.sample_rate_hz || 256} Hz`);
      kv("Duration", `${rec.duration_min || 30} min`);
      kv("Post-process", `${rec.post_process_hz || 128} Hz · ${rec.reference || "avg ref"}`);
      y += 3;

      // Signal Quality
      heading("Signal Quality");
      kv("Good Channels", `${sq.good_channels || "—"} / ${sq.total_channels || "—"}`);
      kv("Noisy Channels", `${sq.noisy_channels || 0}${sq.noisy_labels?.length ? ` (${sq.noisy_labels.join(", ")})` : ""}`);
      kv("Artifact Rejected", `${sq.artifact_pct ?? "—"}%`);
      kv("Clean Epochs", `${sq.clean_epochs || "—"} / ${sq.total_epochs || "—"}`);
      y += 3;

      // Pipeline
      if (pipeline.length > 0) {
        heading("Processing Pipeline");
        for (const p of pipeline) {
          checkPage(6);
          pdf.setFontSize(9);
          pdf.setFont("helvetica", "bold");
          pdf.text(`${p.step}`, margin, y);
          pdf.setFont("helvetica", "normal");
          pdf.text(`— ${p.detail}`, margin + 30, y);
          y += 4.5;
        }
        y += 3;
      }

      // Spectral Power Table
      if (spectral.length > 0) {
        heading("Spectral Power by Region (\u00B5V\u00B2/Hz)");
        checkPage(10 + spectral.length * 5);

        // Table header
        const cols = [margin, margin + 40, margin + 65, margin + 90, margin + 115, margin + 140];
        const headers = ["Region", "\u03B4 (1-4)", "\u03B8 (4-8)", "\u03B1 (8-13)", "\u03B2 (13-30)"];
        pdf.setFillColor(230, 230, 230);
        pdf.rect(margin, y - 3, contentW, 6, "F");
        pdf.setFont("helvetica", "bold"); pdf.setFontSize(8);
        headers.forEach((h, i) => pdf.text(h, cols[i], y));
        y += 5;

        // Table rows
        pdf.setFont("helvetica", "normal"); pdf.setFontSize(9);
        for (const row of spectral) {
          checkPage(5);
          pdf.text(String(row.region || ""), cols[0], y);
          pdf.text(String(row.delta ?? ""), cols[1], y);
          pdf.text(String(row.theta ?? ""), cols[2], y);
          pdf.text(String(row.alpha ?? ""), cols[3], y);
          pdf.text(String(row.beta ?? ""), cols[4], y);
          y += 4.5;
        }
        y += 3;
      }

      // Asymmetry Table
      if (asymmetry.length > 0) {
        heading("Asymmetry Index |L\u2212R|/(L+R)");
        checkPage(10 + asymmetry.length * 5);

        pdf.setFillColor(230, 230, 230);
        pdf.rect(margin, y - 3, contentW, 6, "F");
        pdf.setFont("helvetica", "bold"); pdf.setFontSize(8);
        pdf.text("Pair", margin, y);
        pdf.text("Index", margin + 60, y);
        y += 5;

        pdf.setFont("helvetica", "normal"); pdf.setFontSize(9);
        for (const row of asymmetry) {
          checkPage(5);
          pdf.text(String(row.pair || ""), margin, y);
          pdf.text(typeof row.index === "number" ? row.index.toFixed(3) : String(row.index ?? ""), margin + 60, y);
          y += 4.5;
        }
        y += 3;
      }

      // Markers Table
      if (markers.length > 0) {
        heading(`Flagged Markers (${markers.length} events, z \u2265 2.0)`);
        checkPage(10 + Math.min(markers.length, 30) * 5);

        const mCols = [margin, margin + 15, margin + 35, margin + 60, margin + 100, margin + 130, margin + 155];
        const mHeaders = ["#", "Time", "Channel", "Metric", "Value", "z-score"];
        pdf.setFillColor(230, 230, 230);
        pdf.rect(margin, y - 3, contentW, 6, "F");
        pdf.setFont("helvetica", "bold"); pdf.setFontSize(7);
        mHeaders.forEach((h, i) => pdf.text(h, mCols[i], y));
        y += 5;

        pdf.setFont("helvetica", "normal"); pdf.setFontSize(8);
        for (const m of markers) {
          checkPage(5);
          pdf.text(String(m.epoch ?? ""), mCols[0], y);
          pdf.text(String(m.time ?? ""), mCols[1], y);
          pdf.text(String(m.channel ?? ""), mCols[2], y);
          pdf.text(String(m.metric ?? "").substring(0, 25), mCols[3], y);
          pdf.text(String(m.value ?? ""), mCols[4], y);
          pdf.text(typeof m.zscore === "number" ? m.zscore.toFixed(1) : String(m.zscore ?? ""), mCols[5], y);
          y += 4.5;
        }
        y += 3;

        // Marker Timeline (text-based)
        checkPage(12);
        const durationSec = (rec.duration_min || 30) * 60;
        pdf.setFontSize(8); pdf.setFont("helvetica", "normal");
        pdf.text("Marker Timeline:", margin, y); y += 4;
        const barW = contentW;
        pdf.setDrawColor(180); pdf.setFillColor(240, 240, 240);
        pdf.rect(margin, y, barW, 4, "FD");
        // Draw marker ticks
        pdf.setFillColor(220, 38, 38);
        for (const m of markers) {
          const xPos = margin + ((m.time_sec || 0) / durationSec) * barW;
          pdf.rect(xPos, y, 0.5, 4, "F");
        }
        y += 6;
        pdf.setFontSize(7);
        pdf.text("0:00", margin, y);
        pdf.text(`${Math.floor(durationSec / 60)}:00`, margin + barW, y, { align: "right" });
        y += 6;
      }

      // Disclaimer
      checkPage(15);
      pdf.setFontSize(8); pdf.setFont("helvetica", "italic");
      wrappedText(
        "Quantitative metrics from deterministic processing. Not a clinical interpretation. " +
        "The reviewing physician determines significance. MIND\u00AETriage v1.0"
      );
      y += 3;
    }

    // ── Legacy prose sections (fallback if no triageData) ──
    if (!triageData && reportContent) {
      const addSection = (title: string, content: string) => {
        heading(title);
        wrappedText(content);
      };
      addSection("Technical Details", reportContent.technical_details ?
        `Montage: ${reportContent.technical_details.montage || "Standard"}\nDuration: ${reportContent.technical_details.duration || "N/A"}\nChannels: ${reportContent.technical_details.channels || "21-channel 10-20 system"}` :
        "Standard EEG recording");
      addSection("Background Activity", reportContent.background_activity);
      addSection("Sleep Architecture", reportContent.sleep_stages || reportContent.sleep_architecture);
      addSection("Abnormalities", reportContent.abnormalities);
      addSection("Impression", reportContent.impression);
      addSection("Clinical Correlation", reportContent.correlation || reportContent.clinical_correlation);
      addSection("Recommendations", reportContent.recommendations);
    }

    // ── Signature Block ──
    checkPage(30);
    y += 5;
    pdf.setDrawColor(0); pdf.setLineWidth(0.5);
    pdf.line(margin, y, margin + contentW, y);
    y += 7;
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(10);
    pdf.text("ELECTRONIC SIGNATURE", margin, y); y += 6;
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(9);
    pdf.text(report.profiles?.full_name || "Neurologist", margin, y); y += 4;
    if (report.profiles?.credentials) { pdf.text(report.profiles.credentials, margin, y); y += 4; }
    if (report.profiles?.medical_license_number) { pdf.text(`License: ${report.profiles.medical_license_number}`, margin, y); y += 4; }
    if (report.signed_at) {
      pdf.text(`Electronically signed: ${new Date(report.signed_at).toLocaleString()}`, margin, y);
    }

    // ── Upload PDF ──
    const pdfArrayBuffer = pdf.output("arraybuffer");
    const userId = report.studies.owner || user.id;
    const pdfFileName = `${userId}/report-${report.id}.pdf`;

    const { error: uploadError } = await supabase.storage
      .from("eeg-reports")
      .upload(pdfFileName, pdfArrayBuffer, { contentType: "application/pdf", upsert: true });
    if (uploadError) throw uploadError;

    await supabase.from("reports").update({ pdf_path: pdfFileName }).eq("id", reportId);

    console.log("MIND®Triage PDF generated:", pdfFileName);

    return new Response(
      JSON.stringify({ success: true, pdfPath: pdfFileName, message: "PDF generated successfully" }),
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
