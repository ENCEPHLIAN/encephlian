import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Loader2, Search, Coins, Plus, Minus, History, Wallet } from "lucide-react";
import { format } from "date-fns";

type WalletRow = {
  user_id: string;
  tokens: number;
  updated_at: string | null;
  profiles: {
    email: string;
    full_name: string | null;
  } | null;
};

type TransactionRow = {
  id: string;
  user_id: string;
  amount: number;
  operation: string;
  balance_before: number;
  balance_after: number;
  reason: string | null;
  performed_by: string | null;
  created_at: string;
};

export default function AdminWallets() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [showAdjustDialog, setShowAdjustDialog] = useState(false);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState<WalletRow | null>(null);
  const [adjustForm, setAdjustForm] = useState({
    amount: "",
    operation: "add" as "add" | "remove" | "set",
  });

  // Fetch all wallets
  const { data: wallets, isLoading } = useQuery({
    queryKey: ["admin-wallets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wallets")
        .select(`
          user_id,
          tokens,
          updated_at,
          profiles!wallets_user_id_fkey(email, full_name)
        `)
        .order("updated_at", { ascending: false });

      if (error) throw error;
      return data as WalletRow[];
    },
  });

  // Fetch transactions for selected user
  const { data: transactions, isLoading: transactionsLoading } = useQuery({
    queryKey: ["admin-wallet-transactions", selectedWallet?.user_id],
    queryFn: async () => {
      if (!selectedWallet?.user_id) return [];
      const { data, error } = await supabase
        .from("wallet_transactions")
        .select("*")
        .eq("user_id", selectedWallet.user_id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      return data as TransactionRow[];
    },
    enabled: !!selectedWallet?.user_id && showHistoryDialog,
  });

  // Adjust tokens mutation
  const adjustMutation = useMutation({
    mutationFn: async ({ userId, amount, operation }: { userId: string; amount: number; operation: string }) => {
      const { data, error } = await supabase.rpc("admin_adjust_tokens", {
        p_user_id: userId,
        p_amount: amount,
        p_operation: operation,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["admin-wallets"] });
      toast.success(`Tokens updated: ${data?.old_balance} → ${data?.new_balance}`);
      setShowAdjustDialog(false);
      setAdjustForm({ amount: "", operation: "add" });
    },
    onError: (error: any) => toast.error(error.message),
  });

  // Calculate stats
  const stats = useMemo(() => {
    if (!wallets) return { totalTokens: 0, avgTokens: 0, usersWithTokens: 0 };
    const totalTokens = wallets.reduce((sum, w) => sum + (w.tokens || 0), 0);
    const usersWithTokens = wallets.filter(w => w.tokens > 0).length;
    return {
      totalTokens,
      avgTokens: wallets.length > 0 ? Math.round(totalTokens / wallets.length) : 0,
      usersWithTokens,
    };
  }, [wallets]);

  // Filter wallets
  const filteredWallets = useMemo(() => {
    if (!wallets) return [];
    if (!searchQuery) return wallets;
    const query = searchQuery.toLowerCase();
    return wallets.filter(
      (w) =>
        w.profiles?.email?.toLowerCase().includes(query) ||
        w.profiles?.full_name?.toLowerCase().includes(query)
    );
  }, [wallets, searchQuery]);

  const handleOpenAdjust = (wallet: WalletRow) => {
    setSelectedWallet(wallet);
    setAdjustForm({ amount: "", operation: "add" });
    setShowAdjustDialog(true);
  };

  const handleOpenHistory = (wallet: WalletRow) => {
    setSelectedWallet(wallet);
    setShowHistoryDialog(true);
  };

  const handleAdjust = () => {
    if (!selectedWallet) return;
    const amount = parseInt(adjustForm.amount);
    if (isNaN(amount) || amount < 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    adjustMutation.mutate({
      userId: selectedWallet.user_id,
      amount,
      operation: adjustForm.operation,
    });
  };

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
        <h1 className="text-2xl font-mono font-bold tracking-tight">Wallet Management</h1>
        <p className="text-sm text-muted-foreground font-mono">
          View and manage user token balances
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-muted/30">
          <CardContent className="p-4 flex items-center gap-3">
            <Coins className="h-8 w-8 text-primary" />
            <div>
              <p className="text-2xl font-mono font-bold">{stats.totalTokens}</p>
              <p className="text-xs text-muted-foreground">Total Tokens</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-muted/30">
          <CardContent className="p-4 flex items-center gap-3">
            <Wallet className="h-8 w-8 text-primary" />
            <div>
              <p className="text-2xl font-mono font-bold">{stats.usersWithTokens}</p>
              <p className="text-xs text-muted-foreground">Users with Tokens</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-muted/30">
          <CardContent className="p-4 flex items-center gap-3">
            <Coins className="h-8 w-8 text-primary" />
            <div>
              <p className="text-2xl font-mono font-bold">{stats.avgTokens}</p>
              <p className="text-xs text-muted-foreground">Avg Tokens/User</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by email or name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 font-mono"
        />
      </div>

      {/* Wallets Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-mono">User</TableHead>
                <TableHead className="font-mono">Token Balance</TableHead>
                <TableHead className="font-mono">Last Updated</TableHead>
                <TableHead className="font-mono w-32">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredWallets.map((wallet) => (
                <TableRow key={wallet.user_id}>
                  <TableCell>
                    <div>
                      <p className="font-mono text-sm">{wallet.profiles?.full_name || "—"}</p>
                      <p className="text-xs text-muted-foreground">{wallet.profiles?.email}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={wallet.tokens > 0 ? "default" : "outline"} className="font-mono">
                      {wallet.tokens} tokens
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {wallet.updated_at ? format(new Date(wallet.updated_at), "MMM d, yyyy HH:mm") : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenAdjust(wallet)}
                      >
                        <Coins className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenHistory(wallet)}
                      >
                        <History className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filteredWallets.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    No wallets found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Adjust Dialog */}
      <Dialog open={showAdjustDialog} onOpenChange={setShowAdjustDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-mono">Adjust Token Balance</DialogTitle>
            <DialogDescription>
              {selectedWallet?.profiles?.email} - Current: {selectedWallet?.tokens} tokens
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Operation</Label>
              <Select
                value={adjustForm.operation}
                onValueChange={(v) => setAdjustForm((f) => ({ ...f, operation: v as any }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="add">
                    <div className="flex items-center gap-2">
                      <Plus className="h-4 w-4 text-green-500" />
                      Add Tokens
                    </div>
                  </SelectItem>
                  <SelectItem value="remove">
                    <div className="flex items-center gap-2">
                      <Minus className="h-4 w-4 text-red-500" />
                      Remove Tokens
                    </div>
                  </SelectItem>
                  <SelectItem value="set">
                    <div className="flex items-center gap-2">
                      <Coins className="h-4 w-4" />
                      Set Balance To
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input
                type="number"
                min="0"
                value={adjustForm.amount}
                onChange={(e) => setAdjustForm((f) => ({ ...f, amount: e.target.value }))}
                className="font-mono"
                placeholder="Enter amount..."
              />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setShowAdjustDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleAdjust} disabled={adjustMutation.isPending}>
                {adjustMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Apply
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-mono">Transaction History</DialogTitle>
            <DialogDescription>{selectedWallet?.profiles?.email}</DialogDescription>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto">
            {transactionsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : transactions && transactions.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-mono">Date</TableHead>
                    <TableHead className="font-mono">Operation</TableHead>
                    <TableHead className="font-mono">Amount</TableHead>
                    <TableHead className="font-mono">Balance</TableHead>
                    <TableHead className="font-mono">Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(tx.created_at), "MMM d, HH:mm")}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={tx.operation === "add" ? "default" : tx.operation === "remove" ? "destructive" : "outline"}
                          className="text-xs"
                        >
                          {tx.operation}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {tx.operation === "add" ? "+" : tx.operation === "remove" ? "-" : ""}
                        {tx.amount}
                      </TableCell>
                      <TableCell className="font-mono text-sm text-muted-foreground">
                        {tx.balance_before} → {tx.balance_after}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {tx.reason || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-center text-muted-foreground py-8">No transactions found</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
