import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Building2, FileText, Coins, Users, TrendingUp, Zap, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

type DashboardStats = {
  total_clinics: number;
  total_studies: number;
  studies_by_state: Record<string, number>;
  total_tokens_sold: number;
  total_tokens_consumed: number;
  active_users: number;
};

function StatCard({ 
  title, 
  value, 
  subtitle, 
  icon: Icon, 
  trend,
  accent = "neutral" 
}: { 
  title: string; 
  value: number | string; 
  subtitle?: string; 
  icon: React.ElementType;
  trend?: string;
  accent?: "primary" | "success" | "warning" | "info" | "neutral";
}) {
  return (
    <Card className={cn("relative overflow-hidden", `dashboard-card--${accent}`)}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
            <p className="text-2xl font-semibold tracking-tight">{value}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
          <div className="h-9 w-9 rounded-lg bg-accent/50 flex items-center justify-center">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
        {trend && (
          <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
            <TrendingUp className="h-3 w-3" />
            <span>{trend}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PipelineCard({ studyStates }: { studyStates: Record<string, number> }) {
  const stages = [
    { key: "uploaded", label: "Uploaded", color: "bg-muted-foreground/20" },
    { key: "processing", label: "Processing", color: "bg-amber-500/20 text-amber-600 dark:text-amber-400" },
    { key: "ai_draft", label: "AI Draft", color: "bg-blue-500/20 text-blue-600 dark:text-blue-400" },
    { key: "in_review", label: "In Review", color: "bg-purple-500/20 text-purple-600 dark:text-purple-400" },
    { key: "signed", label: "Signed", color: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400" },
  ];

  const total = Object.values(studyStates).reduce((a, b) => a + b, 0);
  const failed = studyStates["failed"] || 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Pipeline Health</CardTitle>
          {failed > 0 && (
            <Badge variant="destructive" className="text-xs">
              {failed} failed
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-5 gap-2">
          {stages.map((stage) => {
            const count = studyStates[stage.key] || 0;
            const pct = total > 0 ? ((count / total) * 100).toFixed(0) : "0";
            return (
              <div key={stage.key} className="text-center">
                <div className={cn(
                  "rounded-md py-2 px-1 mb-1",
                  stage.color
                )}>
                  <span className="text-lg font-semibold">{count}</span>
                </div>
                <p className="text-[10px] font-medium text-muted-foreground truncate">{stage.label}</p>
                <p className="text-[10px] text-muted-foreground/60">{pct}%</p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminDashboard() {
  const navigate = useNavigate();

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["admin-dashboard-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_get_dashboard_stats");
      if (error) throw error;
      return data as DashboardStats;
    },
  });

  const { data: recentEvents } = useQuery({
    queryKey: ["admin-recent-audit"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return data;
    },
  });

  if (statsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const studyStates = stats?.studies_by_state || {};
  const tokenUtilization = stats?.total_tokens_sold 
    ? Math.round((stats.total_tokens_consumed / stats.total_tokens_sold) * 100) 
    : 0;

  const quickActions = [
    { label: "New Clinic", href: "/admin/clinics", icon: Building2 },
    { label: "Push EEG", href: "/admin/eeg-push", icon: Zap },
    { label: "View Studies", href: "/admin/studies", icon: FileText },
    { label: "Check Health", href: "/admin/health", icon: TrendingUp },
  ];

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Platform metrics and value unit health
        </p>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Value Units"
          value={stats?.total_clinics || 0}
          subtitle="Active clinics"
          icon={Building2}
          accent="primary"
        />
        <StatCard
          title="Studies"
          value={stats?.total_studies || 0}
          subtitle="Total processed"
          icon={FileText}
          accent="info"
        />
        <StatCard
          title="Token Utilization"
          value={`${tokenUtilization}%`}
          subtitle={`${stats?.total_tokens_consumed || 0} / ${stats?.total_tokens_sold || 0}`}
          icon={Coins}
          accent="warning"
        />
        <StatCard
          title="Active Users"
          value={stats?.active_users || 0}
          subtitle="Last 30 days"
          icon={Users}
          accent="success"
        />
      </div>

      {/* Pipeline + Activity */}
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <PipelineCard studyStates={studyStates} />
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentEvents && recentEvents.length > 0 ? (
              recentEvents.slice(0, 5).map((event) => (
                <div
                  key={event.id}
                  className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                    <span className="text-xs font-medium truncate">{event.event_type}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
                  </span>
                </div>
              ))
            ) : (
              <div className="flex items-center justify-center py-6 text-muted-foreground">
                <Clock className="h-4 w-4 mr-2" />
                <span className="text-xs">No recent activity</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions - using navigate instead of <a> tags */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {quickActions.map((action) => (
              <button
                key={action.label}
                onClick={() => navigate(action.href)}
                className="flex items-center gap-2 p-3 rounded-lg border border-border/50 hover:bg-accent/50 transition-colors text-left"
              >
                <action.icon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{action.label}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
