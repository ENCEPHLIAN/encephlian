import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDemoMode } from "@/contexts/DemoModeContext";
import { useUserSession } from "@/contexts/UserSessionContext";

export interface Study {
  id: string;
  created_at: string;
  state: string;
  sla: string;
  meta: any;
  triage_status?: string;
  triage_progress?: number;
  sla_selected_at?: string;
  clinic_id?: string;
  clinics?: { name: string } | null;
  sample?: boolean | null;
}

/**
 * Central hook for fetching studies with proper demo mode isolation.
 * In demo mode: only show sample=true studies
 * In user mode: only show user's studies where sample is null or false
 */
export function useDemoFilteredStudies(
  options: {
    queryKey?: string;
    stateFilter?: string[] | string;
    limit?: number;
    additionalSelect?: string;
    refetchInterval?: number;
  } = {}
) {
  const { isDemoMode } = useDemoMode();
  const { userId, isAuthenticated } = useUserSession();

  const {
    queryKey = "demo-filtered-studies",
    stateFilter,
    limit = 200,
    additionalSelect = "",
    refetchInterval,
  } = options;

  return useQuery({
    queryKey: [queryKey, isDemoMode, userId, stateFilter],
    queryFn: async () => {
      const selectFields = `id, created_at, state, sla, meta, triage_status, triage_progress, sla_selected_at, sample${additionalSelect ? `, ${additionalSelect}` : ""}`;
      
      let query = supabase
        .from("studies")
        .select(selectFields)
        .order("created_at", { ascending: false })
        .limit(limit);

      // CRITICAL: Demo mode isolation
      if (isDemoMode) {
        // Demo mode: ONLY sample studies
        query = query.eq("sample", true);
      } else {
        // User mode: ONLY non-sample studies (RLS handles ownership)
        query = query.or("sample.is.null,sample.eq.false");
      }

      // Apply state filter if provided
      if (stateFilter) {
        if (Array.isArray(stateFilter)) {
          query = query.in("state", stateFilter);
        } else if (stateFilter !== "all") {
          query = query.eq("state", stateFilter);
        }
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as Study[];
    },
    enabled: isAuthenticated && !!userId,
    staleTime: 30000,
    gcTime: 60000,
    refetchInterval,
  });
}
