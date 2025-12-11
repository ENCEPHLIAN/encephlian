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
  const lastFilterRef = useRef(stateFilter);
  const initialLoadRef = useRef(true);

  // Track filter changes to avoid unnecessary refetches
  useEffect(() => {
    if (lastFilterRef.current !== stateFilter) {
      lastFilterRef.current = stateFilter;
    }
  }, [stateFilter]);

  const { data: studies, isLoading, refetch } = useQuery({
    queryKey: ["studies-list", stateFilter],
    queryFn: () => deduplicatedFetch(`studies-${stateFilter}`, async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      let query = supabase
        .from("studies")
        .select("id, created_at, state, sla, meta, indication, sample, clinics(name)")
        .or(`owner.eq.${user.id},sample.eq.true`)
        .order("created_at", { ascending: false })
        .limit(100);

      if (stateFilter !== "all") {
        query = query.eq("state", stateFilter as any);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as StudyListItem[];
    }),
    staleTime: 15000, // 15 seconds
    gcTime: 120000, // 2 minutes garbage collection
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: false, // Disable auto-refetch - rely on realtime
  });

  // Debounced refetch
  const debouncedRefetch = useCallback(() => {
    const timeout = setTimeout(() => {
      refetch();
    }, 500);
    return () => clearTimeout(timeout);
  }, [refetch]);

  // Subscribe to realtime updates only once after initial load
  useEffect(() => {
    if (!initialLoadRef.current) return;
    initialLoadRef.current = false;

    const channel = supabase
      .channel("studies-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "studies",
        },
        () => {
          debouncedRefetch();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [debouncedRefetch]);

  return {
    studies: studies || [],
    isLoading,
    refetch,
  };
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
