import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Loader2, FileText, Coins, ArrowRight,
  CheckCircle2, Clock, Zap, Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import dayjs from "dayjs";
import { usePilotData, PilotStudy } from "@/hooks/usePilotData";
import SlaSelectionModal from "@/components/dashboard/SlaSelectionModal";
import RefundDialog from "@/components/dashboard/RefundDialog";
import { toast } from "sonner";
import logoSrc from "@/assets/logo.png";

export default function PilotDashboard() {
  const navigate = useNavigate();
  const [selectedStudy, setSelectedStudy] = useState<PilotStudy | null>(null);
  const [slaModalOpen, setSlaModalOpen] = useState(false);
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [refundStudy, setRefundStudy] = useState<PilotStudy | null>(null);

  const {
    studies,
    isLoading,
    tokenBalance,
    pending: pendingTriageStudies,
    processing: processingStudies,
    completed: completedReports,
  } = usePilotData();

  const handleSelectSla = useCallback((study: PilotStudy) => {
    setSelectedStudy(study);
    setSlaModalOpen(true);
  }, []);

  const handleInsufficientTokens = useCallback(() => {
    setSlaModalOpen(false);
    toast.error("Not enough tokens", {
      description: "Please add tokens to start triage.",
    });
    navigate("/app/wallet");
  }, [navigate]);

  const handleRequestRefund = useCallback((study: PilotStudy) => {
    setRefundStudy(study);
    setRefundDialogOpen(true);
  }, []);

  // Skeleton loading — matches final layout shape
  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 py-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="h-8 w-24 rounded-full" />
        </div>
        <Skeleton className="h-28 w-full rounded-lg" />
        <Skeleton className="h-20 w-full rounded-lg" />
        <Skeleton className="h-20 w-full rounded-lg" />
      </div>
    );
  }

  const hasProcessing = processingStudies.length > 0;
  const hasPending = pendingTriageStudies.length > 0;
  const hasCompleted = completedReports.length > 0;
  const isEmpty = !hasProcessing && !hasPending && !hasCompleted && studies.length === 0;

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-4 animate-fade-in">
      {/* Header with inline token balance (non-navigating) */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Accelerated Triage</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Upload → Analyze → Report
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/50">
            <Coins className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium tabular-nums">{tokenBalance}</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => navigate("/app/wallet")}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Processing Studies */}
      {hasProcessing && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-sm font-medium">Processing</span>
            </div>
            <div className="space-y-3">
              {processingStudies.slice(0, 3).map((study) => {
                const meta = study.meta as any;
                const progress = study.triage_progress || 0;
                return (
                  <div key={study.id} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="truncate max-w-[200px]">
                        {meta?.patient_name || "Patient"}
                      </span>
                      <Badge variant="secondary" className="text-xs">
                        {study.sla}
                      </Badge>
                    </div>
                    <Progress value={progress} className="h-1.5" />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pending Triage */}
      {hasPending && (
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="h-4 w-4 text-amber-600" />
              <span className="text-sm font-medium">Ready for Triage</span>
            </div>
            <div className="space-y-2">
              {pendingTriageStudies.slice(0, 5).map((study) => {
                const meta = study.meta as any;
                return (
                  <div
                    key={study.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-background/50 hover:bg-background transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {meta?.patient_name || "Unknown Patient"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {dayjs(study.created_at).format("MMM D, h:mm A")}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleSelectSla(study)}
                      className="shrink-0 gap-1"
                    >
                      <Zap className="h-3 w-3" />
                      Start
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Completed Reports */}
      {hasCompleted && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span className="text-sm font-medium">Completed Reports</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/app/studies")}
                className="text-xs h-7"
              >
                View All
              </Button>
            </div>
            <div className="space-y-2">
              {completedReports.slice(0, 3).map((study) => {
                const meta = study.meta as any;
                return (
                  <div
                    key={study.id}
                    onClick={() => navigate(`/app/studies/${study.id}`)}
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-8 w-8 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {meta?.patient_name || "Patient"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {dayjs(study.triage_completed_at || study.created_at).format("MMM D")}
                        </p>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {isEmpty && (
        <Card className="border-dashed border-2">
          <CardContent className="p-8 text-center">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <img src={logoSrc} alt="Encephlian" className="h-8 w-8" />
            </div>
            <h3 className="font-semibold text-lg mb-1">Start Your First Triage</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto">
              Upload an EEG file and get an AI-accelerated triage report in minutes
            </p>
            <Button size="lg" onClick={() => navigate("/app/studies")} className="gap-2">
              <Zap className="h-4 w-4" />
              Upload EEG
            </Button>
          </CardContent>
        </Card>
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

      <RefundDialog
        open={refundDialogOpen}
        onOpenChange={setRefundDialogOpen}
        study={refundStudy}
      />
    </div>
  );
}
