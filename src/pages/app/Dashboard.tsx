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
    <div className="space-y-6 md:space-y-8 lg:space-y-12 max-w-full lg:max-w-[1600px]">
      <div className="animate-fade-in space-y-2 md:space-y-3">
        <h1 className="text-3xl md:text-4xl lg:text-5xl font-semibold tracking-tight text-foreground">
          Dashboard
        </h1>
        <p className="text-muted-foreground text-sm md:text-base lg:text-lg">Welcome back! Here's your triage care overview.</p>
      </div>

      <div className="grid gap-4 md:gap-6 lg:gap-8 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {kpis.map((kpi, index) => {
          const Icon = kpi.icon;
          return (
            <Card 
              key={kpi.title} 
              className="border-border/50 hover:border-border transition-all duration-150 hover:shadow-xl hover:-translate-y-1 animate-fade-in bg-card/50 backdrop-blur-sm"
              style={{ animationDelay: `${index * 0.05}s` }}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 md:pb-6 pt-6 md:pt-8 px-6 md:px-8">
                <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground uppercase tracking-wider">{kpi.title}</CardTitle>
                <div className={cn("p-2 md:p-3 rounded-xl", kpi.bgColor)}>
                  <Icon className={cn("h-4 w-4 md:h-5 md:w-5", kpi.color)} />
                </div>
              </CardHeader>
              <CardContent className="px-6 md:px-8 pb-6 md:pb-8">
                <div className="text-2xl md:text-3xl lg:text-4xl font-semibold tracking-tight">{kpi.value}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="border-border/50 animate-fade-in bg-card/50 backdrop-blur-sm">
        <CardHeader className="pt-6 md:pt-8 px-6 md:px-8 pb-4 md:pb-6">
          <CardTitle className="flex items-center gap-2 md:gap-3 text-lg md:text-xl font-semibold tracking-tight">
            <FileText className="h-5 w-5 md:h-6 md:w-6 text-muted-foreground" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent className="px-6 md:px-8 pb-6 md:pb-8">
          <p className="text-muted-foreground text-sm md:text-base leading-relaxed">
            Your recent studies and activity will appear here. Upload a study to get started with triage care processing.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
