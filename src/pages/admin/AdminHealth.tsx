import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, RefreshCw, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { resolveReadApiBase, getReadApiKey } from "@/shared/readApiConfig";
import { cn } from "@/lib/utils";

type ServiceHealth = {
  id: string;
  service_name: string;
  status: string;
  last_success_at: string | null;
  last_error_at: string | null;
  last_error_message: string | null;
  checked_at: string;
};

const CPLANE_BASE = (import.meta as any).env?.VITE_CPLANE_BASE as string | undefined;
const IPLANE_BASE = (import.meta as any).env?.VITE_IPLANE_BASE as string | undefined;

const SERVICES = [
  { key: "database",      label: "Database",    hint: "Supabase Postgres" },
  { key: "cplane",        label: "C-Plane",     hint: "ESF canonicalization" },
  { key: "iplane",        label: "I-Plane",     hint: "MIND® inference" },
  { key: "azure_read_api",label: "Read API",    hint: "EEG chunk server" },
  { key: "storage",       label: "Storage",     hint: "Supabase storage" },
];

function StatusDot({ status }: { status?: string }) {
  if (status === "healthy") return <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />;
  if (status === "degraded") return <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />;
  if (status === "down") return <span className="h-2 w-2 rounded-full bg-red-500 shrink-0 animate-pulse" />;
  return <span className="h-2 w-2 rounded-full bg-muted-foreground/30 shrink-0" />;
}

function StatusBadge({ status }: { status?: string }) {
  if (status === "healthy") return <Badge variant="secondary" className="text-[10px] h-4 px-1.5 bg-emerald-500/10 text-emerald-500">healthy</Badge>;
  if (status === "degraded") return <Badge variant="secondary" className="text-[10px] h-4 px-1.5 bg-amber-500/10 text-amber-500">degraded</Badge>;
  if (status === "down") return <Badge variant="secondary" className="text-[10px] h-4 px-1.5 bg-red-500/10 text-red-500">down</Badge>;
  return <Badge variant="secondary" className="text-[10px] h-4 px-1.5 text-muted-foreground">unknown</Badge>;
}

