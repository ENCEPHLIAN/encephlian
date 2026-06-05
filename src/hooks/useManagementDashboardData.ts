/**
 * useManagementDashboardData — query hook for the per-clinic management dashboard.
 *
 * Three RPCs (throughput / pipeline health / signal quality) + a single
 * Supabase realtime channel on `studies` that debounce-invalidates them.
 * 30s refetchInterval matches the AdminDashboard pattern (design §8).
 *
 * Honesty discipline: this hook does NOT call any model-metrics RPC. The
 * dashboard reads model verdicts directly from `model_validation_runs` if
 * it surfaces any model claim — never hardcoded constants. The footer
 * panel ships with a hardcoded copy bundle in P0; that bundle lives in
 * HonestGapsFooter, not here.
 *
 * Resolves the clinic_id once via `management_user_clinic_id` (SECURITY
 * DEFINER helper) and passes it explicitly to each RPC. Multi-clinic
 * switcher support is P1.
 *
 * Spec: docs/per_clinic_ops_dashboard_design.md §6 + §11.
 */

import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserSession } from "@/contexts/UserSessionContext";

const REFETCH_INTERVAL_MS = 30_000;
const STALE_TIME_MS = 25_000;

export interface ThroughputSummary {
  clinic_id: string;
  window_days: number;
  today_count: number;
  week_count: number;
  month_count: number;
  sparkline: Array<{ day: string; count: number }>;
  by_vendor_30d: Array<{ format: string; count: number }>;
  by_clinician_30d: Array<{ owner_id: string | null; full_name: string; count: number }>;
  generated_at: string;
}

export interface PipelineUptimeRow {
  source: string;
  total_events: number;
  error_events: number;
  uptime: number | null;
}

export interface PipelineFailureRow {
  study_id: string;
  step: string;
  source: string;
  correlation_id: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
}

export interface PipelineHealthSummary {
  clinic_id: string;
  uptime_24h_by_source: PipelineUptimeRow[];
  mean_processing_seconds_7d: number | null;
  studies_7d: number;
  failed_7d: number;
  failure_rate_7d: number | null;
  failure_breakdown_7d: Array<{ step: string; count: number }>;
  recent_failures: PipelineFailureRow[];
  silent_failures_7d: number;
  generated_at: string;
}

export interface SignalQualitySummary {
  clinic_id: string;
  window_days: number;
  studies_in_window: number;
  poor_quality_studies: number;
  pct_poor_quality: number | null;
  avg_bad_channel_pct_30d: number | null;
  top_bad_channels_30d: Array<{ channel: string; count: number }>;
  weekly_bins_30d: Array<{
    week_start: string;
    total_studies: number;
    poor_quality_studies: number;
    pct_poor_quality: number | null;
  }>;
  generated_at: string;
}

export interface ManagementDashboardData {
  clinicId: string | null;
  throughput: ThroughputSummary | null;
  pipeline: PipelineHealthSummary | null;
  signalQuality: SignalQualitySummary | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useManagementDashboardData(): ManagementDashboardData {
  const { userId, isAuthenticated, clinicContext } = useUserSession();
  const queryClient = useQueryClient();
  const realtimeChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // 1. Resolve the user's clinic_id once. Prefer the session-context value
  //    if present (already loaded by UserSessionProvider) — fall back to the
  //    helper RPC for users whose user_clinic_context row is stale. Either
  //    way the result is the source of truth for every other RPC call.
  const clinicIdQuery = useQuery({
    queryKey: ["management-dashboard", "clinic-id", userId],
    queryFn: async (): Promise<string | null> => {
      if (clinicContext?.clinic_id) return clinicContext.clinic_id;
      if (!userId) return null;
      const { data, error } = await supabase.rpc("management_user_clinic_id", {
        p_user_id: userId,
      });
      if (error) throw error;
      return (data as string | null) ?? null;
    },
    enabled: isAuthenticated && !!userId,
    staleTime: 5 * 60_000,
  });

  const clinicId = clinicIdQuery.data ?? null;

  // 2. Throughput.
  const throughputQuery = useQuery({
    queryKey: ["management-dashboard", "throughput", clinicId],
    queryFn: async (): Promise<ThroughputSummary | null> => {
      if (!clinicId) return null;
      const { data, error } = await supabase.rpc("clinic_throughput_summary", {
        p_clinic_id: clinicId,
        p_window_days: 14,
      });
      if (error) throw error;
      return data as ThroughputSummary;
    },
    enabled: !!clinicId,
    refetchInterval: REFETCH_INTERVAL_MS,
    staleTime: STALE_TIME_MS,
  });

  // 3. Pipeline health.
  const pipelineQuery = useQuery({
    queryKey: ["management-dashboard", "pipeline", clinicId],
    queryFn: async (): Promise<PipelineHealthSummary | null> => {
      if (!clinicId) return null;
      const { data, error } = await supabase.rpc("clinic_pipeline_health_summary", {
        p_clinic_id: clinicId,
      });
      if (error) throw error;
      return data as PipelineHealthSummary;
    },
    enabled: !!clinicId,
    refetchInterval: REFETCH_INTERVAL_MS,
    staleTime: STALE_TIME_MS,
  });

  // 4. Signal quality.
  const signalQualityQuery = useQuery({
    queryKey: ["management-dashboard", "signal-quality", clinicId],
    queryFn: async (): Promise<SignalQualitySummary | null> => {
      if (!clinicId) return null;
      const { data, error } = await supabase.rpc("clinic_signal_quality_summary", {
        p_clinic_id: clinicId,
        p_window_days: 7,
      });
      if (error) throw error;
      return data as SignalQualitySummary;
    },
    enabled: !!clinicId,
    refetchInterval: REFETCH_INTERVAL_MS,
    staleTime: STALE_TIME_MS,
  });

  // 5. Single realtime subscription on `studies`. Debounced to one
  //    invalidate-all per 1s burst — avoids hammering the RPCs when a
  //    failover storm produces many rapid updates.
  useEffect(() => {
    if (!isAuthenticated || !clinicId || realtimeChannelRef.current) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const invalidateAll = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["management-dashboard", "throughput", clinicId] });
        queryClient.invalidateQueries({ queryKey: ["management-dashboard", "pipeline", clinicId] });
        queryClient.invalidateQueries({ queryKey: ["management-dashboard", "signal-quality", clinicId] });
      }, 1_000);
    };

    const channel = supabase
      .channel(`management-dashboard-${clinicId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "studies" },
        invalidateAll,
      )
      .subscribe();

    realtimeChannelRef.current = channel;

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
        realtimeChannelRef.current = null;
      }
    };
  }, [isAuthenticated, clinicId, queryClient]);

  const isLoading =
    clinicIdQuery.isLoading ||
    (!!clinicId &&
      (throughputQuery.isLoading || pipelineQuery.isLoading || signalQualityQuery.isLoading));

  const isError =
    clinicIdQuery.isError ||
    throughputQuery.isError ||
    pipelineQuery.isError ||
    signalQualityQuery.isError;

  const error =
    (clinicIdQuery.error as Error | null) ??
    (throughputQuery.error as Error | null) ??
    (pipelineQuery.error as Error | null) ??
    (signalQualityQuery.error as Error | null) ??
    null;

  return {
    clinicId,
    throughput: throughputQuery.data ?? null,
    pipeline: pipelineQuery.data ?? null,
    signalQuality: signalQualityQuery.data ?? null,
    isLoading,
    isError,
    error,
    refetch: async () => {
      await Promise.all([
        throughputQuery.refetch(),
        pipelineQuery.refetch(),
        signalQualityQuery.refetch(),
      ]);
    },
  };
}
