import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Loader2, Activity, Upload, FileText, TrendingUp } from "lucide-react";
import KPICard from "@/components/dashboard/KPICard";
import UrgentQueue from "@/components/dashboard/UrgentQueue";
import QuickActions from "@/components/dashboard/QuickActions";
import PerformanceCharts from "@/components/dashboard/PerformanceCharts";
import ActivityFeed from "@/components/dashboard/ActivityFeed";
import dayjs from "dayjs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Dashboard() {
  const navigate = useNavigate();

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
      {/* Welcome Header */}
      <div className="space-y-2">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
          Welcome back, {firstName}
        </h1>
        <p className="text-lg text-muted-foreground">
          {dayjs().format('dddd, MMMM D, YYYY')} • {dayjs().format('h:mm A')}
        </p>
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

      {/* KPI Cards with generous spacing */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
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
          label="Earnings (30d)"
          value={`₹${earningsThisMonth.toLocaleString()}`}
          change="+15% vs last month"
          trend="up"
          color="from-orange-500 to-orange-600"
          onClick={() => navigate("/app/wallet")}
        />
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
