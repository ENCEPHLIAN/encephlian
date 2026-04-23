import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useRef, useEffect } from "react";
import { useUserSession } from "@/contexts/UserSessionContext";

// Alias for Lanes/Dashboard compatibility
export type Study = StudyListItem;

export interface StudyListItem {
  id: string;
  created_at: string;
  state: string;
  sla: string;
  sla_selected_at: string | null;
  meta: any;
  original_format: string | null;
  indication: string | null;
  sample: boolean | null;
  tokens_deducted: number | null;
  triage_status: string | null;
  triage_progress: number | null;
  triage_started_at: string | null;
  triage_completed_at: string | null;
  clinics: { name: string } | null;
}

export function useStudiesData(stateFilter: string) {
  const { userId, isAuthenticated } = useUserSession();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const { data: studies, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["studies-list", stateFilter, userId],
    queryFn: async () => {
      // Show user's real studies (RLS handles ownership), exclude sample studies
      let query = supabase
        .from("studies")
        .select("id, created_at, state, sla, sla_selected_at, meta, original_format, indication, sample, tokens_deducted, triage_status, triage_progress, triage_started_at, triage_completed_at, clinics(name)")
        .or(`sample.is.null,sample.eq.false`)
        .order("created_at", { ascending: false })
        .limit(100);

      if (stateFilter !== "all") {
        query = query.eq("state", stateFilter as any);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as StudyListItem[];
    },
    enabled: isAuthenticated && !!userId,
    staleTime: 15000,
    gcTime: 120000,
  });

  // Single realtime subscription - optimized with filter for user's studies
  useEffect(() => {
    if (channelRef.current || !isAuthenticated || !userId) return;

    const debounceTimerRef = { current: null as ReturnType<typeof setTimeout> | null };

    channelRef.current = supabase
      .channel(`studies-realtime-${userId}`)
      .on(
        "postgres_changes",
        { 
          event: "*", 
          schema: "public", 
          table: "studies",
          filter: `owner=eq.${userId}`
        },
        () => {
          // Debounced refetch to avoid multiple rapid updates
          if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
          }
          debounceTimerRef.current = setTimeout(() => {
            refetch();
            debounceTimerRef.current = null;
          }, 300);
        }
      )
      .subscribe();

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [isAuthenticated, userId, refetch]);

  return { studies: studies || [], isLoading, isError, error, refetch };
}

export function useFilteredStudies(studies: StudyListItem[], search: string) {
  return useMemo(() => {
    if (!studies.length) return [];
    if (!search.trim()) return studies;
    
    const lowerSearch = search.toLowerCase();
    return studies.filter((study) => {
      const meta = study.meta as any;
      const patientName = meta?.patient_name || "";
      const patientId = meta?.patient_id || "";
      const fileName = typeof meta?.original_filename === "string" ? meta.original_filename : "";
      return (
        patientName.toLowerCase().includes(lowerSearch) ||
        patientId.toLowerCase().includes(lowerSearch) ||
        fileName.toLowerCase().includes(lowerSearch)
      );
    });
  }, [studies, search]);
}