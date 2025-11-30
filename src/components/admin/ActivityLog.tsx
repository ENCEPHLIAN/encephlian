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
    refetchInterval: 5000
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
      <CardHeader className="pb-3">
        <CardTitle className="text-base uppercase tracking-wide">Activity Log</CardTitle>
      </CardHeader>
      <CardContent className="p-3">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow className="text-xs">
                <TableHead className="h-8 text-xs">Timestamp</TableHead>
                <TableHead className="h-8 text-xs">Event Type</TableHead>
                <TableHead className="h-8 text-xs">User ID</TableHead>
                <TableHead className="h-8 text-xs">IP Address</TableHead>
                <TableHead className="h-8 text-xs">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs?.map((log) => (
                <TableRow key={log.id} className="text-xs h-10">
                  <TableCell className="text-[10px] text-muted-foreground py-2">
                    {format(new Date(log.created_at), "MMM d, h:mm:ss a")}
                  </TableCell>
                  <TableCell className="py-2">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 uppercase">
                      {log.event_type}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-[10px] py-2">
                    {log.user_id?.substring(0, 8)}...
                  </TableCell>
                  <TableCell className="text-[10px] py-2">
                    {log.ip_address ? String(log.ip_address) : "—"}
                  </TableCell>
                  <TableCell className="text-[10px] max-w-md truncate py-2">
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