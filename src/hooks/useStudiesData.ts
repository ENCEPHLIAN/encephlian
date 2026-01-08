import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useRef, useEffect } from "react";
import { useUserSession } from "@/contexts/UserSessionContext";

export interface StudyListItem {
  id: string;
  created_at: string;
  state: string;
  sla: string;
  meta: any;
  indication: string | null;
  sample: boolean | null;
  tokens_deducted: number | null;
  triage_status: string | null;
  clinics: { name: string } | null;
}

export function useStudiesData(stateFilter: string) {
  const { userId, isAuthenticated } = useUserSession();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const { data: studies, isLoading, refetch } = useQuery({
    queryKey: ["studies-list", stateFilter, userId],
    queryFn: async () => {
      // RLS handles user filtering automatically
      let query = supabase
        .from("studies")
        .select("id, created_at, state, sla, meta, indication, sample, tokens_deducted, triage_status, clinics(name)")
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

    const debounceTimerRef = { current: null as NodeJS.Timeout | null };

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

  return { studies: studies || [], isLoading, refetch };
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
      return (
        patientName.toLowerCase().includes(lowerSearch) ||
        patientId.toLowerCase().includes(lowerSearch)
      );
    });
  }, [studies, search]);
}
