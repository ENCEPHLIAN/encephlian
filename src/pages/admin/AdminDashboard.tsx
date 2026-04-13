import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Building2, FileText, Users, AlertTriangle, CheckCircle2, Clock, RotateCcw, ArrowRight, Activity } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { cn } from "@/lib/utils";

type DashboardStats = {
  total_clinics: number;
  total_studies: number;
  studies_by_state: Record<string, number>;
  total_tokens_sold: number;
  total_tokens_consumed: number;
  active_users: number;
};

const STATE_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  awaiting_sla: { label: "Awaiting",   color: "text-muted-foreground", dot: "bg-muted-foreground/40" },
  pending:      { label: "Pending",    color: "text-muted-foreground", dot: "bg-muted-foreground/40" },
  uploaded:     { label: "Uploaded",   color: "text-blue-500",         dot: "bg-blue-500" },
  processing:   { label: "Processing", color: "text-amber-500",        dot: "bg-amber-500" },
  ai_draft:     { label: "AI Draft",   color: "text-violet-500",       dot: "bg-violet-500" },
  complete:     { label: "Complete",   color: "text-emerald-500",      dot: "bg-emerald-500" },
  signed:       { label: "Signed",     color: "text-emerald-600",      dot: "bg-emerald-600" },
  failed:       { label: "Failed",     color: "text-red-500",          dot: "bg-red-500" },
};

