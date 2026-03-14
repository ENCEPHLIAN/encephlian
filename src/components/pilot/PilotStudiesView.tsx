import { useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Upload, FileText, CheckCircle2, Clock,
  Loader2, Zap, Download, ArrowRight, Brain,
} from "lucide-react";
import dayjs from "dayjs";
import { toast } from "sonner";
import { usePilotData, PilotStudy } from "@/hooks/usePilotData";
import SlaSelectionModal from "@/components/dashboard/SlaSelectionModal";
import { StudyUploadWizard } from "@/components/upload/StudyUploadWizard";
import { useUserSession } from "@/contexts/UserSessionContext";
import { cn } from "@/lib/utils";

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
  const { userId } = useUserSession();

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

  // Drag-and-drop
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
      const file = files[0];
      const name = file.name.toLowerCase();
      if (name.endsWith(".edf") || name.endsWith(".bdf")) {
        setUploadWizardOpen(true);
      } else {
        toast.error("Only EDF/BDF files supported", {
          description: "Export your EEG recording as .EDF format first",
        });
      }
    }
  }, []);

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

  // Skeleton
  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 py-4">
        <Skeleton className="h-7 w-36 mx-auto" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
      </div>
    );
  }

  const isEmpty = studies.length === 0;
  const totalInFlight = pendingStudies.length + processingStudies.length;

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Studies</h1>
          <p className="text-xs text-muted-foreground">
            {studies.length} total • {totalInFlight} in progress
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
          "border-2 border-dashed transition-all cursor-pointer",
          isDragOver
            ? "border-primary bg-primary/10 scale-[1.01] shadow-lg"
            : "hover:border-primary/50 hover:bg-primary/5"
        )}
        onClick={() => setUploadWizardOpen(true)}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <CardContent className="p-6 text-center">
          {isDragOver ? (
            <div className="space-y-2">
              <Upload className="h-8 w-8 text-primary mx-auto animate-bounce" />
              <p className="font-medium text-primary">Drop to upload</p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <Upload className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">Upload EEG File</p>
                <p className="text-xs text-muted-foreground">
                  EDF format • Click or drag & drop
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending SLA */}
      {pendingStudies.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <Clock className="h-4 w-4 text-amber-600" />
            <span className="text-sm font-medium">Ready for Triage</span>
            <Badge variant="secondary" className="text-xs ml-auto">{pendingStudies.length}</Badge>
          </div>
          {pendingStudies.map((study) => {
            const meta = study.meta as any;
            return (
              <Card key={study.id} className="bg-amber-500/5 border-amber-500/20">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">
                        {meta?.patient_name || "Patient"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {dayjs(study.created_at).format("MMM D, h:mm A")}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleSelectSla(study)}
                      className="gap-1 shrink-0 rounded-full"
                    >
                      <Zap className="h-3 w-3" />
                      Start Triage
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Processing */}
      {processingStudies.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <Brain className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">AI Analyzing</span>
            <Badge variant="secondary" className="text-xs ml-auto">{processingStudies.length}</Badge>
          </div>
          {processingStudies.map((study) => {
            const meta = study.meta as any;
            const progress = study.triage_progress || 0;
            return (
              <Card key={study.id} className="bg-primary/5 border-primary/20">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm truncate">{meta?.patient_name || "Patient"}</p>
                    <Badge variant="outline" className="text-xs">{study.sla}</Badge>
                  </div>
                  <Progress value={progress} className="h-1.5" />
                  <p className="text-xs text-muted-foreground">
                    {progress < 30 ? "Preprocessing signals..." : progress < 70 ? "Running AI analysis..." : "Generating report..."}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Completed */}
      {completedStudies.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span className="text-sm font-medium">Reports Ready</span>
            <Badge variant="secondary" className="text-xs ml-auto">{completedStudies.length}</Badge>
          </div>
          {completedStudies.slice(0, 10).map((study) => {
            const meta = study.meta as any;
            return (
              <Card key={study.id} className="hover:bg-muted/30 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div
                      className="flex items-center gap-3 min-w-0 cursor-pointer flex-1"
                      onClick={() => navigate(`/app/studies/${study.id}`)}
                    >
                      <div className="h-9 w-9 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{meta?.patient_name || "Patient"}</p>
                        <p className="text-xs text-muted-foreground">
                          {dayjs(study.triage_completed_at || study.created_at).format("MMM D")}
                          <span className="mx-1">•</span>{study.sla}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => navigate(`/app/studies/${study.id}`)}
                      >
                        <FileText className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleDownload(study)}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Empty State */}
      {isEmpty && (
        <div className="text-center py-12 text-muted-foreground">
          <div className="h-14 w-14 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
            <FileText className="h-7 w-7 opacity-40" />
          </div>
          <p className="font-medium text-foreground mb-1">No studies yet</p>
          <p className="text-sm mb-4">Upload your first EEG recording to get started</p>
          <Button onClick={() => setUploadWizardOpen(true)} className="gap-2 rounded-full">
            <Upload className="h-4 w-4" />
            Upload EEG
          </Button>
        </div>
      )}

      {/* SLA Modal (Pilot 1-tap) */}
      <SlaSelectionModal
        open={slaModalOpen}
        onOpenChange={setSlaModalOpen}
        study={selectedStudy}
        tokenBalance={tokenBalance}
        onInsufficientTokens={handleInsufficientTokens}
        isPilot
      />

      {/* Upload Wizard */}
      <StudyUploadWizard
        open={uploadWizardOpen}
        onOpenChange={setUploadWizardOpen}
      />
    </div>
  );
}
