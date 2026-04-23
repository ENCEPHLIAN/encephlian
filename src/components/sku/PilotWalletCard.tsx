import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Zap, CheckCircle, Coins, ArrowRight, Clock, Receipt } from "lucide-react";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { formatEdgeFunctionError } from "@/lib/edgeFunctionError";
import dayjs from "dayjs";
import {
  PILOT_ACCESS_SUBSCRIPTION,
  TOKEN_TOPUP_PACKAGES,
} from "@/shared/tokenEconomy";
import { openRazorpayTokenCheckout } from "@/lib/razorpayCheckout";

export function PilotWalletCard() {
  const { toast } = useToast();
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: walletData, isLoading } = useQuery({
    queryKey: ["wallet-balance"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wallets")
        .select("tokens, updated_at")
        .maybeSingle();
      if (error) return null;
      return data;
    },
    staleTime: 20_000,
  });

  const { data: recentTransactions } = useQuery({
    queryKey: ["wallet-transactions-recent"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wallet_transactions")
        .select("id, amount, operation, reason, created_at, balance_after")
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) return [];
      return data || [];
    },
    staleTime: 30_000,
  });

  const tokenBalance = walletData?.tokens || 0;

  const verifyAndFinish = async (
    response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string },
    packageTokens: number,
    amountInr: number,
  ): Promise<number> => {
    const { data: verifyData, error: verifyError } = await supabase.functions.invoke("verify_payment", {
      body: {
        razorpay_order_id: response.razorpay_order_id,
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_signature: response.razorpay_signature,
      },
    });
    if (verifyError) {
      throw new Error(await formatEdgeFunctionError(verifyError, verifyData));
    }
    if (verifyData && typeof verifyData === "object" && "error" in verifyData) {
      throw new Error(String((verifyData as { error?: string }).error || "Verification failed"));
    }
    const credited =
      verifyData && typeof verifyData === "object" && "tokens_credited" in verifyData
        ? Number((verifyData as { tokens_credited: number }).tokens_credited)
        : packageTokens;
    try {
      await supabase.functions.invoke("send_payment_receipt", {
        body: {
          payment_id: response.razorpay_payment_id,
          order_id: response.razorpay_order_id,
          amount_inr: amountInr,
          tokens: packageTokens,
        },
      });
    } catch (emailError) {
      console.error("Receipt email:", emailError);
    }
    await queryClient.invalidateQueries({ queryKey: ["wallet-balance"] });
    await queryClient.invalidateQueries({ queryKey: ["wallet-transactions-recent"] });
    await queryClient.invalidateQueries({ queryKey: ["pilot-studies"] });
    return credited;
  };

  const buyTopUp = async (tokens: number, priceInr: number) => {
    setPurchasing(`topup-${tokens}`);
    try {
      await openRazorpayTokenCheckout(
        { tokens },
        {
          description: `${tokens} triage tokens`,
          onPaid: async (response) => {
            try {
              const credited = await verifyAndFinish(response, tokens, priceInr);
              toast({
                title: "Payment successful",
                description: `${credited} tokens added to your wallet.`,
              });
            } catch (e: unknown) {
              toast({
                variant: "destructive",
                title: "Verification failed",
                description: e instanceof Error ? e.message : "Unknown error",
              });
            }
          },
          onDismiss: () => setPurchasing(null),
        },
      );
      setPurchasing(null);
    } catch (err: unknown) {
      toast({
        variant: "destructive",
        title: "Checkout error",
        description: err instanceof Error ? err.message : "Unknown error",
      });
      setPurchasing(null);
    }
  };

  const buyPilotAccess = async () => {
    setPurchasing("pilot_access");
    try {
      await openRazorpayTokenCheckout(
        { product: PILOT_ACCESS_SUBSCRIPTION.productId },
        {
          description: `Pilot access + ${PILOT_ACCESS_SUBSCRIPTION.bonusTokens} bonus tokens`,
          onPaid: async (response) => {
            try {
              await verifyAndFinish(
                response,
                PILOT_ACCESS_SUBSCRIPTION.bonusTokens,
                PILOT_ACCESS_SUBSCRIPTION.amountInr,
              );
              toast({
                title: "Subscription payment received",
                description: `${PILOT_ACCESS_SUBSCRIPTION.bonusTokens} bonus tokens credited. Razorpay receipt is available in your Razorpay account; email receipt sends when Resend is configured.`,
              });
            } catch (e: unknown) {
              toast({
                variant: "destructive",
                title: "Verification failed",
                description: e instanceof Error ? e.message : "Unknown error",
              });
            }
          },
          onDismiss: () => setPurchasing(null),
        },
      );
      setPurchasing(null);
    } catch (err: unknown) {
      toast({
        variant: "destructive",
        title: "Checkout error",
        description: err instanceof Error ? err.message : "Unknown error",
      });
      setPurchasing(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-none shadow-lg bg-gradient-to-br from-primary/10 to-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Coins className="h-4 w-4 text-primary" />
            Token balance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold">
              <AnimatedCounter value={tokenBalance} duration={1000} />
            </span>
            <span className="text-muted-foreground">tokens</span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Standard triage = 1 token
            </span>
            <span className="flex items-center gap-1">
              <Zap className="h-3 w-3" />
              Priority (STAT) = 2 tokens
            </span>
          </div>
        </CardContent>
      </Card>

      <Card className="border-primary/25 bg-primary/[0.04]">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Receipt className="h-4 w-4 text-primary" />
            {PILOT_ACCESS_SUBSCRIPTION.title}
          </CardTitle>
          <p className="text-xs text-muted-foreground">{PILOT_ACCESS_SUBSCRIPTION.subtitle}</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="text-xs text-muted-foreground space-y-1.5 list-disc pl-4">
            {PILOT_ACCESS_SUBSCRIPTION.bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
          <div className="flex items-center justify-between pt-1">
            <div>
              <p className="text-2xl font-bold">₹{PILOT_ACCESS_SUBSCRIPTION.amountInr.toLocaleString("en-IN")}</p>
              <p className="text-[11px] text-muted-foreground">
                + {PILOT_ACCESS_SUBSCRIPTION.bonusTokens} tokens · Razorpay invoice
              </p>
            </div>
            <Button
              size="sm"
              className="rounded-full gap-1.5"
              disabled={purchasing !== null}
              onClick={() => void buyPilotAccess()}
            >
              {purchasing === "pilot_access" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Pay with Razorpay
            </Button>
          </div>
        </CardContent>
      </Card>

      <div>
        <h3 className="text-sm font-semibold mb-3">Token top-ups</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Same INR grid as internal (10 / 25 / 50 / 100). Charged when you start triage from Studies, not when you
          sign.
        </p>
        <div className="space-y-3">
          {TOKEN_TOPUP_PACKAGES.map((pack) => (
            <Card
              key={pack.tokens}
              className={`cursor-pointer transition-all hover:shadow-md ${
                pack.popular ? "border-primary/30 bg-primary/5" : ""
              }`}
              onClick={() => !purchasing && void buyTopUp(pack.tokens, pack.priceInr)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`h-10 w-10 rounded-full flex items-center justify-center ${
                        pack.popular ? "bg-primary/20" : "bg-muted"
                      }`}
                    >
                      <Coins className={`h-5 w-5 ${pack.popular ? "text-primary" : "text-muted-foreground"}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{pack.tokens} tokens</span>
                        {pack.popular && (
                          <Badge variant="default" className="text-[10px] px-1.5 py-0">
                            Popular
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        ₹{(pack.priceInr / pack.tokens).toFixed(0)}/token
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold">₹{pack.priceInr.toLocaleString("en-IN")}</span>
                    {purchasing === `topup-${pack.tokens}` ? (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    ) : (
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Card className="border border-border/60 bg-muted/30">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
            Pilot billing model
          </div>
          <ul className="space-y-1 text-xs text-muted-foreground pl-6">
            <li>Subscription checkout covers access + bonus tokens</li>
            <li>Top-ups add tokens any time (same prices as internal)</li>
            <li>Tokens never expire</li>
          </ul>
        </CardContent>
      </Card>

      {recentTransactions && recentTransactions.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3">Recent activity</h3>
          <div className="space-y-1">
            {recentTransactions.map((tx: { id: string; operation: string; reason?: string; created_at: string; amount: number }) => (
              <div key={tx.id} className="flex items-center justify-between py-2 px-1 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="text-xs truncate">
                    {tx.operation === "deduct"
                      ? "Triage deduction"
                      : tx.operation === "refund"
                        ? "Refund"
                        : tx.operation === "add" || tx.operation === "purchase"
                          ? "Tokens added"
                          : tx.operation === "set"
                            ? "Balance adjusted"
                            : tx.reason || tx.operation}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {dayjs(tx.created_at).format("MMM D, h:mm A")}
                  </p>
                </div>
                <span
                  className={`text-sm font-medium tabular-nums ${
                    tx.operation === "deduct" ? "text-destructive" : "text-emerald-600"
                  }`}
                >
                  {tx.operation === "deduct" ? "-" : "+"}
                  {tx.amount}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
