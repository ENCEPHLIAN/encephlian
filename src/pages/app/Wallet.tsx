import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { TokenPurchase } from "@/components/TokenPurchase";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { useSku } from "@/hooks/useSku";
import { PilotWalletCard } from "@/components/sku/PilotWalletCard";
import dayjs from "dayjs";

export default function Wallet() {
  const { isPilot } = useSku();

  const { data: walletData, isLoading: walletLoading } = useQuery({
    queryKey: ["wallet-balance"],
    queryFn: async () => {
      // `.maybeSingle` instead of `.single` so the query doesn't hard-error
      // when a brand-new user has no wallet row yet. RLS already filters
      // to the caller's own wallet so no explicit eq() is needed.
      const { data, error } = await supabase
        .from("wallets")
        .select("tokens, updated_at")
        .maybeSingle();
      if (error) return null;
      return data;
    },
    staleTime: 20_000,
  });

  // Full ledger for internal/demo SKU; pilot has its own condensed widget.
  const { data: transactions } = useQuery({
    queryKey: ["wallet-transactions", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wallet_transactions")
        .select("id, amount, operation, reason, balance_before, balance_after, created_at")
        .order("created_at", { ascending: false })
        .limit(25);
      if (error) return [];
      return data || [];
    },
    enabled: !isPilot,
    staleTime: 30_000,
  });

  const tokenBalance = walletData?.tokens || 0;
  const isLoading = walletLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Pilot SKU: Streamlined wallet with token packs + subscription
  if (isPilot) {
    return (
      <div className="space-y-6 max-w-lg mx-auto">
        <div>
          <h1 className="text-xl font-semibold">Wallet</h1>
          <p className="text-muted-foreground text-sm">
            Tokens power your AI triage reports
          </p>
        </div>
        <PilotWalletCard />
      </div>
    );
  }

  // Demo/Internal SKU: Full wallet with all token packs
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Wallet</h1>
        <p className="text-muted-foreground">Manage your tokens for signing reports</p>
      </div>

      {/* Token Balance Card */}
      <Card className="border-none shadow-lg bg-gradient-to-br from-blue-500/10 to-blue-500/5">
        <CardContent className="pt-6">
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">Token Balance</div>
            <div className="text-4xl font-bold">
              <AnimatedCounter value={tokenBalance} duration={1500} />
            </div>
            <div className="text-xs text-muted-foreground">Available for signing reports</div>
          </div>
        </CardContent>
      </Card>

      {/* Token Purchase - full options for internal/demo */}
      <TokenPurchase />

      {/* Ledger — shows the full wallet_transactions audit trail. Credits
          come from credit_wallet() (Razorpay top-ups) and admin_adjust_tokens
          (manual ops adjustments). Debits come from the SLA selection path. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Wallet Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {transactions && transactions.length > 0 ? (
            <div className="divide-y divide-border/60">
              {transactions.map((tx: any) => {
                const isCredit = ["add", "purchase", "refund", "set"].includes(
                  tx.operation,
                );
                return (
                  <div key={tx.id} className="flex items-start justify-between py-3 gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {tx.operation === "add"
                          ? "Tokens added"
                          : tx.operation === "deduct"
                          ? "Tokens used"
                          : tx.operation === "refund"
                          ? "Refund"
                          : tx.operation === "set"
                          ? "Admin set balance"
                          : tx.operation === "remove"
                          ? "Tokens removed"
                          : tx.operation}
                      </p>
                      {tx.reason && (
                        <p className="text-xs text-muted-foreground truncate">
                          {tx.reason}
                        </p>
                      )}
                      <p className="text-[11px] text-muted-foreground">
                        {dayjs(tx.created_at).format("MMM D, YYYY · h:mm A")}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p
                        className={`text-sm font-semibold tabular-nums ${
                          isCredit ? "text-emerald-600" : "text-destructive"
                        }`}
                      >
                        {isCredit ? "+" : "-"}
                        {tx.amount}
                      </p>
                      <p className="text-[11px] text-muted-foreground tabular-nums">
                        bal {tx.balance_after}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No wallet activity yet. Top up tokens above or sign a report to see
              entries here.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
