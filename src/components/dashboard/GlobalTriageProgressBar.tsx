import { useEffect, useState, useCallback } from "react";
import { Progress } from "@/components/ui/progress";
import { Loader2, Sparkles, FileSearch, FileCheck, Brain } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface ProcessingStudy {
  id: string;
  triage_status?: string;
  triage_progress?: number;
  meta?: any;
}

interface GlobalTriageProgressBarProps {
  studies: ProcessingStudy[];
}

const TRIAGE_STAGES = [
  { key: "queueing", label: "Queueing study...", icon: Loader2, progress: 10, spinning: true },
  { key: "artifact_cleanup", label: "Running artifact cleanup...", icon: FileSearch, progress: 30, spinning: true },
  { key: "triage_model", label: "Analyzing EEG patterns...", icon: Brain, progress: 50, spinning: true },
  { key: "generating_report", label: "Generating clinical report...", icon: Sparkles, progress: 85, spinning: true },
  { key: "completed", label: "Analysis complete", icon: FileCheck, progress: 100, spinning: false },
];

export default function GlobalTriageProgressBar({ studies: initialStudies }: GlobalTriageProgressBarProps) {
  const [studies, setStudies] = useState<ProcessingStudy[]>(initialStudies);
  const [animatedProgress, setAnimatedProgress] = useState(0);

  // Sync with props when they change
  useEffect(() => {
    setStudies(initialStudies);
  }, [initialStudies]);

  // Subscribe to realtime updates for processing studies
  useEffect(() => {
    if (studies.length === 0) return;

    const studyIds = studies.map(s => s.id);

    const channel = supabase
      .channel("triage-progress-realtime")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "studies",
        },
        (payload) => {
          const updated = payload.new as ProcessingStudy;
          
          // Only process updates for studies we're tracking
          if (studyIds.includes(updated.id)) {
            setStudies(prev => 
              prev.map(s => 
                s.id === updated.id 
                  ? { ...s, triage_progress: updated.triage_progress, triage_status: updated.triage_status, meta: updated.meta }
                  : s
              ).filter(s => s.triage_status !== "completed" || s.id === updated.id)
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [studies.map(s => s.id).join(",")]);

  // Calculate average progress from real-time state
  const avgProgress = studies.length > 0
    ? Math.round(studies.reduce((sum, s) => sum + (s.triage_progress || 5), 0) / studies.length)
    : 0;

  // Animate progress changes smoothly
  useEffect(() => {
    const diff = avgProgress - animatedProgress;
    if (Math.abs(diff) < 1) {
      setAnimatedProgress(avgProgress);
      return;
    }
    
    const step = Math.max(1, Math.abs(diff) / 10);
    const timer = setInterval(() => {
      setAnimatedProgress(prev => {
        const newVal = prev + Math.sign(diff) * step;
        if ((diff > 0 && newVal >= avgProgress) || (diff < 0 && newVal <= avgProgress)) {
          clearInterval(timer);
          return avgProgress;
        }
        return Math.round(newVal);
      });
    }, 30);
    
    return () => clearInterval(timer);
  }, [avgProgress]);

  if (studies.length === 0) {
    return null;
  }

  // Get current stage based on average progress
  const currentStage = TRIAGE_STAGES.reduce((found, stage) => {
    if (avgProgress >= stage.progress) return stage;
    return found;
  }, TRIAGE_STAGES[0]);

  const Icon = currentStage.icon;

  // Get patient info for single study display
  const singleStudyMeta = studies.length === 1 ? (studies[0].meta as any) : null;
  const patientDisplay = singleStudyMeta?.patient_name || singleStudyMeta?.patient_id || null;

  return (
    <div className="fixed top-14 left-0 right-0 z-40">
      {/* Gradient backdrop that blends with nav */}
      <div className="absolute inset-0 bg-gradient-to-b from-primary/10 via-primary/5 to-transparent pointer-events-none" />
      
      <div className="relative bg-background/80 backdrop-blur-md border-b border-primary/20 shadow-lg shadow-primary/5">
        <div className="px-4 py-3 max-w-7xl mx-auto">
          {/* Main progress container */}
          <div className="flex items-center gap-4">
            {/* Icon with pulse effect */}
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
              <div className="relative flex items-center justify-center h-10 w-10 rounded-full bg-primary/10 border border-primary/30">
                <Icon className={`h-5 w-5 text-primary ${currentStage.spinning ? "animate-spin" : ""}`} />
              </div>
            </div>

            {/* Progress info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-foreground">
                    {studies.length === 1 ? currentStage.label : `Processing ${studies.length} studies...`}
                  </span>
                  {patientDisplay && (
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                      {patientDisplay}
                    </span>
                  )}
                </div>
                <span className="text-sm font-bold text-primary tabular-nums">
                  {animatedProgress}%
                </span>
              </div>
              
              {/* Enhanced progress bar */}
              <div className="relative h-2.5 rounded-full bg-muted/50 overflow-hidden">
                <div 
                  className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary via-primary to-primary/80 transition-all duration-300 ease-out"
                  style={{ width: `${animatedProgress}%` }}
                />
                {/* Shimmer effect */}
                <div 
                  className="absolute inset-y-0 left-0 w-full bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer"
                  style={{ animationDuration: "2s" }}
                />
              </div>
            </div>
          </div>

          {/* Stage indicators */}
          <div className="flex items-center justify-between mt-2 px-12">
            {TRIAGE_STAGES.slice(0, -1).map((stage, idx) => {
              const isActive = avgProgress >= stage.progress;
              const isCurrent = currentStage.key === stage.key;
              return (
                <div 
                  key={stage.key}
                  className={`flex items-center gap-1.5 transition-all duration-300 ${
                    isActive ? "opacity-100" : "opacity-40"
                  }`}
                >
                  <div className={`h-1.5 w-1.5 rounded-full ${
                    isCurrent ? "bg-primary animate-pulse" : isActive ? "bg-primary" : "bg-muted-foreground"
                  }`} />
                  <span className={`text-xs ${isCurrent ? "text-primary font-medium" : "text-muted-foreground"}`}>
                    {stage.key === "queueing" ? "Queue" :
                     stage.key === "artifact_cleanup" ? "Cleanup" :
                     stage.key === "triage_model" ? "Analysis" :
                     "Report"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
