import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Activity, Database, Server, HardDrive, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface HealthCheck {
  name: string;
  status: "operational" | "degraded" | "down";
  latency?: number;
  icon: any;
}

export default function SystemHealthMonitor() {
  const { data: health, isLoading, refetch } = useQuery({
    queryKey: ["system-health"],
    queryFn: async () => {
      const checks: HealthCheck[] = [];
      
      // Database health check
      const dbStart = Date.now();
      const { error: dbError } = await supabase.from("profiles").select("id").limit(1);
      const dbLatency = Date.now() - dbStart;
      
      checks.push({
        name: "Database",
        status: dbError ? "down" : dbLatency > 1000 ? "degraded" : "operational",
        latency: dbLatency,
        icon: Database,
      });
      
      // Storage health check
      const storageStart = Date.now();
      const { error: storageError } = await supabase.storage.from("eeg-uploads").list("", { limit: 1 });
      const storageLatency = Date.now() - storageStart;
      
      checks.push({
        name: "Storage",
        status: storageError ? "down" : storageLatency > 1000 ? "degraded" : "operational",
        latency: storageLatency,
        icon: HardDrive,
      });
      
      // Edge Functions health check
      const edgeStart = Date.now();
      try {
        await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/`, { method: "OPTIONS" });
        const edgeLatency = Date.now() - edgeStart;
        checks.push({
          name: "Edge Functions",
          status: edgeLatency > 2000 ? "degraded" : "operational",
          latency: edgeLatency,
          icon: Server,
        });
      } catch {
        checks.push({
          name: "Edge Functions",
          status: "down",
          icon: Server,
        });
      }
      
      return checks;
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const allOperational = health?.every(check => check.status === "operational");
  const anyDown = health?.some(check => check.status === "down");
  
  const StatusIcon = () => {
    if (anyDown) return <XCircle className="h-3.5 w-3.5 text-destructive" />;
    if (!allOperational) return <AlertCircle className="h-3.5 w-3.5 text-warning" />;
    return <Activity className="h-3.5 w-3.5 text-success" />;
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-background/50 backdrop-blur-sm hover:bg-background/80 transition-colors"
        >
          <div className="relative flex h-2 w-2">
            {allOperational && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
            )}
            <span className={`relative inline-flex rounded-full h-2 w-2 ${
              anyDown ? "bg-destructive" : !allOperational ? "bg-warning" : "bg-success"
            }`}></span>
          </div>
          <StatusIcon />
          <span className={`text-xs font-medium ${
            anyDown ? "text-destructive" : !allOperational ? "text-warning" : "text-success"
          }`}>
            {anyDown ? "SYSTEM DEGRADED" : !allOperational ? "PARTIAL OUTAGE" : "ALL UNITS OPERATIONAL"}
          </span>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            System Health Monitor
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-4">
          {health?.map((check) => (
            <Card key={check.name} className={`border-l-4 ${
              check.status === "operational" ? "border-l-success" :
              check.status === "degraded" ? "border-l-warning" : "border-l-destructive"
            }`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <check.icon className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-sm">{check.name}</p>
                      {check.latency && (
                        <p className="text-xs text-muted-foreground">{check.latency}ms response</p>
                      )}
                    </div>
                  </div>
                  <Badge variant={
                    check.status === "operational" ? "default" :
                    check.status === "degraded" ? "secondary" : "destructive"
                  }>
                    {check.status === "operational" && <CheckCircle2 className="h-3 w-3 mr-1" />}
                    {check.status === "degraded" && <AlertCircle className="h-3 w-3 mr-1" />}
                    {check.status === "down" && <XCircle className="h-3 w-3 mr-1" />}
                    {check.status.toUpperCase()}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
          <p className="text-xs text-muted-foreground text-center pt-2">
            Auto-refreshes every 30 seconds • Click badge to refresh manually
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
