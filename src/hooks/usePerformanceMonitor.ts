import { useCallback, useRef } from "react";

export interface ApiCallMetric {
  endpoint: string;
  duration: number;
  timestamp: number;
  success: boolean;
  cached: boolean;
}

export interface DbQueryMetric {
  query: string;
  table: string;
  duration: number;
  timestamp: number;
  success: boolean;
  rowCount?: number;
}

export interface PerformanceStats {
  totalCalls: number;
  cachedCalls: number;
  avgResponseTime: number;
  maxResponseTime: number;
  minResponseTime: number;
  errorRate: number;
  cacheHitRate: number;
  callsByEndpoint: Record<string, { count: number; avgTime: number; errors: number; cacheHits: number }>;
  dbStats: {
    totalQueries: number;
    avgQueryTime: number;
    slowQueries: number;
    queriesByTable: Record<string, { count: number; avgTime: number }>;
  };
}

// Global performance metrics storage
const metricsStorage: ApiCallMetric[] = [];
const dbMetricsStorage: DbQueryMetric[] = [];
const MAX_METRICS = 500;
const SLOW_QUERY_THRESHOLD = 500; // 500ms

export function recordApiCall(metric: ApiCallMetric) {
  metricsStorage.push(metric);
  if (metricsStorage.length > MAX_METRICS) {
    metricsStorage.shift();
  }
}

export function recordDbQuery(metric: DbQueryMetric) {
  dbMetricsStorage.push(metric);
  if (dbMetricsStorage.length > MAX_METRICS) {
    dbMetricsStorage.shift();
  }
}

export function getPerformanceStats(): PerformanceStats {
  const emptyStats: PerformanceStats = {
    totalCalls: 0,
    cachedCalls: 0,
    avgResponseTime: 0,
    maxResponseTime: 0,
    minResponseTime: 0,
    errorRate: 0,
    cacheHitRate: 0,
    callsByEndpoint: {},
    dbStats: {
      totalQueries: 0,
      avgQueryTime: 0,
      slowQueries: 0,
      queriesByTable: {},
    },
  };

  if (metricsStorage.length === 0 && dbMetricsStorage.length === 0) {
    return emptyStats;
  }

  // API call stats
  const successfulCalls = metricsStorage.filter(m => m.success && !m.cached);
  const durations = successfulCalls.map(m => m.duration);
  const cachedCount = metricsStorage.filter(m => m.cached).length;
  const errorCount = metricsStorage.filter(m => !m.success).length;

  // Group by endpoint
  const callsByEndpoint: Record<string, { count: number; avgTime: number; errors: number; cacheHits: number; totalTime: number }> = {};
  
  metricsStorage.forEach(metric => {
    if (!callsByEndpoint[metric.endpoint]) {
      callsByEndpoint[metric.endpoint] = { count: 0, avgTime: 0, errors: 0, cacheHits: 0, totalTime: 0 };
    }
    callsByEndpoint[metric.endpoint].count++;
    if (!metric.cached) {
      callsByEndpoint[metric.endpoint].totalTime += metric.duration;
    }
    if (!metric.success) {
      callsByEndpoint[metric.endpoint].errors++;
    }
    if (metric.cached) {
      callsByEndpoint[metric.endpoint].cacheHits++;
    }
  });

  // Calculate averages
  Object.keys(callsByEndpoint).forEach(endpoint => {
    const data = callsByEndpoint[endpoint];
    const nonCachedCount = data.count - data.cacheHits;
    data.avgTime = nonCachedCount > 0 ? Math.round(data.totalTime / nonCachedCount) : 0;
  });

  // DB query stats
  const dbDurations = dbMetricsStorage.filter(m => m.success).map(m => m.duration);
  const slowQueries = dbMetricsStorage.filter(m => m.duration > SLOW_QUERY_THRESHOLD).length;
  
  const queriesByTable: Record<string, { count: number; avgTime: number; totalTime: number }> = {};
  dbMetricsStorage.forEach(metric => {
    if (!queriesByTable[metric.table]) {
      queriesByTable[metric.table] = { count: 0, avgTime: 0, totalTime: 0 };
    }
    queriesByTable[metric.table].count++;
    queriesByTable[metric.table].totalTime += metric.duration;
  });

  Object.keys(queriesByTable).forEach(table => {
    const data = queriesByTable[table];
    data.avgTime = Math.round(data.totalTime / data.count);
  });

  return {
    totalCalls: metricsStorage.length,
    cachedCalls: cachedCount,
    avgResponseTime: durations.length > 0 
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) 
      : 0,
    maxResponseTime: durations.length > 0 ? Math.max(...durations) : 0,
    minResponseTime: durations.length > 0 ? Math.min(...durations) : 0,
    errorRate: metricsStorage.length > 0 
      ? Math.round((errorCount / metricsStorage.length) * 100) 
      : 0,
    cacheHitRate: metricsStorage.length > 0
      ? Math.round((cachedCount / metricsStorage.length) * 100)
      : 0,
    callsByEndpoint: Object.fromEntries(
      Object.entries(callsByEndpoint).map(([k, v]) => [k, { count: v.count, avgTime: v.avgTime, errors: v.errors, cacheHits: v.cacheHits }])
    ),
    dbStats: {
      totalQueries: dbMetricsStorage.length,
      avgQueryTime: dbDurations.length > 0
        ? Math.round(dbDurations.reduce((a, b) => a + b, 0) / dbDurations.length)
        : 0,
      slowQueries,
      queriesByTable: Object.fromEntries(
        Object.entries(queriesByTable).map(([k, v]) => [k, { count: v.count, avgTime: v.avgTime }])
      ),
    },
  };
}

