import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useRef, useEffect, useCallback } from "react";
import { recordApiCall } from "./usePerformanceMonitor";

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

// Request deduplication cache
const requestCache = new Map<string, { promise: Promise<any>; timestamp: number }>();
const CACHE_TTL = 10000; // 10 second deduplication window

function deduplicatedFetch<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const cached = requestCache.get(key);
  
  if (cached && now - cached.timestamp < CACHE_TTL) {
    // Record cached hit
    recordApiCall({
      endpoint: key,
      duration: 0,
      timestamp: now,
      success: true,
      cached: true,
    });
    return cached.promise as Promise<T>;
  }
  
  const startTime = Date.now();
  const promise = fetcher().then(result => {
    recordApiCall({
      endpoint: key,
      duration: Date.now() - startTime,
      timestamp: Date.now(),
      success: true,
      cached: false,
    });
    return result;
  }).catch(error => {
    recordApiCall({
      endpoint: key,
      duration: Date.now() - startTime,
      timestamp: Date.now(),
      success: false,
      cached: false,
    });
    throw error;
  });
  
  requestCache.set(key, { promise, timestamp: now });
  
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

export function useStudiesData(stateFilter: string) {
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const { data: studies, isLoading, refetch } = useQuery({
    queryKey: ["studies-list", stateFilter],
    queryFn: () => deduplicatedFetch(`studies-${stateFilter}`, async () => {
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
    }),
    staleTime: 15000,
    gcTime: 120000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: false,
  });

  // Single realtime subscription
  useEffect(() => {
    if (channelRef.current) return; // Already subscribed

    channelRef.current = supabase
      .channel("studies-realtime-v3")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "studies" },
        () => {
          // Debounced refetch via setTimeout
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
  }, [refetch]);

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
