import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import jsPDF from "https://esm.sh/jspdf@2.5.2";

/**
 * generate_report_pdf
 *
 * Produces a SCORE EEG-style PDF report from:
 *   - mind.report.v1 machine data (MIND®Triage + SCORE fields)
 *   - report.content — neurologist's signed text (impression, background, etc.)
 *   - clinic + patient + interpreter metadata
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

    const { reportId } = await req.json();
    if (!reportId) return new Response(
      JSON.stringify({ error: "Missing reportId" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

    const { data: report, error: reportError } = await supabase
      .from("reports")
      .select(`
        *,
        studies!inner(id, meta, created_at, ai_draft_json, clinics(name, brand_name)),
        profiles!interpreter(full_name, credentials, medical_license_number)
      `)
      .eq("id", reportId)
      .single();

    if (reportError) throw reportError;

    const signed    = report.content as any || {};          // neurologist's edited text
    const mindData  = report.studies.ai_draft_json as any;  // mind.report.v1
    const studyMeta = report.studies.meta as any || {};
    const clinicName = report.studies.clinics?.brand_name || report.studies.clinics?.name || "ENCEPHLIAN";
    const isMindV1  = mindData?.schema_version === "mind.report.v1";

    const triage  = isMindV1 ? (mindData.triage  || {}) : {};
    const clean   = isMindV1 ? (mindData.clean   || {}) : {};
    const seizure = isMindV1 ? (mindData.seizure || {}) : {};
    const score   = isMindV1 ? (mindData.score   || {}) : {};
    const rec     = isMindV1 ? (mindData.recording || {}) : {};

    // ── PDF setup ─────────────────────────────────────────────────────────────
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const PW = 210, MARGIN = 15, CW = PW - MARGIN * 2;
    let y = 0;

    const newPage = () => { pdf.addPage(); y = 20; };
    const checkPage = (need = 25) => { if (y > 277 - need) newPage(); };

    const setFont = (style: "normal" | "bold" | "italic" = "normal", size = 10) => {
      pdf.setFont("helvetica", style);
      pdf.setFontSize(size);
    };

    const section = (title: string) => {
      checkPage(22);
      y += 2;
      setFont("bold", 9);
      pdf.setTextColor(30, 30, 30);
      pdf.text(title.toUpperCase(), MARGIN, y);
      y += 1.5;
      pdf.setDrawColor(80, 80, 80); pdf.setLineWidth(0.4);
      pdf.line(MARGIN, y, MARGIN + CW, y);
      y += 4;
      setFont("normal", 9);
      pdf.setTextColor(0, 0, 0);
    };

    const subsection = (title: string) => {
      checkPage(14);
      setFont("bold", 9);
      pdf.text(title, MARGIN + 2, y);
      y += 4;
      setFont("normal", 9);
    };

    const kv = (label: string, value: string, indent = 4) => {
      checkPage(6);
      setFont("bold", 8.5);
      pdf.text(`${label}:`, MARGIN + indent, y);
      setFont("normal", 8.5);
      const lines = pdf.splitTextToSize(value || "—", CW - indent - 38);
      pdf.text(lines, MARGIN + indent + 38, y);
      y += lines.length * 4.2 + 0.8;
    };

    const prose = (text: string, indent = 4) => {
      if (!text) return;
      checkPage(8);
      setFont("normal", 9);
      const lines = pdf.splitTextToSize(text, CW - indent);
      pdf.text(lines, MARGIN + indent, y);
      y += lines.length * 4.5 + 2;
    };

    const fieldLine = (label: string, value: string, indent = 6) => {
      checkPage(5);
      setFont("bold", 8);
      pdf.text(`${label}:`, MARGIN + indent, y);
      setFont("normal", 8);
      const lines = pdf.splitTextToSize(value || "Not detected", CW - indent - 30);
      pdf.text(lines, MARGIN + indent + 30, y);
      y += lines.length * 3.8 + 0.5;
    };

    // ── PAGE 1: HEADER ────────────────────────────────────────────────────────
    y = 15;

    // Clinic name (top left) + Report ID (top right)
    setFont("bold", 14);
    pdf.setTextColor(20, 20, 20);
    pdf.text(clinicName, MARGIN, y);
    setFont("normal", 8);
    pdf.setTextColor(100, 100, 100);
    const rptNum = `EEG Report  ${report.id.slice(0, 8).toUpperCase()}`;
    pdf.text(rptNum, PW - MARGIN, y - 4, { align: "right" });
    pdf.text(new Date(report.created_at || Date.now()).toLocaleDateString("en-IN"), PW - MARGIN, y, { align: "right" });
    y += 3;
    pdf.setDrawColor(40, 40, 40); pdf.setLineWidth(0.6);
    pdf.line(MARGIN, y, MARGIN + CW, y);
    y += 6;
    pdf.setTextColor(0, 0, 0);

    // ── Patient + Study Info (two-column) ──
    setFont("bold", 9);
    pdf.text("PATIENT — PERSONAL INFORMATION", PW / 2 + 2, y);
    setFont("bold", 9);
    pdf.text("STUDY INFORMATION", MARGIN, y);
    y += 5;

    const col1 = (lbl: string, val: string) => {
      checkPage(5);
      setFont("bold", 8); pdf.text(`${lbl}:`, MARGIN + 2, y);
      setFont("normal", 8); pdf.text(val || "—", MARGIN + 28, y);
    };
    const col2 = (lbl: string, val: string) => {
      setFont("bold", 8); pdf.text(`${lbl}:`, PW / 2 + 4, y);
      setFont("normal", 8); pdf.text(val || "—", PW / 2 + 30, y);
      y += 4.5;
    };

    col1("EEG type", "Routine EEG"); col2("Name", studyMeta.patient_name || "—");
    col1("Indication", (studyMeta.indication || "—").slice(0, 22)); col2("Date of birth", studyMeta.dob || "—");
    col1("Duration", rec.duration_seconds ? `${Math.round(rec.duration_seconds / 60)} min` : "—"); col2("Age at study", studyMeta.patient_age ? `${studyMeta.patient_age} yrs` : "—");
    col1("Sample rate", rec.sampling_rate_hz ? `${rec.sampling_rate_hz} Hz` : "—"); col2("Patient ID", studyMeta.patient_id || "—");
    col1("Channels", rec.n_channels ? String(rec.n_channels) : "19"); col2("Gender", studyMeta.patient_gender || "—");

    y += 2;
    pdf.setDrawColor(180); pdf.setLineWidth(0.3);
    pdf.line(MARGIN, y, MARGIN + CW, y);
    y += 6;

    // ── FINDINGS ──────────────────────────────────────────────────────────────
    section("FINDINGS");

    // Background dominant rhythm
    const bg = score.background_activity || {};
    const hasBackground = bg.pdr_frequency_hz || bg.continuity || bg.symmetry ||
      bg.reactivity || bg.generalized_slowing || bg.dominant_rhythm;

    subsection("Background dominant rhythm");
    if (hasBackground) {
      const bgProps: string[] = [];
      if (bg.pdr_frequency_hz) bgProps.push(`${bg.pdr_frequency_hz} Hz PDR`);
      if (bg.dominant_rhythm) bgProps.push(bg.dominant_rhythm);
      if (bg.amplitude) bgProps.push(`${bg.amplitude} amplitude`);
      if (bg.symmetry) bgProps.push(bg.symmetry);
      if (bg.reactivity) bgProps.push(`Reactive to eye opening: ${bg.reactivity}`);
      const genSlowing = bg.generalized_slowing;
      if (genSlowing) {
        const s = typeof genSlowing === "object"
          ? (genSlowing.present ? `Generalized slowing: ${genSlowing.grade || "present"}` : null)
          : `Generalized slowing: ${genSlowing}`;
        if (s) bgProps.push(s);
      }

      kv("Properties", bgProps.join(". ") || "Within normal limits");
      kv("Location", bg.location || "Bilateral occipital");
    } else if (signed.background_activity) {
      prose(signed.background_activity);
    } else {
      prose("Background dominant rhythm within normal limits for age.");
    }

    // Interictal findings — artifacts from MIND®Clean
    const artifacts = clean.artifacts || [];
    const artifactTypes = new Set(artifacts.map((a: any) => a.artifact_type || "artifact"));
    if (artifacts.length > 0) {
      subsection("Interictal findings — Artifact activity");
      kv("Clean recording", `${clean.clean_percentage?.toFixed(1) ?? "—"}%`);
      kv("Artifact windows", `${clean.artifact_windows ?? 0} / ${clean.total_windows ?? 0} epochs (2s each)`);
      if (artifactTypes.size > 0) {
        kv("Artifact types", Array.from(artifactTypes).join(", "));
      }
      // Show up to 6 notable artifact windows
      const notable = artifacts.slice(0, 6);
      for (const a of notable) {
        checkPage(5);
        setFont("normal", 8);
        const loc = `t=${a.start_sec?.toFixed(1)}s–${a.end_sec?.toFixed(1)}s`;
        pdf.text(`  • ${a.artifact_type || "artifact"}  [${loc}]  severity: ${a.severity || "—"}`, MARGIN + 6, y);
        y += 3.8;
      }
      if (artifacts.length > 6) {
        setFont("italic", 7.5);
        pdf.setTextColor(120);
        pdf.text(`  … ${artifacts.length - 6} more artifact windows`, MARGIN + 6, y);
        pdf.setTextColor(0);
        y += 3.8;
      }
      y += 2;
    }

    // Seizure events
    const seizureEvents = seizure.events || [];
    if (seizureEvents.length > 0) {
      subsection("Ictal findings — Seizure events");
      kv("Events detected", String(seizureEvents.length));
      for (const e of seizureEvents.slice(0, 5)) {
        checkPage(5);
        setFont("normal", 8);
        const onset = e.onset_time ?? e.onset_sec ?? "?";
        const duration = e.duration_sec ?? ((e.offset_time ?? 0) - (e.onset_time ?? 0));
        pdf.text(
          `  • Onset ${Number(onset).toFixed(1)}s  Duration ${Number(duration).toFixed(1)}s` +
          (e.confidence != null ? `  Confidence ${(Number(e.confidence) * 100).toFixed(0)}%` : ""),
          MARGIN + 6, y,
        );
        y += 3.8;
      }
      y += 2;
    }

    // Abnormalities (from neurologist's signed text)
    if (signed.abnormalities) {
      subsection("Interictal findings — Interpreter notes");
      prose(signed.abnormalities);
    }

    // Sleep architecture
    if (signed.sleep_architecture) {
      subsection("Sleep architecture");
      prose(signed.sleep_architecture);
    }

    // ── CONCLUSION ────────────────────────────────────────────────────────────
    section("CONCLUSION");

    // Impression — neurologist's text first, then machine fallback
    const impressionText = signed.impression || score.impression;
    if (impressionText) {
      subsection("Summary of the findings");
      prose(impressionText);
    }

    // Clinical correlates
    if (signed.clinical_correlates) {
      subsection("Clinical correlates");
      prose(signed.clinical_correlates);
    }

    // Diagnostic significance
    checkPage(20);
    const diagLabel = score.clinical_significance_label || score.clinical_significance || triage.classification;
    const icdHint = triage.icd_hint || score.icd_hint;
    const recAction = score.recommended_action || signed.clinical_correlates;

    setFont("bold", 9);
    pdf.text("DIAGNOSTIC SIGNIFICANCE", MARGIN + 2, y);
    y += 5;

    if (diagLabel) {
      setFont("bold", 11);
      const isAbnormal = triage.classification === "abnormal" ||
        (typeof diagLabel === "string" && diagLabel.toLowerCase().includes("abnormal"));
      pdf.setTextColor(isAbnormal ? 180 : 30, isAbnormal ? 30 : 140, 30);
      const diagText = typeof diagLabel === "string"
        ? diagLabel.charAt(0).toUpperCase() + diagLabel.slice(1).replace(/_/g, " ")
        : "See findings above";
      pdf.text(diagText, MARGIN + 4, y);
      pdf.setTextColor(0);
      y += 6;
    }

    if (icdHint) {
      setFont("normal", 8.5);
      pdf.text(`ICD hint: ${icdHint}`, MARGIN + 4, y);
      y += 4.5;
    }

    if (recAction) {
      setFont("normal", 8.5);
      const lines = pdf.splitTextToSize(`Recommended action: ${recAction}`, CW - 4);
      pdf.text(lines, MARGIN + 4, y);
      y += lines.length * 4 + 2;
    }

    // MIND® confidence note
    if (triage.confidence != null) {
      setFont("italic", 7.5);
      pdf.setTextColor(100);
      pdf.text(
        `MIND®Triage confidence: ${(Number(triage.confidence) * 100).toFixed(0)}% · Model: ${triage.model || "mind_triage_v1"} · Pipeline: ${mindData?.pipeline_version || "1.x"}`,
        MARGIN + 4, y,
      );
      pdf.setTextColor(0);
      y += 4;
    }

    // ── SIGNATURE ─────────────────────────────────────────────────────────────
    checkPage(35);
    y += 6;
    pdf.setDrawColor(60); pdf.setLineWidth(0.4);
    pdf.line(MARGIN, y, MARGIN + CW, y);
    y += 8;

    setFont("bold", 9);
    pdf.text("ELECTRONICALLY SIGNED", MARGIN, y);
    y += 6;

    const interp = report.profiles;
    setFont("normal", 10);
    pdf.text(interp?.full_name || "Reporting Neurologist", MARGIN, y);
    y += 4;
    setFont("normal", 9);
    if (interp?.credentials) { pdf.text(interp.credentials, MARGIN, y); y += 4; }
    if (interp?.medical_license_number) { pdf.text(`License: ${interp.medical_license_number}`, MARGIN, y); y += 4; }
    if (report.signed_at) {
      pdf.text(`Signed: ${new Date(report.signed_at).toLocaleString("en-IN")}`, MARGIN, y);
      y += 4;
    }

    // Footer disclaimer on last page
    y += 4;
    setFont("italic", 7);
    pdf.setTextColor(140);
    const disclaimer =
      "This report was generated with MIND® AI-assisted EEG analysis. " +
      "Machine findings require clinical interpretation by a qualified neurologist. " +
      "ENCEPHLIAN Platform · MIND® v" + (mindData?.pipeline_version || "1.x");
    const discLines = pdf.splitTextToSize(disclaimer, CW);
    pdf.text(discLines, MARGIN, y);

    // ── Upload PDF to Supabase Storage ────────────────────────────────────────
    const pdfBytes = pdf.output("arraybuffer");
    const pdfPath = `${user.id}/report-${report.id}.pdf`;

    const { error: uploadErr } = await supabase.storage
      .from("eeg-reports")
      .upload(pdfPath, pdfBytes, { contentType: "application/pdf", upsert: true });
    if (uploadErr) throw uploadErr;

    await supabase.from("reports").update({ pdf_path: pdfPath }).eq("id", reportId);

    return new Response(
      JSON.stringify({ success: true, pdfPath }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (error) {
    console.error("generate_report_pdf:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
