import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";

export default function ActivityLog() {
  const { data: logs, isLoading } = useQuery({
    queryKey: ["admin-activity"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      return data;
    },
    refetchInterval: 60_000 // 60s — egress-conscious, was 5s
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity Log</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Event Type</TableHead>
                <TableHead>User ID</TableHead>
                <TableHead>IP Address</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs?.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-xs text-muted-foreground">
                    {format(new Date(log.created_at), "MMM d, h:mm:ss a")}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{log.event_type}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {log.user_id?.substring(0, 8)}...
                  </TableCell>
                  <TableCell className="text-xs">
                    {log.ip_address ? String(log.ip_address) : "—"}
                  </TableCell>
                  <TableCell className="text-xs max-w-md truncate">
                    {log.event_data ? JSON.stringify(log.event_data) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
