import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserSession } from "@/contexts/UserSessionContext";
import dayjs from "dayjs";

/* ─── Types ────────────────────────────────────────────── */

export type NotifType =
  | "triage_complete"
  | "triage_started"
  | "pipeline_error"
  | "sla_breach"
  | "sla_warning"
  | "token_credit"
  | "token_low";

export type NotifCategory = "alert" | "report" | "billing" | "info";

export interface AppNotification {
  id: string;
  type: NotifType;
  category: NotifCategory;
  title: string;
  body: string;
  createdAt: string;
  studyId?: string;
  href?: string;
  patientName?: string;
}

const CATEGORY_MAP: Record<NotifType, NotifCategory> = {
  triage_complete: "report",
  triage_started:  "info",
  pipeline_error:  "alert",
  sla_breach:      "alert",
  sla_warning:     "alert",
  token_credit:    "billing",
  token_low:       "billing",
};

/* ─── Persistence ───────────────────────────────────────── */

const STORAGE_KEY = "enceph_notif_read_v2";

function getReadSet(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}_${userId}`);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveReadSet(userId: string, ids: Set<string>) {
  try {
    // Keep at most 500 read IDs to avoid unbounded growth
    const arr = [...ids].slice(-500);
    localStorage.setItem(`${STORAGE_KEY}_${userId}`, JSON.stringify(arr));
  } catch {}
}

/* ─── Notification builders ─────────────────────────────── */

function patientLabel(meta: any): string {
  return meta?.patient_name || meta?.patient_id || "Unknown patient";
}

function buildTriageComplete(study: any): AppNotification {
  const name = patientLabel(study.meta);
  const cls = study.ai_draft_json?.classification ?? study.ai_draft_json?.triage?.classification;
  const resultStr = cls && cls !== "unknown" ? ` · ${cls.charAt(0).toUpperCase() + cls.slice(1)}` : "";
  return {
    id: `triage_complete_${study.id}`,
    type: "triage_complete",
    category: "report",
    title: "MIND® analysis complete",
    body: `${name}${resultStr} — ready for review`,
    createdAt: study.triage_completed_at || study.updated_at || new Date().toISOString(),
    studyId: study.id,
    href: `/app/studies/${study.id}`,
    patientName: name,
  };
}

function buildTriageStarted(study: any): AppNotification {
  const name = patientLabel(study.meta);
  return {
    id: `triage_started_${study.id}`,
    type: "triage_started",
    category: "info",
    title: "Analysis started",
    body: `${name} · ${study.sla || "Standard"} priority`,
    createdAt: study.updated_at || new Date().toISOString(),
    studyId: study.id,
    href: `/app/studies/${study.id}`,
    patientName: name,
  };
}

function buildPipelineError(event: any): AppNotification {
  const detail = typeof event.detail === "string"
    ? event.detail
    : event.detail?.message || event.detail?.error || `Step "${event.step}" failed`;
  return {
    id: `pipeline_error_${event.id}`,
    type: "pipeline_error",
    category: "alert",
    title: "Pipeline error",
    body: detail,
    createdAt: event.created_at,
    studyId: event.study_id,
    href: `/app/studies/${event.study_id}`,
  };
}

function buildTokenCredit(tx: any): AppNotification {
  return {
    id: `token_credit_${tx.id}`,
    type: "token_credit",
    category: "billing",
    title: "Tokens credited",
    body: `+${tx.amount} tokens · balance now ${tx.balance_after}`,
    createdAt: tx.created_at,
    href: "/app/wallet",
  };
}

const SEVEN_DAYS_AGO = () => dayjs().subtract(7, "day").toISOString();

/* ─── Hook ──────────────────────────────────────────────── */

export function useNotifications() {
  const { userId, isAuthenticated } = useUserSession();

  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [liveNotifs, setLiveNotifs] = useState<AppNotification[]>([]);
  // Banner queue: live critical alerts shown as top-of-screen banners
  const [bannerQueue, setBannerQueue] = useState<AppNotification[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const ringFiredRef = useRef<Set<string>>(new Set());

  const dismissBanner = useCallback((id: string) => {
    setBannerQueue((prev) => prev.filter((n) => n.id !== id));
  }, []);

  useEffect(() => {
    if (userId) setReadIds(getReadSet(userId));
  }, [userId]);

  // ── Historical: completed studies (report ready)
  const { data: completedStudies = [] } = useQuery({
    queryKey: ["notif-completed", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("studies")
        .select("id, updated_at, triage_completed_at, meta, sla, ai_draft_json")
        .eq("triage_status", "completed")
        .gte("triage_completed_at", SEVEN_DAYS_AGO())
        .order("triage_completed_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
    enabled: !!userId && isAuthenticated,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  // ── Historical: pipeline errors
  const { data: pipelineErrors = [] } = useQuery({
    queryKey: ["notif-errors", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("study_pipeline_events")
        .select("id, created_at, study_id, step, detail")
        .eq("status", "error")
        .gte("created_at", SEVEN_DAYS_AGO())
        .order("created_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
    enabled: !!userId && isAuthenticated,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  // ── Historical: token credits
  const { data: tokenCredits = [] } = useQuery({
    queryKey: ["notif-credits", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("wallet_transactions")
        .select("id, created_at, amount, operation, balance_after")
        .eq("operation", "credit")
        .gte("created_at", SEVEN_DAYS_AGO())
        .order("created_at", { ascending: false })
        .limit(10);
      return data ?? [];
    },
    enabled: !!userId && isAuthenticated,
    staleTime: 120_000,
    refetchInterval: 300_000,
  });

  // ── SLA warnings: active studies approaching deadline
  const { data: activeStudies = [] } = useQuery({
    queryKey: ["notif-sla-active", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("studies")
        .select("id, sla, sla_selected_at, created_at, meta, triage_status, state")
        .not("sla_selected_at", "is", null)
        .not("triage_status", "eq", "completed")
        .not("state", "eq", "signed")
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
    enabled: !!userId && isAuthenticated,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  // ── Realtime subscription
  useEffect(() => {
    if (channelRef.current || !isAuthenticated || !userId) return;

    channelRef.current = supabase
      .channel(`notif-rt-${userId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "studies" },
        (payload) => {
          const old = payload.old as any;
          const next = payload.new as any;

          // Triage just completed
          if (old.triage_status !== "completed" && next.triage_status === "completed") {
            const notif = buildTriageComplete(next);
            if (!ringFiredRef.current.has(notif.id)) {
              ringFiredRef.current.add(notif.id);
              setLiveNotifs((prev) => [notif, ...prev.filter((n) => n.id !== notif.id)]);
              setBannerQueue((prev) => [notif, ...prev.filter((n) => n.id !== notif.id)]);
            }
          }

          // Triage just started
          if (old.triage_status !== "processing" && next.triage_status === "processing") {
            const notif = buildTriageStarted(next);
            if (!ringFiredRef.current.has(notif.id)) {
              ringFiredRef.current.add(notif.id);
              setLiveNotifs((prev) => [notif, ...prev.filter((n) => n.id !== notif.id)]);
            }
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "study_pipeline_events" },
        (payload) => {
          const ev = payload.new as any;
          if (ev.status !== "error") return;
          const notif = buildPipelineError(ev);
          if (!ringFiredRef.current.has(notif.id)) {
            ringFiredRef.current.add(notif.id);
            setLiveNotifs((prev) => [notif, ...prev.filter((n) => n.id !== notif.id)]);
            setBannerQueue((prev) => [notif, ...prev.filter((n) => n.id !== notif.id)]);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "wallet_transactions" },
        (payload) => {
          const tx = payload.new as any;
          if (tx.operation !== "credit") return;
          const notif = buildTokenCredit(tx);
          if (!ringFiredRef.current.has(notif.id)) {
            ringFiredRef.current.add(notif.id);
            setLiveNotifs((prev) => [notif, ...prev.filter((n) => n.id !== notif.id)]);
          }
        }
      )
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [isAuthenticated, userId]);

  // ── Synthesize all notifications
  const notifications = useMemo<AppNotification[]>(() => {
    const all: AppNotification[] = [];
    const seen = new Set<string>();

    const push = (n: AppNotification) => {
      if (!seen.has(n.id)) { seen.add(n.id); all.push(n); }
    };

    // Live realtime first (most recent)
    liveNotifs.forEach(push);

    // Historical: completed studies
    completedStudies.forEach((s) => push(buildTriageComplete(s)));

    // Historical: pipeline errors
    pipelineErrors.forEach((e) => push(buildPipelineError(e)));

    // Historical: token credits
    tokenCredits.forEach((tx) => push(buildTokenCredit(tx)));

    // SLA warnings and breaches computed from active studies
    const now = dayjs();
    const SLA_HOURS: Record<string, number> = { STAT: 1, "24H": 24, "48H": 48, ROUTINE: 72, TAT: 12 };

    for (const s of activeStudies) {
      const hours = SLA_HOURS[s.sla] ?? 24;
      const start = dayjs(s.sla_selected_at || s.created_at);
      const deadline = start.add(hours, "hour");
      const remaining = deadline.diff(now, "minute");

      if (remaining < 0) {
        push({
          id: `sla_breach_${s.id}`,
          type: "sla_breach",
          category: "alert",
          title: "SLA breached",
          body: `${patientLabel(s.meta)} · ${Math.abs(remaining)}m overdue`,
          createdAt: deadline.toISOString(),
          studyId: s.id,
          href: `/app/studies/${s.id}`,
          patientName: patientLabel(s.meta),
        });
      } else if (remaining <= 30) {
        push({
          id: `sla_warn_${s.id}`,
          type: "sla_warning",
          category: "alert",
          title: "SLA deadline approaching",
          body: `${patientLabel(s.meta)} · ${remaining}m remaining`,
          createdAt: new Date().toISOString(),
          studyId: s.id,
          href: `/app/studies/${s.id}`,
          patientName: patientLabel(s.meta),
        });
      }
    }

    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [liveNotifs, completedStudies, pipelineErrors, tokenCredits, activeStudies]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !readIds.has(n.id)).length,
    [notifications, readIds]
  );

  const markAsRead = useCallback((id: string) => {
    if (!userId) return;
    setReadIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      saveReadSet(userId, next);
      return next;
    });
  }, [userId]);

  const markAllRead = useCallback(() => {
    if (!userId) return;
    const allIds = new Set(notifications.map((n) => n.id));
    setReadIds(allIds);
    saveReadSet(userId, allIds);
  }, [userId, notifications]);

  const dismiss = useCallback((id: string) => {
    // Mark as read + hide from live list
    markAsRead(id);
    setLiveNotifs((prev) => prev.filter((n) => n.id !== id));
  }, [markAsRead]);

  return {
    notifications,
    unreadCount,
    readIds,
    markAsRead,
    markAllRead,
    dismiss,
    bannerQueue,
    dismissBanner,
  };
}
