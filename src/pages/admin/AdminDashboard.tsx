import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Building2, FileText, Coins, Users, AlertCircle } from "lucide-react";
import { format } from "date-fns";

type DashboardStats = {
  total_clinics: number;
  total_studies: number;
  studies_by_state: Record<string, number>;
  total_tokens_sold: number;
  total_tokens_consumed: number;
  active_users: number;
};

export default function AdminDashboard() {
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
        .limit(10);
      if (error) throw error;
      return data;
    },
  });

  if (statsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const studyStates = stats?.studies_by_state || {};
  const stateOrder = ["uploaded", "parsed", "canonicalized", "ai_draft", "in_review", "signed", "failed"];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-mono font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground font-mono">
          Platform overview and metrics
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Total Clinics
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{stats?.total_clinics || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Total Studies
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{stats?.total_studies || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Coins className="h-4 w-4" />
              Tokens Sold
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{stats?.total_tokens_sold || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Consumed: {stats?.total_tokens_consumed || 0}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Active Users (30d)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{stats?.active_users || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Studies by State */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-mono">Studies by State</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {stateOrder.map((state) => {
              const count = studyStates[state] || 0;
              const variant = state === "failed" ? "destructive" : 
                             state === "signed" ? "default" : "secondary";
              return (
                <div key={state} className="flex items-center gap-2">
                  <Badge variant={variant as any} className="font-mono text-xs">
                    {state.toUpperCase()}
                  </Badge>
                  <span className="text-sm font-mono">{count}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Recent Admin Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-mono">Recent Admin Actions</CardTitle>
          <CardDescription>Last 10 audit events</CardDescription>
        </CardHeader>
        <CardContent>
          {recentEvents && recentEvents.length > 0 ? (
            <div className="space-y-2">
              {recentEvents.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center justify-between py-2 border-b border-border/50 last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="font-mono text-xs">
                      {event.event_type}
                    </Badge>
                    <span className="text-xs text-muted-foreground font-mono">
                      {event.user_id?.slice(0, 8)}...
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(event.created_at), "MMM d, HH:mm")}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <AlertCircle className="h-4 w-4 mr-2" />
              No recent admin actions
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
