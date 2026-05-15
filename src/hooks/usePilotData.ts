import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useRef, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useUserSession } from "@/contexts/UserSessionContext";

export interface PilotStudy {
  id: string;
  study_key: string | null;
  sla_selected_at?: string | null;
  reference?: string | null;
  sla: string;
  state: string;
  created_at: string;
  meta: any;
  original_format: string | null;
  triage_status: string | null;
  triage_progress: number | null;
  triage_completed_at: string | null;
  refund_requested: boolean | null;
  tokens_deducted: number | null;
  ai_draft_json?: any | null;
}

// EGRESS-CRITICAL: do NOT include ai_draft_json here. The MIND report can be
// 50-200 KB per study; pulling it for 50 studies × frequent polling = MBs of
// Supabase egress per minute per user. The report is already available via
// blob at eeg-reports/{study_id}/report.json and fetched by StudyDetail on
// demand. Keep this list lightweight.
const STUDY_COLUMNS =
  "id, study_key, reference, sla, state, created_at, meta, original_format, triage_status, triage_progress, triage_completed_at, refund_requested, tokens_deducted, sla_selected_at";

/** If PostgREST/schema lags, fall back without optional columns so pilot never goes blank. */
const STUDY_COLUMNS_FALLBACK =
  "id, study_key, sla, state, created_at, meta, original_format, triage_status, triage_progress, triage_completed_at, refund_requested, tokens_deducted";

/**
 * Single lightweight hook for ALL Pilot SKU data needs.
 * One studies query + one wallet query + one filtered realtime channel.
 * Shared across PilotDashboard and PilotStudiesView via queryKey caching.
 */
// C-Plane stage → triage_progress %
const STAGE_PROGRESS: Record<string, number> = {
  not_found: 10,
  raw_uploaded: 20,
  canonical_ready: 50,
  derived_ready: 80,
  complete: 100,
  failed: -1,
  error: -1,
};

// Studies stuck in processing longer than this are auto-marked failed
const PROCESSING_TIMEOUT_MS = 25 * 60 * 1000; // 25 minutes

