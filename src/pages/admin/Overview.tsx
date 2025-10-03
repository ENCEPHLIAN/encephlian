import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Users, FileText, DollarSign } from "lucide-react";

export default function Overview() {
  const { data: stats } = useQuery({
    queryKey: ["overview-stats"],
    queryFn: async () => {
      const [clinics, users, studies, billing] = await Promise.all([
        supabase.from("clinics").select("*", { count: "exact", head: true }),
        supabase.from("profiles").select("*", { count: "exact", head: true }),
        supabase.from("studies").select("*", { count: "exact", head: true }),
        supabase.from("billing_records").select("amount"),
      ]);

      const totalRevenue = billing.data?.reduce((sum, record) => sum + Number(record.amount), 0) || 0;

      return {
        clinics: clinics.count || 0,
        users: users.count || 0,
        studies: studies.count || 0,
        revenue: totalRevenue,
      };
    },
  });

  const statCards = [
    {
      title: "Total Clinics",
      value: stats?.clinics || 0,
      icon: Building2,
      description: "Active clinics in the system",
    },
    {
      title: "Total Users",
      value: stats?.users || 0,
      icon: Users,
      description: "Registered users",
    },
    {
      title: "Active Studies",
      value: stats?.studies || 0,
      icon: FileText,
      description: "Ongoing research studies",
    },
    {
      title: "Total Revenue",
      value: `$${stats?.revenue.toLocaleString() || 0}`,
      icon: DollarSign,
      description: "All-time billing revenue",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Overview</h1>
        <p className="text-muted-foreground">
          Welcome to Encephlian Admin Dashboard
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {stat.title}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">
                {stat.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