export default function AdminDashboard() {
  const navigate = useNavigate();

  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ["admin-dashboard-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_get_dashboard_stats");
      if (error) throw error;
      return data as DashboardStats;
    },
    refetchInterval: 30000,
  });

  const { data: recentAudit } = useQuery({
    queryKey: ["admin-recent-audit"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("id, event_type, created_at, event_data")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
    refetchInterval: 30000,
  });

  const { data: failedStudies } = useQuery({
    queryKey: ["admin-failed-studies"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_get_all_studies");
      if (error) throw error;
      return (data || []).filter((s: any) => s.state === "failed").slice(0, 5);
    },
    refetchInterval: 30000,
  });

  const { data: recentComplete } = useQuery({
    queryKey: ["admin-recent-complete"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_get_all_studies");
      if (error) throw error;
      return (data || [])
        .filter((s: any) => s.state === "complete" || s.state === "signed")
        .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 5);
    },
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const states = stats?.studies_by_state || {};
  const failed = states["failed"] || 0;
  const processing = states["processing"] || 0;
  const complete = (states["complete"] || 0) + (states["signed"] || 0);
  const total = stats?.total_studies || 0;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Operations</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {format(new Date(), "EEEE, d MMMM yyyy · HH:mm")}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate("/admin/health")}>
          <Activity className="h-3.5 w-3.5 mr-1.5" />
          Service Health
        </Button>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Clinics", value: stats?.total_clinics || 0, icon: Building2, href: "/admin/clinics" },
          { label: "Studies", value: total, icon: FileText, href: "/admin/studies" },
          { label: "Active Users", value: stats?.active_users || 0, icon: Users, href: "/admin/users" },
          {
            label: "Complete",
            value: total > 0 ? `${Math.round((complete / total) * 100)}%` : "—",
            icon: CheckCircle2,
            href: "/admin/studies",
            accent: complete > 0 ? "text-emerald-500" : undefined,
          },
        ].map((kpi) => (
          <button
            key={kpi.label}
            onClick={() => navigate(kpi.href)}
            className="text-left p-4 rounded-lg border border-border/60 hover:border-border hover:bg-accent/30 transition-all group"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">{kpi.label}</span>
              <kpi.icon className="h-3.5 w-3.5 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
            </div>
            <span className={cn("text-2xl font-semibold tabular-nums", kpi.accent)}>{kpi.value}</span>
          </button>
        ))}
      </div>

      {/* Pipeline State Breakdown */}
      <div className="rounded-lg border border-border/60 p-4">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-medium">Pipeline</span>
          <span className="text-xs text-muted-foreground">{total} total studies</span>
        </div>
        <div className="flex gap-2 flex-wrap">
          {Object.entries(STATE_CONFIG).map(([key, cfg]) => {
            const count = states[key] || 0;
            if (count === 0 && key !== "processing" && key !== "failed") return null;
            return (
              <button
                key={key}
                onClick={() => navigate(`/admin/studies?state=${key}`)}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors",
                  "border border-transparent hover:border-border/60 hover:bg-accent/40",
                  count === 0 ? "opacity-40" : ""
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", cfg.dot)} />
                <span className={cfg.color}>{count}</span>
                <span className="text-muted-foreground">{cfg.label}</span>
              </button>
            );
          })}
        </div>
        {processing > 0 && (
          <div className="mt-3 pt-3 border-t border-border/40 flex items-center gap-2 text-xs text-amber-500">
            <Loader2 className="h-3 w-3 animate-spin" />
            {processing} {processing === 1 ? "study" : "studies"} currently in pipeline
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Failed Studies */}
        <div className="rounded-lg border border-border/60 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
            <div className="flex items-center gap-2">
              <AlertTriangle className={cn("h-3.5 w-3.5", failed > 0 ? "text-red-500" : "text-muted-foreground/40")} />
              <span className="text-sm font-medium">Failed</span>
              {failed > 0 && (
                <Badge variant="destructive" className="h-4 text-[10px] px-1.5">{failed}</Badge>
              )}
            </div>
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => navigate("/admin/studies?state=failed")}>
              View all <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
          <div className="divide-y divide-border/40">
            {failedStudies && failedStudies.length > 0 ? (
              failedStudies.map((s: any) => (
                <div key={s.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-accent/20 transition-colors">
                  <div className="min-w-0">
                    <span className="font-mono text-xs text-muted-foreground">{s.id.slice(0, 8)}</span>
                    {s.meta?.patient_id && (
                      <span className="ml-2 text-xs text-muted-foreground/60">{s.meta.patient_id}</span>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs shrink-0"
                    onClick={() => navigate(`/admin/studies/${s.id}`)}
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Retry
                  </Button>
                </div>
              ))
            ) : (
              <div className="flex items-center justify-center h-20 text-xs text-muted-foreground/50">
                No failed studies
              </div>
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="rounded-lg border border-border/60 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
            <div className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 text-muted-foreground/60" />
              <span className="text-sm font-medium">Activity</span>
            </div>
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => navigate("/admin/audit")}>
              Full log <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
          <div className="divide-y divide-border/40">
            {recentAudit && recentAudit.length > 0 ? (
              recentAudit.slice(0, 6).map((event) => (
                <div key={event.id} className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-xs font-mono text-muted-foreground truncate max-w-[180px]">
                    {event.event_type}
                  </span>
                  <span className="text-[10px] text-muted-foreground/50 shrink-0 ml-2">
                    {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
                  </span>
                </div>
              ))
            ) : (
              <div className="flex items-center justify-center h-20 text-xs text-muted-foreground/50">
                No recent activity
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recently Completed */}
      {recentComplete && recentComplete.length > 0 && (
        <div className="rounded-lg border border-border/60 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-sm font-medium">Recently Completed</span>
            </div>
          </div>
          <div className="divide-y divide-border/40">
            {recentComplete.map((s: any) => (
              <button
                key={s.id}
                onClick={() => navigate(`/admin/studies/${s.id}`)}
                className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-accent/20 transition-colors text-left"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-mono text-xs text-muted-foreground">{s.id.slice(0, 8)}</span>
                  {s.meta?.patient_id && (
                    <span className="text-xs text-muted-foreground/60 truncate">{s.meta.patient_id}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="secondary" className="text-[10px] h-4 px-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    {s.state}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground/50">
                    {formatDistanceToNow(new Date(s.created_at), { addSuffix: true })}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