export function usePilotData() {
  const { userId, isAuthenticated } = useUserSession();
  const navigate = useNavigate();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  // Stable ref so polling always sees latest processing list
  const processingRef = useRef<PilotStudy[]>([]);

  // Single studies query — RLS + filter excludes samples
  const {
    data: studies,
    isLoading: studiesLoading,
    refetch: refetchStudies,
  } = useQuery({
    queryKey: ["pilot-studies", userId],
    queryFn: async () => {
      let res = await supabase
        .from("studies")
        .select(STUDY_COLUMNS)
        .or("sample.is.null,sample.eq.false")
        .order("created_at", { ascending: false })
        .limit(50);

      if (res.error) {
        const msg = res.error.message || "";
        const retryable =
          msg.includes("reference") ||
          msg.includes("source_content_sha256") ||
          msg.includes("column") ||
          res.error.code === "PGRST204";
        if (retryable) {
          res = await supabase
            .from("studies")
            .select(STUDY_COLUMNS_FALLBACK)
            .or("sample.is.null,sample.eq.false")
            .order("created_at", { ascending: false })
            .limit(50);
        }
      }

      if (res.error) {
        console.error("Pilot studies fetch:", res.error);
        return [] as PilotStudy[];
      }
      return (res.data || []) as PilotStudy[];
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

    let debounce: ReturnType<typeof setTimeout> | null = null;

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
          // Debounce + ignore noisy fields. Only refetch the studies list when
          // a state-change happens. Avoids constant egress on minor updates.
          const n = payload.new as PilotStudy;
          const o = payload.old as Partial<PilotStudy>;
          const stateChanged =
            o?.state !== n?.state ||
            o?.triage_status !== n?.triage_status ||
            (o?.triage_progress ?? 0) !== (n?.triage_progress ?? 0);
          if (!stateChanged) return;

          if (debounce) clearTimeout(debounce);
          debounce = setTimeout(() => refetchStudies(), 800);

          if (payload.eventType === "UPDATE" &&
              o?.triage_status === "processing" && n?.triage_status === "completed") {
            const name = (n.meta as any)?.patient_name || `Study ${n.id.slice(0, 6)}`;
            toast.success(`Analysis complete: ${name}`, {
              description: "Report ready for review",
              action: { label: "View", onClick: () => navigate(`/app/studies/${n.id}`) },
            });
            refetchWallet();
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

  // Keep processingRef in sync with latest studies so polling can access it without re-registering
  const processingStudies = useMemo(
    () =>
      (studies || []).filter(
        (s) =>
          s.triage_status === "processing" ||
          (s.state === "processing" && s.triage_status !== "completed"),
      ),
    [studies],
  );
  processingRef.current = processingStudies;

  // Poll C-Plane status for in-progress studies and sync results to Supabase
  useEffect(() => {
    const CPLANE_BASE = (import.meta as any).env?.VITE_CPLANE_BASE as string | undefined;
    const IPLANE_BASE = (import.meta as any).env?.VITE_IPLANE_BASE as string | undefined;
    if (!CPLANE_BASE || !isAuthenticated) return;

    const checkStatus = async () => {
      const toCheck = processingRef.current;
      if (!toCheck.length) return;

      for (const study of toCheck) {
        try {
          const res = await fetch(`${CPLANE_BASE}/status/${study.id}`);
          if (!res.ok) continue;
          const status = await res.json() as { stage: string };
          const newProgress = STAGE_PROGRESS[status.stage] ?? 5;

          if (status.stage === "complete") {
            // EGRESS-CRITICAL: do NOT upsert the full MIND report into Supabase.
            // The report lives in Azure Blob (eeg-reports/{id}/report.json) and
            // StudyDetail fetches it directly from iplane on demand. Mirroring
            // it into ai_draft_json was the original egress hot-path.
            const { error: upErr } = await supabase
              .from("studies")
              .update({
                triage_status: "completed",
                triage_progress: 100,
                triage_completed_at: new Date().toISOString(),
                state: "completed",
              })
              .eq("id", study.id);
            if (!upErr) void refetchStudies();
          } else if (status.stage === "failed" || status.stage === "error") {
            // Pipeline reported failure — surface it immediately
            const { error: upErr } = await supabase
              .from("studies")
              .update({ triage_status: "failed", state: "failed", triage_progress: 0 })
              .eq("id", study.id);
            if (!upErr) {
              void refetchStudies();
              toast.error("Processing failed", {
                description: `Study ${study.id.slice(0, 8).toUpperCase()} — pipeline error. Retry or contact support.`,
              });
            }
          } else {
            // Check for stuck study (no progress after PROCESSING_TIMEOUT_MS)
            const startedAt = study.sla_selected_at
              ? new Date(study.sla_selected_at).getTime()
              : study.created_at
              ? new Date(study.created_at).getTime()
              : Date.now();
            const elapsed = Date.now() - startedAt;
            if (elapsed > PROCESSING_TIMEOUT_MS && (study.triage_progress ?? 0) < 80) {
              await supabase
                .from("studies")
                .update({ triage_status: "failed", state: "failed", triage_progress: 0 })
                .eq("id", study.id);
              void refetchStudies();
              return;
            }
            if (newProgress !== (study.triage_progress ?? 5)) {
              const { error: upErr } = await supabase
                .from("studies")
                .update({ triage_progress: newProgress })
                .eq("id", study.id);
              if (!upErr) void refetchStudies();
            }
          }
        } catch (err) {
          console.error("[pilot] C-Plane status poll failed", study.id, err);
        }
      }
    };

    checkStatus(); // immediate on mount / when processing list changes
    // 15s poll instead of 4s — realtime channel handles instant state changes;
    // this interval only catches cplane status that doesn't broadcast.
    const interval = setInterval(checkStatus, 15_000);
    return () => clearInterval(interval);
  }, [isAuthenticated, refetchStudies]);

  // Memoized categorization — no heavy metrics, just buckets
  const categorized = useMemo(() => {
    const all = studies || [];
    return {
      pending: all.filter((s) => {
        if ((s.tokens_deducted ?? 0) > 0) return false;
        if (s.state === "signed" || s.state === "failed") return false;
        if (s.triage_status === "processing" || s.state === "processing") return false;
        if (s.triage_status === "completed" || s.triage_status === "failed") return false;
        return (
          s.state === "awaiting_sla" ||
          s.sla === "pending" ||
          (s.state === "uploaded" &&
            (!s.triage_status ||
              s.triage_status === "awaiting_sla" ||
              s.triage_status === "pending"))
        );
      }),
      processing: processingStudies,
      completed: all.filter(
        (s) =>
          s.state === "signed" ||
          s.triage_status === "completed" ||
          s.state === "ai_draft" ||
          s.state === "complete" ||
          s.state === "completed" ||
          s.state === "in_review",
      ),
      failed: all.filter(
        (s) => s.state === "failed" || s.triage_status === "failed",
      ),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studies, processingStudies]);

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
  } as const;
}
