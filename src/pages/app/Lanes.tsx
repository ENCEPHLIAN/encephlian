import { useMemo, memo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { 
  Loader2, Upload, Clock, Brain, Eye, CheckCircle2, 
  ArrowRight, AlertTriangle, Zap 
} from "lucide-react";
import dayjs from "dayjs";
import { useStudiesData, Study } from "@/hooks/useStudiesData";

const SLA_CONFIG = {
  STAT: { label: "STAT", color: "destructive", priority: 1, targetHours: 1 },
  "24H": { label: "24 Hour", color: "warning", priority: 2, targetHours: 24 },
  "48H": { label: "48 Hour", color: "secondary", priority: 3, targetHours: 48 },
  ROUTINE: { label: "Routine", color: "outline", priority: 4, targetHours: 72 },
} as const;

type SLAKey = keyof typeof SLA_CONFIG;

// Triage stages for Kanban columns
const TRIAGE_STAGES = [
  { 
    id: "uploaded", 
    label: "Uploaded", 
    icon: Upload, 
    color: "border-amber-500",
    bgColor: "bg-amber-500/10",
    description: "Awaiting SLA selection"
  },
  { 
    id: "processing", 
    label: "Processing", 
    icon: Brain, 
    color: "border-blue-500",
    bgColor: "bg-blue-500/10",
    description: "AI analysis in progress"
  },
  { 
    id: "ai_draft", 
    label: "AI Draft", 
    icon: Eye, 
    color: "border-purple-500",
    bgColor: "bg-purple-500/10",
    description: "Ready for review"
  },
  { 
    id: "in_review", 
    label: "In Review", 
    icon: Clock, 
    color: "border-cyan-500",
    bgColor: "bg-cyan-500/10",
    description: "Under physician review"
  },
  { 
    id: "signed", 
    label: "Signed", 
    icon: CheckCircle2, 
    color: "border-emerald-500",
    bgColor: "bg-emerald-500/10",
    description: "Report finalized"
  },
];

function getTimeInfo(study: Study): { remaining: number; overdue: boolean; formatted: string } {
  const slaConfig = SLA_CONFIG[study.sla as SLAKey] || SLA_CONFIG.ROUTINE;
  const startTime = study.sla_selected_at || study.created_at;
  const deadline = dayjs(startTime).add(slaConfig.targetHours, "hour");
  const now = dayjs();
  const remaining = deadline.diff(now, "minute");
  const overdue = remaining < 0;

  let formatted: string;
  if (overdue) {
    const overdueMinutes = Math.abs(remaining);
    if (overdueMinutes >= 60) {
      formatted = `${Math.floor(overdueMinutes / 60)}h overdue`;
    } else {
      formatted = `${overdueMinutes}m overdue`;
    }
  } else {
    if (remaining >= 60) {
      formatted = `${Math.floor(remaining / 60)}h left`;
    } else {
      formatted = `${remaining}m left`;
    }
  }

  return { remaining, overdue, formatted };
}

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

  return (
    <Card 
      className={`transition-all hover:shadow-md cursor-pointer group ${timeInfo.overdue ? "border-destructive/50 bg-destructive/5" : ""}`}
      onClick={() => navigate(`/app/studies/${study.id}`)}
    >
      <CardContent className="p-3">
        <div className="space-y-2">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-sm truncate">
                {meta?.patient_name || "Unknown Patient"}
              </p>
              {ageGenderStr && (
                <p className="text-xs text-muted-foreground">{ageGenderStr}</p>
              )}
            </div>
            <Badge 
              variant={SLA_CONFIG[study.sla as SLAKey]?.color as any || "outline"}
              className="shrink-0 text-xs"
            >
              {study.sla === "STAT" && <Zap className="h-3 w-3 mr-1" />}
              {study.sla}
            </Badge>
          </div>

          {/* Patient ID & Clinic */}
          <p className="text-xs text-muted-foreground truncate">
            {meta?.patient_id || study.id.slice(0, 8)}
          </p>

          {/* Progress (if processing) */}
          {isProcessing && (
            <div className="flex items-center gap-2">
              <Progress value={study.triage_progress || 0} className="h-1.5 flex-1" />
              <span className="text-xs text-muted-foreground">{study.triage_progress || 0}%</span>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between pt-1">
            <span className={`text-xs ${timeInfo.overdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
              {timeInfo.formatted}
            </span>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
});

function KanbanColumn({ stage, studies }: { stage: typeof TRIAGE_STAGES[0]; studies: Study[] }) {
  const Icon = stage.icon;
  
  return (
    <div className="flex flex-col h-full min-w-[260px] max-w-[320px] flex-1">
      {/* Column Header */}
      <div className={`flex items-center gap-2 mb-3 pb-2 border-b-2 ${stage.color}`}>
        <div className={`p-1.5 rounded ${stage.bgColor}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="font-semibold text-sm">{stage.label}</span>
          <p className="text-xs text-muted-foreground truncate">{stage.description}</p>
        </div>
        <Badge variant="secondary" className="shrink-0">
          {studies.length}
        </Badge>
      </div>

      {/* Cards */}
      <ScrollArea className="flex-1">
        <div className="space-y-2 pr-2 pb-4">
          {studies.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <div className={`p-3 rounded-full mx-auto w-fit mb-2 ${stage.bgColor}`}>
                <Icon className="h-5 w-5 opacity-50" />
              </div>
              <p className="text-xs">No studies</p>
            </div>
          ) : (
            studies.map((study) => (
              <StudyCard key={study.id} study={study} />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

export default function Lanes() {
  const navigate = useNavigate();

  // Fetch all studies for kanban view
  const { studies, isLoading } = useStudiesData("all");

  // Categorize studies by triage stage
  const stageStudies = useMemo(() => {
    if (!studies) return {};

    const sortByUrgency = (a: Study, b: Study) => {
      const aConfig = SLA_CONFIG[a.sla as SLAKey] || SLA_CONFIG.ROUTINE;
      const bConfig = SLA_CONFIG[b.sla as SLAKey] || SLA_CONFIG.ROUTINE;
      if (aConfig.priority !== bConfig.priority) {
        return aConfig.priority - bConfig.priority;
      }
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
        .slice(0, 20), // Limit signed studies shown
    };
  }, [studies]);

  // Count overdue studies
  const overdueCount = useMemo(() => {
    if (!studies) return 0;
    return studies.filter(s => 
      s.state !== "signed" && 
      getTimeInfo(s).overdue
    ).length;
  }, [studies]);

  // Total active (non-signed)
  const activeCount = useMemo(() => {
    if (!stageStudies) return 0;
    return (stageStudies.uploaded?.length || 0) + 
           (stageStudies.processing?.length || 0) + 
           (stageStudies.ai_draft?.length || 0) + 
           (stageStudies.in_review?.length || 0);
  }, [stageStudies]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Triage Lanes</h1>
          <p className="text-sm text-muted-foreground">
            {activeCount} active • {stageStudies.signed?.length || 0} completed
          </p>
        </div>
        <div className="flex items-center gap-3">
          {overdueCount > 0 && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              {overdueCount} overdue
            </Badge>
          )}
          <Button onClick={() => navigate("/app/studies")}>
            <Upload className="h-4 w-4 mr-2" />
            Upload Study
          </Button>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-4 h-full min-h-[500px] pb-4">
          {TRIAGE_STAGES.map((stage) => (
            <KanbanColumn 
              key={stage.id} 
              stage={stage} 
              studies={stageStudies[stage.id as keyof typeof stageStudies] || []} 
            />
          ))}
        </div>
      </div>
    </div>
  );
}
