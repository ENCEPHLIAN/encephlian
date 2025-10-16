import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Coins } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

declare global {
  interface Window {
    Razorpay: any;
  }
}

export function TokenPurchase() {
  const [tokens, setTokens] = useState(10);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const costInr = tokens * 200;

  const handlePurchase = async () => {
    setLoading(true);
    try {
      // Create order
      const { data: orderData, error: orderError } = await supabase.functions.invoke('create_order', {
        body: { tokens }
      });

      if (orderError) throw orderError;

      // Load Razorpay script if not already loaded
      if (!window.Razorpay) {
        const script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        document.body.appendChild(script);
        await new Promise(resolve => script.onload = resolve);
      }

      // Open Razorpay checkout
      const options = {
        key: orderData.razorpay_key_id,
        amount: orderData.order.amount,
        currency: 'INR',
        name: 'ENCEPHLIAN',
        description: `${tokens} Tokens`,
        order_id: orderData.order.id,
        handler: async (response: any) => {
          try {
            // Verify payment
            const { error: verifyError } = await supabase.functions.invoke('verify_payment', {
              body: {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature
              }
            });

            if (verifyError) throw verifyError;

            toast({
              title: "Purchase successful!",
              description: `${tokens} tokens added to your wallet.`
            });

            // Refresh wallet balance
            queryClient.invalidateQueries({ queryKey: ['wallet-balance'] });
            queryClient.invalidateQueries({ queryKey: ['payments'] });
            setTokens(10);
          } catch (err) {
            toast({
              title: "Payment verification failed",
              description: "Please contact support if amount was deducted.",
              variant: "destructive"
            });
          }
        },
        prefill: {
          email: (await supabase.auth.getUser()).data.user?.email
        },
        theme: {
          color: '#000000'
        }
      };

      const razorpay = new window.Razorpay(options);
      razorpay.open();
    } catch (error: any) {
      toast({
        title: "Purchase failed",
        description: error.message || "Something went wrong",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Coins className="h-5 w-5" />
          Buy Tokens
        </CardTitle>
        <CardDescription>
          Purchase tokens to sign EEG reports. Each TAT report costs 1 token (₹200), STAT costs 2 tokens (₹400).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="tokens">Number of Tokens</Label>
          <Input
            id="tokens"
            type="number"
            min={10}
            step={10}
            value={tokens}
            onChange={(e) => setTokens(Math.max(10, parseInt(e.target.value) || 10))}
            className="text-lg"
          />
          <p className="text-sm text-muted-foreground">Minimum 10 tokens</p>
        </div>

        <div className="p-4 bg-muted rounded-lg space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Tokens:</span>
            <span className="font-medium">{tokens}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Rate:</span>
            <span className="font-medium">₹200 per token</span>
          </div>
          <div className="border-t pt-2 mt-2 flex justify-between">
            <span className="font-semibold">Total:</span>
            <span className="text-xl font-bold">₹{costInr.toLocaleString()}</span>
          </div>
        </div>

        <Button
          onClick={handlePurchase}
          disabled={loading || tokens < 10}
          className="w-full"
          size="lg"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Coins className="mr-2 h-4 w-4" />
              Buy {tokens} Tokens for ₹{costInr.toLocaleString()}
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
