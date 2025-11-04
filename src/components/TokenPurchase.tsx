import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";

const TOKEN_PACKAGES = [
  { tokens: 50, price: 10000, popular: false },
  { tokens: 100, price: 20000, popular: true },
  { tokens: 200, price: 38000, popular: false },
  { tokens: 500, price: 90000, popular: false },
];

export function TokenPurchase() {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handlePurchase = async (packageTokens: number, packagePrice: number) => {
    try {
      setLoading(true);

      // Create order via edge function
      const { data: orderData, error: orderError } = await supabase.functions.invoke('create_order', {
        body: { tokens: packageTokens },
      });

      if (orderError) throw orderError;

      // Load Razorpay script if not already loaded
      if (!(window as any).Razorpay) {
        const script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.async = true;
        document.body.appendChild(script);
        await new Promise((resolve) => script.onload = resolve);
      }

      const options = {
        key: orderData.keyId,
        amount: orderData.amount * 100,
        currency: orderData.currency,
        name: 'ENCEPHLIAN',
        description: `${packageTokens} tokens`,
        order_id: orderData.orderId,
        handler: async function (response: any) {
          try {
            const { data: verifyData, error: verifyError } = await supabase.functions.invoke('verify_payment', {
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

            queryClient.invalidateQueries({ queryKey: ["wallet"] });
            queryClient.invalidateQueries({ queryKey: ["payments"] });
          } catch (error: any) {
            toast({
              title: "Payment verification failed",
              description: error.message,
              variant: "destructive",
            });
          } finally {
            setLoading(false);
          }
        },
        prefill: {
          email: (await supabase.auth.getUser()).data.user?.email || '',
        },
        theme: {
          color: '#0ea5e9',
        },
        modal: {
          ondismiss: () => setLoading(false)
        }
      };

      const razorpay = new (window as any).Razorpay(options);
      razorpay.open();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
      setLoading(false);
    }
  };

  return (
    <Card className="border-none shadow-lg">
      <CardHeader>
        <CardTitle className="text-2xl">Purchase Tokens</CardTitle>
        <CardDescription>
          Choose a package that fits your needs. Each token = 1 TAT report signing.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {TOKEN_PACKAGES.map((pkg) => (
            <Card 
              key={pkg.tokens}
              className={cn(
                "relative transition-all hover:shadow-xl cursor-pointer border-2",
                pkg.popular ? "border-primary shadow-lg scale-105" : "border-border hover:border-primary/50"
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
                  <div className="text-2xl font-bold">₹{(pkg.price / 100).toLocaleString('en-IN')}</div>
                  <div className="text-xs text-muted-foreground">
                    ₹{(pkg.price / pkg.tokens / 100).toFixed(0)}/token
                  </div>
                </div>

                {pkg.tokens >= 200 && (
                  <div className="text-xs text-green-600 font-medium flex items-center justify-center gap-1">
                    <Check className="h-3 w-3" />
                    Save {Math.round((1 - (pkg.price / pkg.tokens) / 200) * 100)}%
                  </div>
                )}

                <Button 
                  onClick={() => handlePurchase(pkg.tokens, pkg.price)}
                  disabled={loading}
                  className={cn(
                    "w-full",
                    pkg.popular ? "bg-primary hover:bg-primary/90" : ""
                  )}
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buy Now"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-6 p-4 bg-muted/50 rounded-lg">
          <h4 className="font-semibold mb-2">What are tokens used for?</h4>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• 1 token = 1 TAT (Turn Around Time) report signing</li>
            <li>• 2 tokens = 1 STAT (Urgent) report signing</li>
            <li>• Secure payment via Razorpay</li>
            <li>• Instant credit after successful payment</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