export default function AdminHealth() {
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);

  const { data: logs } = useQuery<ServiceHealth[]>({
    queryKey: ["admin-health-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_health_logs")
        .select("*")
        .order("checked_at", { ascending: false });
      if (error) throw error;
      return data as ServiceHealth[];
    },
    refetchInterval: 30000,
  });

  const latest = (key: string) => logs?.find((l) => l.service_name === key);

  const checkMutation = useMutation({
    mutationFn: async () => {
      setRunning(true);
      const results: Array<{ service: string; status: string; error?: string }> = [];

      // Database
      try {
        const t = Date.now();
        await supabase.from("clinics").select("id").limit(1);
        results.push({ service: "database", status: Date.now() - t < 1000 ? "healthy" : "degraded" });
      } catch (e: any) { results.push({ service: "database", status: "down", error: e.message }); }

      // Storage
      try {
        const t = Date.now();
        await supabase.storage.from("clinic-logos").list("", { limit: 1 });
        results.push({ service: "storage", status: Date.now() - t < 2000 ? "healthy" : "degraded" });
      } catch (e: any) { results.push({ service: "storage", status: "down", error: e.message }); }

      // Read API
      try {
        const apiBase = resolveReadApiBase();
        const apiKey = getReadApiKey();
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 5000);
        const res = await fetch(`${apiBase}/health`, { signal: ctrl.signal, headers: apiKey ? { "X-API-KEY": apiKey } : {} });
        clearTimeout(timer);
        results.push({ service: "azure_read_api", status: res.ok ? "healthy" : "degraded" });
      } catch (e: any) { results.push({ service: "azure_read_api", status: "down", error: e.message }); }

      // C-Plane
      if (CPLANE_BASE) {
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 5000);
          const res = await fetch(`${CPLANE_BASE}/health`, { signal: ctrl.signal });
          clearTimeout(timer);
          results.push({ service: "cplane", status: res.ok ? "healthy" : "degraded" });
        } catch (e: any) { results.push({ service: "cplane", status: "down", error: e.message }); }
      }

      // I-Plane
      if (IPLANE_BASE) {
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 5000);
          const res = await fetch(`${IPLANE_BASE}/health`, { signal: ctrl.signal });
          clearTimeout(timer);
          results.push({ service: "iplane", status: res.ok ? "healthy" : "degraded" });
        } catch (e: any) { results.push({ service: "iplane", status: "down", error: e.message }); }
      }

      const { data: { user } } = await supabase.auth.getUser();
      for (const r of results) {
        await supabase.from("service_health_logs").insert({
          service_name: r.service,
          status: r.status,
          last_success_at: r.status !== "down" ? new Date().toISOString() : null,
          last_error_at: r.status === "down" ? new Date().toISOString() : null,
          last_error_message: r.error || null,
          checked_by: user?.id,
        });
      }
      return results;
    },
    onSuccess: (results) => {
      queryClient.invalidateQueries({ queryKey: ["admin-health-logs"] });
      const ok = results.every((r) => r.status === "healthy");
      const down = results.some((r) => r.status === "down");
      if (ok) toast.success("All services healthy");
      else if (down) toast.error("One or more services are down");
      else toast.warning("Some services degraded");
    },
    onError: (e: any) => toast.error(e.message),
    onSettled: () => setRunning(false),
  });

  const allHealthy = SERVICES.every((s) => latest(s.key)?.status === "healthy");
  const anyDown = SERVICES.some((s) => latest(s.key)?.status === "down");

  return (
    <div className="space-y-4 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Service Health</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {allHealthy ? "All systems operational" : anyDown ? "Outage detected" : "Partial degradation"}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => checkMutation.mutate()} disabled={running}>
          {running ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
          Run check
        </Button>
      </div>

      {/* Status Banner */}
      <div className={cn(
        "flex items-center gap-2.5 px-4 py-2.5 rounded-lg border text-sm font-medium",
        allHealthy
          ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
          : anyDown
            ? "bg-red-500/5 border-red-500/20 text-red-500"
            : "bg-amber-500/5 border-amber-500/20 text-amber-500"
      )}>
        {allHealthy
          ? <CheckCircle2 className="h-4 w-4" />
          : anyDown
            ? <XCircle className="h-4 w-4" />
            : <AlertCircle className="h-4 w-4" />}
        {allHealthy ? "All Systems Operational" : anyDown ? "System Outage Detected" : "Degraded Performance"}
      </div>

      {/* Services Grid */}
      <div className="rounded-lg border border-border/60 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/40 bg-muted/30">
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Service</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Status</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Last checked</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Error</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {SERVICES.map((svc) => {
              const log = latest(svc.key);
              return (
                <tr key={svc.key} className="hover:bg-accent/20 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <StatusDot status={log?.status} />
                      <div>
                        <p className="text-sm font-medium">{svc.label}</p>
                        <p className="text-[10px] text-muted-foreground">{svc.hint}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={log?.status} />
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {log?.checked_at
                      ? formatDistanceToNow(new Date(log.checked_at), { addSuffix: true })
                      : "Never"}
                  </td>
                  <td className="px-4 py-3 text-xs text-red-400 max-w-xs truncate">
                    {log?.last_error_message || "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Recent Log */}
      {logs && logs.length > 0 && (
        <div className="rounded-lg border border-border/60 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border/40 bg-muted/30">
            <span className="text-xs font-medium text-muted-foreground">Recent checks</span>
          </div>
          <div className="max-h-56 overflow-y-auto divide-y divide-border/40">
            {logs.slice(0, 30).map((log) => (
              <div key={log.id} className="flex items-center justify-between px-4 py-2">
                <div className="flex items-center gap-2.5">
                  <StatusDot status={log.status} />
                  <span className="font-mono text-xs text-muted-foreground">{log.service_name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={log.status} />
                  <span className="text-[10px] text-muted-foreground/50">
                    {formatDistanceToNow(new Date(log.checked_at), { addSuffix: true })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
