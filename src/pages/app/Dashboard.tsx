import { useState, useCallback, memo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Activity, Upload, TrendingUp, Clock, CheckCircle2, AlertCircle, RefreshCw, WifiOff, Layers, ArrowRight } from "lucide-react";
import KPICard from "@/components/dashboard/KPICard";
import UrgentQueue from "@/components/dashboard/UrgentQueue";
import PendingTriageSection from "@/components/dashboard/PendingTriageSection";
import SlaSelectionModal from "@/components/dashboard/SlaSelectionModal";
import RecentReportsSection from "@/components/dashboard/RecentReportsSection";
import RefundDialog from "@/components/dashboard/RefundDialog";
import { CalendarWidget } from "@/components/CalendarWidget";
import dayjs from "dayjs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDashboardData, Study } from "@/hooks/useDashboardData";
import { useSku } from "@/hooks/useSku";
import PilotDashboard from "@/components/dashboard/PilotDashboard";
import { getStudyHandle } from "@/lib/studyDisplay";

const MemoizedKPICard = memo(KPICard);
const MemoizedPendingTriageSection = memo(PendingTriageSection);
const MemoizedRecentReportsSection = memo(RecentReportsSection);
const MemoizedUrgentQueue = memo(UrgentQueue);
const MemoizedCalendarWidget = memo(CalendarWidget);

