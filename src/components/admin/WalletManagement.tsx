import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, Plus, Minus } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

export default function WalletManagement() {
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [amount, setAmount] = useState("");
  const queryClient = useQueryClient();

  const { data: wallets, isLoading } = useQuery({
    queryKey: ["admin-wallets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wallets")
        .select(`
          *,
          profiles!wallets_user_id_fkey(email, full_name)
        `)
        .order("updated_at", { ascending: false });

      if (error) throw error;
      return data;
    }
  });

  const adjustTokensMutation = useMutation({
    mutationFn: async ({ userId, amount, operation }: { userId: string; amount: number; operation: string }) => {
      const { data, error } = await supabase.rpc("admin_adjust_tokens", {
        p_user_id: userId,
        p_amount: amount,
        p_operation: operation
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(`Tokens ${data.old_balance} → ${data.new_balance}`);
      queryClient.invalidateQueries({ queryKey: ["admin-wallets"] });
      setSelectedUser(null);
      setAmount("");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to adjust tokens");
    }
  });

  const handleAdjust = (operation: "add" | "remove") => {
    const numAmount = parseInt(amount);
    if (!selectedUser || !numAmount || numAmount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    adjustTokensMutation.mutate({
      userId: selectedUser.user_id,
      amount: numAmount,
      operation
    });
  };

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
        <CardTitle>Token Wallets</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User Email</TableHead>
                <TableHead>Full Name</TableHead>
                <TableHead>Token Balance</TableHead>
                <TableHead>Last Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {wallets?.map((wallet) => (
                <TableRow key={wallet.user_id}>
                  <TableCell className="font-mono text-xs">
                    {wallet.profiles?.email}
                  </TableCell>
                  <TableCell>{wallet.profiles?.full_name || "—"}</TableCell>
                  <TableCell className="font-bold">{wallet.tokens}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {wallet.updated_at ? new Date(wallet.updated_at).toLocaleString() : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedUser(wallet)}
                        >
                          Adjust
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Adjust Token Balance</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          <div>
                            <p className="text-sm text-muted-foreground">User</p>
                            <p className="font-medium">{wallet.profiles?.email}</p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Current Balance</p>
                            <p className="text-2xl font-bold">{wallet.tokens} tokens</p>
                          </div>
                          <div>
                            <label className="text-sm font-medium">Amount</label>
                            <Input
                              type="number"
                              min="1"
                              value={amount}
                              onChange={(e) => setAmount(e.target.value)}
                              placeholder="Enter amount"
                              className="mt-1"
                            />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            className="flex-1"
                            onClick={() => handleAdjust("add")}
                            disabled={adjustTokensMutation.isPending}
                          >
                            <Plus className="mr-2 h-4 w-4" />
                            Add Tokens
                          </Button>
                          <Button
                            variant="destructive"
                            className="flex-1"
                            onClick={() => handleAdjust("remove")}
                            disabled={adjustTokensMutation.isPending}
                          >
                            <Minus className="mr-2 h-4 w-4" />
                            Remove Tokens
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
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
