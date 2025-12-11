import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Activity, Gauge, RefreshCw, Trash2, Clock, CheckCircle2, XCircle, Database } from "lucide-react";
import { getPerformanceStats, clearMetrics, getRecentMetrics, type PerformanceStats, type ApiCallMetric } from "@/hooks/usePerformanceMonitor";

export default function AdminPerformance() {
  const [stats, setStats] = useState<PerformanceStats | null>(null);
  const [recentCalls, setRecentCalls] = useState<ApiCallMetric[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const refreshStats = () => {
    setStats(getPerformanceStats());
    setRecentCalls(getRecentMetrics(50));
  };

  useEffect(() => {
    refreshStats();
    
    if (autoRefresh) {
      const interval = setInterval(refreshStats, 2000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const handleClearMetrics = () => {
    clearMetrics();
    refreshStats();
  };

  const getResponseTimeColor = (ms: number) => {
    if (ms < 100) return "text-emerald-500";
    if (ms < 300) return "text-amber-500";
    return "text-red-500";
  };

  const getResponseTimeLabel = (ms: number) => {
    if (ms < 100) return "Fast";
    if (ms < 300) return "Normal";
    return "Slow";
  };

  if (!stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <Activity className="h-8 w-8 animate-pulse text-primary" />
      </div>
    );
  }

  const cacheHitRate = stats.totalCalls > 0 
    ? Math.round((stats.cachedCalls / stats.totalCalls) * 100) 
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-mono font-bold tracking-tight">Performance Monitor</h1>
          <p className="text-sm text-muted-foreground font-mono">
            API response times and request deduplication metrics
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={autoRefresh ? "default" : "outline"}
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${autoRefresh ? "animate-spin" : ""}`} />
            {autoRefresh ? "Auto-refresh ON" : "Auto-refresh OFF"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleClearMetrics}>
            <Trash2 className="h-4 w-4 mr-2" />
            Clear
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Total API Calls
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{stats.totalCalls}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.cachedCalls} served from cache
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Database className="h-4 w-4" />
              Cache Hit Rate
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{cacheHitRate}%</div>
            <Progress value={cacheHitRate} className="mt-2 h-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Gauge className="h-4 w-4" />
              Avg Response Time
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold font-mono ${getResponseTimeColor(stats.avgResponseTime)}`}>
              {stats.avgResponseTime}ms
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {getResponseTimeLabel(stats.avgResponseTime)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <XCircle className="h-4 w-4" />
              Error Rate
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold font-mono ${stats.errorRate > 5 ? "text-red-500" : "text-emerald-500"}`}>
              {stats.errorRate}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.errorRate === 0 ? "No errors" : "Errors detected"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Response Time Range */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-mono">Response Time Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-8">
            <div className="text-center">
              <div className="text-sm text-muted-foreground">Min</div>
              <div className="text-2xl font-mono font-bold text-emerald-500">{stats.minResponseTime}ms</div>
            </div>
            <div className="flex-1 h-2 bg-muted rounded-full relative">
              <div 
                className="absolute h-full bg-gradient-to-r from-emerald-500 via-amber-500 to-red-500 rounded-full"
                style={{ width: `${Math.min((stats.avgResponseTime / stats.maxResponseTime) * 100, 100)}%` }}
              />
            </div>
            <div className="text-center">
              <div className="text-sm text-muted-foreground">Max</div>
              <div className="text-2xl font-mono font-bold text-red-500">{stats.maxResponseTime}ms</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Endpoint Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-mono">Endpoint Performance</CardTitle>
          <CardDescription>Breakdown by API endpoint</CardDescription>
        </CardHeader>
        <CardContent>
          {Object.keys(stats.callsByEndpoint).length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Endpoint</TableHead>
                  <TableHead className="text-right">Calls</TableHead>
                  <TableHead className="text-right">Avg Time</TableHead>
                  <TableHead className="text-right">Errors</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(stats.callsByEndpoint)
                  .sort((a, b) => b[1].count - a[1].count)
                  .map(([endpoint, data]) => (
                    <TableRow key={endpoint}>
                      <TableCell className="font-mono text-sm">{endpoint}</TableCell>
                      <TableCell className="text-right font-mono">{data.count}</TableCell>
                      <TableCell className={`text-right font-mono ${getResponseTimeColor(data.avgTime)}`}>
                        {data.avgTime}ms
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {data.errors > 0 ? (
                          <span className="text-red-500">{data.errors}</span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={data.errors > 0 ? "destructive" : "default"} className="font-mono text-xs">
                          {getResponseTimeLabel(data.avgTime)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No API calls recorded yet
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Calls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-mono">Recent API Calls</CardTitle>
          <CardDescription>Last 50 requests</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-64">
            {recentCalls.length > 0 ? (
              <div className="space-y-2">
                {recentCalls.slice().reverse().map((call, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between py-2 px-3 rounded-lg border bg-muted/30"
                  >
                    <div className="flex items-center gap-3">
                      {call.success ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500" />
                      )}
                      <span className="font-mono text-sm">{call.endpoint}</span>
                      {call.cached && (
                        <Badge variant="outline" className="text-xs">cached</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4">
                      <span className={`font-mono text-sm ${getResponseTimeColor(call.duration)}`}>
                        {call.duration}ms
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(call.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No recent calls
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
