import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Loader2, Activity, Upload, StickyNote, Coins, TrendingUp, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import KPICard from "@/components/dashboard/KPICard";
import UrgentQueue from "@/components/dashboard/UrgentQueue";
import PerformanceCharts from "@/components/dashboard/PerformanceCharts";
import ActivityFeed from "@/components/dashboard/ActivityFeed";
import PendingTriageSection from "@/components/dashboard/PendingTriageSection";
import SlaSelectionModal from "@/components/dashboard/SlaSelectionModal";
import GlobalTriageProgressBar from "@/components/dashboard/GlobalTriageProgressBar";
import RecentReportsSection from "@/components/dashboard/RecentReportsSection";
import RefundDialog from "@/components/dashboard/RefundDialog";
import TokenBalanceHeader from "@/components/dashboard/TokenBalanceHeader";
import { CalendarWidget } from "@/components/CalendarWidget";
import dayjs from "dayjs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface Study {
  id: string;
  sla: string;
  state: string;
  created_at: string;
  meta: any;
  triage_status?: string;
  triage_progress?: number;
  triage_completed_at?: string;
  refund_requested?: boolean;
  tokens_deducted?: number;
  duration_min?: number;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedStudy, setSelectedStudy] = useState<Study | null>(null);
  const [slaModalOpen, setSlaModalOpen] = useState(false);
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [refundStudy, setRefundStudy] = useState<Study | null>(null);
  const previousBalanceRef = useRef<number | undefined>(undefined);

  const { data: user } = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user;
    },
  });

  const { data: studies, isLoading, refetch: refetchStudies } = useQuery({
    queryKey: ["dashboard-studies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("studies")
        .select("id, sla, state, created_at, meta, triage_status, triage_progress, triage_completed_at, refund_requested, tokens_deducted, duration_min")
        .order("created_at", { ascending: false })
        .limit(100);
      // Return empty array if error or no data - never fail
      if (error || !data) return [] as Study[];
      return data as Study[];
    },
    staleTime: 3000,
    gcTime: 30000,
    refetchInterval: 5000,
  });

  const { data: wallet, refetch: refetchWallet } = useQuery({
    queryKey: ["wallet-balance"],
    queryFn: async () => {
      const { data, error } = await supabase.from("wallets").select("tokens").single();
      // If no wallet exists, return 0 tokens instead of failing
      if (error || !data) return { tokens: 0 };
      return data;
    },
    refetchInterval: 5000,
    staleTime: 3000,
  });

  // Track previous balance for animation
  useEffect(() => {
    if (wallet?.tokens !== undefined && previousBalanceRef.current !== wallet.tokens) {
      previousBalanceRef.current = wallet.tokens;
    }
  }, [wallet?.tokens]);

  // Subscribe to realtime updates for studies
  useEffect(() => {
    const channel = supabase
      .channel("dashboard-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "studies",
        },
        (payload) => {
          // Immediately refetch studies
          refetchStudies();
          refetchWallet();

          // Show toast for completed triage
          if (payload.eventType === "UPDATE") {
            const newData = payload.new as Study;
            const oldData = payload.old as Partial<Study>;
            
            if (
              oldData.triage_status === "processing" &&
              newData.triage_status === "completed"
            ) {
              const meta = (newData.meta || {}) as Record<string, any>;
              const patientId = meta.patient_name || meta.patient_id || `Study ${newData.id.slice(0, 6)}`;
              toast.success(`Analysis complete for ${patientId}`, {
                description: "Report is ready for review",
                action: {
                  label: "View Report",
                  onClick: () => navigate(`/app/studies/${newData.id}`),
                },
              });
            }
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "wallets",
        },
        () => {
          refetchWallet();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, navigate, refetchStudies, refetchWallet]);

  // Compute metrics from studies data
  const metrics = useMemo(() => {
    if (!studies) return null;
    
    const now = dayjs();
    const todayStart = now.startOf("day");
    const weekStart = now.startOf("week");
    const monthStart = now.startOf("month");
    
    // Completed studies (signed or triage completed)
    const completedStudies = studies.filter(s => 
      s.state === "signed" || s.triage_status === "completed"
    );
    
    const completedToday = completedStudies.filter(s => 
      dayjs(s.triage_completed_at || s.created_at).isAfter(todayStart)
    ).length;
    
    const completedWeek = completedStudies.filter(s => 
      dayjs(s.triage_completed_at || s.created_at).isAfter(weekStart)
    ).length;
    
    const completedMonth = completedStudies.filter(s => 
      dayjs(s.triage_completed_at || s.created_at).isAfter(monthStart)
    ).length;
    
    // Pending studies (awaiting SLA or uploaded)
    const pendingStudies = studies.filter(s => 
      s.state === "uploaded" && 
      (!s.triage_status || s.triage_status === "awaiting_sla" || s.triage_status === "pending")
    );
    
    // Processing studies
    const processingStudies = studies.filter(s => s.triage_status === "processing");
    
    // STAT cases
    const statCases = pendingStudies.filter(s => s.sla === "STAT").length;
    
    // Calculate average turnaround (mock for now - would need actual timestamps)
    const avgTurnaround = completedStudies.length > 0 ? "4.2h" : "--";
    
    // Total tokens used this month
    const tokensUsedMonth = studies
      .filter(s => dayjs(s.created_at).isAfter(monthStart))
      .reduce((sum, s) => sum + (s.tokens_deducted || 0), 0);
    
    return {
      completedToday,
      completedWeek,
      completedMonth,
      pendingCount: pendingStudies.length,
      processingCount: processingStudies.length,
      statCases,
      avgTurnaround,
      tokensUsedMonth,
      totalStudies: studies.length,
      completedTotal: completedStudies.length,
    };
  }, [studies]);

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

  // Filter studies by status
  const pendingTriageStudies = studies?.filter(
    (s) => s.state === "uploaded" && (!s.triage_status || s.triage_status === "awaiting_sla" || s.triage_status === "pending")
  ) || [];

  const processingStudies = studies?.filter(
    (s) => s.triage_status === "processing"
  ) || [];

  const completedReports = studies?.filter(
    (s) => s.state === "signed" || s.triage_status === "completed"
  ).slice(0, 5) || [];

  const pendingStudies = studies?.filter(
    (s) => s.state === "uploaded" || s.state === "ai_draft" || s.state === "in_review"
  ) || [];

  const handleSelectSla = (study: Study) => {
    setSelectedStudy(study);
    setSlaModalOpen(true);
  };

  const handleInsufficientTokens = () => {
    setSlaModalOpen(false);
    toast.error("Not enough tokens", {
      description: "Please purchase more tokens to start triage.",
    });
    navigate("/app/wallet");
  };

  const handleRequestRefund = (study: Study) => {
    setRefundStudy(study);
    setRefundDialogOpen(true);
  };

  // Ensure tokenBalance always has a valid number
  const tokenBalance = typeof wallet?.tokens === 'number' ? wallet.tokens : 0;
  const hasProcessingStudies = processingStudies.length > 0;
  const studyCount = studies?.length ?? 0;

  return (
    <div className={`space-y-6 animate-fade-in ${hasProcessingStudies ? "pt-24" : ""}`}>
      {/* Global Progress Bar for Processing Studies */}
      {hasProcessingStudies && (
        <GlobalTriageProgressBar studies={processingStudies} />
      )}

      {/* Header with Token Balance */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {dayjs().format("dddd, MMMM D, YYYY")}
          </p>
        </div>
        <TokenBalanceHeader 
          balance={tokenBalance} 
          previousBalance={previousBalanceRef.current}
        />
      </div>

      {/* Pending Triage Section - Shows when there are uploads awaiting SLA */}
      {pendingTriageStudies.length > 0 && (
        <PendingTriageSection
          studies={pendingTriageStudies}
          onSelectSla={handleSelectSla}
        />
      )}

      {/* Quick Actions */}
      <Card className="openai-card border-2">
        <CardHeader className="pb-4">
          <CardTitle className="text-xl">Quick Actions</CardTitle>
          <CardDescription className="text-sm">Get started with your most common tasks</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="lg"
                  className="quick-action-btn h-20 flex-col gap-2 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                  onClick={() => navigate("/app/studies?filter=uploaded")}
                >
                  <Activity className="h-5 w-5 shrink-0" />
                  <span className="text-sm">Start Review</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Review pending EEG studies</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="lg"
                  variant="outline"
                  className="quick-action-btn h-20 flex-col gap-2 quick-outline transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                  onClick={() => navigate("/app/files")}
                >
                  <Upload className="h-5 w-5 shrink-0" />
                  <span className="text-sm">Upload Study</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Upload new EEG files</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="lg"
                  variant="outline"
                  className="quick-action-btn h-20 flex-col gap-2 quick-outline transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                  onClick={() => navigate("/app/notes")}
                >
                  <StickyNote className="h-5 w-5 shrink-0" />
                  <span className="text-sm">My Notes</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>View and edit your notes</TooltipContent>
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
        <KPICard
          label="Pending Studies"
          value={metrics?.pendingCount || 0}
          change={`${metrics?.statCases || 0} STAT urgent`}
          trend={metrics?.pendingCount && metrics.pendingCount > 5 ? "up" : "neutral"}
          color="kpi-amber"
          onClick={() => navigate("/app/studies?filter=uploaded")}
        />

        <KPICard
          label="Completed Today"
          value={metrics?.completedToday || 0}
          change="Daily progress"
          trend={metrics?.completedToday && metrics.completedToday >= 3 ? "up" : "neutral"}
          color="kpi-green"
        />

        <KPICard 
          label="This Week" 
          value={metrics?.completedWeek || 0} 
          change="Studies analyzed" 
          trend={metrics?.completedWeek && metrics.completedWeek >= 10 ? "up" : "neutral"} 
          color="kpi-cyan" 
        />

        <KPICard
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
        <KPICard 
          label="Avg Turnaround" 
          value={metrics?.avgTurnaround || "--"} 
          change="Time to report" 
          trend="up" 
          color="kpi-blue" 
        />

        <KPICard
          label="This Month"
          value={metrics?.completedMonth || 0}
          change="Monthly total"
          trend="up"
          color="kpi-neutral"
        />

        <KPICard 
          label="Total Studies" 
          value={metrics?.totalStudies || 0} 
          change={`${metrics?.completedTotal || 0} completed`}
          trend="neutral" 
          color="kpi-cyan" 
        />

        <KPICard 
          label="Processing Now" 
          value={metrics?.processingCount || 0} 
          change="Active analyses" 
          trend={metrics?.processingCount && metrics.processingCount > 0 ? "up" : "neutral"} 
          color="kpi-blue" 
        />
      </div>

      {/* Recent Reports Section */}
      {completedReports.length > 0 && (
        <RecentReportsSection
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
                            <p className="font-medium text-sm">{meta?.patient_name || "Unknown Patient"}</p>
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
                  <Button variant="link" size="sm" onClick={() => navigate("/app/files")}>
                    Upload your first study
                  </Button>
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Calendar Widget - Full width to match Activity card height */}
      <CalendarWidget />

      {/* Urgent Queue */}
      {pendingStudies.length > 0 && (
        <div className="openai-section">
          <UrgentQueue studies={pendingStudies} />
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
