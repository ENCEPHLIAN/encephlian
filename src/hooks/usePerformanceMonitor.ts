import { useCallback, useRef } from "react";

export interface ApiCallMetric {
  endpoint: string;
  duration: number;
  timestamp: number;
  success: boolean;
  cached: boolean;
}

export interface PerformanceStats {
  totalCalls: number;
  cachedCalls: number;
  avgResponseTime: number;
  maxResponseTime: number;
  minResponseTime: number;
  errorRate: number;
  callsByEndpoint: Record<string, { count: number; avgTime: number; errors: number }>;
}

// Global performance metrics storage
const metricsStorage: ApiCallMetric[] = [];
const MAX_METRICS = 500; // Keep last 500 calls

export function recordApiCall(metric: ApiCallMetric) {
  metricsStorage.push(metric);
  if (metricsStorage.length > MAX_METRICS) {
    metricsStorage.shift();
  }
}

export function getPerformanceStats(): PerformanceStats {
  if (metricsStorage.length === 0) {
    return {
      totalCalls: 0,
      cachedCalls: 0,
      avgResponseTime: 0,
      maxResponseTime: 0,
      minResponseTime: 0,
      errorRate: 0,
      callsByEndpoint: {},
    };
  }

  const successfulCalls = metricsStorage.filter(m => m.success);
  const durations = successfulCalls.map(m => m.duration);
  const cachedCount = metricsStorage.filter(m => m.cached).length;
  const errorCount = metricsStorage.filter(m => !m.success).length;

  // Group by endpoint
  const callsByEndpoint: Record<string, { count: number; avgTime: number; errors: number; totalTime: number }> = {};
  
  metricsStorage.forEach(metric => {
    if (!callsByEndpoint[metric.endpoint]) {
      callsByEndpoint[metric.endpoint] = { count: 0, avgTime: 0, errors: 0, totalTime: 0 };
    }
    callsByEndpoint[metric.endpoint].count++;
    callsByEndpoint[metric.endpoint].totalTime += metric.duration;
    if (!metric.success) {
      callsByEndpoint[metric.endpoint].errors++;
    }
  });

  // Calculate averages
  Object.keys(callsByEndpoint).forEach(endpoint => {
    const data = callsByEndpoint[endpoint];
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
    callsByEndpoint: Object.fromEntries(
      Object.entries(callsByEndpoint).map(([k, v]) => [k, { count: v.count, avgTime: v.avgTime, errors: v.errors }])
    ),
  };
}

export function clearMetrics() {
  metricsStorage.length = 0;
}

export function getRecentMetrics(count: number = 50): ApiCallMetric[] {
  return metricsStorage.slice(-count);
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

  return { startCall, endCall, trackCall, getStats: getPerformanceStats };
}
