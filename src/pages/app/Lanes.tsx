import { useMemo, memo, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Loader2, Upload, Clock, Brain, Eye, CheckCircle2,
  ArrowRight, AlertTriangle, Zap, Inbox, RefreshCw, WifiOff,
  ShieldCheck, AlertCircle
} from "lucide-react";
import { cn } from "@/lib/utils";
import dayjs from "dayjs";
import { useStudiesData, Study } from "@/hooks/useStudiesData";
import { formatStudySourceLine } from "@/lib/studySourceFile";
import { getStudyHandle } from "@/lib/studyDisplay";

/* ── SLA config ─────────────────────────────────── */

const SLA_CONFIG = {
  STAT: { label: "STAT", priority: 1, targetHours: 1 },
  "24H": { label: "24H", priority: 2, targetHours: 24 },
  "48H": { label: "48H", priority: 3, targetHours: 48 },
  ROUTINE: { label: "Routine", priority: 4, targetHours: 72 },
} as const;

type SLAKey = keyof typeof SLA_CONFIG;

/* ── Triage stages ──────────────────────────────── */

const TRIAGE_STAGES = [
  { id: "uploaded",   label: "Uploaded",   icon: Upload,       description: "Awaiting SLA selection" },
  { id: "processing", label: "Processing", icon: Brain,        description: "Analysis in progress" },
  { id: "ai_draft",   label: "Draft",      icon: Eye,          description: "Ready for review" },
  { id: "in_review",  label: "In Review",  icon: Clock,        description: "Under physician review" },
  { id: "signed",     label: "Signed",     icon: CheckCircle2, description: "Report finalized" },
] as const;

/* ── Time helpers ───────────────────────────────── */

function getTimeInfo(study: Study): { remaining: number; overdue: boolean; formatted: string } {
  const slaConfig = SLA_CONFIG[study.sla as SLAKey] || SLA_CONFIG.ROUTINE;
  const startTime = study.sla_selected_at || study.created_at;
  const deadline = dayjs(startTime).add(slaConfig.targetHours, "hour");
  const now = dayjs();
  const remaining = deadline.diff(now, "minute");
  const overdue = remaining < 0;

  let formatted: string;
  if (overdue) {
    const m = Math.abs(remaining);
    formatted = m >= 60 ? `${Math.floor(m / 60)}h overdue` : `${m}m overdue`;
  } else {
    formatted = remaining >= 60 ? `${Math.floor(remaining / 60)}h left` : `${remaining}m left`;
  }

  return { remaining, overdue, formatted };
}

/* ── Study card ─────────────────────────────────── */

function getClassification(study: Study): { cls: string | null; conf: number | null } {
  const report = (study as any).ai_draft_json;
  if (!report) return { cls: null, conf: null };
  const cls = report.classification ?? report.triage?.classification ?? null;
  const conf = report.triage_confidence ?? report.triage?.confidence ?? null;
  return { cls, conf };
}

