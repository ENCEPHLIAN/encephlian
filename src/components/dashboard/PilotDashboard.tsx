import { useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Upload, FileText, Coins, ArrowRight, Plus,
  CheckCircle2, Clock, Zap, Loader2, Sparkles,
  HelpCircle, ChevronRight, Brain, Shield, BarChart3,
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
import PilotOnboarding from "@/components/pilot/PilotOnboarding";
import { toast } from "sonner";
import logoSrc from "@/assets/logo.png";
import { useUserSession } from "@/contexts/UserSessionContext";

/* ─── How It Works Steps ─── */
const HOW_IT_WORKS = [
  { icon: Upload, label: "Upload EEG", desc: "Drop your .EDF file" },
  { icon: Brain, label: "AI Analysis", desc: "MIND® processes the recording" },
  { icon: FileText, label: "Get Report", desc: "Triage report in minutes" },
];

export default function PilotDashboard() {
  const navigate = useNavigate();
  const { profile } = useUserSession();
  const [selectedStudy, setSelectedStudy] = useState<PilotStudy | null>(null);
  const [slaModalOpen, setSlaModalOpen] = useState(false);
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [refundStudy, setRefundStudy] = useState<PilotStudy | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);

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
      description: "Add tokens to start triage.",
    });
    navigate("/app/wallet");
  }, [navigate]);

  // Check if this is likely a new user (no studies ever)
  const isNewUser = !isLoading && studies.length === 0;
  const firstName = profile?.full_name?.split(" ")[0] || "Doctor";

  // Skeleton loading — matches final layout
  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 py-4">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-4 w-36" />
          </div>
          <Skeleton className="h-9 w-28 rounded-full" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
        </div>
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    );
  }

  const hasProcessing = processingStudies.length > 0;
  const hasPending = pendingTriageStudies.length > 0;
  const hasCompleted = completedReports.length > 0;

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-4 animate-fade-in">
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {isNewUser ? `Welcome, ${firstName}` : "Accelerated Triage"}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isNewUser ? "Let's get your first triage report" : "Upload → Analyze → Report"}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent/50 border border-border/50">
            <Coins className="h-3.5 w-3.5 text-primary" />
            <span className="text-sm font-semibold tabular-nums">{tokenBalance}</span>
            <span className="text-xs text-muted-foreground hidden sm:inline">tokens</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full"
            onClick={() => navigate("/app/wallet")}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* ─── How It Works (always visible, collapsible once familiar) ─── */}
      {isNewUser && (
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">How It Works</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {HOW_IT_WORKS.map((step, i) => (
                <div key={i} className="text-center space-y-2">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                    <step.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold">{step.label}</p>
                    <p className="text-[11px] text-muted-foreground">{step.desc}</p>
                  </div>
                  {i < HOW_IT_WORKS.length - 1 && (
                    <ChevronRight className="h-3 w-3 text-muted-foreground/40 absolute right-0 top-1/2 -translate-y-1/2 hidden" />
                  )}
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between">
              <button
                onClick={() => setShowOnboarding(true)}
                className="text-xs text-primary hover:underline underline-offset-2 flex items-center gap-1"
              >
                <HelpCircle className="h-3 w-3" />
                How do I export EDF from my EEG machine?
              </button>
              <Button
                size="sm"
                onClick={() => navigate("/app/studies")}
                className="gap-1.5 rounded-full"
              >
                <Upload className="h-3.5 w-3.5" />
                Upload First EEG
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Quick Stats (non-new users) ─── */}
      {!isNewUser && (
        <div className="grid grid-cols-3 gap-3">
          <Card className="border-border/50">
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold tabular-nums">{processingStudies.length}</p>
              <p className="text-[11px] text-muted-foreground">Processing</p>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold tabular-nums">{pendingTriageStudies.length}</p>
              <p className="text-[11px] text-muted-foreground">Awaiting Triage</p>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold tabular-nums">{completedReports.length}</p>
              <p className="text-[11px] text-muted-foreground">Reports Ready</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── Processing Studies ─── */}
      {hasProcessing && (
        <Card className="border-primary/20 bg-primary/5 overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-sm font-medium">Processing</span>
              <Badge variant="secondary" className="text-xs ml-auto">{processingStudies.length}</Badge>
            </div>
            <div className="space-y-3">
              {processingStudies.slice(0, 3).map((study) => {
                const meta = study.meta as any;
                const progress = study.triage_progress || 0;
                const statusLabel = progress < 30 ? "Preparing..." : progress < 70 ? "Analyzing EEG..." : "Generating report...";
                return (
                  <div key={study.id} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="truncate max-w-[200px] font-medium">
                        {meta?.patient_name || "Patient"}
                      </span>
                      <span className="text-xs text-muted-foreground">{statusLabel}</span>
                    </div>
                    <Progress value={progress} className="h-1.5" />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Pending Triage ─── */}
      {hasPending && (
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="h-4 w-4 text-amber-600" />
              <span className="text-sm font-medium">Ready for Triage</span>
              <Badge variant="secondary" className="text-xs ml-auto">{pendingTriageStudies.length}</Badge>
            </div>
            <div className="space-y-2">
              {pendingTriageStudies.slice(0, 5).map((study) => {
                const meta = study.meta as any;
                return (
                  <div
                    key={study.id}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-background/60 hover:bg-background transition-colors"
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
                      className="shrink-0 gap-1 rounded-full"
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

      {/* ─── Completed Reports ─── */}
      {hasCompleted && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span className="text-sm font-medium">Reports Ready</span>
              </div>
              {completedReports.length > 3 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate("/app/studies")}
                  className="text-xs h-7 gap-1"
                >
                  View All <ArrowRight className="h-3 w-3" />
                </Button>
              )}
            </div>
            <div className="space-y-1.5">
              {completedReports.slice(0, 3).map((study) => {
                const meta = study.meta as any;
                return (
                  <div
                    key={study.id}
                    onClick={() => navigate(`/app/studies/${study.id}`)}
                    className="flex items-center justify-between p-2.5 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
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
                          {study.sla !== "pending" && (
                            <>
                              <span className="mx-1">•</span>
                              {study.sla}
                            </>
                          )}
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

      {/* ─── Empty State (new user with tokens) ─── */}
      {isNewUser && (
        <Card className="border-dashed border-2">
          <CardContent className="p-8 text-center">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <img src={logoSrc} alt="ENCEPHLIAN" className="h-8 w-8" />
            </div>
            <h3 className="font-semibold text-lg mb-1">Your AI Triage Assistant</h3>
            <p className="text-sm text-muted-foreground mb-2 max-w-sm mx-auto">
              Upload an EEG recording and get an AI-accelerated triage report.
              Each standard analysis uses 1 token.
            </p>
            <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground mb-6">
              <span className="flex items-center gap-1"><Shield className="h-3 w-3" /> HIPAA Compliant</span>
              <span className="flex items-center gap-1"><BarChart3 className="h-3 w-3" /> 99.2% Uptime</span>
            </div>
            <Button
              size="lg"
              onClick={() => navigate("/app/studies")}
              className="gap-2 rounded-full"
            >
              <Upload className="h-4 w-4" />
              Upload Your First EEG
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ─── Primary CTA (non-empty) ─── */}
      {!isNewUser && (
        <Button
          size="lg"
          onClick={() => navigate("/app/studies")}
          className="w-full gap-2 h-12 rounded-full"
        >
          <Upload className="h-4 w-4" />
          Upload New Study
        </Button>
      )}

      {/* ─── Help Link ─── */}
      {!isNewUser && (
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => setShowOnboarding(true)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            <HelpCircle className="h-3 w-3" />
            How to export EDF from your EEG machine
          </button>
        </div>
      )}

      {/* ─── Modals ─── */}
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

      <PilotOnboarding
        open={showOnboarding}
        onOpenChange={setShowOnboarding}
      />
    </div>
  );
}
