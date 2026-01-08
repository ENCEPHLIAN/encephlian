import { useMemo, useState, memo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Loader2, Zap, Clock, AlertTriangle, CheckCircle2, Activity, ArrowRight } from "lucide-react";
import dayjs from "dayjs";

type Study = {
  id: string;
  sla: string;
  state: string;
  created_at: string;
  meta: any;
  triage_status?: string;
  triage_progress?: number;
  sla_selected_at?: string;
  clinic_id: string;
  clinics?: { name: string } | null;
};

const SLA_CONFIG = {
  STAT: { label: "STAT", color: "destructive", priority: 1, targetHours: 1 },
  "24H": { label: "24 Hour", color: "warning", priority: 2, targetHours: 24 },
  "48H": { label: "48 Hour", color: "secondary", priority: 3, targetHours: 48 },
  ROUTINE: { label: "Routine", color: "outline", priority: 4, targetHours: 72 },
} as const;

type SLAKey = keyof typeof SLA_CONFIG;

function getTimeRemaining(study: Study): { remaining: number; overdue: boolean; formatted: string } {
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
      formatted = `${Math.floor(overdueMinutes / 60)}h ${overdueMinutes % 60}m overdue`;
    } else {
      formatted = `${overdueMinutes}m overdue`;
    }
  } else {
    if (remaining >= 60) {
      formatted = `${Math.floor(remaining / 60)}h ${remaining % 60}m left`;
    } else {
      formatted = `${remaining}m left`;
    }
  }

  return { remaining, overdue, formatted };
}

const LaneCard = memo(function LaneCard({ study, onAction }: { study: Study; onAction: (id: string, action: string) => void }) {
  const navigate = useNavigate();
  const meta = study.meta as any;
  const timeInfo = getTimeRemaining(study);
  const isProcessing = study.triage_status === "processing";
  const isCompleted = study.triage_status === "completed" || study.state === "signed";

  const patientAge = meta?.patient_age;
  const patientGender = meta?.patient_gender;
  const ageGenderStr = [
    patientAge ? `${patientAge}y` : null,
    patientGender ? patientGender.charAt(0).toUpperCase() : null,
  ].filter(Boolean).join("/");

  return (
    <Card className={`transition-all hover:shadow-md ${timeInfo.overdue ? "border-destructive/50" : ""}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium truncate">
                {meta?.patient_name || "Unknown Patient"}
              </span>
              {ageGenderStr && (
                <span className="text-xs text-muted-foreground">({ageGenderStr})</span>
              )}
              <Badge variant={SLA_CONFIG[study.sla as SLAKey]?.color as any || "outline"}>
                {study.sla}
              </Badge>
            </div>
            <div className="text-sm text-muted-foreground mb-2">
              {meta?.patient_id || study.id.slice(0, 8)} • {study.clinics?.name || "—"}
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className={timeInfo.overdue ? "text-destructive font-medium" : "text-muted-foreground"}>
                {timeInfo.formatted}
              </span>
              <span className="text-muted-foreground">
                {dayjs(study.created_at).format("MMM D, h:mm A")}
              </span>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            {isProcessing ? (
              <div className="flex items-center gap-2">
                <Progress value={study.triage_progress || 0} className="w-20 h-2" />
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              </div>
            ) : isCompleted ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            ) : (
              <AlertTriangle className={`h-5 w-5 ${timeInfo.overdue ? "text-destructive" : "text-amber-500"}`} />
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2"
              onClick={() => navigate(`/app/studies/${study.id}`)}
            >
              View <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});

function LaneColumn({ title, icon: Icon, studies, color, onAction }: {
  title: string;
  icon: any;
  studies: Study[];
  color: string;
  onAction: (id: string, action: string) => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className={`flex items-center gap-2 mb-4 pb-2 border-b-2 ${color}`}>
        <Icon className="h-5 w-5" />
        <span className="font-semibold">{title}</span>
        <Badge variant="secondary" className="ml-auto">
          {studies.length}
        </Badge>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-3 pr-2">
          {studies.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No studies in this lane
            </p>
          ) : (
            studies.map((study) => (
              <LaneCard key={study.id} study={study} onAction={onAction} />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

export default function Lanes() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"active" | "completed">("active");

  const { data: studies, isLoading } = useQuery({
    queryKey: ["lanes-studies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("studies")
        .select("id, sla, state, created_at, meta, triage_status, triage_progress, sla_selected_at, clinic_id, clinics(name)")
        .in("state", ["uploaded", "awaiting_sla", "ai_draft", "in_review", "signed"])
        .order("created_at", { ascending: false })
        .limit(200);
      
      if (error) throw error;
      return (data || []) as Study[];
    },
    staleTime: 30000,
    refetchInterval: 30000,
  });

  const handleAction = (studyId: string, action: string) => {
    if (action === "view") {
      navigate(`/app/studies/${studyId}`);
    }
  };

  const { statQueue, tatQueue, completedQueue } = useMemo(() => {
    if (!studies) return { statQueue: [], tatQueue: [], completedQueue: [] };

    const active = studies.filter(s => 
      s.state !== "signed" && s.triage_status !== "completed"
    );
    const completed = studies.filter(s => 
      s.state === "signed" || s.triage_status === "completed"
    );

    // Sort by priority and time remaining
    const sortByUrgency = (a: Study, b: Study) => {
      const aConfig = SLA_CONFIG[a.sla as SLAKey] || SLA_CONFIG.ROUTINE;
      const bConfig = SLA_CONFIG[b.sla as SLAKey] || SLA_CONFIG.ROUTINE;
      if (aConfig.priority !== bConfig.priority) {
        return aConfig.priority - bConfig.priority;
      }
      return getTimeRemaining(a).remaining - getTimeRemaining(b).remaining;
    };

    // STAT = immediate priority
    const stat = active.filter(s => s.sla === "STAT").sort(sortByUrgency);
    // TAT = all non-STAT active studies
    const tat = active.filter(s => s.sla !== "STAT").sort(sortByUrgency);

    return {
      statQueue: stat,
      tatQueue: tat,
      completedQueue: completed.slice(0, 50),
    };
  }, [studies]);

  const overdueCount = useMemo(() => {
    return [...statQueue, ...tatQueue].filter(s => getTimeRemaining(s).overdue).length;
  }, [statQueue, tatQueue]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 h-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Lanes</h1>
          <p className="text-sm text-muted-foreground">
            Manage STAT and TAT queues • {statQueue.length + tatQueue.length} active studies
          </p>
        </div>
        {overdueCount > 0 && (
          <Badge variant="destructive" className="text-sm">
            {overdueCount} overdue
          </Badge>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList>
          <TabsTrigger value="active" className="gap-2">
            <Activity className="h-4 w-4" />
            Active ({statQueue.length + tatQueue.length})
          </TabsTrigger>
          <TabsTrigger value="completed" className="gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Completed ({completedQueue.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[calc(100vh-280px)]">
            <LaneColumn
              title="STAT Queue"
              icon={Zap}
              studies={statQueue}
              color="border-destructive"
              onAction={handleAction}
            />
            <LaneColumn
              title="TAT Queue"
              icon={Clock}
              studies={tatQueue}
              color="border-amber-500"
              onAction={handleAction}
            />
          </div>
        </TabsContent>

        <TabsContent value="completed" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {completedQueue.length === 0 ? (
              <p className="text-muted-foreground col-span-full text-center py-12">
                No completed studies yet
              </p>
            ) : (
              completedQueue.map((study) => (
                <LaneCard key={study.id} study={study} onAction={handleAction} />
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