export function clearMetrics() {
  metricsStorage.length = 0;
  dbMetricsStorage.length = 0;
}

export function getRecentMetrics(count: number = 50): ApiCallMetric[] {
  return metricsStorage.slice(-count);
}

export function getRecentDbQueries(count: number = 50): DbQueryMetric[] {
  return dbMetricsStorage.slice(-count);
}

// Tracked Supabase query wrapper
export async function trackedQuery<T>(
  table: string,
  queryFn: () => Promise<{ data: T | null; error: any }>
): Promise<{ data: T | null; error: any }> {
  const startTime = Date.now();
  const result = await queryFn();
  
  recordDbQuery({
    query: `SELECT FROM ${table}`,
    table,
    duration: Date.now() - startTime,
    timestamp: startTime,
    success: !result.error,
    rowCount: Array.isArray(result.data) ? result.data.length : result.data ? 1 : 0,
  });
  
  return result;
}

// Hook for tracking API calls in components
export function usePerformanceMonitor() {
  const pendingCalls = useRef<Map<string, number>>(new Map());

  const startCall = useCallback((endpoint: string): string => {
    const callId = `${endpoint}-${Date.now()}-${Math.random()}`;
    pendingCalls.current.set(callId, Date.now());
    return callId;
  }, []);

  const endCall = useCallback((callId: string, success: boolean, cached: boolean = false) => {
    const startTime = pendingCalls.current.get(callId);
    if (startTime) {
      const duration = Date.now() - startTime;
      const endpoint = callId.split('-')[0];
      
      recordApiCall({
        endpoint,
        duration,
        timestamp: Date.now(),
        success,
        cached,
      });
      
      pendingCalls.current.delete(callId);
    }
  }, []);

  const trackCall = useCallback(async <T>(
    endpoint: string,
    fn: () => Promise<T>,
    isCached: boolean = false
  ): Promise<T> => {
    const callId = startCall(endpoint);
    try {
      const result = await fn();
      endCall(callId, true, isCached);
      return result;
    } catch (error) {
      endCall(callId, false, false);
      throw error;
    }
  }, [startCall, endCall]);

  return { 
    startCall, 
    endCall, 
    trackCall, 
    getStats: getPerformanceStats,
    getRecentCalls: getRecentMetrics,
    getRecentQueries: getRecentDbQueries,
  };
}
