import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatEdgeFunctionError } from "@/lib/edgeFunctionError";
import { TOKEN_TOPUP_PACKAGES } from "@/shared/tokenEconomy";
import { loadRazorpayScript } from "@/lib/razorpayCheckout";

export function TokenPurchase() {
  const [loadingPackage, setLoadingPackage] = useState<number | null>(null);

  const queryClient = useQueryClient();

  const handlePurchase = async (packageTokens: number, packagePrice: number) => {
    // Prevent double-clicking different packs while one is in flight
    if (loadingPackage !== null && loadingPackage !== packageTokens) return;

    try {
      setLoadingPackage(packageTokens);

      // Create order via edge function – server must enforce the correct INR amount
      const { data: orderData, error: orderError } = await supabase.functions.invoke("create_order", {
        body: { tokens: packageTokens },
      });

      if (orderError) {
        throw new Error(await formatEdgeFunctionError(orderError, orderData));
      }
      if (!orderData || typeof orderData !== "object") {
        throw new Error("No response from payment server");
      }
      if ("error" in orderData && typeof (orderData as { error?: string }).error === "string") {
        throw new Error((orderData as { error: string }).error);
      }
      if (!(orderData as { orderId?: string }).orderId || !(orderData as { keyId?: string }).keyId) {
        throw new Error("Invalid order response — check Edge Function logs for create_order");
      }

      await loadRazorpayScript();

      const options: any = {
        key: (orderData as { keyId: string }).keyId,
        // amount from edge function should already be in INR – Razorpay wants paise
        amount: (orderData as { amountPaise: number }).amountPaise,
        currency: (orderData as { currency: string }).currency,
        name: "ENCEPHLIAN",
        description: `${packageTokens} tokens`,
        order_id: (orderData as { orderId: string }).orderId,

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
              throw new Error(await formatEdgeFunctionError(verifyError, verifyData));
            }
            if (verifyData && typeof verifyData === "object" && "error" in verifyData) {
              throw new Error(String((verifyData as { error?: string }).error || "Verification failed"));
            }

            toast.success("Payment successful", {
              description: `${(verifyData as { tokens_credited?: number })?.tokens_credited ?? packageTokens} tokens credited to your wallet`,
              duration: 6000,
            });

            // Fire-and-forget receipt email via edge function (uses RESEND_API_KEY)
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

            // Refresh wallet + payments
            await queryClient.invalidateQueries({ queryKey: ["wallet-balance"] });
            await queryClient.refetchQueries({ queryKey: ["wallet-balance"] });
            queryClient.invalidateQueries({ queryKey: ["wallet-transactions"] });
            queryClient.invalidateQueries({ queryKey: ["payments"] });
          } catch (error: any) {
            toast.error("Payment verification failed", { description: error.message });
          } finally {
            setLoadingPackage(null);
          }
        },

        prefill: {
          email: (await supabase.auth.getUser()).data.user?.email || "",
        },

        // Do NOT override theme here; let Razorpay Dashboard styling control
        // the checkout colors and background consistently.
        // theme: { color: "#0ea5e9" },

        modal: {
          ondismiss: () => setLoadingPackage(null),
        },
      };

      const razorpay = new (window as any).Razorpay(options);
      razorpay.open();
    } catch (error: any) {
      toast.error("Checkout error", { description: error.message });
      setLoadingPackage(null);
    }
  };

  return (
    <Card className="border-none shadow-lg">
      <CardHeader>
        <CardTitle className="text-2xl">Purchase Tokens</CardTitle>
        <CardDescription>
          Same packs as pilot. Tokens are charged when you start triage (Standard = 1, Priority = 2); review and sign
          does not deduct again.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {TOKEN_TOPUP_PACKAGES.map((pkg) => (
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
                  <div className="text-2xl font-bold">₹{pkg.priceInr.toLocaleString("en-IN")}</div>
                  <div className="text-xs text-muted-foreground">₹{(pkg.priceInr / pkg.tokens).toFixed(0)}/token</div>
                </div>

                {pkg.tokens >= 50 && (
                  <div className="text-xs text-green-600 font-medium flex items-center justify-center gap-1">
                    <Check className="h-3 w-3" />
                    Best value
                  </div>
                )}

                <Button
                  onClick={() => handlePurchase(pkg.tokens, pkg.priceInr)}
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
            <li>• 1 token when you start Standard triage (TAT)</li>
            <li>• 2 tokens when you start Priority triage (STAT)</li>
            <li>• Review and sign does not use additional tokens</li>
            <li>• Razorpay checkout — wallet credits immediately after verification</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
