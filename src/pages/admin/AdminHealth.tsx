import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Loader2,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertCircle,
  Activity,
  Database,
  Cloud,
  Cpu,
  Circle,
} from "lucide-react";
import { format } from "date-fns";

type ServiceHealth = {
  id: string;
  service_name: string;
  status: string;
  last_success_at: string | null;
  last_error_at: string | null;
  last_error_message: string | null;
  checked_at: string;
};

const EDGE_FUNCTIONS = [
  { name: "parse_eeg_study", label: "EEG Parser" },
  { name: "create_study_from_upload", label: "Study Creator" },
  { name: "generate_ai_report", label: "AI Report Generator" },
  { name: "sign_report", label: "Report Signer" },
  { name: "verify_payment", label: "Payment Verifier" },
];

export default function AdminHealth() {
  const queryClient = useQueryClient();
  const [isRunningCheck, setIsRunningCheck] = useState(false);

  const { data: healthLogs, isLoading } = useQuery<ServiceHealth[]>({
    queryKey: ["admin-health-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_health_logs")
        .select("*")
        .order("checked_at", { ascending: false });
      if (error) throw error;
      return data as ServiceHealth[];
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Get latest status for each service
  const getServiceStatus = (serviceName: string): ServiceHealth | undefined => {
    return healthLogs?.find((log) => log.service_name === serviceName);
  };

  const runHealthCheckMutation = useMutation({
    mutationFn: async () => {
      setIsRunningCheck(true);
      const results: Array<{ service: string; status: string; error?: string }> = [];

      // Check Database
      try {
        const start = Date.now();
        await supabase.from("clinics").select("id").limit(1);
        const latency = Date.now() - start;
        results.push({
          service: "database",
          status: latency < 1000 ? "healthy" : "degraded",
        });
      } catch (error: any) {
        results.push({ service: "database", status: "down", error: error.message });
      }

      // Check Storage
      try {
        const start = Date.now();
        await supabase.storage.from("clinic-logos").list("", { limit: 1 });
        const latency = Date.now() - start;
        results.push({
          service: "storage",
          status: latency < 2000 ? "healthy" : "degraded",
        });
      } catch (error: any) {
        results.push({ service: "storage", status: "down", error: error.message });
      }

      // Log results using direct insert (management users have insert policy)
      const { data: { user } } = await supabase.auth.getUser();
      for (const result of results) {
        const { error: insertError } = await supabase.from("service_health_logs").insert({
          service_name: result.service,
          status: result.status,
          last_success_at: result.status !== "down" ? new Date().toISOString() : null,
          last_error_at: result.status === "down" ? new Date().toISOString() : null,
          last_error_message: result.error || null,
          checked_by: user?.id,
        });
        if (insertError) {
          console.error("Failed to log health check:", insertError);
        }
      }

      return results;
    },
    onSuccess: (results) => {
      queryClient.invalidateQueries({ queryKey: ["admin-health-logs"] });
      const allHealthy = results.every((r) => r.status === "healthy");
      if (allHealthy) {
        toast.success("All services healthy");
      } else {
        toast.warning("Some services degraded or down");
      }
    },
    onError: (error: any) => {
      toast.error(`Health check failed: ${error.message}`);
    },
    onSettled: () => {
      setIsRunningCheck(false);
    },
  });

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case "healthy":
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case "degraded":
        return <AlertCircle className="h-5 w-5 text-yellow-500" />;
      case "down":
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <AlertCircle className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case "healthy":
        return <Badge className="bg-green-500/10 text-green-500 font-mono">HEALTHY</Badge>;
      case "degraded":
        return <Badge className="bg-yellow-500/10 text-yellow-500 font-mono">DEGRADED</Badge>;
      case "down":
        return <Badge className="bg-red-500/10 text-red-500 font-mono">DOWN</Badge>;
      default:
        return <Badge variant="secondary" className="font-mono">UNKNOWN</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const dbStatus = getServiceStatus("database");
  const storageStatus = getServiceStatus("storage");

  // Determine overall system status
  const allHealthy = dbStatus?.status === "healthy" && storageStatus?.status === "healthy";
  const anyDown = dbStatus?.status === "down" || storageStatus?.status === "down";

  return (
    <div className="space-y-6">
      {/* Operational Status Banner */}
      <div className={`flex items-center gap-3 p-4 rounded-lg border ${
        allHealthy 
          ? "bg-green-500/10 border-green-500/30" 
          : anyDown 
            ? "bg-red-500/10 border-red-500/30" 
            : "bg-yellow-500/10 border-yellow-500/30"
      }`}>
        <Circle className={`h-4 w-4 fill-current ${
          allHealthy ? "text-green-500" : anyDown ? "text-red-500" : "text-yellow-500"
        }`} />
        <span className="font-mono font-medium">
          {allHealthy ? "All Systems Operational" : anyDown ? "System Outage Detected" : "Degraded Performance"}
        </span>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-mono font-bold tracking-tight">Service Health</h1>
          <p className="text-sm text-muted-foreground font-mono">
            Monitor platform services and edge functions
          </p>
        </div>
        <Button
          onClick={() => runHealthCheckMutation.mutate()}
          disabled={isRunningCheck}
          className="font-mono"
        >
          {isRunningCheck ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Run Health Check
        </Button>
      </div>

      {/* Core Services */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-base font-mono">Database</CardTitle>
              </div>
              {getStatusIcon(dbStatus?.status)}
            </div>
          </CardHeader>
          <CardContent>
            {getStatusBadge(dbStatus?.status)}
            {dbStatus?.checked_at && (
              <p className="text-xs text-muted-foreground mt-2">
                Last check: {format(new Date(dbStatus.checked_at), "MMM d, HH:mm")}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cloud className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-base font-mono">Storage</CardTitle>
              </div>
              {getStatusIcon(storageStatus?.status)}
            </div>
          </CardHeader>
          <CardContent>
            {getStatusBadge(storageStatus?.status)}
            {storageStatus?.checked_at && (
              <p className="text-xs text-muted-foreground mt-2">
                Last check: {format(new Date(storageStatus.checked_at), "MMM d, HH:mm")}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-base font-mono">Azure Microservice</CardTitle>
              </div>
              <AlertCircle className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <Badge variant="secondary" className="font-mono">UNKNOWN</Badge>
            <p className="text-xs text-muted-foreground mt-2">
              Azure integration pending
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Edge Functions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-mono">Edge Functions</CardTitle>
          <CardDescription>Status based on recent review_events</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {EDGE_FUNCTIONS.map((fn) => {
              const status = getServiceStatus(fn.name);
              return (
                <div
                  key={fn.name}
                  className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <Activity className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="font-mono text-sm">{fn.label}</p>
                      <p className="text-xs text-muted-foreground">{fn.name}</p>
                    </div>
                  </div>
                  {status ? (
                    getStatusIcon(status.status)
                  ) : (
                    <Badge variant="secondary" className="text-xs">N/A</Badge>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Recent Health Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-mono">Recent Health Logs</CardTitle>
        </CardHeader>
        <CardContent>
          {healthLogs && healthLogs.length > 0 ? (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {healthLogs.slice(0, 20).map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between py-2 border-b border-border/50 last:border-0"
                >
                  <div className="flex items-center gap-3">
                    {getStatusIcon(log.status)}
                    <span className="font-mono text-sm">{log.service_name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {getStatusBadge(log.status)}
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(log.checked_at), "MMM d, HH:mm")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-4">
              No health logs recorded. Run a health check to start monitoring.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
