import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, FileText, CheckCircle, Clock, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import dayjs from "dayjs";

export default function Dashboard() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const { data: studies } = await supabase
        .from("studies")
        .select("state, created_at");

      const { data: wallets } = await supabase
        .from("credits_wallets")
        .select("balance");

      const totalCredits = wallets?.reduce((sum, w) => sum + w.balance, 0) || 0;
      const uploaded = studies?.filter(s => s.state === "uploaded").length || 0;
      const inReview = studies?.filter(s => s.state === "in_review").length || 0;
      const signed = studies?.filter(s => s.state === "signed").length || 0;

      return { totalCredits, uploaded, inReview, signed };
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
    { title: "Total Credits", value: stats?.totalCredits || 0, icon: Clock, color: "text-blue-500" },
    { title: "In Queue", value: stats?.uploaded || 0, icon: FileText, color: "text-yellow-500" },
    { title: "In Review", value: stats?.inReview || 0, icon: AlertCircle, color: "text-orange-500" },
    { title: "Signed", value: stats?.signed || 0, icon: CheckCircle, color: "text-green-500" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Welcome back! Here's your overview.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Card key={kpi.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{kpi.title}</CardTitle>
                <Icon className={cn("h-4 w-4", kpi.color)} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{kpi.value}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Your recent studies and activity will appear here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
