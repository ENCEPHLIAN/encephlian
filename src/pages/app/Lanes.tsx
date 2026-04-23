import { useMemo, memo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Loader2, Upload, Clock, Brain, Eye, CheckCircle2,
  ArrowRight, AlertTriangle, Zap, Inbox, RefreshCw, WifiOff
} from "lucide-react";
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
  { id: "processing", label: "Processing", icon: Brain,        description: "AI analysis in progress" },
  { id: "ai_draft",   label: "AI Draft",   icon: Eye,          description: "Ready for review" },
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

const StudyCard = memo(function StudyCard({ study }: { study: Study }) {
  const navigate = useNavigate();
  const meta = study.meta as any;
  const timeInfo = getTimeInfo(study);
  const isProcessing = study.triage_status === "processing";

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
      className={`
        transition-all duration-150 cursor-pointer group
        hover:shadow-md hover:border-primary/20
        ${timeInfo.overdue ? "border-destructive/40" : ""}
      `}
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
            <Progress value={study.triage_progress || 0} className="h-1 flex-1" />
            <span className="text-[10px] text-muted-foreground font-mono w-7 text-right">
              {study.triage_progress || 0}%
            </span>
          </div>
        )}

        {/* Row 4: Time + Arrow */}
        <div className="flex items-center justify-between">
          <span
            className={`text-[11px] font-medium ${
              timeInfo.overdue ? "text-destructive" : "text-muted-foreground"
            }`}
          >
            {timeInfo.overdue && <AlertTriangle className="h-3 w-3 inline mr-0.5 -mt-0.5" />}
            {timeInfo.formatted}
          </span>
          <ArrowRight className="h-3 w-3 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity" />
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

export default function Lanes() {
  const navigate = useNavigate();
  const { studies, isLoading, isError, error, refetch } = useStudiesData("all");

  const stageStudies = useMemo(() => {
    if (!studies) return {};

    const sortByUrgency = (a: Study, b: Study) => {
      const aP = (SLA_CONFIG[a.sla as SLAKey] || SLA_CONFIG.ROUTINE).priority;
      const bP = (SLA_CONFIG[b.sla as SLAKey] || SLA_CONFIG.ROUTINE).priority;
      if (aP !== bP) return aP - bP;
      return getTimeInfo(a).remaining - getTimeInfo(b).remaining;
    };

    return {
      uploaded: studies
        .filter(s => (s.state === "uploaded" || s.state === "awaiting_sla") && !s.triage_status)
        .sort(sortByUrgency),
      processing: studies
        .filter(s => s.triage_status === "processing")
        .sort(sortByUrgency),
      ai_draft: studies
        .filter(s => s.state === "ai_draft" || (s.triage_status === "completed" && s.state !== "signed" && s.state !== "in_review"))
        .sort(sortByUrgency),
      in_review: studies
        .filter(s => s.state === "in_review")
        .sort(sortByUrgency),
      signed: studies
        .filter(s => s.state === "signed")
        .slice(0, 20),
    };
  }, [studies]);

  const overdueCount = useMemo(() => {
    if (!studies) return 0;
    return studies.filter(s => s.state !== "signed" && getTimeInfo(s).overdue).length;
  }, [studies]);

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
