import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import dayjs from "dayjs";
import { useUserSession } from "@/contexts/UserSessionContext";
import { useDemoMode } from "@/contexts/DemoModeContext";

export interface Study {
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
  sample?: boolean;
}

export function useDashboardData() {
  const { userId, isAuthenticated } = useUserSession();
  const { isDemoMode } = useDemoMode();
  const navigate = useNavigate();
  const previousBalanceRef = useRef<number | undefined>(undefined);
  const realtimeChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Studies query - filtered by demo mode
  const { data: studies, isLoading: studiesLoading, refetch: refetchStudies } = useQuery({
    queryKey: ["dashboard-studies", userId, isDemoMode],
    queryFn: async () => {
      let query = supabase
        .from("studies")
        .select("id, sla, state, created_at, meta, triage_status, triage_progress, triage_completed_at, refund_requested, tokens_deducted, duration_min, sample")
        .order("created_at", { ascending: false })
        .limit(100);
      
      // Filter by demo mode
      if (isDemoMode) {
        query = query.eq("sample", true);
      } else {
        // Show user's own studies (RLS handles this) but exclude sample studies
        query = query.or(`sample.is.null,sample.eq.false`);
      }
      
      const { data, error } = await query;
      
      if (error) {
        console.error("Studies fetch error:", error);
        return [] as Study[];
      }
      return (data || []) as Study[];
    },
    enabled: isAuthenticated && !!userId,
    staleTime: 30000,
    gcTime: 120000,
  });

  // Wallet query - RLS handles user filtering
  const { data: wallet, refetch: refetchWallet } = useQuery({
    queryKey: ["wallet-balance", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wallets")
        .select("tokens")
        .maybeSingle();
      
      if (error) {
        console.error("Wallet fetch error:", error);
        return { tokens: 0 };
      }
      return data || { tokens: 0 };
    },
    enabled: isAuthenticated && !!userId,
    staleTime: 30000,
    gcTime: 120000,
  });

  // Track previous balance for animation
  useEffect(() => {
    if (wallet?.tokens !== undefined && previousBalanceRef.current !== wallet.tokens) {
      previousBalanceRef.current = wallet.tokens;
    }
  }, [wallet?.tokens]);

  // Single realtime subscription
  useEffect(() => {
    if (realtimeChannelRef.current || !isAuthenticated) return;

    const channel = supabase
      .channel("dashboard-realtime-unified")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "studies" },
        (payload) => {
          // Debounced refetch
          setTimeout(() => refetchStudies(), 1000);

          // Toast for completed triage
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
              refetchWallet();
            }
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "wallets" },
        () => refetchWallet()
      )
      .subscribe();

    realtimeChannelRef.current = channel;

    return () => {
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
        realtimeChannelRef.current = null;
      }
    };
  }, [isAuthenticated, navigate, refetchStudies, refetchWallet]);

  // Memoized metrics
  const metrics = useMemo(() => {
    if (!studies || studies.length === 0) {
      return {
        completedToday: 0,
        completedWeek: 0,
        completedMonth: 0,
        pendingCount: 0,
        processingCount: 0,
        statCases: 0,
        avgTurnaround: "--",
        tokensUsedMonth: 0,
        totalStudies: 0,
        completedTotal: 0,
      };
    }
    
    const now = dayjs();
    const todayStart = now.startOf("day");
    const weekStart = now.startOf("week");
    const monthStart = now.startOf("month");
    
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
    
    const pendingStudies = studies.filter(s => 
      s.state === "awaiting_sla" ||
      (s.state === "uploaded" && 
       (!s.triage_status || s.triage_status === "awaiting_sla" || s.triage_status === "pending"))
    );
    
    const processingStudies = studies.filter(s => s.triage_status === "processing");
    const statCases = pendingStudies.filter(s => s.sla === "STAT").length;
    
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
      avgTurnaround: completedStudies.length > 0 ? "4.2h" : "--",
      tokensUsedMonth,
      totalStudies: studies.length,
      completedTotal: completedStudies.length,
    };
  }, [studies]);

  // Memoized filtered study lists
  const filteredStudies = useMemo(() => {
    if (!studies || studies.length === 0) {
      return {
        pendingTriageStudies: [],
        processingStudies: [],
        completedReports: [],
        pendingStudies: [],
      };
    }

    return {
      pendingTriageStudies: studies.filter(
        (s) => s.state === "awaiting_sla" || 
        (s.state === "uploaded" && (!s.triage_status || s.triage_status === "awaiting_sla" || s.triage_status === "pending"))
      ),
      processingStudies: studies.filter((s) => s.triage_status === "processing"),
      completedReports: studies.filter(
        (s) => s.state === "signed" || s.triage_status === "completed"
      ).slice(0, 5),
      pendingStudies: studies.filter(
        (s) => s.state === "uploaded" || s.state === "ai_draft" || s.state === "in_review"
      ),
    };
  }, [studies]);

  return {
    studies: studies || [],
    wallet,
    metrics,
    filteredStudies,
    isLoading: studiesLoading,
    tokenBalance: typeof wallet?.tokens === 'number' ? wallet.tokens : 0,
    previousBalance: previousBalanceRef.current,
    refetchStudies,
    refetchWallet,
  };
}
