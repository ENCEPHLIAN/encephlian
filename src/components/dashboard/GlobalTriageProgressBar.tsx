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
  { key: "queueing", label: "Queueing...", icon: Loader2, progress: 10 },
  { key: "artifact_cleanup", label: "Running artifact cleanup...", icon: FileSearch, progress: 30 },
  { key: "triage_model", label: "Running triage model...", icon: Wand2, progress: 60 },
  { key: "generating_report", label: "Generating report...", icon: Sparkles, progress: 85 },
  { key: "completed", label: "Complete", icon: FileCheck, progress: 100 },
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
          filter: `triage_status=eq.processing`,
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
    ? Math.round(studies.reduce((sum, s) => sum + (s.triage_progress || 0), 0) / studies.length)
    : 0;

  // Animate progress changes
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
    <div className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-b">
      <div className="flex items-center gap-3 px-4 py-2 max-w-7xl mx-auto">
        <div className="flex items-center gap-2 text-sm font-medium text-primary">
          <Icon className={`h-4 w-4 ${currentStage.key !== "completed" ? "animate-spin" : ""}`} />
          <span>
            {studies.length === 1
              ? currentStage.label
              : `Processing ${studies.length} EEG studies...`}
          </span>
        </div>
        <div className="flex-1">
          <Progress value={animatedProgress} className="h-1.5" />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          {animatedProgress}%
        </span>
      </div>
    </div>
  );
}
