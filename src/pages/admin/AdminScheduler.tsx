import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, Bell, Repeat, Zap, Settings } from "lucide-react";

export default function AdminScheduler() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-mono font-bold tracking-tight">Scheduler</h1>
          <p className="text-sm text-muted-foreground font-mono">
            Automated tasks and scheduled operations
          </p>
        </div>
        <Badge variant="outline" className="font-mono">Coming Soon</Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-dashed">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base font-mono">Scheduled Jobs</CardTitle>
            </div>
            <CardDescription>
              View and manage automated scheduled tasks
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-40 flex items-center justify-center bg-muted/30 rounded-lg">
              <p className="text-sm text-muted-foreground">No scheduled jobs</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-dashed">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base font-mono">Cron Tasks</CardTitle>
            </div>
            <CardDescription>
              Recurring background processes
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-40 flex items-center justify-center bg-muted/30 rounded-lg">
              <p className="text-sm text-muted-foreground">No cron tasks configured</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-dashed">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base font-mono">Notification Queue</CardTitle>
            </div>
            <CardDescription>
              Pending and scheduled notifications
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-40 flex items-center justify-center bg-muted/30 rounded-lg">
              <p className="text-sm text-muted-foreground">Queue empty</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-dashed">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Repeat className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base font-mono">Batch Operations</CardTitle>
            </div>
            <CardDescription>
              Bulk processing tasks
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-40 flex items-center justify-center bg-muted/30 rounded-lg">
              <p className="text-sm text-muted-foreground">No batch jobs running</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
