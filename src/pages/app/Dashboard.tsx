import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import KPICard from "@/components/dashboard/KPICard";
import UrgentQueue from "@/components/dashboard/UrgentQueue";
import QuickActions from "@/components/dashboard/QuickActions";
import PerformanceCharts from "@/components/dashboard/PerformanceCharts";
import ActivityFeed from "@/components/dashboard/ActivityFeed";
import dayjs from "dayjs";

export default function Dashboard() {
  const navigate = useNavigate();

  // Fetch user info
  const { data: user } = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user;
    }
  });

  // Fetch studies for metrics
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

  // Fetch wallet balance
  const { data: wallet } = useQuery({
    queryKey: ["wallet-balance"],
    queryFn: async () => {
      const { data } = await supabase.from("wallets").select("tokens").single();
      return data;
    }
  });

  // Fetch earnings
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

  // Calculate metrics
  const pendingStudies = studies?.filter(s => s.state === 'uploaded' || s.state === 'ai_draft' || s.state === 'in_review') || [];
  const completedToday = studies?.filter(s => 
    s.state === 'signed' && dayjs(s.created_at).isAfter(dayjs().startOf('day'))
  ).length || 0;
  const completedWeek = studies?.filter(s => 
    s.state === 'signed' && dayjs(s.created_at).isAfter(dayjs().startOf('week'))
  ).length || 0;
  const earningsThisMonth = earningsData?.balance_inr || 0;

  // Get user's first name
  const firstName = user?.email?.split('@')[0] || 'User';

  return (
    <div className="space-y-8">
      {/* Welcome Header */}
      <div>
        <h1 className="text-4xl font-bold">Welcome back, {firstName}</h1>
        <p className="text-muted-foreground mt-1">
          {dayjs().format('dddd, MMMM D, YYYY')} • {dayjs().format('h:mm A')}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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
          change={`${Math.round((completedWeek / 30) * 100)}% of monthly goal`}
          trend="up"
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

      {/* Urgent Queue */}
      <UrgentQueue studies={pendingStudies} />

      {/* Quick Actions */}
      <QuickActions 
        pendingStudies={pendingStudies}
        tokenBalance={wallet?.tokens || 0}
      />

      {/* Performance Charts */}
      <PerformanceCharts studies={studies || []} />

      {/* Activity Feed */}
      <ActivityFeed studies={studies || []} />
    </div>
  );
}
