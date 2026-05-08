import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, MessageSquare } from "lucide-react";
import { format } from "date-fns";

const STATUS_COLORS: Record<string, string> = {
  open: "bg-yellow-500",
  in_progress: "bg-blue-500",
  resolved: "bg-green-500",
  closed: "bg-gray-500",
};

type TicketRow = {
  id: string;
  subject: string;
  message: string;
  status: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  user_email?: string;
};

export default function AdminTickets() {
  const queryClient = useQueryClient();
  const [selectedTicket, setSelectedTicket] = useState<TicketRow | null>(null);
  const [newStatus, setNewStatus] = useState<string>("");

  const { data: tickets, isLoading } = useQuery({
    queryKey: ["admin-support-tickets"],
    queryFn: async () => {
      // Fetch tickets with user profiles
      const { data: ticketsData, error } = await supabase
        .from("support_tickets")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Get user emails for each ticket
      const userIds = [...new Set(ticketsData?.map(t => t.user_id) || [])];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email")
        .in("id", userIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p.email]) || []);

      return (ticketsData || []).map(ticket => ({
        ...ticket,
        user_email: profileMap.get(ticket.user_id) || "Unknown",
      })) as TicketRow[];
    },
    refetchInterval: 30000,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ ticketId, status }: { ticketId: string; status: string }) => {
      const { data, error } = await supabase.rpc("admin_update_ticket_status", {
        p_ticket_id: ticketId,
        p_status: status,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-support-tickets"] });
      toast.success("Ticket status updated");
      setSelectedTicket(null);
    },
    onError: (error: any) => toast.error(error.message),
  });

  const handleStatusChange = () => {
    if (!selectedTicket || !newStatus) return;
    updateStatusMutation.mutate({ ticketId: selectedTicket.id, status: newStatus });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const openTickets = tickets?.filter(t => t.status === "open").length || 0;
  const inProgressTickets = tickets?.filter(t => t.status === "in_progress").length || 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Support Tickets</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {tickets?.length ?? 0} total · {openTickets} open · {inProgressTickets} in progress
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-border/60 p-4">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="text-2xl font-semibold tabular-nums mt-1">{tickets?.length || 0}</p>
        </div>
        <div className="rounded-lg border border-border/60 p-4">
          <p className="text-xs text-muted-foreground">Open</p>
          <p className="text-2xl font-semibold tabular-nums mt-1 text-amber-500">{openTickets}</p>
        </div>
        <div className="rounded-lg border border-border/60 p-4">
          <p className="text-xs text-muted-foreground">In Progress</p>
          <p className="text-2xl font-semibold tabular-nums mt-1 text-blue-500">{inProgressTickets}</p>
        </div>
      </div>

      {/* Tickets Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-mono">Status</TableHead>
                <TableHead className="font-mono">Subject</TableHead>
                <TableHead className="font-mono">User</TableHead>
                <TableHead className="font-mono">Created</TableHead>
                <TableHead className="font-mono w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tickets?.map((ticket) => (
                <TableRow key={ticket.id}>
                  <TableCell>
                    <Badge className={`${STATUS_COLORS[ticket.status]} text-white`}>
                      {ticket.status.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium max-w-[300px] truncate">
                    {ticket.subject}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {ticket.user_email}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(ticket.created_at), "MMM d, yyyy HH:mm")}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedTicket(ticket);
                        setNewStatus(ticket.status);
                      }}
                    >
                      <MessageSquare className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {(!tickets || tickets.length === 0) && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No support tickets
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Ticket Detail Dialog */}
      <Dialog open={!!selectedTicket} onOpenChange={(open) => !open && setSelectedTicket(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-mono">{selectedTicket?.subject}</DialogTitle>
            <DialogDescription>
              From: {selectedTicket?.user_email} • {selectedTicket && format(new Date(selectedTicket.created_at), "MMM d, yyyy HH:mm")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="p-4 bg-muted/50 rounded-lg">
              <p className="text-sm whitespace-pre-wrap">{selectedTicket?.message}</p>
            </div>
            <div className="flex items-center gap-4">
              <label className="text-sm font-medium">Status:</label>
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" sideOffset={4}>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setSelectedTicket(null)}>
                Close
              </Button>
              <Button
                onClick={handleStatusChange}
                disabled={updateStatusMutation.isPending || newStatus === selectedTicket?.status}
              >
                {updateStatusMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Update Status
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}