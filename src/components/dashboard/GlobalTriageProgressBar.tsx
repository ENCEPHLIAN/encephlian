import { useEffect, useState } from "react";
import { Progress } from "@/components/ui/progress";
import { Loader2, Sparkles, FileSearch, Wand2, FileCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface ProcessingStudy {
  id: string;
  triage_status?: string;
  triage_progress?: number;
}

interface GlobalTriageProgressBarProps {
  studies: ProcessingStudy[];
}

const TRIAGE_STAGES = [
  { key: "queueing", label: "Queueing...", icon: Loader2, progress: 10, spinning: true },
  { key: "artifact_cleanup", label: "Running artifact cleanup...", icon: FileSearch, progress: 30, spinning: true },
  { key: "triage_model", label: "Running triage model...", icon: Wand2, progress: 60, spinning: true },
  { key: "generating_report", label: "Generating report...", icon: Sparkles, progress: 85, spinning: true },
  { key: "completed", label: "Complete", icon: FileCheck, progress: 100, spinning: false },
];

export default function GlobalTriageProgressBar({ studies }: GlobalTriageProgressBarProps) {
  const [animatedProgress, setAnimatedProgress] = useState(0);

  // Subscribe to realtime updates for processing studies
  useEffect(() => {
    if (studies.length === 0) return;

    const channel = supabase
      .channel("triage-progress")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "studies",
        },
        (payload) => {
          // Handle realtime updates - the parent component will refetch
          console.log("Triage progress update:", payload);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [studies.length]);

  // Calculate average progress
  const avgProgress = studies.length > 0
    ? Math.round(studies.reduce((sum, s) => sum + (s.triage_progress || 5), 0) / studies.length)
    : 0;

  // Animate progress changes smoothly
  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedProgress(avgProgress);
    }, 100);
    return () => clearTimeout(timer);
  }, [avgProgress]);

  if (studies.length === 0) {
    return null;
  }

  // Get current stage based on average progress
  const currentStage = TRIAGE_STAGES.find((stage, idx) => {
    const nextStage = TRIAGE_STAGES[idx + 1];
    return avgProgress >= stage.progress && (!nextStage || avgProgress < nextStage.progress);
  }) || TRIAGE_STAGES[0];

  const Icon = currentStage.icon;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-b shadow-sm">
      <div className="flex items-center gap-3 px-4 py-2.5 max-w-7xl mx-auto">
        <div className="flex items-center gap-2 text-sm font-medium text-primary min-w-fit">
          <Icon className={`h-4 w-4 ${currentStage.spinning ? "animate-spin" : ""}`} />
          <span className="whitespace-nowrap">
            {studies.length === 1
              ? currentStage.label
              : `Processing ${studies.length} EEG studies...`}
          </span>
        </div>
        <div className="flex-1">
          <Progress value={animatedProgress} className="h-2" />
        </div>
        <span className="text-xs font-medium text-muted-foreground tabular-nums min-w-[3ch]">
          {animatedProgress}%
        </span>
      </div>
    </div>
  );
}