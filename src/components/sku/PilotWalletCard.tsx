import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Zap, CheckCircle, Coins, ArrowRight, Clock } from "lucide-react";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { formatEdgeFunctionError } from "@/lib/edgeFunctionError";
import dayjs from "dayjs";

const TOP_UP_PACKS = [
  { tokens: 5, price: 750, label: "5 Tokens", per: "₹150/token" },
  { tokens: 10, price: 1500, label: "10 Tokens", per: "₹150/token", popular: true },
  { tokens: 25, price: 3499, label: "25 Tokens", per: "₹140/token" },
];

export function PilotWalletCard() {
  const { toast } = useToast();
  const [purchasing, setPurchasing] = useState<number | null>(null);
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

  const handlePurchase = async (tokens: number) => {
    setPurchasing(tokens);
    try {
      const { data, error } = await supabase.functions.invoke("create_order", {
        body: { tokens },
      });

      if (error) {
        throw new Error(await formatEdgeFunctionError(error, data));
      }
      if (!data || typeof data !== "object") {
        throw new Error("No response from payment server");
      }
      if ("error" in data && typeof (data as { error?: string }).error === "string") {
        throw new Error((data as { error: string }).error);
      }
      if (!(data as { keyId?: string }).keyId || !(data as { orderId?: string }).orderId) {
        throw new Error("Payment configuration not available. Please contact support.");
      }

      // Load Razorpay
      if (!(window as any).Razorpay) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://checkout.razorpay.com/v1/checkout.js";
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Failed to load payment gateway"));
          document.body.appendChild(script);
        });
      }

      const options = {
        key: data.keyId,
        amount: data.amountPaise,
        currency: data.currency,
        name: "ENCEPHLIAN",
        description: `${tokens} Triage Tokens`,
        order_id: data.orderId,
        handler: async (response: any) => {
          try {
            const { data: verifyData, error: verifyError } = await supabase.functions.invoke("verify_payment", {
              body: {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              },
            });

            if (verifyError) {
              const msg = await formatEdgeFunctionError(verifyError, verifyData);
              toast({ variant: "destructive", title: "Payment verification failed", description: msg });
            } else if (verifyData && typeof verifyData === "object" && "error" in verifyData) {
              toast({
                variant: "destructive",
                title: "Payment verification failed",
                description: String((verifyData as { error?: string }).error || "Unknown error"),
              });
            } else {
              // Refresh wallet data
              await queryClient.invalidateQueries({ queryKey: ["wallet-balance"] });
              await queryClient.invalidateQueries({ queryKey: ["wallet-transactions-recent"] });
              await queryClient.invalidateQueries({ queryKey: ["pilot-studies"] });
              toast({ title: "Tokens added!", description: `${tokens} tokens have been added to your wallet.` });
            }
          } catch (err: any) {
            toast({ variant: "destructive", title: "Error", description: err.message });
          }
        },
        theme: { color: "#000000" },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    } finally {
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
      {/* Token Balance */}
      <Card className="border-none shadow-lg bg-gradient-to-br from-primary/10 to-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Coins className="h-4 w-4 text-primary" />
            Token Balance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold">
              <AnimatedCounter value={tokenBalance} duration={1000} />
            </span>
            <span className="text-muted-foreground">tokens</span>
          </div>
          <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              1 token = Standard triage
            </span>
            <span className="flex items-center gap-1">
              <Zap className="h-3 w-3" />
              2 tokens = Priority triage
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Token Packs */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Add Tokens</h3>
        <div className="space-y-3">
          {TOP_UP_PACKS.map((pack) => (
            <Card
              key={pack.tokens}
              className={`cursor-pointer transition-all hover:shadow-md ${
                pack.popular ? "border-primary/30 bg-primary/5" : ""
              }`}
              onClick={() => !purchasing && handlePurchase(pack.tokens)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                      pack.popular ? "bg-primary/20" : "bg-muted"
                    }`}>
                      <Coins className={`h-5 w-5 ${pack.popular ? "text-primary" : "text-muted-foreground"}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{pack.label}</span>
                        {pack.popular && (
                          <Badge variant="default" className="text-[10px] px-1.5 py-0">Popular</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{pack.per}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold">₹{pack.price.toLocaleString()}</span>
                    {purchasing === pack.tokens ? (
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

      {/* Plan info */}
      <Card className="border border-border/60 bg-muted/30">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
            Pilot Plan — pay-as-you-go
          </div>
          <ul className="space-y-1 text-xs text-muted-foreground pl-6">
            <li>1 token = standard triage report</li>
            <li>2 tokens = priority (STAT) triage report</li>
            <li>Tokens never expire</li>
          </ul>
        </CardContent>
      </Card>

      {/* Recent Transactions */}
      {recentTransactions && recentTransactions.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3">Recent Activity</h3>
          <div className="space-y-1">
            {recentTransactions.map((tx: any) => (
              <div key={tx.id} className="flex items-center justify-between py-2 px-1 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="text-xs truncate">
                    {tx.operation === "deduct" ? "Triage deduction" :
                     tx.operation === "refund" ? "Refund" :
                     tx.operation === "add" ? "Tokens added" :
                     tx.operation === "set" ? "Balance adjusted" :
                     tx.reason || tx.operation}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {dayjs(tx.created_at).format("MMM D, h:mm A")}
                  </p>
                </div>
                <span className={`text-sm font-medium tabular-nums ${
                  tx.operation === "deduct" ? "text-destructive" : "text-emerald-600"
                }`}>
                  {tx.operation === "deduct" ? "-" : "+"}{tx.amount}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
