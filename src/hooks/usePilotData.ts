import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useRef, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useUserSession } from "@/contexts/UserSessionContext";

export interface PilotStudy {
  id: string;
  sla: string;
  state: string;
  created_at: string;
  meta: any;
  triage_status: string | null;
  triage_progress: number | null;
  triage_completed_at: string | null;
  refund_requested: boolean | null;
  tokens_deducted: number | null;
}

const STUDY_COLUMNS = "id, sla, state, created_at, meta, triage_status, triage_progress, triage_completed_at, refund_requested, tokens_deducted";

/**
 * Single lightweight hook for ALL Pilot SKU data needs.
 * One studies query + one wallet query + one filtered realtime channel.
 * Shared across PilotDashboard and PilotStudiesView via queryKey caching.
 */
export function usePilotData() {
  const { userId, isAuthenticated } = useUserSession();
  const navigate = useNavigate();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Single studies query — RLS + filter excludes samples
  const {
    data: studies,
    isLoading: studiesLoading,
    refetch: refetchStudies,
  } = useQuery({
    queryKey: ["pilot-studies", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("studies")
        .select(STUDY_COLUMNS)
        .or("sample.is.null,sample.eq.false")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        console.error("Pilot studies fetch:", error);
        return [] as PilotStudy[];
      }
      return (data || []) as PilotStudy[];
    },
    enabled: isAuthenticated && !!userId,
    staleTime: 20_000,
    gcTime: 120_000,
  });

  // Single wallet query
  const {
    data: wallet,
    refetch: refetchWallet,
  } = useQuery({
    queryKey: ["wallet-balance", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wallets")
        .select("tokens")
        .maybeSingle();

      if (error) {
        console.error("Wallet fetch:", error);
        return { tokens: 0 };
      }
      return data || { tokens: 0 };
    },
    enabled: isAuthenticated && !!userId,
    staleTime: 30_000,
    gcTime: 120_000,
  });

  // Single filtered realtime channel
  useEffect(() => {
    if (channelRef.current || !isAuthenticated || !userId) return;

    let debounce: NodeJS.Timeout | null = null;

    channelRef.current = supabase
      .channel(`pilot-rt-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "studies",
          filter: `owner=eq.${userId}`,
        },
        (payload) => {
          if (debounce) clearTimeout(debounce);
          debounce = setTimeout(() => refetchStudies(), 400);

          // Toast on triage completion
          if (payload.eventType === "UPDATE") {
            const n = payload.new as PilotStudy;
            const o = payload.old as Partial<PilotStudy>;
            if (o.triage_status === "processing" && n.triage_status === "completed") {
              const name = (n.meta as any)?.patient_name || `Study ${n.id.slice(0, 6)}`;
              toast.success(`Analysis complete: ${name}`, {
                description: "Report ready for review",
                action: {
                  label: "View",
                  onClick: () => navigate(`/app/studies/${n.id}`),
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

    return () => {
      if (debounce) clearTimeout(debounce);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [isAuthenticated, userId, navigate, refetchStudies, refetchWallet]);

  // Memoized categorization — no heavy metrics, just buckets
  const categorized = useMemo(() => {
    const all = studies || [];
    return {
      pending: all.filter(
        (s) =>
          s.state === "awaiting_sla" ||
          (s.state === "uploaded" &&
            (!s.triage_status ||
              s.triage_status === "awaiting_sla" ||
              s.triage_status === "pending"))
      ),
      processing: all.filter(
        (s) =>
          s.triage_status === "processing" ||
          s.state === "ai_draft" ||
          s.state === "in_review"
      ),
      completed: all.filter(
        (s) => s.state === "signed" || s.triage_status === "completed"
      ),
    };
  }, [studies]);

  // Optimistic helper: instantly move a study to "processing" in cache
  const optimisticStartTriage = useCallback(
    (studyId: string, sla: string) => {
      // We don't directly mutate query cache to avoid complexity;
      // realtime + refetch handles it within ~400ms.
      // But we do an immediate refetch to speed things up.
      setTimeout(() => refetchStudies(), 200);
    },
    [refetchStudies]
  );

  return {
    studies: studies || [],
    isLoading: studiesLoading,
    tokenBalance: typeof wallet?.tokens === "number" ? wallet.tokens : 0,
    ...categorized,
    refetchStudies,
    refetchWallet,
    optimisticStartTriage,
  };
}
