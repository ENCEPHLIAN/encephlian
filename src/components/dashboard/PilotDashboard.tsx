import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Upload, FileText, Coins, ArrowRight, Plus,
  CheckCircle2, Clock, Loader2,
  HelpCircle, Brain, Shield, BarChart3, Eye,
  ChevronRight, Activity, AlertTriangle,
  ShieldCheck, AlertCircle as AbnormalIcon,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import dayjs from "dayjs";
import { supabase } from "@/integrations/supabase/client";
import { usePilotData, PilotStudy } from "@/hooks/usePilotData";
import { PilotInlineSla } from "@/components/pilot/PilotInlineSla";
import RefundDialog from "@/components/dashboard/RefundDialog";
import PilotOnboarding from "@/components/pilot/PilotOnboarding";
import SampleReportPreview from "@/components/pilot/SampleReportPreview";
import { toast } from "sonner";
import { useUserSession } from "@/contexts/UserSessionContext";
import { cn } from "@/lib/utils";

/* ─── Value Proposition Steps ─── */
const VALUE_STEPS = [
  {
    icon: Upload,
    label: "Upload",
    desc: "Drop an .EDF file",
    time: "30 sec",
  },
  {
    icon: Brain,
    label: "AI Analysis",
    desc: "MIND® processes it",
    time: "~15 min",
  },
  {
    icon: FileText,
    label: "Triage Report",
    desc: "Clinically structured PDF",
    time: "Instant",
  },
];

/* ─── Status helpers ─── */
function getProgressLabel(progress: number): string {
  if (progress < 15) return "Queuing...";
  if (progress < 35) return "Preprocessing signals...";
  if (progress < 60) return "Running AI analysis...";
  if (progress < 85) return "Generating report...";
  return "Finalizing...";
}

function getProgressColor(progress: number): string {
  if (progress < 35) return "text-blue-500";
  if (progress < 70) return "text-primary";
  return "text-emerald-500";
}