const StudyCard = memo(function StudyCard({ study }: { study: Study }) {
  const navigate = useNavigate();
  const meta = study.meta as any;
  const timeInfo = getTimeInfo(study);
  const isProcessing = study.triage_status === "processing";
  const { cls, conf } = getClassification(study);
  const isNormal = cls === "normal";
  const isAbnormal = cls === "abnormal";
  const hasClassification = cls && cls !== "unknown";

  const patientAge = meta?.patient_age;
  const patientGender = meta?.patient_gender;
  const ageGenderStr = [
    patientAge ? `${patientAge}y` : null,
    patientGender ? patientGender.charAt(0).toUpperCase() : null,
  ].filter(Boolean).join("/");

  const isStat = study.sla === "STAT";
  const srcLine = formatStudySourceLine(meta, study.original_format ?? null);
  const handle = getStudyHandle(study);

  return (
    <Card
      className={cn(
        "transition-all duration-150 cursor-pointer group hover:shadow-md",
        timeInfo.overdue ? "border-destructive/40" :
        isAbnormal ? "border-red-500/25 hover:border-red-500/40" :
        isNormal   ? "border-emerald-500/25 hover:border-emerald-500/40" :
                     "hover:border-primary/20"
      )}
      onClick={() => navigate(`/app/studies/${study.id}`)}
    >
      <CardContent className="p-3 space-y-2">
        {/* Row 1: Patient + SLA */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-sm leading-tight truncate text-foreground">
              {meta?.patient_name || "Unknown Patient"}
            </p>
            {ageGenderStr && (
              <p className="text-xs text-muted-foreground mt-0.5">{ageGenderStr}</p>
            )}
          </div>
          <Badge
            variant={isStat ? "destructive" : "secondary"}
            className="shrink-0 text-[10px] font-mono px-1.5 py-0"
          >
            {isStat && <Zap className="h-2.5 w-2.5 mr-0.5" />}
            {study.sla}
          </Badge>
        </div>

        {/* Row 2: Patient ID */}
        <p className="text-[10px] font-mono text-muted-foreground truncate" title={handle}>{handle}</p>
        <p className="text-[11px] text-muted-foreground truncate">
          {meta?.patient_id || "—"}
        </p>
        {srcLine && (
          <p className="text-[10px] text-muted-foreground/90 truncate" title={srcLine}>
            {srcLine}
          </p>
        )}

        {/* Row 3: Progress bar (processing only) */}
        {isProcessing && (
          <div className="flex items-center gap-2">
            {study.triage_progress && study.triage_progress > 0 ? (
              <>
                <Progress value={study.triage_progress} className="h-1 flex-1" />
                <span className="text-[10px] text-muted-foreground font-mono w-7 text-right">
                  {study.triage_progress}%
                </span>
              </>
            ) : (
              <div className="relative h-1 flex-1 rounded-full bg-secondary overflow-hidden">
                <div className="absolute inset-y-0 left-0 bg-purple-500/70 rounded-full animate-progress-indeterminate" />
              </div>
            )}
          </div>
        )}

        {/* Row 4: Classification badge + Time + Arrow */}
        <div className="flex items-center justify-between gap-1">
          {hasClassification ? (
            <Badge className={cn(
              "text-[10px] px-1.5 py-0 h-4 gap-0.5",
              isNormal
                ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                : "bg-red-500/10 text-red-600 border-red-500/20"
            )}>
              {isNormal
                ? <ShieldCheck className="h-2.5 w-2.5" />
                : <AlertCircle className="h-2.5 w-2.5" />}
              {isNormal ? "Normal" : "Abnormal"}
              {typeof conf === "number" && conf > 0 && (
                <span className="opacity-60 ml-0.5">{Math.round(conf * 100)}%</span>
              )}
            </Badge>
          ) : (
            <span
              className={`text-[11px] font-medium ${
                timeInfo.overdue ? "text-destructive" : "text-muted-foreground"
              }`}
            >
              {timeInfo.overdue && <AlertTriangle className="h-3 w-3 inline mr-0.5 -mt-0.5" />}
              {timeInfo.formatted}
            </span>
          )}
          <div className="flex items-center gap-1 ml-auto">
            {hasClassification && (
              <span className={`text-[10px] ${timeInfo.overdue ? "text-destructive" : "text-muted-foreground/70"}`}>
                {timeInfo.overdue && <AlertTriangle className="h-2.5 w-2.5 inline mr-0.5" />}
                {timeInfo.formatted}
              </span>
            )}
            <ArrowRight className="h-3 w-3 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
});

/* ── Kanban column ──────────────────────────────── */

function KanbanColumn({
  stage,
  studies,
  index,
}: {
  stage: typeof TRIAGE_STAGES[number];
  studies: Study[];
  index: number;
}) {
  const Icon = stage.icon;
  const count = studies.length;

  return (
    <div
      className="flex flex-col h-full min-w-[240px] max-w-[300px] flex-1"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      {/* Column header */}
      <div className="flex items-center gap-2.5 mb-3 pb-2.5 border-b border-border">
        <div className="p-1.5 rounded-md bg-muted">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-foreground">{stage.label}</span>
            <span className="text-[11px] font-mono text-muted-foreground bg-muted rounded px-1.5 py-0.5">
              {count}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground/70 truncate mt-0.5">{stage.description}</p>
        </div>
      </div>

      {/* Card list */}
      <ScrollArea className="flex-1">
        <div className="space-y-2 pr-1 pb-4">
          {count === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground/50">
              <Inbox className="h-5 w-5 mb-2" />
              <p className="text-xs">No studies</p>
            </div>
          ) : (
            studies.map((study) => <StudyCard key={study.id} study={study} />)
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

/* ── Loading skeleton ───────────────────────────── */

function LanesSkeleton() {
  return (
    <div className="p-6 space-y-4 h-full flex flex-col">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-7 w-36 mb-2" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="flex-1 flex gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex-1 min-w-[240px] max-w-[300px] space-y-3">
            <Skeleton className="h-10 w-full" />
            {Array.from({ length: 3 - i > 0 ? 3 - i : 1 }).map((_, j) => (
              <Skeleton key={j} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Main component ─────────────────────────────── */

type SlaFilter = "ALL" | "STAT" | "24H" | "48H" | "ROUTINE";

const SLA_FILTERS: { id: SlaFilter; label: string }[] = [
  { id: "ALL",     label: "All" },
  { id: "STAT",    label: "STAT" },
  { id: "24H",     label: "24H" },
  { id: "48H",     label: "48H" },
  { id: "ROUTINE", label: "Routine" },
];

export default function Lanes() {
  const navigate = useNavigate();
  const [slaFilter, setSlaFilter] = useState<SlaFilter>("ALL");
  const { studies, isLoading, isError, error, refetch } = useStudiesData("all");

  // Realtime: refetch whenever any study changes state or triage_status
  useEffect(() => {
    const ch = supabase
      .channel("lanes-rt")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "studies" },
        () => { refetch(); }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "studies" },
        () => { refetch(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refetch]);

  const filteredStudies = useMemo(() => {
    if (!studies) return [];
    if (slaFilter === "ALL") return studies;
    return studies.filter(s => s.sla === slaFilter);
  }, [studies, slaFilter]);

  const stageStudies = useMemo(() => {
    if (!filteredStudies) return {};

    const sortByUrgency = (a: Study, b: Study) => {
      const aP = (SLA_CONFIG[a.sla as SLAKey] || SLA_CONFIG.ROUTINE).priority;
      const bP = (SLA_CONFIG[b.sla as SLAKey] || SLA_CONFIG.ROUTINE).priority;
      if (aP !== bP) return aP - bP;
      return getTimeInfo(a).remaining - getTimeInfo(b).remaining;
    };

    return {
      uploaded: filteredStudies
        .filter(s => (s.state === "uploaded" || s.state === "awaiting_sla") && (s.triage_status == null || s.triage_status === "pending"))
        .sort(sortByUrgency),
      processing: filteredStudies
        .filter(s => s.triage_status === "processing")
        .sort(sortByUrgency),
      ai_draft: filteredStudies
        .filter(s => s.state === "ai_draft" || (s.triage_status === "completed" && s.state !== "signed" && s.state !== "in_review"))
        .sort(sortByUrgency),
      in_review: filteredStudies
        .filter(s => s.state === "in_review")
        .sort(sortByUrgency),
      signed: filteredStudies
        .filter(s => s.state === "signed")
        .slice(0, 20),
    };
  }, [filteredStudies]);

  const overdueCount = useMemo(() => {
    return filteredStudies.filter(s => s.state !== "signed" && getTimeInfo(s).overdue).length;
  }, [filteredStudies]);

  const activeCount = useMemo(() => {
    if (!stageStudies) return 0;
    return (stageStudies.uploaded?.length || 0) +
           (stageStudies.processing?.length || 0) +
           (stageStudies.ai_draft?.length || 0) +
           (stageStudies.in_review?.length || 0);
  }, [stageStudies]);

  const avgProcessingMinutes = useMemo(() => {
    const processing = stageStudies.processing || [];
    if (processing.length === 0) return null;
    const totalMin = processing.reduce((sum, s) => {
      const start = s.triage_started_at || s.created_at;
      return sum + dayjs().diff(dayjs(start), "minute");
    }, 0);
    return Math.round(totalMin / processing.length);
  }, [stageStudies]);

  const overduePercent = useMemo(() => {
    if (activeCount === 0) return 0;
    return Math.round((overdueCount / activeCount) * 100);
  }, [overdueCount, activeCount]);

  if (isLoading) return <LanesSkeleton />;

  if (isError) {
    return (
      <div className="p-6 space-y-4 h-full flex flex-col">
        <Alert variant="destructive" className="flex items-center gap-3">
          <WifiOff className="h-4 w-4 shrink-0" />
          <AlertDescription className="flex-1">
            Could not load studies. Check your connection and try again.
          </AlertDescription>
          <Button size="sm" variant="outline" onClick={() => refetch()} className="shrink-0 gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </Button>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Triage Lanes</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Real-time study pipeline
          </p>
        </div>
        <Button size="sm" onClick={() => navigate("/app/studies")}>
          <Upload className="h-3.5 w-3.5 mr-1.5" />
          Upload Study
        </Button>
      </div>

      {/* SLA Filter Pills */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {SLA_FILTERS.map((f) => {
          const count = f.id === "ALL"
            ? (studies?.length ?? 0)
            : (studies?.filter(s => s.sla === f.id).length ?? 0);
          const isActive = slaFilter === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setSlaFilter(f.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all border",
                isActive
                  ? f.id === "STAT"
                    ? "bg-destructive text-destructive-foreground border-destructive"
                    : "bg-primary text-primary-foreground border-primary"
                  : "bg-muted/50 text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
              )}
            >
              {f.id === "STAT" && isActive && <Zap className="h-3 w-3" />}
              {f.label}
              {count > 0 && (
                <span className={cn(
                  "rounded-full px-1 text-[10px] font-bold tabular-nums",
                  isActive ? "bg-white/20" : "bg-muted"
                )}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Summary stats bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-3 py-1.5">
          <span className="text-xs text-muted-foreground">Active</span>
          <span className="text-sm font-semibold text-foreground font-mono">{activeCount}</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-3 py-1.5">
          <span className="text-xs text-muted-foreground">Signed</span>
          <span className="text-sm font-semibold text-foreground font-mono">{stageStudies.signed?.length || 0}</span>
        </div>
        {overdueCount > 0 && (
          <div className="flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-1.5">
            <AlertTriangle className="h-3 w-3 text-destructive" />
            <span className="text-xs text-destructive font-medium">{overduePercent}% overdue</span>
            <span className="text-[10px] text-destructive/70">({overdueCount})</span>
          </div>
        )}
        {avgProcessingMinutes !== null && (
          <div className="flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-3 py-1.5">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Avg processing</span>
            <span className="text-sm font-semibold text-foreground font-mono">
              {avgProcessingMinutes >= 60 ? `${Math.floor(avgProcessingMinutes / 60)}h ${avgProcessingMinutes % 60}m` : `${avgProcessingMinutes}m`}
            </span>
          </div>
        )}
      </div>

      {/* Kanban board */}
      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-3 h-full min-h-[500px] pb-4">
          {TRIAGE_STAGES.map((stage, i) => (
            <KanbanColumn
              key={stage.id}
              stage={stage}
              studies={stageStudies[stage.id as keyof typeof stageStudies] || []}
              index={i}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
