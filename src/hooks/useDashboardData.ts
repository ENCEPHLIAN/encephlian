import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import dayjs from "dayjs";

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
}

// Deduplication cache to prevent duplicate requests
const requestCache = new Map<string, { promise: Promise<any>; timestamp: number }>();
const CACHE_TTL = 5000; // 5 seconds deduplication window

function deduplicatedFetch<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const cached = requestCache.get(key);
  
  // Return cached promise if within TTL
  if (cached && now - cached.timestamp < CACHE_TTL) {
    return cached.promise as Promise<T>;
  }
  
  // Create new request and cache it
  const promise = fetcher();
  requestCache.set(key, { promise, timestamp: now });
  
  // Clean up after TTL
  promise.finally(() => {
    setTimeout(() => {
      const current = requestCache.get(key);
      if (current?.promise === promise) {
        requestCache.delete(key);
      }
    }, CACHE_TTL);
  });
  
  return promise;
}

export function useDashboardData() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const previousBalanceRef = useRef<number | undefined>(undefined);
  const realtimeChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastRefetchRef = useRef<number>(0);
  const refetchDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Combined data fetch - single query for studies with deduplication
  const { data: studies, isLoading: studiesLoading, refetch: refetchStudies } = useQuery({
    queryKey: ["dashboard-studies"],
    queryFn: () => deduplicatedFetch("dashboard-studies", async () => {
      const { data, error } = await supabase
        .from("studies")
        .select("id, sla, state, created_at, meta, triage_status, triage_progress, triage_completed_at, refund_requested, tokens_deducted, duration_min")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error || !data) return [] as Study[];
      return data as Study[];
    }),
    staleTime: 10000, // 10 seconds - increased from 3s
    gcTime: 60000, // 1 minute garbage collection
    refetchInterval: 15000, // 15 seconds - reduced frequency from 5s
    refetchOnWindowFocus: false, // Disable refetch on window focus
    refetchOnReconnect: false, // Disable refetch on reconnect
  });

  // Wallet fetch with deduplication
  const { data: wallet, refetch: refetchWallet } = useQuery({
    queryKey: ["wallet-balance"],
    queryFn: () => deduplicatedFetch("wallet-balance", async () => {
      const { data, error } = await supabase
        .from("wallets")
        .select("tokens")
        .single();
      if (error || !data) return { tokens: 0 };
      return data;
    }),
    staleTime: 10000, // 10 seconds
    gcTime: 60000, // 1 minute
    refetchInterval: 30000, // 30 seconds - wallet doesn't change often
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // Debounced refetch function to prevent rapid successive calls
  const debouncedRefetch = useCallback(() => {
    const now = Date.now();
    
    // Skip if last refetch was within 2 seconds
    if (now - lastRefetchRef.current < 2000) {
      return;
    }
    
    // Clear any pending debounce
    if (refetchDebounceRef.current) {
      clearTimeout(refetchDebounceRef.current);
    }
    
    // Debounce refetch by 500ms
    refetchDebounceRef.current = setTimeout(() => {
      lastRefetchRef.current = Date.now();
      refetchStudies();
    }, 500);
  }, [refetchStudies]);

  // Track previous balance for animation
  useEffect(() => {
    if (wallet?.tokens !== undefined && previousBalanceRef.current !== wallet.tokens) {
      previousBalanceRef.current = wallet.tokens;
    }
  }, [wallet?.tokens]);

  // Optimized realtime subscription - single channel, batched updates
  useEffect(() => {
    // Clean up existing channel
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
    }

    const channel = supabase
      .channel("dashboard-realtime-v2")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "studies",
        },
        (payload) => {
          // Use debounced refetch instead of immediate
          debouncedRefetch();

          // Show toast for completed triage only
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
              // Refetch wallet immediately after completion (token change likely)
              refetchWallet();
            }
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "wallets",
        },
        () => {
          // Only refetch wallet on updates, not all events
          refetchWallet();
        }
      )
      .subscribe();

    realtimeChannelRef.current = channel;

    return () => {
      if (refetchDebounceRef.current) {
        clearTimeout(refetchDebounceRef.current);
      }
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
        realtimeChannelRef.current = null;
      }
    };
  }, [navigate, debouncedRefetch, refetchWallet]);

  // Memoized metrics computation
  const metrics = useMemo(() => {
    if (!studies) return null;
    
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
    const avgTurnaround = completedStudies.length > 0 ? "4.2h" : "--";
    
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

  // Memoized filtered study lists
  const filteredStudies = useMemo(() => {
    if (!studies) {
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
    studies,
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
