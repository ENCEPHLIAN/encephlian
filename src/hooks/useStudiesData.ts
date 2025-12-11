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
        .select("id, created_at, state, sla, meta, indication, sample, clinics(name)")
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

  // Single realtime subscription - only set up once
  useEffect(() => {
    if (channelRef.current || !isAuthenticated) return;

    channelRef.current = supabase
      .channel("studies-realtime-unified")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "studies" },
        () => {
          // Debounced refetch
          setTimeout(() => refetch(), 500);
        }
      )
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [isAuthenticated, refetch]);

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
