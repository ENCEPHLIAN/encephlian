import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Loader2, Clock, Zap, CheckCircle2, AlertCircle,
  Brain, FileText, Activity, User, Sparkles, ArrowRight,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { selectSlaAndStartPipeline } from "@/lib/analysisPipeline";
import { triageTokensForSla } from "@/shared/tokenEconomy";
import { supabase } from "@/integrations/supabase/client";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";

dayjs.extend(duration);

/* ── Types ──────────────────────────────────────────────── */

interface Study {
  id: string;
  meta: any;
  sla?: string;
  created_at?: string;
  duration_min?: number;
  original_format?: string | null;
}

interface SlaSelectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  study: Study | null;
  tokenBalance: number;
  onInsufficientTokens: () => void;
  isPilot?: boolean;
}

type SlaChoice = "TAT" | "STAT";

const MIND_CAPABILITIES = [
  "Background rhythm classification (normal / abnormal)",
  "Epileptiform discharge detection",
  "Artifact quantification & quality score",
  "Sleep staging (if present)",
  "Clinical impression generation",
];

const SLA_OPTIONS: Array<{
  value: SlaChoice;
  label: string;
  sublabel: string;
  turnaround: string;
  tokens: number;
  icon: any;
  accent: string;
  accentBg: string;
  accentBorder: string;
}> = [
  {
    value: "TAT",
    label: "Standard",
    sublabel: "Routine clinical triage",
    turnaround: "12–24 h",
    tokens: 1,
    icon: Clock,
    accent: "text-blue-600 dark:text-blue-400",
    accentBg: "bg-blue-500/8 hover:bg-blue-500/12",
    accentBorder: "border-blue-500/30 data-[selected=true]:border-blue-500/60 data-[selected=true]:ring-2 data-[selected=true]:ring-blue-500/20",
  },
  {
    value: "STAT",
    label: "Priority",
    sublabel: "Time-sensitive / critical",
    turnaround: "30–90 min",
    tokens: 2,
    icon: Zap,
    accent: "text-red-600 dark:text-red-400",
    accentBg: "bg-red-500/8 hover:bg-red-500/12",
    accentBorder: "border-red-500/30 data-[selected=true]:border-red-500/60 data-[selected=true]:ring-2 data-[selected=true]:ring-red-500/20",
  },
];

/* ── Token balance bar ──────────────────────────────────── */

function TokenBar({
  balance,
  cost,
  max = 25,
}: {
  balance: number;
  cost: number;
  max?: number;
}) {
  const pctBefore = Math.min(100, (balance / max) * 100);
  const pctAfter  = Math.min(100, (Math.max(0, balance - cost) / max) * 100);
  const insufficient = balance < cost;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Token balance</span>
        <span className={cn("font-semibold tabular-nums", insufficient ? "text-destructive" : "text-foreground")}>
          {balance} → <span className={insufficient ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}>{Math.max(0, balance - cost)}</span>
          <span className="text-muted-foreground font-normal ml-1">remaining</span>
        </span>
      </div>
      <div className="relative h-2 w-full rounded-full bg-muted overflow-hidden">
        {/* after-deduction fill */}
        <div
          className={cn(
            "absolute left-0 top-0 h-full rounded-full transition-all duration-500",
            insufficient ? "bg-destructive/40" : "bg-emerald-500/60"
          )}
          style={{ width: `${pctAfter}%` }}
        />
        {/* current balance overlay */}
        <div
          className="absolute left-0 top-0 h-full rounded-full transition-all duration-300 bg-primary/70"
          style={{ width: `${pctBefore}%`, opacity: 0.5 }}
        />
        {/* cost marker */}
        <div
          className={cn(
            "absolute top-0 h-full w-[3px] rounded-sm transition-all duration-300",
            insufficient ? "bg-destructive" : "bg-primary"
          )}
          style={{ left: `${pctAfter}%`, transform: "translateX(-50%)" }}
        />
      </div>
    </div>
  );
}

/* ── Main modal ─────────────────────────────────────────── */

