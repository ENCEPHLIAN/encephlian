import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Loader2, Activity, Upload, StickyNote, Coins } from "lucide-react";
import KPICard from "@/components/dashboard/KPICard";
import UrgentQueue from "@/components/dashboard/UrgentQueue";
import PerformanceCharts from "@/components/dashboard/PerformanceCharts";
import ActivityFeed from "@/components/dashboard/ActivityFeed";
import { CalendarWidget } from "@/components/CalendarWidget";
import dayjs from "dayjs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function Dashboard() {
  const navigate = useNavigate();

  const { data: user } = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user;
    },
  });

  const { data: studies, isLoading } = useQuery({
    queryKey: ["dashboard-studies"],
    queryFn: async () => {
      const { data, error } = await supabase.from("studies").select("*").order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const { data: wallet } = useQuery({
    queryKey: ["wallet-balance"],
    queryFn: async () => {
      const { data } = await supabase.from("wallets").select("tokens").single();
      return data;
    },
  });

  const { data: recentStudies } = useQuery({
    queryKey: ["recent-studies"],
    queryFn: async () => {
      const { data } = await supabase.from("studies").select("*").order("created_at", { ascending: false }).limit(5);
      return data;
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const pendingStudies =
    studies?.filter((s) => s.state === "uploaded" || s.state === "ai_draft" || s.state === "in_review") || [];

  const completedToday =
    studies?.filter((s) => s.state === "signed" && dayjs(s.created_at).isAfter(dayjs().startOf("day"))).length || 0;

  const completedWeek =
    studies?.filter((s) => s.state === "signed" && dayjs(s.created_at).isAfter(dayjs().startOf("week"))).length || 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Subtle Header: only date/time, no cringe greeting */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {dayjs().format("dddd, MMMM D, YYYY")} • {dayjs().format("h:mm A")}
        </p>
      </div>

      {/* Quick Actions */}
      <Card className="openai-card border-2">
        <CardHeader className="pb-4">
          <CardTitle className="text-xl">Quick Actions</CardTitle>
          <CardDescription className="text-sm">Get started with your most common tasks</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            {/* Primary CTA – deep navy in light, warm off-white in dark */}
            <Button
              size="lg"
              className="quick-action-btn h-20 flex-col"
              onClick={() => navigate("/app/studies?filter=uploaded")}
            >
              <Activity className="h-5 w-5 shrink-0" />
              <span className="text-sm">Start Review</span>
            </Button>

            {/* The rest: richer surface via quick-outline */}
            <Button
              size="lg"
              variant="outline"
              className="quick-action-btn h-20 flex-col quick-outline"
              onClick={() => navigate("/app/files")}
            >
              <Upload className="h-5 w-5 shrink-0" />
              <span className="text-sm">Upload Study</span>
            </Button>

            <Button
              size="lg"
              variant="outline"
              className="quick-action-btn h-20 flex-col quick-outline"
              onClick={() => navigate("/app/notes")}
            >
              <StickyNote className="h-5 w-5 shrink-0" />
              <span className="text-sm">My Notes</span>
            </Button>

            <Button
              size="lg"
              variant="outline"
              className="quick-action-btn h-20 flex-col quick-outline"
              onClick={() => navigate("/app/wallet")}
            >
              <Coins className="h-5 w-5 shrink-0" />
              <span className="text-sm">Buy Tokens</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards - 8 Cards with muted business colors (uses kpi- classes) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Pending Studies"
          value={pendingStudies.length}
          change={`${pendingStudies.filter((s) => s.sla === "STAT").length} STAT cases`}
          trend={pendingStudies.length > 5 ? "up" : "neutral"}
          variant="blue"
          onClick={() => navigate("/app/studies?filter=uploaded")}
        />

        <KPICard
          label="Completed Today"
          value={completedToday}
          change="Goal: 5"
          trend={completedToday >= 5 ? "up" : "neutral"}
          variant="green"
        />

        <KPICard label="This Week" value={completedWeek} change="Studies completed" trend="neutral" variant="cyan" />

        <KPICard
          label="Token Balance"
          value={wallet?.tokens || 0}
          change="Available for signing"
          trend="neutral"
          variant="indigo"
          onClick={() => navigate("/app/wallet")}
        />

        <KPICard label="Average TAT" value="12 hrs" change="Turnaround time" trend="up" variant="amber" />

        <KPICard
          label="This Month"
          value={
            studies?.filter((s) => s.state === "signed" && dayjs(s.created_at).isAfter(dayjs().startOf("month")))
              .length || 0
          }
          change="Monthly total"
          trend="up"
          variant="cyan"
        />

        <KPICard label="Success Rate" value="98.5%" change="Quality score" trend="up" variant="green" />

        <KPICard label="Active Now" value="3" change="Reviewers online" trend="neutral" variant="neutral" />
      </div>

      {/* Analytics & Recent Studies Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Performance Analytics */}
        <Card className="openai-card">
          <CardHeader>
            <CardTitle>Performance Analytics</CardTitle>
            <CardDescription>Your review metrics this month</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <div className="text-3xl font-bold">{studies?.length || 0}</div>
                <div className="text-sm text-muted-foreground">Studies Reviewed</div>
              </div>
              <div>
                <div className="text-3xl font-bold">2.3h</div>
                <div className="text-sm text-muted-foreground">Avg. Review Time</div>
              </div>
              <div>
                <div className="text-3xl font-bold">94%</div>
                <div className="text-sm text-muted-foreground">On-Time Rate</div>
              </div>
              <div>
                <div className="text-3xl font-bold">{wallet?.tokens || 0}</div>
                <div className="text-sm text-muted-foreground">Tokens</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recent Studies Quick Access */}
        <Card className="openai-card">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Recent Studies</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate("/app/studies")}>
                View All
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-48">
              {recentStudies && recentStudies.length > 0 ? (
                <div className="space-y-3">
                  {recentStudies.map((study) => {
                    const meta = study.meta as any;
                    return (
                      <div key={study.id} className="flex items-center justify-between py-2 border-b last:border-0">
                        <div className="flex items-center gap-3">
                          <Activity className="h-5 w-5 text-blue-600" />
                          <div>
                            <p className="font-medium text-sm">{meta?.patient_name || "Unknown"}</p>
                            <p className="text-xs text-muted-foreground">{meta?.patient_id || study.id.slice(0, 8)}</p>
                          </div>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => navigate(`/app/studies/${study.id}`)}>
                          Open
                        </Button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">No recent studies</div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Calendar Widget */}
      <div className="mt-16">
        <CalendarWidget />
      </div>

      {/* Urgent Queue */}
      <div className="openai-section">
        <UrgentQueue studies={pendingStudies} />
      </div>

      {/* Performance Charts */}
      <div className="openai-section">
        <PerformanceCharts studies={studies || []} />
      </div>

      {/* Activity Feed */}
      <div className="openai-section">
        <ActivityFeed studies={studies || []} />
      </div>
    </div>
  );
}
