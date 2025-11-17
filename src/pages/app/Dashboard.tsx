import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Loader2, Activity, Upload, FileText, TrendingUp, Lightbulb, Keyboard, Zap, Search } from "lucide-react";
import KPICard from "@/components/dashboard/KPICard";
import UrgentQueue from "@/components/dashboard/UrgentQueue";
import PerformanceCharts from "@/components/dashboard/PerformanceCharts";
import ActivityFeed from "@/components/dashboard/ActivityFeed";
import dayjs from "dayjs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useState } from "react";

export default function Dashboard() {
  const navigate = useNavigate();
  const [commandOpen, setCommandOpen] = useState(false);

  const { data: user } = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user;
    }
  });

  const { data: studies, isLoading } = useQuery({
    queryKey: ["dashboard-studies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("studies")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data;
    }
  });

  const { data: wallet } = useQuery({
    queryKey: ["wallet-balance"],
    queryFn: async () => {
      const { data } = await supabase.from("wallets").select("tokens").single();
      return data;
    }
  });

  const { data: earningsData } = useQuery({
    queryKey: ["earnings-wallet"],
    queryFn: async () => {
      const { data } = await supabase
        .from("earnings_wallets")
        .select("*")
        .single();
      return data;
    }
  });

  const { data: recentStudies } = useQuery({
    queryKey: ["recent-studies"],
    queryFn: async () => {
      const { data } = await supabase
        .from("studies")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5);
      return data;
    }
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const pendingStudies = studies?.filter(s => s.state === 'uploaded' || s.state === 'ai_draft' || s.state === 'in_review') || [];
  const completedToday = studies?.filter(s => 
    s.state === 'signed' && dayjs(s.created_at).isAfter(dayjs().startOf('day'))
  ).length || 0;
  const completedWeek = studies?.filter(s => 
    s.state === 'signed' && dayjs(s.created_at).isAfter(dayjs().startOf('week'))
  ).length || 0;
  const earningsThisMonth = earningsData?.balance_inr || 0;

  const firstName = user?.email?.split('@')[0] || 'User';

  return (
    <div className="space-y-[var(--space-3xl)] animate-fade-in">
      {/* Welcome Header with Search */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
              Welcome back, {firstName}
            </h1>
            <p className="text-lg text-muted-foreground">
              {dayjs().format('dddd, MMMM D, YYYY')} • {dayjs().format('h:mm A')}
            </p>
          </div>
        </div>
        
        {/* Command Palette Hint */}
        <Button 
          variant="outline" 
          className="relative h-12 w-full max-w-xl justify-start text-muted-foreground hover:bg-muted"
          onClick={() => {
            const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true });
            document.dispatchEvent(event);
          }}
        >
          <Search className="mr-2 h-4 w-4" />
          <span>Search studies, patients, navigate...</span>
          <kbd className="pointer-events-none absolute right-3 hidden h-6 select-none items-center gap-1 rounded border bg-background px-2 font-mono text-xs font-medium opacity-100 sm:flex">
            <span className="text-xs">⌘</span>K
          </kbd>
        </Button>
      </div>

      {/* Quick Actions - Prominent */}
      <Card className="openai-card border-2">
        <CardHeader>
          <CardTitle className="text-2xl">Quick Actions</CardTitle>
          <CardDescription>Get started with your most common tasks</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button 
              size="lg" 
              className="h-20 text-lg"
              onClick={() => navigate("/app/studies?filter=uploaded")}
            >
              <Activity className="mr-2 h-6 w-6" />
              Start Review
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              className="h-20 text-lg"
              onClick={() => navigate("/app/files")}
            >
              <Upload className="mr-2 h-6 w-6" />
              Upload Study
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              className="h-20 text-lg"
              onClick={() => navigate("/app/studies")}
            >
              <FileText className="mr-2 h-6 w-6" />
              View Reports
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Quick Tips Card */}
      <Card className="openai-card bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950 border-2 border-blue-200 dark:border-blue-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-blue-600" />
            Quick Tips
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            <li className="flex gap-3">
              <Keyboard className="h-5 w-5 text-blue-600 flex-shrink-0" />
              <div>
                <p className="font-medium">Press <kbd className="px-2 py-1 bg-background rounded text-xs">Ctrl+K</kbd> to search</p>
                <p className="text-sm text-muted-foreground">Quickly find studies, navigate, or take actions</p>
              </div>
            </li>
            <li className="flex gap-3">
              <Upload className="h-5 w-5 text-blue-600 flex-shrink-0" />
              <div>
                <p className="font-medium">Drag & drop EEG files</p>
                <p className="text-sm text-muted-foreground">Upload directly from Files page</p>
              </div>
            </li>
            <li className="flex gap-3">
              <Zap className="h-5 w-5 text-blue-600 flex-shrink-0" />
              <div>
                <p className="font-medium">AI assists your reviews</p>
                <p className="text-sm text-muted-foreground">Get draft reports in seconds, review and sign</p>
              </div>
            </li>
          </ul>
        </CardContent>
      </Card>

      {/* KPI Cards with generous spacing */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
        <KPICard
          label="Pending Studies"
          value={pendingStudies.length}
          change={`${pendingStudies.filter(s => s.sla === 'STAT').length} STAT cases`}
          trend={pendingStudies.length > 5 ? "up" : "neutral"}
          color="from-blue-500 to-blue-600"
          onClick={() => navigate("/app/studies?filter=uploaded")}
        />
        <KPICard
          label="Completed Today"
          value={completedToday}
          change="Goal: 5"
          trend={completedToday >= 5 ? "up" : "neutral"}
          color="from-green-500 to-green-600"
        />
        <KPICard
          label="This Week"
          value={completedWeek}
          change="Studies completed"
          trend="neutral"
          color="from-purple-500 to-purple-600"
        />
        <KPICard
          label="Earnings (30d)"
          value={`₹${earningsThisMonth.toLocaleString()}`}
          change="+15% vs last month"
          trend="up"
          color="from-orange-500 to-orange-600"
          onClick={() => navigate("/app/wallet")}
        />
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
                <div className="text-3xl font-bold">₹{earningsThisMonth.toLocaleString()}</div>
                <div className="text-sm text-muted-foreground">Earned</div>
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
                  {recentStudies.map(study => {
                    const meta = study.meta as any;
                    return (
                      <div key={study.id} className="flex items-center justify-between py-2 border-b last:border-0">
                        <div className="flex items-center gap-3">
                          <Activity className="h-5 w-5 text-blue-600" />
                          <div>
                            <p className="font-medium text-sm">{meta?.patient_name || 'Unknown'}</p>
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
                <div className="text-center py-8 text-muted-foreground">
                  No recent studies
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Keyboard Shortcuts Guide */}
      <Card className="openai-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            Keyboard Shortcuts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground">Open command palette</span>
              <kbd className="px-2 py-1 bg-muted rounded text-xs w-fit">Ctrl+K</kbd>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground">Toggle sidebar</span>
              <kbd className="px-2 py-1 bg-muted rounded text-xs w-fit">Ctrl+B</kbd>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground">Go to dashboard</span>
              <kbd className="px-2 py-1 bg-muted rounded text-xs w-fit">G then D</kbd>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground">Go to studies</span>
              <kbd className="px-2 py-1 bg-muted rounded text-xs w-fit">G then S</kbd>
            </div>
          </div>
        </CardContent>
      </Card>

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
