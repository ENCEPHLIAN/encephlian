import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";

const TOKEN_PACKAGES = [
  // Base pack – no discount
  { tokens: 10, price: 1500, popular: false },

  // Volume packs – discounted, all ending with 999
  { tokens: 25, price: 3499, popular: true }, // ~₹140/token
  { tokens: 50, price: 6499, popular: false }, // ~₹130/token
  { tokens: 100, price: 11999, popular: false }, // ~₹120/token
];

export function TokenPurchase() {
  const [loadingPackage, setLoadingPackage] = useState<number | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handlePurchase = async (packageTokens: number, packagePrice: number) => {
    // Optional guard so user can’t multi-click different packs in the same session
    if (loadingPackage !== null && loadingPackage !== packageTokens) return;

    try {
      setLoadingPackage(packageTokens);

      // Create order via edge function
      const { data: orderData, error: orderError } = await supabase.functions.invoke("create_order", {
        body: { tokens: packageTokens },
      });

      if (orderError) throw orderError;

      // Load Razorpay script if not already loaded
      if (!(window as any).Razorpay) {
        const script = document.createElement("script");
        script.src = "https://checkout.razorpay.com/v1/checkout.js";
        script.async = true;
        document.body.appendChild(script);
        await new Promise((resolve) => (script.onload = resolve));
      }

      const options = {
        key: orderData.keyId,
        amount: orderData.amount * 100,
        currency: orderData.currency,
        name: "ENCEPHLIAN",
        description: `${packageTokens} tokens`,
        order_id: orderData.orderId,
        handler: async function (response: any) {
          try {
            const { data: verifyData, error: verifyError } = await supabase.functions.invoke("verify_payment", {
              body: {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              },
            });

            if (verifyError) throw verifyError;

            toast({
              title: "Payment successful! 🎉",
              description: `${verifyData.tokens_credited} tokens credited`,
            });

            // Send receipt email
            try {
              await supabase.functions.invoke("send_payment_receipt", {
                body: {
                  payment_id: response.razorpay_payment_id,
                  order_id: response.razorpay_order_id,
                  amount_inr: packagePrice,
                  tokens: packageTokens,
                },
              });
            } catch (emailError) {
              console.error("Failed to send receipt email:", emailError);
            }

            // Immediately refresh wallet balance
            await queryClient.invalidateQueries({ queryKey: ["wallet-balance"] });
            await queryClient.refetchQueries({ queryKey: ["wallet-balance"] });
            queryClient.invalidateQueries({ queryKey: ["payments"] });
          } catch (error: any) {
            toast({
              title: "Payment verification failed",
              description: error.message,
              variant: "destructive",
            });
          } finally {
            setLoadingPackage(null);
          }
        },
        prefill: {
          email: (await supabase.auth.getUser()).data.user?.email || "",
        },
        theme: {
          color: "#0ea5e9",
        },
        modal: {
          ondismiss: () => setLoadingPackage(null),
        },
      };

      const razorpay = new (window as any).Razorpay(options);
      razorpay.open();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
      setLoadingPackage(null);
    }
  };

  return (
    <Card className="border-none shadow-lg">
      <CardHeader>
        <CardTitle className="text-2xl">Purchase Tokens</CardTitle>
        <CardDescription>
          Base rate ~₹150/token. Larger packages are discounted: 1 TAT report ≈ 1 token • 1 STAT report ≈ 2 tokens.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {TOKEN_PACKAGES.map((pkg) => (
            <Card
              key={pkg.tokens}
              className={cn(
                "relative transition-all hover:shadow-xl cursor-pointer border-2",
                pkg.popular ? "border-primary shadow-lg scale-105" : "border-border hover:border-primary/50",
              )}
            >
              {pkg.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-full">
                    POPULAR
                  </span>
                </div>
              )}
              <CardContent className="pt-8 pb-6 text-center space-y-4">
                <div>
                  <div className="text-4xl font-bold">{pkg.tokens}</div>
                  <div className="text-sm text-muted-foreground">tokens</div>
                </div>

                <div className="space-y-1">
                  <div className="text-2xl font-bold">₹{pkg.price.toLocaleString("en-IN")}</div>
                  <div className="text-xs text-muted-foreground">₹{(pkg.price / pkg.tokens).toFixed(0)}/token</div>
                </div>

                {pkg.tokens >= 50 && (
                  <div className="text-xs text-green-600 font-medium flex items-center justify-center gap-1">
                    <Check className="h-3 w-3" />
                    Best value
                  </div>
                )}

                <Button
                  onClick={() => handlePurchase(pkg.tokens, pkg.price)}
                  disabled={loadingPackage === pkg.tokens}
                  className={cn("w-full", pkg.popular ? "bg-primary hover:bg-primary/90" : "")}
                >
                  {loadingPackage === pkg.tokens ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buy Now"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-6 p-4 bg-muted/50 rounded-lg">
          <h4 className="font-semibold mb-2">What are tokens used for?</h4>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• 1 token ≈ 1 TAT (Turnaround Time) report signing</li>
            <li>• 2 tokens ≈ 1 STAT (Urgent) report signing</li>
            <li>• Secure payment via Razorpay</li>
            <li>• Instant credit after successful payment</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
