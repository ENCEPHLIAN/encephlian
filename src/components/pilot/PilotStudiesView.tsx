import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Upload, FileText, CheckCircle2, Clock,
  Loader2, Download, Brain, ChevronRight,
  AlertTriangle, Activity, ShieldCheck, AlertCircle as AbnormalIcon, Coins, Plus,
} from "lucide-react";
import dayjs from "dayjs";
import { toast } from "sonner";
import { usePilotData, PilotStudy } from "@/hooks/usePilotData";
import { StudyUploadWizard } from "@/components/upload/StudyUploadWizard";
import { PilotInlineSla } from "@/components/pilot/PilotInlineSla";
import { cn } from "@/lib/utils";
import { formatStudySourceLine } from "@/lib/studySourceFile";

function getTriageResult(study: PilotStudy): { classification: string; confidence: number } | null {
  const report = study.ai_draft_json;
  if (!report) return null;
  const c = report.classification ?? report.triage_classification ?? null;
  const conf = report.triage_confidence ?? report.confidence ?? null;
  if (!c) return null;
  return { classification: String(c), confidence: typeof conf === "number" ? conf : 0 };
}

export default function PilotStudiesView() {
  const navigate = useNavigate();
  const [uploadWizardOpen, setUploadWizardOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const {
    studies,
    isLoading,
    tokenBalance,
    pending: pendingStudies,
    processing: processingStudies,
    completed: completedStudies,
    refetchStudies,
  } = usePilotData();

  const handleInsufficientTokens = useCallback(() => {
    toast.error("Add tokens to continue", {
      action: {
        label: "Add Tokens",
        onClick: () => navigate("/app/wallet"),
      },
    });
  }, [navigate]);

  /* ─── Drag and drop ─── */
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const name = files[0].name.toLowerCase();
      if (name.endsWith(".edf") || name.endsWith(".bdf")) {
        setUploadWizardOpen(true);
      } else {
        toast.error("Only EDF/BDF files are supported", {
          description: "Export your EEG recording as .EDF first.",
        });
      }
    }
  }, []);

  /* ─── Download report ─── */
  const handleDownload = async (study: PilotStudy) => {
    const triggerDownload = (blob: Blob, name: string) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };

    try {
      // 1. Check for a signed report PDF first
      const { data: report } = await supabase
        .from("reports")
        .select("pdf_path, id")
        .eq("study_id", study.id)
        .maybeSingle();

      if (report?.pdf_path) {
        const { data, error } = await supabase.storage.from("eeg-reports").download(report.pdf_path);
        if (!error && data) {
          triggerDownload(data, `triage-report-${study.id.slice(0, 8)}.pdf`);
          toast.success("Download started");
          return;
        }
      }

      // 2. Try server-side PDF generation if report row has no pdf_path
      if (report?.id) {
        toast.info("Generating PDF...");
        await supabase.functions.invoke("generate_report_pdf", { body: { reportId: report.id } });
        const { data: fresh } = await supabase.from("reports").select("pdf_path").eq("id", report.id).single();
        if (fresh?.pdf_path) {
          const { data, error } = await supabase.storage.from("eeg-reports").download(fresh.pdf_path);
          if (!error && data) {
            triggerDownload(data, `triage-report-${study.id.slice(0, 8)}.pdf`);
            toast.success("Download started");
            return;
          }
        }
      }

      // 3. Fallback: generate HTML report from ai_draft_json
      const raw = study.ai_draft_json as any;
      if (raw) {
        const meta = study.meta as any;
        const patientName = meta?.patient_name || "Unknown Patient";
        const patientId = meta?.patient_id ? ` · ${meta.patient_id}` : "";
        const reportDate = dayjs(study.triage_completed_at || study.created_at).format("MMMM D, YYYY");
        const score = raw.score || {};
        const bg = score.background_activity || {};
        const cls = raw.classification ?? raw.triage?.classification ?? score.classification;
        const conf = raw.triage_confidence ?? raw.triage?.confidence;
        const clsLine = cls && cls !== "unknown"
          ? `${cls.charAt(0).toUpperCase() + cls.slice(1)}${typeof conf === "number" ? ` (confidence: ${Math.round(conf * 100)}%)` : ""}`
          : null;

        const bgLines = [
          bg.dominant_rhythm && `Dominant rhythm: ${bg.dominant_rhythm}`,
          bg.amplitude && `Amplitude: ${bg.amplitude}`,
          bg.generalized_slowing?.present && `Generalised slowing: ${bg.generalized_slowing?.grade || "present"}`,
          bg.symmetry && `Symmetry: ${bg.symmetry}`,
        ].filter(Boolean).join("\n") || score.recording_conditions || "";

        const sections = [
          { h: "Classification", t: clsLine },
          { h: "Background Activity", t: bgLines },
          { h: "Interictal Findings", t: score.interictal_findings?.ieds_note },
          { h: "Ictal Findings", t: score.ictal_findings?.note },
          { h: "Impression", t: score.impression || raw.triage?.summary },
          { h: "Recommended Action", t: score.recommended_action || raw.triage?.action },
        ].filter((s): s is { h: string; t: string } => !!s.t);

        const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Triage Report — ${patientName}</title>
<style>
  body { font-family: Georgia, serif; max-width: 720px; margin: 40px auto; color: #111; line-height: 1.7; }
  h1 { font-size: 1.4rem; border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 4px; }
  .meta { color: #555; font-size: 0.85rem; margin-bottom: 1.5rem; }
  h2 { font-size: 0.95rem; font-weight: 700; margin-top: 1.4rem; margin-bottom: 2px; text-transform: uppercase; letter-spacing: 0.04em; }
  p { white-space: pre-wrap; margin: 0; font-size: 0.95rem; }
  .footer { margin-top: 2.5rem; padding-top: 1rem; border-top: 1px solid #ddd; font-size: 0.75rem; color: #999; }
  @media print { body { margin: 20mm; } }
</style></head><body>
<h1>ENCEPHLIAN™ Triage Report</h1>
<div class="meta">
  <strong>Patient:</strong> ${patientName}${patientId}<br>
  <strong>Date:</strong> ${reportDate}<br>
  <strong>SLA:</strong> ${study.sla}<br>
  <strong>Study ID:</strong> ${study.id.slice(0, 8).toUpperCase()}
</div>
${sections.map(s => `<h2>${s.h}</h2>\n<p>${s.t}</p>`).join("\n")}
<div class="footer">Generated by ENCEPHLIAN™ · Triage report · For physician review only</div>
</body></html>`;

        const blob = new Blob([html], { type: "text/html" });
        triggerDownload(blob, `triage-report-${study.id.slice(0, 8)}.html`);
        toast.success("Report downloaded", { description: "Open the .html file and print to PDF" });
        return;
      }

      toast.error("Report not yet available — analysis may still be running");
    } catch {
      toast.error("Download failed");
    }
  };

  /* ─── Skeleton loading ─── */
  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto space-y-5 py-4 px-1">
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-9 w-24 rounded-full" />
        </div>
        <Skeleton className="h-36 w-full rounded-2xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
      </div>
    );
  }

  const isEmpty = studies.length === 0;
  const totalActive = pendingStudies.length + processingStudies.length;

  return (
    <div className="max-w-2xl mx-auto space-y-5 py-4 px-1 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Studies</h1>
          <p className="text-xs text-muted-foreground">
            {isEmpty
              ? "Upload your first EEG to get started"
              : `${studies.length} total · ${totalActive} active`}
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setUploadWizardOpen(true)}
          className="gap-1.5 rounded-full"
        >
          <Upload className="h-3.5 w-3.5" />
          Upload
        </Button>
      </div>

      {/* Upload Drop Zone */}
      <Card
        className={cn(
          "border-2 border-dashed transition-all cursor-pointer group",
          isDragOver
            ? "border-primary bg-primary/10 scale-[1.01] shadow-lg"
            : "hover:border-primary/40 hover:bg-primary/5"
        )}
        onClick={() => setUploadWizardOpen(true)}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <CardContent className="p-6 sm:p-8 text-center">
          {isDragOver ? (
            <div className="space-y-2">
              <Upload className="h-10 w-10 text-primary mx-auto animate-bounce" />
              <p className="font-semibold text-primary">Drop to upload</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto group-hover:bg-primary/15 transition-colors">
                <Upload className="h-7 w-7 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-sm">Upload EEG Recording</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  EDF/BDF format · Click or drag & drop · Max 20MB
                </p>
              </div>
              <div className="flex items-center justify-center gap-3 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Brain className="h-3 w-3" /> AI-analyzed
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" /> ~15 min
                </span>
                <span className="flex items-center gap-1">
                  <FileText className="h-3 w-3" /> PDF report
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Zero-token prompt when studies are waiting */}
      {tokenBalance === 0 && pendingStudies.length > 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
              <Coins className="h-5 w-5 text-destructive" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">No tokens — {pendingStudies.length} {pendingStudies.length === 1 ? "study" : "studies"} waiting</p>
              <p className="text-xs text-muted-foreground">Add tokens to start triage. Standard · 1 token, Priority · 2 tokens.</p>
            </div>
            <Button size="sm" className="rounded-full shrink-0 gap-1.5" onClick={() => navigate("/app/wallet")}>
              <Plus className="h-3.5 w-3.5" />
              Add Tokens
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Pending SLA Selection */}
      {pendingStudies.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <span className="text-sm font-semibold">Choose triage</span>
            <Badge variant="secondary" className="text-[10px] ml-auto tabular-nums">
              {pendingStudies.length}
            </Badge>
          </div>
          {pendingStudies.map((study) => {
            const meta = study.meta as any;
            const src = formatStudySourceLine(meta, study.original_format ?? null);
            return (
              <Card
                key={study.id}
                className="bg-amber-500/5 border-amber-500/20"
              >
                <CardContent className="p-3.5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-9 w-9 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                        <FileText className="h-4 w-4 text-amber-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">
                          {meta?.patient_name || "Patient"}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {dayjs(study.created_at).format("MMM D, h:mm A")}
                        </p>
                        {src && (
                          <p className="text-[11px] text-muted-foreground/90 truncate" title={src}>{src}</p>
                        )}
                      </div>
                    </div>
                    <PilotInlineSla
                      study={study}
                      tokenBalance={tokenBalance}
                      onNeedTokens={handleInsufficientTokens}
                      onStarted={() => refetchStudies()}
                      compact
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </section>
      )}

      {/* Processing */}
      {processingStudies.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <Activity className="h-4 w-4 text-primary animate-pulse" />
            <span className="text-sm font-semibold">Analyzing</span>
            <Badge variant="secondary" className="text-[10px] ml-auto tabular-nums">
              {processingStudies.length}
            </Badge>
          </div>
          {processingStudies.map((study) => {
            const meta = study.meta as any;
            const src = formatStudySourceLine(meta, study.original_format ?? null);
            const progress = study.triage_progress || 0;
            const label =
              progress < 30
                ? "Preprocessing..."
                : progress < 70
                ? "AI analysis..."
                : "Generating report...";
            return (
              <Card key={study.id} className="bg-primary/5 border-primary/20">
                <CardContent className="p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Loader2 className="h-4 w-4 text-primary animate-spin" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">
                          {meta?.patient_name || "Patient"}
                        </p>
                        <p className="text-[11px] text-muted-foreground">{label}</p>
                        {src && (
                          <p className="text-[11px] text-muted-foreground/90 truncate" title={src}>{src}</p>
                        )}
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-primary tabular-nums">
                      {progress}%
                    </span>
                  </div>
                  <Progress value={progress} className="h-1.5" />
                </CardContent>
              </Card>
            );
          })}
        </section>
      )}

      {/* Completed Reports */}
      {completedStudies.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <span className="text-sm font-semibold">Reports</span>
            <Badge variant="secondary" className="text-[10px] ml-auto tabular-nums">
              {completedStudies.length}
            </Badge>
          </div>
          {completedStudies.slice(0, 15).map((study) => {
            const meta = study.meta as any;
            const src = formatStudySourceLine(meta, study.original_format ?? null);
            const isSigned = study.state === "signed";
            const triageResult = getTriageResult(study);
            const isNormal = triageResult?.classification === "normal";
            const isAbnormal = triageResult?.classification === "abnormal";
            return (
              <Card
                key={study.id}
                className="hover:bg-muted/30 transition-all cursor-pointer group border-border/60"
                onClick={() => navigate(`/app/studies/${study.id}`)}
              >
                <CardContent className="p-3.5">
                  <div className="flex items-center gap-3">
                    {/* Classification icon */}
                    <div className={cn(
                      "h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
                      isNormal ? "bg-emerald-500/10" :
                      isAbnormal ? "bg-red-500/10" :
                      isSigned ? "bg-emerald-500/10" : "bg-primary/10"
                    )}>
                      {isNormal
                        ? <ShieldCheck className="h-5 w-5 text-emerald-500" />
                        : isAbnormal
                        ? <AbnormalIcon className="h-5 w-5 text-red-500" />
                        : isSigned
                        ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        : <FileText className="h-4 w-4 text-primary" />}
                    </div>

                    {/* Main content */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="font-medium text-sm truncate">
                          {meta?.patient_name || "Patient"}
                        </p>
                        {triageResult ? (
                          <Badge className={cn(
                            "text-[10px] shrink-0 font-semibold",
                            isNormal
                              ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                              : "bg-red-500/10 text-red-600 border-red-500/20"
                          )}>
                            {isNormal ? "Normal" : "Abnormal"}
                            {triageResult.confidence > 0 && (
                              <span className="ml-1 opacity-70">{Math.round(triageResult.confidence * 100)}%</span>
                            )}
                          </Badge>
                        ) : isSigned ? (
                          <Badge className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20 shrink-0">Signed</Badge>
                        ) : null}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {dayjs(study.triage_completed_at || study.created_at).format("MMM D, h:mm A")}
                        <span className="mx-1">·</span>
                        {study.sla}
                      </p>
                      {src && (
                        <p className="text-[11px] text-muted-foreground/70 truncate mt-0.5" title={src}>{src}</p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 opacity-60 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => { e.stopPropagation(); handleDownload(study); }}
                      >
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </section>
      )}

      {/* Empty State */}
      {isEmpty && (
        <div className="text-center py-10 space-y-4">
          <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto">
            <FileText className="h-8 w-8 text-muted-foreground/40" />
          </div>
          <div>
            <p className="font-semibold">No studies yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Upload your first EEG recording to get a triage report
            </p>
          </div>
          <Button
            onClick={() => setUploadWizardOpen(true)}
            className="gap-2 rounded-full"
          >
            <Upload className="h-4 w-4" />
            Upload EEG
          </Button>
        </div>
      )}

      {/* Modals */}
      <StudyUploadWizard
        open={uploadWizardOpen}
        onOpenChange={setUploadWizardOpen}
      />
    </div>
  );
}