export default function PilotDashboard() {
  const navigate = useNavigate();
  const { profile } = useUserSession();
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [refundStudy, setRefundStudy] = useState<PilotStudy | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showSampleReport, setShowSampleReport] = useState(false);

  const {
    studies,
    isLoading,
    tokenBalance,
    pending: pendingTriageStudies,
    processing: processingStudies,
    completed: completedReports,
    failed: failedStudies,
    refetchStudies,
  } = usePilotData();

  const handleInsufficientTokens = useCallback(() => {
    toast.error("Not enough tokens", {
      description: "Add tokens to start triage.",
      action: {
        label: "Add Tokens",
        onClick: () => navigate("/app/wallet"),
      },
    });
  }, [navigate]);

  const handleDownload = useCallback(async (study: PilotStudy) => {
    const triggerDownload = (blob: Blob, name: string) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    };
    try {
      const { data: report } = await supabase
        .from("reports").select("pdf_path, id").eq("study_id", study.id).maybeSingle();
      if (report?.pdf_path) {
        const { data, error } = await supabase.storage.from("eeg-reports").download(report.pdf_path);
        if (!error && data) { triggerDownload(data, `report-${study.id.slice(0, 8)}.pdf`); toast.success("Download started"); return; }
      }
      if (report?.id) {
        await supabase.functions.invoke("generate_report_pdf", { body: { reportId: report.id } });
        const { data: fresh } = await supabase.from("reports").select("pdf_path").eq("id", report.id).single();
        if (fresh?.pdf_path) {
          const { data, error } = await supabase.storage.from("eeg-reports").download(fresh.pdf_path);
          if (!error && data) { triggerDownload(data, `report-${study.id.slice(0, 8)}.pdf`); toast.success("Download started"); return; }
        }
      }
      // Fallback: generate HTML from ai_draft_json
      const raw = study.ai_draft_json as any;
      if (raw) {
        const meta = study.meta as any;
        const cls = raw.classification ?? raw.triage?.classification;
        const score = raw.score || {};
        const impression = score.impression || raw.triage?.summary || "";
        const action = score.recommended_action || raw.triage?.action || "";
        const bg = score.background_activity || {};
        const bgText = [bg.dominant_rhythm && `Dominant rhythm: ${bg.dominant_rhythm}`, bg.amplitude && `Amplitude: ${bg.amplitude}`].filter(Boolean).join("\n");
        const sections = [
          { h: "Classification", t: cls ? cls.charAt(0).toUpperCase() + cls.slice(1) : null },
          { h: "Background Activity", t: bgText || null },
          { h: "Impression", t: impression || null },
          { h: "Recommended Action", t: action || null },
        ].filter((s): s is { h: string; t: string } => !!s.t);
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Triage Report</title><style>body{font-family:Georgia,serif;max-width:720px;margin:40px auto;color:#111;line-height:1.7}h1{font-size:1.4rem;border-bottom:2px solid #111;padding-bottom:8px}h2{font-size:.95rem;font-weight:700;margin-top:1.4rem;text-transform:uppercase;letter-spacing:.04em}.meta{color:#555;font-size:.85rem;margin-bottom:1.5rem}p{white-space:pre-wrap;margin:0;font-size:.95rem}.footer{margin-top:2rem;padding-top:1rem;border-top:1px solid #ddd;font-size:.75rem;color:#999}@media print{body{margin:20mm}}</style></head><body><h1>ENCEPHLIAN™ Triage Report</h1><div class="meta"><strong>Patient:</strong> ${meta?.patient_name || "Unknown"}<br><strong>Date:</strong> ${dayjs(study.triage_completed_at || study.created_at).format("MMMM D, YYYY")}<br><strong>Study ID:</strong> ${study.id.slice(0, 8).toUpperCase()}</div>${sections.map(s => `<h2>${s.h}</h2><p>${s.t}</p>`).join("")}<div class="footer">ENCEPHLIAN™ · AI triage · For physician review only</div></body></html>`;
        triggerDownload(new Blob([html], { type: "text/html" }), `report-${study.id.slice(0, 8)}.html`);
        toast.success("Report downloaded", { description: "Open the .html file and print to PDF" });
        return;
      }
      toast.error("Report not available yet");
    } catch { toast.error("Download failed"); }
  }, []);

  const firstName = profile?.full_name?.split(" ")[0] || "Doctor";
  const isNewUser = !isLoading && studies.length === 0;

  /* ─── Loading skeleton ─── */
  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto space-y-5 py-4 px-1">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="h-9 w-24 rounded-full" />
        </div>
        <Skeleton className="h-44 w-full rounded-2xl" />
        <div className="grid grid-cols-3 gap-3">
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
        </div>
        <Skeleton className="h-28 w-full rounded-xl" />
      </div>
    );
  }

  const hasProcessing = processingStudies.length > 0;
  const hasPending = pendingTriageStudies.length > 0;
  const hasCompleted = completedReports.length > 0;
  const hasFailed = (failedStudies?.length ?? 0) > 0;
  const totalActive = processingStudies.length + pendingTriageStudies.length;

  return (
    <div className="max-w-2xl mx-auto space-y-5 py-4 px-1 animate-fade-in">
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {isNewUser
              ? `Welcome, ${firstName} 👋`
              : `Good ${getTimeGreeting()}, ${firstName}`}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isNewUser
              ? "Get your first AI triage report in minutes"
              : totalActive > 0
              ? `${totalActive} active • ${completedReports.length} completed`
              : `${completedReports.length} reports completed`}
          </p>
        </div>
        <TokenChip
          balance={tokenBalance}
          onAdd={() => navigate("/app/wallet")}
        />
      </div>

      {/* ─── New User: Full Value Showcase ─── */}
      {isNewUser && (
        <>
          {/* Hero value card */}
          <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/5 via-transparent to-primary/3">
            <CardContent className="p-5 space-y-5">
              {/* Value steps */}
              <div className="grid grid-cols-3 gap-2">
                {VALUE_STEPS.map((step, i) => (
                  <div key={i} className="text-center space-y-2 relative">
                    <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center mx-auto">
                      <step.icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold">{step.label}</p>
                      <p className="text-[10px] text-muted-foreground leading-tight">
                        {step.desc}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className="text-[9px] px-1.5 py-0 mx-auto"
                    >
                      {step.time}
                    </Badge>
                    {i < VALUE_STEPS.length - 1 && (
                      <ChevronRight className="h-3 w-3 text-muted-foreground/30 absolute -right-1 top-4 hidden sm:block" />
                    )}
                  </div>
                ))}
              </div>

              {/* CTA row */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <Button
                  onClick={() => navigate("/app/studies")}
                  className="flex-1 gap-2 rounded-full h-11"
                >
                  <Upload className="h-4 w-4" />
                  Upload Your First EEG
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowSampleReport(true)}
                  className="flex-1 gap-2 rounded-full h-11"
                >
                  <Eye className="h-4 w-4" />
                  See Sample Report
                </Button>
              </div>

              {/* Trust signals */}
              <div className="flex items-center justify-center gap-4 text-[10px] text-muted-foreground pt-1">
                <span className="flex items-center gap-1">
                  <Shield className="h-3 w-3" /> HIPAA Compliant
                </span>
                <span className="flex items-center gap-1">
                  <BarChart3 className="h-3 w-3" /> 99.2% Uptime
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" /> 48h Refund Guarantee
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Quick help */}
          <button
            onClick={() => setShowOnboarding(true)}
            className="w-full text-left p-3 rounded-xl border border-border/50 hover:border-primary/30 hover:bg-primary/5 transition-all flex items-center gap-3"
          >
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <HelpCircle className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">
                How do I export EDF from my EEG machine?
              </p>
              <p className="text-xs text-muted-foreground">
                Step-by-step guides for Natus, Nihon Kohden, Compumedics & more
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </button>
        </>
      )}

      {/* ─── Returning User: Quick Stats ─── */}
      {!isNewUser && (
        <div className="grid grid-cols-3 gap-3">
          <StatCard
            value={processingStudies.length}
            label="Processing"
            accent={processingStudies.length > 0}
            icon={<Loader2 className={cn("h-4 w-4", processingStudies.length > 0 && "animate-spin text-primary")} />}
          />
          <StatCard
            value={pendingTriageStudies.length}
            label="Awaiting Triage"
            accent={pendingTriageStudies.length > 0}
            icon={<Clock className={cn("h-4 w-4", pendingTriageStudies.length > 0 && "text-amber-500")} />}
          />
          <StatCard
            value={completedReports.length}
            label="Reports"
            icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
          />
        </div>
      )}

      {/* ─── Processing Studies (live progress) ─── */}
      {hasProcessing && (
        <Card className="border-primary/20 bg-primary/5 overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="h-4 w-4 text-primary animate-pulse" />
              <span className="text-sm font-semibold">Live Analysis</span>
              <Badge variant="secondary" className="text-[10px] ml-auto tabular-nums">
                {processingStudies.length} active
              </Badge>
            </div>
            <div className="space-y-3">
              {processingStudies.slice(0, 3).map((study) => {
                const meta = study.meta as any;
                const progress = study.triage_progress || 0;
                return (
                  <div key={study.id} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium truncate max-w-[180px]">
                        {meta?.patient_name || "Patient"}
                      </span>
                      <span
                        className={cn(
                          "text-xs font-medium tabular-nums",
                          getProgressColor(progress)
                        )}
                      >
                        {progress}%
                      </span>
                    </div>
                    <Progress value={progress} className="h-1.5" />
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-muted-foreground">
                        {getProgressLabel(progress)}
                      </span>
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                        {study.sla}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Zero-token prompt when studies are waiting ─── */}
      {hasPending && tokenBalance === 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
              <Coins className="h-5 w-5 text-destructive" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">No tokens — {pendingTriageStudies.length} {pendingTriageStudies.length === 1 ? "study" : "studies"} waiting</p>
              <p className="text-xs text-muted-foreground">Standard triage · 1 token &nbsp;·&nbsp; Priority · 2 tokens</p>
            </div>
            <Button size="sm" className="rounded-full shrink-0 gap-1.5" onClick={() => navigate("/app/wallet")}>
              <Plus className="h-3.5 w-3.5" />
              Add Tokens
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ─── Pending Triage — 1-tap action ─── */}
      {hasPending && (
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <span className="text-sm font-semibold">Ready for Triage</span>
              <Badge
                variant="secondary"
                className="text-[10px] ml-auto tabular-nums"
              >
                {pendingTriageStudies.length}
              </Badge>
            </div>
            <div className="space-y-2">
              {pendingTriageStudies.slice(0, 5).map((study) => {
                const meta = study.meta as any;
                return (
                  <div
                    key={study.id}
                    className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-3 rounded-xl bg-background/80 hover:bg-background transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-9 w-9 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                        <FileText className="h-4 w-4 text-amber-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {meta?.patient_name || "Unknown Patient"}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {dayjs(study.created_at).format("MMM D, h:mm A")}
                          {meta?.edf_num_channels && (
                            <>
                              <span className="mx-1">·</span>
                              {meta.edf_num_channels}ch
                            </>
                          )}
                        </p>
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
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span className="text-sm font-semibold">Reports Ready</span>
              </div>
              {completedReports.length > 3 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate("/app/studies")}
                  className="text-xs h-7 gap-1 text-muted-foreground"
                >
                  View All
                  <ArrowRight className="h-3 w-3" />
                </Button>
              )}
            </div>
            <div className="space-y-1">
              {completedReports.slice(0, 4).map((study) => {
                const meta = study.meta as any;
                const report = study.ai_draft_json;
                const cls = report?.classification ?? report?.triage?.classification ?? null;
                const conf = report?.triage_confidence ?? report?.triage?.confidence ?? null;
                const isNormal = cls === "normal";
                const isAbnormal = cls === "abnormal";
                return (
                  <div
                    key={study.id}
                    onClick={() => navigate(`/app/studies/${study.id}`)}
                    className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-muted/50 transition-colors cursor-pointer group"
                  >
                    <div className={cn(
                      "h-9 w-9 rounded-lg flex items-center justify-center shrink-0",
                      isNormal ? "bg-emerald-500/10" :
                      isAbnormal ? "bg-red-500/10" : "bg-emerald-500/10"
                    )}>
                      {isNormal
                        ? <ShieldCheck className="h-4 w-4 text-emerald-500" />
                        : isAbnormal
                        ? <AbnormalIcon className="h-4 w-4 text-red-500" />
                        : <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">
                          {meta?.patient_name || "Patient"}
                        </p>
                        {cls && (
                          <Badge className={cn(
                            "text-[9px] px-1.5 py-0 shrink-0",
                            isNormal
                              ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                              : "bg-red-500/10 text-red-600 border-red-500/20"
                          )}>
                            {isNormal ? "Normal" : "Abnormal"}
                            {typeof conf === "number" && conf > 0 && (
                              <span className="ml-1 opacity-60">{Math.round(conf * 100)}%</span>
                            )}
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {dayjs(study.triage_completed_at || study.created_at).format("MMM D, h:mm A")}
                        {study.sla !== "pending" && (
                          <>
                            <span className="mx-1">·</span>
                            {study.sla}
                          </>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => { e.stopPropagation(); void handleDownload(study); }}
                        title="Download report"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-foreground transition-colors" />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Failed Studies ─── */}
      {hasFailed && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <AbnormalIcon className="h-4 w-4 text-red-400 shrink-0" />
              <p className="text-sm font-semibold text-red-400">
                {failedStudies!.length} {failedStudies!.length === 1 ? "study" : "studies"} failed
              </p>
              <span className="ml-auto text-[10px] text-muted-foreground">Pipeline error — tokens not charged</span>
            </div>
            {failedStudies!.slice(0, 3).map((study) => {
              const meta = study.meta as any;
              const name = meta?.patient_name || meta?.patient_id || "Unknown patient";
              return (
                <div key={study.id} className="flex items-center gap-3 rounded-lg border border-red-500/20 bg-background/50 p-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {study.original_format?.toUpperCase() || "EEG"} · {new Date(study.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 border-red-500/30 text-red-400 hover:bg-red-500/10 h-7 text-xs"
                    onClick={() => navigate(`/app/studies/${study.id}`)}
                  >
                    Details
                  </Button>
                </div>
              );
            })}
            {failedStudies!.length > 3 && (
              <p className="text-xs text-muted-foreground text-center">+{failedStudies!.length - 3} more — check Studies page</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─── Primary Upload CTA (returning users) ─── */}
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

      {/* ─── Help link (returning users) ─── */}
      {!isNewUser && (
        <div className="flex items-center justify-center gap-3 text-xs">
          <button
            onClick={() => setShowOnboarding(true)}
            className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            <HelpCircle className="h-3 w-3" />
            EDF Export Guide
          </button>
          <span className="text-border">·</span>
          <button
            onClick={() => setShowSampleReport(true)}
            className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            <Eye className="h-3 w-3" />
            Sample Report
          </button>
        </div>
      )}

      {/* ─── Modals ─── */}
      <RefundDialog
        open={refundDialogOpen}
        onOpenChange={setRefundDialogOpen}
        study={refundStudy}
      />

      <PilotOnboarding
        open={showOnboarding}
        onOpenChange={setShowOnboarding}
      />

      <SampleReportPreview
        open={showSampleReport}
        onOpenChange={setShowSampleReport}
      />
    </div>
  );
}

/* ─── Sub-components ─── */

function TokenChip({
  balance,
  onAdd,
}: {
  balance: number;
  onAdd: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <div
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border/50",
          balance === 0
            ? "bg-destructive/10 border-destructive/30"
            : "bg-accent/50"
        )}
      >
        <Coins
          className={cn(
            "h-3.5 w-3.5",
            balance === 0 ? "text-destructive" : "text-primary"
          )}
        />
        <span className="text-sm font-semibold tabular-nums">{balance}</span>
        <span className="text-[10px] text-muted-foreground hidden sm:inline">
          tokens
        </span>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 rounded-full"
        onClick={onAdd}
      >
        <Plus className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function StatCard({
  value,
  label,
  icon,
  accent,
}: {
  value: number;
  label: string;
  icon: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <Card
      className={cn(
        "border-border/50 transition-colors",
        accent && "border-primary/20 bg-primary/5"
      )}
    >
      <CardContent className="p-3 text-center space-y-1">
        <div className="flex justify-center">{icon}</div>
        <p className="text-2xl font-bold tabular-nums">{value}</p>
        <p className="text-[10px] text-muted-foreground leading-tight">
          {label}
        </p>
      </CardContent>
    </Card>
  );
}

function getTimeGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}
