import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Zap, CreditCard, CheckCircle } from "lucide-react";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

const PILOT_PLAN = {
  name: "Pilot Plan",
  tokens: 10,
  price: 3000, // INR
  period: "month",
};

/**
 * Simplified wallet for Pilot SKU
 * Shows token balance + single subscription option
 */
export function PilotWalletCard() {
  const { toast } = useToast();
  const [purchasing, setPurchasing] = useState(false);
  
  const { data: walletData, isLoading } = useQuery({
    queryKey: ["wallet-balance"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wallets")
        .select("*")
        .single();
      if (error) return null;
      return data;
    }
  });

  const tokenBalance = walletData?.tokens || 0;

  const handleSubscribe = async () => {
    setPurchasing(true);
    try {
      const { data, error } = await supabase.functions.invoke("create_order", {
        body: { tokens: PILOT_PLAN.tokens },
      });

      if (error) throw error;

      // Load Razorpay script if needed
      if (!(window as any).Razorpay) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://checkout.razorpay.com/v1/checkout.js";
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Failed to load Razorpay"));
          document.body.appendChild(script);
        });
      }

      const options = {
        key: data.razorpay_key,
        amount: data.amount,
        currency: data.currency,
        name: "ENCEPHLIAN",
        description: `Pilot Plan - ${PILOT_PLAN.tokens} Tokens`,
        order_id: data.order_id,
        handler: async (response: any) => {
          const { error: verifyError } = await supabase.functions.invoke("verify_payment", {
            body: {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            },
          });

          if (verifyError) {
            toast({ variant: "destructive", title: "Payment failed", description: verifyError.message });
          } else {
            toast({ title: "Plan activated!", description: `${PILOT_PLAN.tokens} tokens added to your wallet.` });
          }
        },
        theme: { color: "#000000" },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    } finally {
      setPurchasing(false);
    }
  };

  if (isLoading) {
    return (
      <Card className="border-none shadow-lg">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Token Balance */}
      <Card className="border-none shadow-lg bg-gradient-to-br from-amber-500/10 to-amber-500/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-500" />
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
          <p className="text-xs text-muted-foreground mt-2">
            1 token = 1 standard triage report
          </p>
        </CardContent>
      </Card>

      {/* Pilot Plan */}
      <Card className="border-2 border-amber-500/30 shadow-lg">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">{PILOT_PLAN.name}</CardTitle>
            <Badge variant="outline" className="border-amber-500 text-amber-500">
              Recommended
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold">₹{PILOT_PLAN.price.toLocaleString()}</span>
            <span className="text-muted-foreground">/{PILOT_PLAN.period}</span>
          </div>
          
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-emerald-500" />
              {PILOT_PLAN.tokens} triage tokens included
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-emerald-500" />
              Accelerated AI triage reports
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-emerald-500" />
              HIPAA-compliant data handling
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-emerald-500" />
              Email support
            </li>
          </ul>

          <Button 
            className="w-full" 
            size="lg"
            onClick={handleSubscribe}
            disabled={purchasing}
          >
            {purchasing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <CreditCard className="mr-2 h-4 w-4" />
                Subscribe Now
              </>
            )}
          </Button>
          
          <p className="text-xs text-center text-muted-foreground">
            Need more tokens? Additional packs available after subscription.
          </p>
        </CardContent>
      </Card>

      {/* Top-up option */}
      {tokenBalance > 0 && (
        <Card className="border-dashed">
          <CardContent className="py-4">
            <p className="text-sm text-center text-muted-foreground">
              Running low? <button className="text-primary underline-offset-4 hover:underline" onClick={handleSubscribe}>Top up with more tokens</button>
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
