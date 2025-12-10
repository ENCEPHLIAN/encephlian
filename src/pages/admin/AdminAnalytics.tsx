import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart3, TrendingUp, Users, FileText, Activity, Clock } from "lucide-react";

export default function AdminAnalytics() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-mono font-bold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground font-mono">
            Platform usage metrics and insights
          </p>
        </div>
        <Badge variant="outline" className="font-mono">Coming Soon</Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="border-dashed">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base font-mono">Study Volume</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-32 flex items-center justify-center bg-muted/30 rounded-lg">
              <p className="text-sm text-muted-foreground">Charts coming soon</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-dashed">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base font-mono">Token Usage</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-32 flex items-center justify-center bg-muted/30 rounded-lg">
              <p className="text-sm text-muted-foreground">Charts coming soon</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-dashed">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base font-mono">User Activity</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-32 flex items-center justify-center bg-muted/30 rounded-lg">
              <p className="text-sm text-muted-foreground">Charts coming soon</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-dashed">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base font-mono">Report Metrics</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-32 flex items-center justify-center bg-muted/30 rounded-lg">
              <p className="text-sm text-muted-foreground">Charts coming soon</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-dashed">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base font-mono">SLA Performance</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-32 flex items-center justify-center bg-muted/30 rounded-lg">
              <p className="text-sm text-muted-foreground">Charts coming soon</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-dashed">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base font-mono">Response Times</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-32 flex items-center justify-center bg-muted/30 rounded-lg">
              <p className="text-sm text-muted-foreground">Charts coming soon</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
