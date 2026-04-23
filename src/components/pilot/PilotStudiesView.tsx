import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Upload, FileText, CheckCircle2, Clock,
  Loader2, Zap, Download, Brain,
  AlertTriangle, Activity,
} from "lucide-react";
import dayjs from "dayjs";
import { toast } from "sonner";
import { usePilotData, PilotStudy } from "@/hooks/usePilotData";
import SlaSelectionModal from "@/components/dashboard/SlaSelectionModal";
import { StudyUploadWizard } from "@/components/upload/StudyUploadWizard";
import { useUserSession } from "@/contexts/UserSessionContext";
import { cn } from "@/lib/utils";
import { formatStudySourceLine } from "@/lib/studySourceFile";
import { getStudyHandle } from "@/lib/studyDisplay";

export default function PilotStudiesView() {
  const navigate = useNavigate();
  const [selectedStudy, setSelectedStudy] = useState<PilotStudy | null>(null);
  const [slaModalOpen, setSlaModalOpen] = useState(false);
  const [uploadWizardOpen, setUploadWizardOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const {
    studies,
    isLoading,
    tokenBalance,
    pending: pendingStudies,
    processing: processingStudies,
    completed: completedStudies,
  } = usePilotData();

  const handleSelectSla = useCallback((study: PilotStudy) => {
    setSelectedStudy(study);
    setSlaModalOpen(true);
  }, []);

  const handleInsufficientTokens = useCallback(() => {
    setSlaModalOpen(false);
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
    try {
      const { data: report } = await supabase
        .from("reports")
        .select("pdf_path, id")
        .eq("study_id", study.id)
        .single();

      if (!report?.pdf_path) {
        toast.info("Generating report...");
        if (report?.id) {
          await supabase.functions.invoke("generate_report_pdf", {
            body: { reportId: report.id },
          });
        }
        return;
      }

      const { data, error } = await supabase.storage
        .from("eeg-reports")
        .download(report.pdf_path);
      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `triage-report-${study.id.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Download started");
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

      {/* Pending SLA Selection */}
      {pendingStudies.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <span className="text-sm font-semibold">Ready for Triage</span>
            <Badge variant="secondary" className="text-[10px] ml-auto tabular-nums">
              {pendingStudies.length}
            </Badge>
          </div>
          {pendingStudies.map((study) => {
            const meta = study.meta as any;
            const src = formatStudySourceLine(meta, study.original_format ?? null);
            const handle = getStudyHandle(study);
            return (
              <Card
                key={study.id}
                className="bg-amber-500/5 border-amber-500/20"
              >
                <CardContent className="p-3.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-9 w-9 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                        <FileText className="h-4 w-4 text-amber-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-mono text-muted-foreground">{handle}</p>
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
                    <Button
                      size="sm"
                      onClick={() => handleSelectSla(study)}
                      className="gap-1.5 shrink-0 rounded-full h-8 px-4"
                    >
                      <Zap className="h-3 w-3" />
                      Start
                    </Button>
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
            const handle = getStudyHandle(study);
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
                        <p className="text-[10px] font-mono text-muted-foreground">{handle}</p>
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
            return (
              <Card
                key={study.id}
                className="hover:bg-muted/30 transition-colors cursor-pointer group"
                onClick={() => navigate(`/app/studies/${study.id}`)}
              >
                <CardContent className="p-3.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className={cn(
                        "h-9 w-9 rounded-lg flex items-center justify-center shrink-0",
                        isSigned ? "bg-emerald-500/10" : "bg-primary/10"
                      )}>
                        {isSigned
                          ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          : <FileText className="h-4 w-4 text-primary" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-mono text-muted-foreground">{handle}</p>
                        <div className="flex items-center gap-2 min-w-0">
                          <p className="font-medium text-sm truncate">
                            {meta?.patient_name || "Patient"}
                          </p>
                          {isSigned && (
                            <Badge className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20 shrink-0">Signed</Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          {dayjs(
                            study.triage_completed_at || study.created_at
                          ).format("MMM D, h:mm A")}
                          <span className="mx-1">·</span>
                          {study.sla}
                        </p>
                        {src && (
                          <p className="text-[11px] text-muted-foreground/90 truncate" title={src}>{src}</p>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={(e) => { e.stopPropagation(); handleDownload(study); }}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
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
              Upload your first EEG recording to get an AI triage report
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
      <SlaSelectionModal
        open={slaModalOpen}
        onOpenChange={setSlaModalOpen}
        study={selectedStudy}
        tokenBalance={tokenBalance}
        onInsufficientTokens={handleInsufficientTokens}
        isPilot
      />

      <StudyUploadWizard
        open={uploadWizardOpen}
        onOpenChange={setUploadWizardOpen}
      />
    </div>
  );
}
