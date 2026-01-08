import { useState, useCallback, memo } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Activity, Upload, Coins, TrendingUp, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import KPICard from "@/components/dashboard/KPICard";
import UrgentQueue from "@/components/dashboard/UrgentQueue";
import PendingTriageSection from "@/components/dashboard/PendingTriageSection";
import SlaSelectionModal from "@/components/dashboard/SlaSelectionModal";
import GlobalTriageProgressBar from "@/components/dashboard/GlobalTriageProgressBar";
import RecentReportsSection from "@/components/dashboard/RecentReportsSection";
import RefundDialog from "@/components/dashboard/RefundDialog";
import TokenBalanceHeader from "@/components/dashboard/TokenBalanceHeader";
import { CalendarWidget } from "@/components/CalendarWidget";
import { DemoModeToggle } from "@/components/DemoModeToggle";
import dayjs from "dayjs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDashboardData, Study } from "@/hooks/useDashboardData";
import { useDemoMode } from "@/contexts/DemoModeContext";

// Memoized components to prevent unnecessary re-renders
const MemoizedKPICard = memo(KPICard);
const MemoizedPendingTriageSection = memo(PendingTriageSection);
const MemoizedRecentReportsSection = memo(RecentReportsSection);
const MemoizedGlobalTriageProgressBar = memo(GlobalTriageProgressBar);
const MemoizedUrgentQueue = memo(UrgentQueue);
const MemoizedCalendarWidget = memo(CalendarWidget);

