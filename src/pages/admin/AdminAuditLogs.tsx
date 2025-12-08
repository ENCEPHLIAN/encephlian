import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, ScrollText, User, Building2, FileText, Shield, Trash2 } from "lucide-react";
import { format } from "date-fns";

type AuditLog = {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  event_type: string;
  event_data: Record<string, any>;
  created_at: string;
};

const getEventIcon = (eventType: string) => {
  if (eventType.includes("user")) return User;
  if (eventType.includes("clinic")) return Building2;
  if (eventType.includes("study")) return FileText;
  if (eventType.includes("role")) return Shield;
  if (eventType.includes("cleanup") || eventType.includes("delete")) return Trash2;
  return ScrollText;
};

const getEventBadgeVariant = (eventType: string) => {
  if (eventType.includes("delete") || eventType.includes("suspend")) return "destructive";
  if (eventType.includes("create") || eventType.includes("grant")) return "default";
  if (eventType.includes("update")) return "secondary";
  return "outline";
};

export default function AdminAuditLogs() {
  const { data: logs, isLoading } = useQuery<AuditLog[]>({
    queryKey: ["admin-audit-logs"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_get_recent_audit_logs", {
        p_limit: 100,
      });
      if (error) throw error;
      return data as AuditLog[];
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-mono font-bold tracking-tight">Audit Logs</h1>
        <p className="text-sm text-muted-foreground font-mono">
          Track all administrative actions on the platform
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-mono">Event</TableHead>
                <TableHead className="font-mono">Actor</TableHead>
                <TableHead className="font-mono">Details</TableHead>
                <TableHead className="font-mono">Timestamp</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs?.map((log) => {
                const Icon = getEventIcon(log.event_type);
                return (
                  <TableRow key={log.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <Badge
                          variant={getEventBadgeVariant(log.event_type) as any}
                          className="font-mono text-xs"
                        >
                          {log.event_type}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {log.actor_email || (
                        <span className="text-muted-foreground">System</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <pre className="text-xs text-muted-foreground font-mono max-w-md truncate">
                        {JSON.stringify(log.event_data, null, 0)}
                      </pre>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {format(new Date(log.created_at), "MMM d, yyyy HH:mm:ss")}
                    </TableCell>
                  </TableRow>
                );
              })}
              {(!logs || logs.length === 0) && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    No audit logs found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
