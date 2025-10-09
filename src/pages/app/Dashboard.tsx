import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, FileText, CheckCircle, Clock, AlertCircle, TrendingUp, Coins, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import dayjs from "dayjs";
import { Badge } from "@/components/ui/badge";

export default function Dashboard() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const { data: studies } = await supabase
        .from("studies")
        .select("state, created_at");

      const { data: wallet } = await supabase
        .from("wallets")
        .select("tokens")
        .single();

      const { data: earnings } = await supabase
        .from("earnings_wallets")
        .select("balance_inr, total_earned_inr")
        .single();

      const totalTokens = wallet?.tokens || 0;
      const uploaded = studies?.filter(s => s.state === "uploaded").length || 0;
      const inReview = studies?.filter(s => s.state === "in_review").length || 0;
      const signed = studies?.filter(s => s.state === "signed").length || 0;
      const earningsBalance = earnings?.balance_inr || 0;
      const totalEarned = earnings?.total_earned_inr || 0;

      return { totalTokens, uploaded, inReview, signed, earningsBalance, totalEarned };
    }
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const kpis = [
    { title: "Available Tokens", value: stats?.totalTokens || 0, icon: Coins, color: "text-primary", bgColor: "bg-primary/10" },
    { title: "In Queue", value: stats?.uploaded || 0, icon: Clock, color: "text-yellow-500", bgColor: "bg-yellow-500/10" },
    { title: "In Review", value: stats?.inReview || 0, icon: AlertCircle, color: "text-orange-500", bgColor: "bg-orange-500/10" },
    { title: "Signed Reports", value: stats?.signed || 0, icon: CheckCircle, color: "text-green-500", bgColor: "bg-green-500/10" },
    { title: "Earnings Balance", value: `₹${stats?.earningsBalance || 0}`, icon: DollarSign, color: "text-green-500", bgColor: "bg-green-500/10" },
    { title: "Total Earned", value: `₹${stats?.totalEarned || 0}`, icon: TrendingUp, color: "text-primary", bgColor: "bg-primary/10" },
  ];

  return (
    <div className="space-y-8">
      <div className="animate-fade-in">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-cyan-400 bg-clip-text text-transparent">
          Dashboard
        </h1>
        <p className="text-muted-foreground text-lg mt-2">Welcome back! Here's your triage care overview.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {kpis.map((kpi, index) => {
          const Icon = kpi.icon;
          return (
            <Card 
              key={kpi.title} 
              className="border-border hover:border-primary/50 transition-all duration-300 hover:shadow-lg hover:shadow-primary/10 hover:-translate-y-1 animate-fade-in"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">{kpi.title}</CardTitle>
                <div className={cn("p-2 rounded-lg", kpi.bgColor)}>
                  <Icon className={cn("h-5 w-5", kpi.color)} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{kpi.value}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="border-border animate-fade-in">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Your recent studies and activity will appear here. Upload a study to get started with triage care processing.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
