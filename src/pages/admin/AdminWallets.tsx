import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Search, Coins, Plus, Minus, History } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

type WalletRow = {
  user_id: string;
  email: string;
  full_name: string | null;
  tokens: number;
  updated_at: string | null;
  clinic_id?: string | null;
  clinic_name?: string | null;
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

type ClinicAggregate = {
  clinic_id: string | null;
  clinic_name: string;
  total_tokens: number;
  user_count: number;
  avg_tokens: number;
};

type SortKey = "balance_desc" | "balance_asc" | "recent" | "name_asc";

const BALANCE_STYLE = (tokens: number) => {
  if (tokens > 5) return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
  if (tokens >= 1) return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
  return "bg-red-500/10 text-red-500";
};

const OP_STYLE: Record<string, string> = {
  add:    "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  remove: "bg-red-500/10 text-red-500",
  set:    "bg-blue-500/10 text-blue-500",
};

export default function AdminWallets() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("balance_desc");
  const [view, setView] = useState<"user" | "clinic">("user");

  const [showAdjustDialog, setShowAdjustDialog] = useState(false);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState<WalletRow | null>(null);
  const [adjustForm, setAdjustForm] = useState({
    amount: "",
    operation: "add" as "add" | "remove" | "set",
  });

  const { data: wallets, isLoading } = useQuery({
    queryKey: ["admin-wallets"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_get_all_wallets");
      if (error) throw error;
      return data as WalletRow[];
    },
  });

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

  const stats = useMemo(() => {
    if (!wallets) return { totalTokens: 0, usersWithTokens: 0, avgTokens: 0 };
    const totalTokens = wallets.reduce((s, w) => s + (w.tokens || 0), 0);
    const usersWithTokens = wallets.filter((w) => w.tokens > 0).length;
    return {
      totalTokens,
      usersWithTokens,
      avgTokens: wallets.length > 0 ? Math.round(totalTokens / wallets.length) : 0,
    };
  }, [wallets]);

  const filtered = useMemo(() => {
    if (!wallets) return [];
    const q = search.toLowerCase();
    let rows = search
      ? wallets.filter(
          (w) =>
            w.email?.toLowerCase().includes(q) ||
            w.full_name?.toLowerCase().includes(q) ||
            w.clinic_name?.toLowerCase().includes(q),
        )
      : [...wallets];

    rows.sort((a, b) => {
      if (sort === "balance_desc") return (b.tokens || 0) - (a.tokens || 0);
      if (sort === "balance_asc") return (a.tokens || 0) - (b.tokens || 0);
      if (sort === "recent") {
        const ta = a.updated_at ? new Date(a.updated_at).getTime() : 0;
        const tb = b.updated_at ? new Date(b.updated_at).getTime() : 0;
        return tb - ta;
      }
      if (sort === "name_asc") return (a.full_name || a.email).localeCompare(b.full_name || b.email);
      return 0;
    });
    return rows;
  }, [wallets, search, sort]);

  const clinicAggregates = useMemo((): ClinicAggregate[] => {
    if (!wallets) return [];
    const map = new Map<string, ClinicAggregate>();
    for (const w of wallets) {
      const key = w.clinic_id || "__none__";
      const name = w.clinic_name || "No clinic";
      if (!map.has(key)) {
        map.set(key, { clinic_id: w.clinic_id || null, clinic_name: name, total_tokens: 0, user_count: 0, avg_tokens: 0 });
      }
      const agg = map.get(key)!;
      agg.total_tokens += w.tokens || 0;
      agg.user_count += 1;
    }
    for (const agg of map.values()) {
      agg.avg_tokens = agg.user_count > 0 ? Math.round(agg.total_tokens / agg.user_count) : 0;
    }
    return Array.from(map.values()).sort((a, b) => b.total_tokens - a.total_tokens);
  }, [wallets]);

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
      toast.error("Enter a valid amount");
      return;
    }
    adjustMutation.mutate({ userId: selectedWallet.user_id, amount, operation: adjustForm.operation });
  };

  return (
    <div className="space-y-4 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Wallets</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className="inline-flex items-center gap-1.5 text-xs border border-border/60 rounded-md px-2 py-0.5 bg-muted/30 tabular-nums">
              <Coins className="h-3 w-3 text-muted-foreground" />
              <span className="text-muted-foreground">Total tokens:</span>
              <span className="font-medium">{stats.totalTokens.toLocaleString()}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs border border-border/60 rounded-md px-2 py-0.5 bg-muted/30 tabular-nums">
              <span className="text-muted-foreground">Users with tokens:</span>
              <span className="font-medium">{stats.usersWithTokens}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs border border-border/60 rounded-md px-2 py-0.5 bg-muted/30 tabular-nums">
              <span className="text-muted-foreground">Avg:</span>
              <span className="font-medium">{stats.avgTokens}</span>
            </span>
          </div>
        </div>
      </div>

      {/* View toggle + filters */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Tab toggle */}
        <div className="flex items-center border border-border/60 rounded-md overflow-hidden h-8">
          <button
            onClick={() => setView("user")}
            className={cn(
              "px-3 h-full text-xs font-medium transition-colors",
              view === "user" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent/40",
            )}
          >
            By User
          </button>
          <button
            onClick={() => setView("clinic")}
            className={cn(
              "px-3 h-full text-xs font-medium transition-colors border-l border-border/60",
              view === "clinic" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent/40",
            )}
          >
            By Clinic
          </button>
        </div>

        {view === "user" && (
          <>
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Email, name, clinic…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
            <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              <SelectTrigger className="w-44 h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="balance_desc">Highest balance</SelectItem>
                <SelectItem value="balance_asc">Lowest balance</SelectItem>
                <SelectItem value="recent">Most recent</SelectItem>
                <SelectItem value="name_asc">Name A–Z</SelectItem>
              </SelectContent>
            </Select>
          </>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : view === "user" ? (
        <div className="rounded-lg border border-border/60 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40 bg-muted/30">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">User</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Clinic</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Balance</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Last updated</th>
                <th className="px-4 py-2.5 w-24" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {filtered.length > 0 ? (
                filtered.map((w) => (
                  <tr key={w.user_id} className="hover:bg-accent/20 transition-colors group">
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium">{w.full_name || "—"}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{w.email}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {w.clinic_name || <span className="italic">none</span>}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant="secondary"
                        className={cn("text-[10px] h-4 px-1.5 tabular-nums font-mono", BALANCE_STYLE(w.tokens))}
                      >
                        {w.tokens}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {w.updated_at
                        ? formatDistanceToNow(new Date(w.updated_at), { addSuffix: true })
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Adjust tokens"
                          onClick={() => handleOpenAdjust(w)}
                        >
                          <Coins className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Transaction history"
                          onClick={() => handleOpenHistory(w)}
                        >
                          <History className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-xs text-muted-foreground">
                    No wallets match the current filters
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* By Clinic view */
        <div className="rounded-lg border border-border/60 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40 bg-muted/30">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Clinic</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Total tokens</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Users</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Avg tokens/user</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {clinicAggregates.length > 0 ? (
                clinicAggregates.map((agg) => (
                  <tr key={agg.clinic_id ?? "__none__"} className="hover:bg-accent/20 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium">{agg.clinic_name}</td>
                    <td className="px-4 py-3">
                      <Badge
                        variant="secondary"
                        className={cn("text-[10px] h-4 px-1.5 tabular-nums font-mono", BALANCE_STYLE(agg.total_tokens))}
                      >
                        {agg.total_tokens.toLocaleString()}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-xs text-muted-foreground">{agg.user_count}</td>
                    <td className="px-4 py-3 tabular-nums text-xs text-muted-foreground">{agg.avg_tokens}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-xs text-muted-foreground">
                    No wallet data
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Adjust Dialog */}
      <Dialog open={showAdjustDialog} onOpenChange={setShowAdjustDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Adjust tokens</DialogTitle>
            <DialogDescription className="font-mono text-xs">
              {selectedWallet?.email} · current balance:{" "}
              <span className="font-semibold">{selectedWallet?.tokens}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Operation</Label>
              <Select
                value={adjustForm.operation}
                onValueChange={(v) => setAdjustForm((f) => ({ ...f, operation: v as any }))}
              >
                <SelectTrigger className="mt-1 h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="add">
                    <div className="flex items-center gap-2">
                      <Plus className="h-3.5 w-3.5 text-emerald-500" />
                      Add tokens
                    </div>
                  </SelectItem>
                  <SelectItem value="remove">
                    <div className="flex items-center gap-2">
                      <Minus className="h-3.5 w-3.5 text-red-500" />
                      Remove tokens
                    </div>
                  </SelectItem>
                  <SelectItem value="set">
                    <div className="flex items-center gap-2">
                      <Coins className="h-3.5 w-3.5 text-blue-500" />
                      Set balance to
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Amount</Label>
              <Input
                type="number"
                min="0"
                value={adjustForm.amount}
                onChange={(e) => setAdjustForm((f) => ({ ...f, amount: e.target.value }))}
                className="mt-1 h-8 text-sm font-mono"
                placeholder="0"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowAdjustDialog(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleAdjust} disabled={adjustMutation.isPending}>
              {adjustMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Apply
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Transaction history</DialogTitle>
            <DialogDescription className="font-mono text-xs">{selectedWallet?.email}</DialogDescription>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto">
            {transactionsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : transactions && transactions.length > 0 ? (
              <div className="rounded-lg border border-border/60 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/40 bg-muted/30">
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Date</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Op</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Amount</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Before → After</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {transactions.map((tx) => (
                      <tr key={tx.id} className="hover:bg-accent/20 transition-colors">
                        <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(tx.created_at), "MMM d, HH:mm")}
                        </td>
                        <td className="px-3 py-2">
                          <Badge
                            variant="secondary"
                            className={cn("text-[10px] h-4 px-1.5", OP_STYLE[tx.operation] || "")}
                          >
                            {tx.operation}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs tabular-nums">
                          <span
                            className={cn(
                              tx.operation === "add" ? "text-emerald-600 dark:text-emerald-400" :
                              tx.operation === "remove" ? "text-red-500" : "text-blue-500",
                            )}
                          >
                            {tx.operation === "add" ? "+" : tx.operation === "remove" ? "−" : "="}
                            {tx.amount}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground tabular-nums">
                          {tx.balance_before} → {tx.balance_after}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {tx.reason || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-center text-xs text-muted-foreground py-8">No transactions found</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