export default function Dashboard() {
  const { isPilot } = useSku();
  const navigate = useNavigate();
  const [selectedStudy, setSelectedStudy] = useState<Study | null>(null);
  const [slaModalOpen, setSlaModalOpen] = useState(false);
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [refundStudy, setRefundStudy] = useState<Study | null>(null);

  const {
    studies,
    metrics,
    filteredStudies,
    isLoading,
    isError,
    error: dataError,
    tokenBalance,
    refetchStudies,
  } = useDashboardData();

  const [loadingTooLong, setLoadingTooLong] = useState(false);

  // Loading timeout — if data takes > 15s, show helpful message
  useEffect(() => {
    if (!isLoading) {
      setLoadingTooLong(false);
      return;
    }
    const timer = setTimeout(() => setLoadingTooLong(true), 15000);
    return () => clearTimeout(timer);
  }, [isLoading]);

  const { pendingTriageStudies, processingStudies, completedReports, pendingStudies } = filteredStudies;

  const handleSelectSla = useCallback((study: Study) => {
    setSelectedStudy(study);
    setSlaModalOpen(true);
  }, []);

  const handleInsufficientTokens = useCallback(() => {
    setSlaModalOpen(false);
    toast.error("Not enough tokens", {
      description: "Please purchase more tokens to start triage.",
    });
    navigate("/app/wallet");
  }, [navigate]);

  const handleRequestRefund = useCallback((study: Study) => {
    setRefundStudy(study);
    setRefundDialogOpen(true);
  }, []);

  // Pilot SKU gets the focused, value-only dashboard
  if (isPilot) {
    return <PilotDashboard />;
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center space-y-4 max-w-sm">
          <WifiOff className="h-10 w-10 text-destructive mx-auto" />
          <p className="font-medium">Could not load dashboard</p>
          <p className="text-sm text-muted-foreground">
            This could be a network issue or a temporary server problem. Check your connection and try again.
          </p>
          <Button onClick={() => refetchStudies()} variant="outline" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center space-y-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">Loading dashboard...</p>
          {loadingTooLong && (
            <div className="space-y-2">
              <p className="text-sm text-amber-600">Taking longer than expected. This could be a network issue.</p>
              <Button onClick={() => refetchStudies()} variant="outline" size="sm" className="gap-2">
                <RefreshCw className="h-3.5 w-3.5" />
                Retry
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {dayjs().format("dddd, MMMM D, YYYY")}
          </p>
        </div>
      </div>

      {/* Pending Triage Section */}
      {pendingTriageStudies.length > 0 && (
        <MemoizedPendingTriageSection
          studies={pendingTriageStudies}
          onSelectSla={handleSelectSla}
        />
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-3 gap-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="lg"
              className="quick-action-btn h-16 flex-col gap-1.5 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
              onClick={() => navigate("/app/lanes")}
            >
              <Layers className="h-4 w-4 shrink-0" />
              <span className="text-sm">Triage Lanes</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>View STAT/TAT triage lanes</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="lg"
              variant="outline"
              className="quick-action-btn h-16 flex-col gap-1.5 quick-outline transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
              onClick={() => navigate("/app/studies")}
            >
              <Upload className="h-4 w-4 shrink-0" />
              <span className="text-sm">Upload Study</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Upload new EEG study</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="lg"
              variant="outline"
              className="quick-action-btn h-16 flex-col gap-1.5 quick-outline transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
              onClick={() => navigate("/app/reports")}
            >
              <TrendingUp className="h-4 w-4 shrink-0" />
              <span className="text-sm">Reports</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>See completed reports</TooltipContent>
        </Tooltip>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MemoizedKPICard
          label="Pending"
          value={metrics?.pendingCount || 0}
          change={`${metrics?.statCases || 0} STAT urgent`}
          trend={metrics?.pendingCount && metrics.pendingCount > 5 ? "up" : "neutral"}
          color="kpi-amber"
          onClick={() => navigate("/app/studies?filter=uploaded")}
        />
        <MemoizedKPICard
          label="Completed Today"
          value={metrics?.completedToday || 0}
          change={`${metrics?.completedWeek || 0} this week`}
          trend={metrics?.completedToday && metrics.completedToday >= 3 ? "up" : "neutral"}
          color="kpi-green"
        />
        <MemoizedKPICard
          label="Processing"
          value={metrics?.processingCount || 0}
          change="Active analyses"
          trend={metrics?.processingCount && metrics.processingCount > 0 ? "up" : "neutral"}
          color="kpi-blue"
        />
        <MemoizedKPICard
          label="Avg Turnaround"
          value={metrics?.avgTurnaround || "--"}
          change="Time to report"
          trend="up"
          color="kpi-cyan"
        />
      </div>

      {/* Recent Reports */}
      {completedReports.length > 0 && (
        <MemoizedRecentReportsSection
          studies={completedReports}
          onRequestRefund={handleRequestRefund}
        />
      )}

      {/* Recent Studies */}
      <Card className="openai-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4 text-primary" />
              Recent Studies
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate("/app/studies")} className="gap-1 text-xs">
              View All <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {studies && studies.length > 0 ? (
            <div className="divide-y divide-border/40">
              {studies.slice(0, 6).map((study) => {
                const meta = study.meta as any;
                const isCompleted = study.triage_status === "completed" || study.state === "signed";
                const isProcessing = study.triage_status === "processing";
                const patientAge = meta?.patient_age;
                const patientGender = meta?.patient_gender;
                const ageGenderStr = [
                  patientAge ? `${patientAge}y` : null,
                  patientGender ? patientGender.charAt(0).toUpperCase() : null,
                ].filter(Boolean).join("/");
                const handle = getStudyHandle(study);
                const statusColor = isCompleted ? "text-emerald-500" : isProcessing ? "text-blue-500" : "text-amber-500";

                return (
                  <div
                    key={study.id}
                    className="flex items-center gap-3 py-2.5 hover:bg-muted/40 transition-colors cursor-pointer rounded-lg px-2 -mx-2 group"
                    onClick={() => navigate(`/app/studies/${study.id}`)}
                  >
                    <div className={cn("mt-0.5 shrink-0", statusColor)}>
                      {isCompleted ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : isProcessing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <AlertCircle className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate leading-snug">
                        {meta?.patient_name || "Unknown Patient"}
                        {ageGenderStr && (
                          <span className="text-muted-foreground font-normal text-xs ml-1.5">({ageGenderStr})</span>
                        )}
                      </p>
                      <p className="text-[11px] text-muted-foreground font-mono truncate">
                        {handle} · {dayjs(study.created_at).format("MMM D, h:mm A")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge
                        variant={isCompleted ? "default" : isProcessing ? "secondary" : "outline"}
                        className="text-[10px] px-1.5 py-0 font-mono"
                      >
                        {study.sla}
                      </Badge>
                      <ArrowRight className="h-3 w-3 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-10 text-muted-foreground">
              <Activity className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No studies yet</p>
              <Button variant="link" size="sm" onClick={() => navigate("/app/studies")}>
                Upload your first study
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <MemoizedCalendarWidget />

      {pendingStudies.length > 0 && (
        <div className="openai-section">
          <MemoizedUrgentQueue studies={pendingStudies} />
        </div>
      )}

      <SlaSelectionModal
        open={slaModalOpen}
        onOpenChange={setSlaModalOpen}
        study={selectedStudy}
        tokenBalance={tokenBalance}
        onInsufficientTokens={handleInsufficientTokens}
      />

      <RefundDialog
        open={refundDialogOpen}
        onOpenChange={setRefundDialogOpen}
        study={refundStudy}
      />
    </div>
  );
}