export default function Dashboard() {
  const navigate = useNavigate();
  const [selectedStudy, setSelectedStudy] = useState<Study | null>(null);
  const [slaModalOpen, setSlaModalOpen] = useState(false);
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [refundStudy, setRefundStudy] = useState<Study | null>(null);

  // Use optimized hook with request deduplication
  const {
    studies,
    metrics,
    filteredStudies,
    isLoading,
    tokenBalance,
    previousBalance,
  } = useDashboardData();

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

  const hasProcessingStudies = processingStudies.length > 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center space-y-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-6 animate-fade-in ${hasProcessingStudies ? "pt-24" : ""}`}>
      {/* Global Progress Bar for Processing Studies */}
      {hasProcessingStudies && (
        <MemoizedGlobalTriageProgressBar studies={processingStudies} />
      )}

      {/* Header with Token Balance */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {dayjs().format("dddd, MMMM D, YYYY")}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <DemoModeToggle />
          <TokenBalanceHeader 
            balance={tokenBalance} 
            previousBalance={previousBalance}
          />
        </div>
      </div>

      {/* Pending Triage Section - Shows when there are uploads awaiting SLA */}
      {pendingTriageStudies.length > 0 && (
        <MemoizedPendingTriageSection
          studies={pendingTriageStudies}
          onSelectSla={handleSelectSla}
        />
      )}

      {/* Quick Actions - Core workflow focused */}
      <Card className="openai-card border-2">
        <CardHeader className="pb-4">
          <CardTitle className="text-xl">Quick Actions</CardTitle>
          <CardDescription className="text-sm">Your most common tasks</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="lg"
                  className="quick-action-btn h-20 flex-col gap-2 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                  onClick={() => navigate("/app/lanes")}
                >
                  <Activity className="h-5 w-5 shrink-0" />
                  <span className="text-sm">Triage Queue</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>View STAT/TAT triage lanes</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="lg"
                  variant="outline"
                  className="quick-action-btn h-20 flex-col gap-2 quick-outline transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                  onClick={() => navigate("/app/studies")}
                >
                  <Upload className="h-5 w-5 shrink-0" />
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
                  className="quick-action-btn h-20 flex-col gap-2 quick-outline transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                  onClick={() => navigate("/app/reports")}
                >
                  <TrendingUp className="h-5 w-5 shrink-0" />
                  <span className="text-sm">View Reports</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>See completed reports</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="lg"
                  variant="outline"
                  className="quick-action-btn h-20 flex-col gap-2 quick-outline transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                  onClick={() => navigate("/app/wallet")}
                >
                  <Coins className="h-5 w-5 shrink-0" />
                  <span className="text-sm">Buy Tokens</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Purchase analysis tokens</TooltipContent>
            </Tooltip>
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards - Using real metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MemoizedKPICard
          label="Pending Studies"
          value={metrics?.pendingCount || 0}
          change={`${metrics?.statCases || 0} STAT urgent`}
          trend={metrics?.pendingCount && metrics.pendingCount > 5 ? "up" : "neutral"}
          color="kpi-amber"
          onClick={() => navigate("/app/studies?filter=uploaded")}
        />

        <MemoizedKPICard
          label="Completed Today"
          value={metrics?.completedToday || 0}
          change="Daily progress"
          trend={metrics?.completedToday && metrics.completedToday >= 3 ? "up" : "neutral"}
          color="kpi-green"
        />

        <MemoizedKPICard 
          label="This Week" 
          value={metrics?.completedWeek || 0} 
          change="Studies analyzed" 
          trend={metrics?.completedWeek && metrics.completedWeek >= 10 ? "up" : "neutral"} 
          color="kpi-cyan" 
        />

        <MemoizedKPICard
          label="Token Balance"
          value={tokenBalance}
          change={`${metrics?.tokensUsedMonth || 0} used this month`}
          trend={tokenBalance < 5 ? "down" : "neutral"}
          color="kpi-indigo"
          onClick={() => navigate("/app/wallet")}
        />
      </div>

      {/* Secondary metrics row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MemoizedKPICard 
          label="Avg Turnaround" 
          value={metrics?.avgTurnaround || "--"} 
          change="Time to report" 
          trend="up" 
          color="kpi-blue" 
        />

        <MemoizedKPICard
          label="This Month"
          value={metrics?.completedMonth || 0}
          change="Monthly total"
          trend="up"
          color="kpi-neutral"
        />

        <MemoizedKPICard 
          label="Total Studies" 
          value={metrics?.totalStudies || 0} 
          change={`${metrics?.completedTotal || 0} completed`}
          trend="neutral" 
          color="kpi-cyan" 
        />

        <MemoizedKPICard 
          label="Processing Now" 
          value={metrics?.processingCount || 0} 
          change="Active analyses" 
          trend={metrics?.processingCount && metrics.processingCount > 0 ? "up" : "neutral"} 
          color="kpi-blue" 
        />
      </div>

      {/* Recent Reports Section */}
      {completedReports.length > 0 && (
        <MemoizedRecentReportsSection
          studies={completedReports}
          onRequestRefund={handleRequestRefund}
        />
      )}

      {/* Analytics & Recent Studies Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="openai-card">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Performance Summary
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-1">
                <div className="text-3xl font-bold">{metrics?.totalStudies || 0}</div>
                <div className="text-sm text-muted-foreground">Total Studies</div>
              </div>
              <div className="space-y-1">
                <div className="text-3xl font-bold">{metrics?.avgTurnaround || "--"}</div>
                <div className="text-sm text-muted-foreground">Avg. Review Time</div>
              </div>
              <div className="space-y-1">
                <div className="text-3xl font-bold text-emerald-600">
                  {metrics?.totalStudies ? Math.round((metrics.completedTotal / metrics.totalStudies) * 100) : 0}%
                </div>
                <div className="text-sm text-muted-foreground">Completion Rate</div>
              </div>
              <div className="space-y-1">
                <div className="text-3xl font-bold">{tokenBalance}</div>
                <div className="text-sm text-muted-foreground">Available Tokens</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="openai-card">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                Recent Studies
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate("/app/studies")}>
                View All
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-48">
              {studies && studies.length > 0 ? (
                <div className="space-y-3">
                  {studies.slice(0, 5).map((study) => {
                    const meta = study.meta as any;
                    const isCompleted = study.triage_status === "completed" || study.state === "signed";
                    const isProcessing = study.triage_status === "processing";
                    
                    // Build patient info string with age/gender
                    const patientAge = meta?.patient_age;
                    const patientGender = meta?.patient_gender;
                    const ageGenderStr = [
                      patientAge ? `${patientAge}y` : null,
                      patientGender ? patientGender.charAt(0).toUpperCase() : null
                    ].filter(Boolean).join("/");
                    
                    return (
                      <div 
                        key={study.id} 
                        className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer border"
                        onClick={() => navigate(`/app/studies/${study.id}`)}
                      >
                        <div className="flex items-center gap-3">
                          {isCompleted ? (
                            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                          ) : isProcessing ? (
                            <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
                          ) : (
                            <AlertCircle className="h-5 w-5 text-amber-500" />
                          )}
                          <div>
                            <p className="font-medium text-sm">
                              {meta?.patient_name || "Unknown Patient"}
                              {ageGenderStr && (
                                <span className="text-muted-foreground font-normal ml-1.5">
                                  ({ageGenderStr})
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {meta?.patient_id || study.id.slice(0, 8)} • {dayjs(study.created_at).format("MMM D, h:mm A")}
                            </p>
                          </div>
                        </div>
                        <Badge variant={isCompleted ? "default" : isProcessing ? "secondary" : "outline"}>
                          {study.sla}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No studies yet</p>
                  <Button variant="link" size="sm" onClick={() => navigate("/app/studies")}>
                    Upload your first study
                  </Button>
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Calendar Widget - Full width to match Activity card height */}
      <MemoizedCalendarWidget />

      {/* Urgent Queue */}
      {pendingStudies.length > 0 && (
        <div className="openai-section">
          <MemoizedUrgentQueue studies={pendingStudies} />
        </div>
      )}

      {/* SLA Selection Modal */}
      <SlaSelectionModal
        open={slaModalOpen}
        onOpenChange={setSlaModalOpen}
        study={selectedStudy}
        tokenBalance={tokenBalance}
        onInsufficientTokens={handleInsufficientTokens}
      />

      {/* Refund Dialog */}
      <RefundDialog
        open={refundDialogOpen}
        onOpenChange={setRefundDialogOpen}
        study={refundStudy}
      />
    </div>
  );
}