export default function SlaSelectionModal({
  open,
  onOpenChange,
  study,
  tokenBalance,
  onInsufficientTokens,
  isPilot = false,
}: SlaSelectionModalProps) {
  const [selected, setSelected] = useState<SlaChoice>("TAT");
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!open) {
      setConfirming(false);
      setSelected("TAT");
      setSubmitting(false);
    }
  }, [open]);

  const cost = triageTokensForSla(selected);
  const balanceAfter = tokenBalance - cost;
  const insufficient = tokenBalance < cost;

  const meta = (study?.meta || {}) as Record<string, any>;
  const patientName  = meta.patient_name  || meta.patientName  || "Unknown Patient";
  const patientAge   = meta.patient_age   || meta.patientAge;
  const patientGender = meta.patient_gender || meta.patientGender;
  const indication   = meta.indication    || meta.clinical_indication;
  const durationMin  = study?.duration_min;
  const format       = study?.original_format || meta.original_format;
  const uploadedAt   = study?.created_at ? dayjs(study.created_at).fromNow() : null;

  const submitTriage = async () => {
    if (!study) return;
    setSubmitting(true);
    try {
      if (isPilot) {
        if (insufficient) { onInsufficientTokens(); return; }
        const result = await selectSlaAndStartPipeline(study.id, selected);
        if (!result.success) {
          if (result.error === "insufficient_tokens") {
            toast.error("Not enough tokens", { description: "Top up your wallet to continue." });
            onInsufficientTokens();
            return;
          }
          throw new Error(result.error || "Failed to start triage");
        }
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["wallet-balance"] }),
          queryClient.invalidateQueries({ queryKey: ["wallet-balance-studies"] }),
          queryClient.invalidateQueries({ queryKey: ["pilot-studies"] }),
          queryClient.invalidateQueries({ queryKey: ["dashboard-studies"] }),
          queryClient.invalidateQueries({ queryKey: ["studies-list"] }),
          queryClient.invalidateQueries({ queryKey: ["study-detail", study.id] }),
        ]);
        toast.success("Analysis started", {
          description: `${result.tokens_deducted} token${result.tokens_deducted !== 1 ? "s" : ""} deducted · ${result.new_balance} remaining`,
          duration: 5000,
          action: { label: "View study", onClick: () => window.location.assign(`/app/studies/${study.id}`) },
        });
      } else {
        // Internal: SLA selection recorded server-side, no token deduction
        const { error } = await supabase.functions.invoke("generate_ai_report", {
          body: { study_id: study.id, sla: selected },
        });
        if (error) throw error;
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["dashboard-studies"] }),
          queryClient.invalidateQueries({ queryKey: ["studies-list"] }),
          queryClient.invalidateQueries({ queryKey: ["study-detail", study.id] }),
        ]);
        toast.success("Analysis started", {
          description: `${selected === "STAT" ? "Priority" : "Standard"} · pipeline running`,
          duration: 5000,
          action: { label: "View study", onClick: () => window.location.assign(`/app/studies/${study.id}`) },
        });
      }
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to start triage");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSelect = (sla: SlaChoice) => {
    setSelected(sla);
    setConfirming(false);
  };

  const handlePrimary = () => {
    if (isPilot && insufficient) { onInsufficientTokens(); return; }
    if (selected === "STAT" && !confirming) { setConfirming(true); return; }
    void submitTriage();
  };

  /* ── Pilot: lean two-card layout (unchanged behaviour) ── */
  if (isPilot) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg z-[100]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              {confirming ? "Confirm Analysis" : "Start AI Analysis"}
            </DialogTitle>
          </DialogHeader>

          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
            <span className="text-sm font-medium">Token Balance</span>
            <Badge variant="secondary" className="text-base font-bold">{tokenBalance}</Badge>
          </div>

          {!confirming ? (
            <div className="grid grid-cols-2 gap-4 mt-1">
              {SLA_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const noTokens = tokenBalance < opt.tokens;
                return (
                  <div
                    key={opt.value}
                    className={cn(
                      "p-4 rounded-xl border-2 cursor-pointer transition-all text-center space-y-3",
                      noTokens ? "opacity-50 pointer-events-none" : "",
                      selected === opt.value
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-border hover:border-primary/40"
                    )}
                    onClick={() => !noTokens && handleSelect(opt.value)}
                  >
                    <div className={cn("mx-auto w-12 h-12 rounded-full flex items-center justify-center", opt.accentBg)}>
                      <Icon className={cn("h-5 w-5", opt.accent)} />
                    </div>
                    <div>
                      <p className="font-semibold">{opt.label}</p>
                      <Badge variant={opt.value === "STAT" ? "destructive" : "outline"} className="mt-1">
                        {opt.tokens} Token{opt.tokens > 1 ? "s" : ""}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{opt.turnaround}</p>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3 p-4 rounded-lg border bg-muted/30">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Priority</span>
                <Badge variant="destructive">STAT</Badge>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tokens</span>
                <span className="font-semibold">2</span>
              </div>
              <div className="flex justify-between text-sm pt-2 border-t">
                <span className="text-muted-foreground">Balance after</span>
                <span className="font-semibold">{balanceAfter}</span>
              </div>
            </div>
          )}

          <div className="flex gap-3 mt-1">
            <Button variant="outline" className="flex-1" onClick={() => confirming ? setConfirming(false) : onOpenChange(false)} disabled={submitting}>
              {confirming ? "Back" : "Cancel"}
            </Button>
            <Button className="flex-1" onClick={handlePrimary} disabled={submitting || insufficient}>
              {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              {confirming ? "Confirm" : selected === "STAT" ? "Review →" : "Begin Analysis"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  /* ── Internal: rich two-panel layout ────────────────────── */
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl p-0 overflow-hidden z-[100]">
        <div className="flex flex-col sm:flex-row min-h-0">

          {/* ── Left panel: study context ── */}
          <div className="sm:w-56 bg-muted/40 border-b sm:border-b-0 sm:border-r border-border/50 p-5 flex flex-col gap-4 shrink-0">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 mb-2">
                Study
              </p>
              <div className="flex items-start gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Brain className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm leading-tight truncate">{patientName}</p>
                  {(patientAge || patientGender) && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {[patientAge && `${patientAge}y`, patientGender?.charAt(0).toUpperCase()].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              {durationMin && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Activity className="h-3.5 w-3.5 shrink-0" />
                  <span>{durationMin} min recording</span>
                </div>
              )}
              {format && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <FileText className="h-3.5 w-3.5 shrink-0" />
                  <span className="uppercase">{format}</span>
                </div>
              )}
              {indication && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <User className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate" title={indication}>{indication}</span>
                </div>
              )}
              {uploadedAt && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  <span>Uploaded {uploadedAt}</span>
                </div>
              )}
            </div>

            {/* What MIND analyses */}
            <div className="mt-auto">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 mb-2">
                Pipeline processes
              </p>
              <ul className="space-y-1">
                {MIND_CAPABILITIES.map((cap) => (
                  <li key={cap} className="flex items-start gap-1.5 text-[10px] text-muted-foreground">
                    <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0 mt-0.5" />
                    <span className="leading-snug">{cap}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* ── Right panel: priority selection ── */}
          <div className="flex-1 p-5 flex flex-col gap-5">
            <div>
              <h2 className="font-semibold text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Start Analysis
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Choose turnaround priority.
              </p>
            </div>

            {/* SLA option cards */}
            <div className="grid grid-cols-2 gap-3">
              {SLA_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const isSelected = selected === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    data-selected={isSelected}
                    onClick={() => handleSelect(opt.value)}
                    className={cn(
                      "relative p-4 rounded-xl border-2 text-left transition-all cursor-pointer",
                      "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                      opt.accentBorder,
                      isSelected ? opt.accentBg : "hover:bg-muted/50"
                    )}
                  >
                    {isSelected && (
                      <CheckCircle2 className={cn("absolute top-2.5 right-2.5 h-3.5 w-3.5", opt.accent)} />
                    )}
                    <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center mb-2.5", opt.accentBg)}>
                      <Icon className={cn("h-4 w-4", opt.accent)} />
                    </div>
                    <p className="font-semibold text-sm">{opt.label}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{opt.sublabel}</p>
                    <div className="flex items-center justify-between mt-3">
                      <Badge variant="outline" className="text-[10px] h-5 px-1.5 text-emerald-600 border-emerald-500/40">
                        Internal
                      </Badge>
                      <span className="text-[10px] text-muted-foreground font-mono">{opt.turnaround}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* STAT confirmation */}
            {confirming && (
              <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/8 p-3">
                <Zap className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Confirm Priority run</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Priority analysis typically completes in 30–90 minutes.
                  </p>
                </div>
              </div>
            )}

            {/* CTA */}
            <div className="flex items-center gap-3 mt-auto pt-1">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => confirming ? setConfirming(false) : onOpenChange(false)}
                disabled={submitting}
              >
                {confirming ? "← Back" : "Cancel"}
              </Button>
              <Button
                className="flex-1 gap-2"
                onClick={handlePrimary}
                disabled={submitting}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="h-4 w-4" />
                )}
                {submitting
                  ? "Starting…"
                  : confirming
                  ? "Confirm Priority"
                  : selected === "STAT"
                  ? "Review →"
                  : "Start Standard"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
