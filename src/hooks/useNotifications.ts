import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserSession } from "@/contexts/UserSessionContext";

export type NotifType = "pipeline_failed" | "report_ready" | "payment_success" | "sla_breach";

export interface AppNotification {
  id: string;
  type: NotifType;
  title: string;
  body: string;
  createdAt: string;
  studyId?: string;
  href?: string;
}

const STORAGE_KEY = "enceph_notif_read";

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
    localStorage.setItem(`${STORAGE_KEY}_${userId}`, JSON.stringify([...ids]));
  } catch {}
}

const SEVEN_DAYS_AGO = new Date(Date.now() - 7 * 864e5).toISOString();

export function useNotifications() {
  const { profile } = useUserSession();
  const userId = (profile as any)?.id as string | undefined;

  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (userId) setReadIds(getReadSet(userId));
  }, [userId]);

  // Pipeline failures
  const { data: pipelineEvents = [] } = useQuery({
    queryKey: ["notif-pipeline-failures"],
    queryFn: async () => {
      const { data } = await supabase
        .from("study_pipeline_events")
        .select("id, created_at, study_id, step, detail")
        .eq("status", "error")
        .gte("created_at", SEVEN_DAYS_AGO)
        .order("created_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
    refetchInterval: 60_000,
    enabled: !!userId,
  });

  // Report ready (ai_draft state)
  const { data: reportReadyStudies = [] } = useQuery({
    queryKey: ["notif-report-ready"],
    queryFn: async () => {
      const { data } = await supabase
        .from("studies")
        .select("id, updated_at, meta")
        .eq("state", "ai_draft")
        .gte("updated_at", SEVEN_DAYS_AGO)
        .order("updated_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
    refetchInterval: 60_000,
    enabled: !!userId,
  });

  // Payment confirmations
  const { data: payments = [] } = useQuery({
    queryKey: ["notif-payments"],
    queryFn: async () => {
      const { data } = await supabase
        .from("wallet_transactions")
        .select("id, created_at, amount, operation")
        .eq("operation", "credit")
        .gte("created_at", SEVEN_DAYS_AGO)
        .order("created_at", { ascending: false })
        .limit(10);
      return data ?? [];
    },
    refetchInterval: 120_000,
    enabled: !!userId,
  });

  const notifications = useMemo<AppNotification[]>(() => {
    const all: AppNotification[] = [];

    for (const e of pipelineEvents) {
      const meta = (e as any).meta as any;
      all.push({
        id: `pipeline_${e.id}`,
        type: "pipeline_failed",
        title: "Pipeline failed",
        body: (e as any).detail || `Step ${(e as any).step} failed — check study for details`,
        createdAt: e.created_at,
        studyId: (e as any).study_id,
        href: `/app/studies/${(e as any).study_id}`,
      });
    }

    for (const s of reportReadyStudies) {
      const meta = (s as any).meta as any;
      const name = meta?.patient_name || "Patient";
      all.push({
        id: `report_${s.id}`,
        type: "report_ready",
        title: "AI report ready",
        body: `${name} — ready for your review`,
        createdAt: s.updated_at,
        studyId: s.id,
        href: `/app/studies/${s.id}`,
      });
    }

    for (const p of payments) {
      all.push({
        id: `pay_${p.id}`,
        type: "payment_success",
        title: "Tokens credited",
        body: `${(p as any).amount ?? "—"} tokens added to your wallet`,
        createdAt: p.created_at,
        href: `/app/wallet`,
      });
    }

    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [pipelineEvents, reportReadyStudies, payments]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !readIds.has(n.id)).length,
    [notifications, readIds]
  );

  const markAsRead = (id: string) => {
    if (!userId) return;
    setReadIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      saveReadSet(userId, next);
      return next;
    });
  };

  const markAllRead = () => {
    if (!userId) return;
    const allIds = new Set(notifications.map((n) => n.id));
    setReadIds(allIds);
    saveReadSet(userId, allIds);
  };

  return { notifications, unreadCount, readIds, markAsRead, markAllRead };
}
