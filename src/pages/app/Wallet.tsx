import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Coins, TrendingUp, ArrowRight, Wallet as WalletIcon, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";

const TOKEN_PACKAGES = [
  { tokens: 10, price: 2000, popular: false },
  { tokens: 50, price: 10000, popular: true, savings: "Save 5%" },
  { tokens: 100, price: 18000, popular: false, savings: "Save 10%" },
];

export default function Wallet() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [loadingPackage, setLoadingPackage] = useState<number | null>(null);

  const { data: wallet, isLoading } = useQuery({
    queryKey: ["wallet"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wallets")
        .select("*")
        .single();

      if (error) throw error;
      return data;
    }
  });

  const { data: earnings } = useQuery({
    queryKey: ["earnings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("earnings_wallets")
        .select("*")
        .single();

      if (error) return null;
      return data;
    }
  });

  const purchaseMutation = useMutation({
    mutationFn: async (tokens: number) => {
      const amount = tokens * 200;
      const { data, error } = await supabase.functions.invoke("create_order", {
        body: { amount_inr: amount, credits_purchased: tokens },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      // Open Razorpay checkout
      const options = {
        key: "rzp_test_RP2pqx9x2tKFVK",
        amount: data.amount,
        currency: "INR",
        name: "Encephalian",
        description: `Purchase ${data.credits_purchased} Tokens`,
        order_id: data.order_id,
        handler: async function (response: any) {
          toast({
            title: "Payment Successful",
            description: `${data.credits_purchased} tokens added to your wallet!`,
          });
          queryClient.invalidateQueries({ queryKey: ["wallet"] });
          setLoadingPackage(null);
        },
        modal: {
          ondismiss: function() {
            setLoadingPackage(null);
          }
        }
      };
      
      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    },
    onError: (error) => {
      toast({
        title: "Purchase Failed",
        description: error instanceof Error ? error.message : "Failed to process payment",
        variant: "destructive",
      });
      setLoadingPackage(null);
    },
  });

  const handlePurchase = (tokens: number) => {
    setLoadingPackage(tokens);
    purchaseMutation.mutate(tokens);
  };

  const totalTokens = wallet?.tokens || 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-6xl mx-auto animate-fade-in">
      <div>
        <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
          Token Wallet
        </h1>
        <p className="text-muted-foreground mt-2">Purchase tokens for report processing</p>
      </div>

      <Alert className="border-primary/20 bg-primary/5">
        <AlertCircle className="h-4 w-4 text-primary" />
        <AlertDescription className="text-sm">
          <strong>Clinical Decision Support System (CDSS)</strong> - This is an assistive tool designed to support clinical decision-making. 
          It is not a diagnostic AI and should not be used as a replacement for professional medical judgment.
        </AlertDescription>
      </Alert>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="hover-scale border-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle>Available Tokens</CardTitle>
              <CardDescription>Ready to use for reports</CardDescription>
            </div>
            <Coins className="h-8 w-8 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-5xl font-bold text-primary">{totalTokens}</div>
            <div className="mt-4 space-y-2 text-sm text-muted-foreground">
              <div className="flex justify-between">
                <span>TAT Reports (1 token)</span>
                <span className="font-semibold">₹200 each</span>
              </div>
              <div className="flex justify-between">
                <span>STAT Reports (2 tokens)</span>
                <span className="font-semibold">₹400 each</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {earnings && (
          <Card className="hover-scale border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle>Earnings Wallet</CardTitle>
                <CardDescription>From report sign-offs</CardDescription>
              </div>
              <TrendingUp className="h-8 w-8 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-5xl font-bold text-green-600">₹{earnings.balance_inr}</div>
              <div className="mt-4 text-sm text-muted-foreground">
                <div className="flex justify-between">
                  <span>Total Earned</span>
                  <span className="font-semibold">₹{earnings.total_earned_inr}</span>
                </div>
                <div className="mt-2 text-xs">
                  • TAT: 3% commission<br />
                  • STAT: 5% commission
                </div>
              </div>
              <Button variant="outline" className="w-full mt-4" size="sm">
                Withdraw to Bank
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <div>
        <h2 className="text-2xl font-semibold mb-4">Purchase Token Packages</h2>
        <p className="text-sm text-muted-foreground mb-6">Each token = ₹200 | Minimum purchase: 10 tokens</p>
        
        <div className="grid gap-4 md:grid-cols-3">
          {TOKEN_PACKAGES.map((pkg) => (
            <Card 
              key={pkg.tokens}
              className={`hover-scale transition-all ${
                pkg.popular ? 'border-2 border-primary shadow-lg' : ''
              }`}
            >
              {pkg.popular && (
                <div className="bg-primary text-primary-foreground text-xs font-semibold text-center py-1">
                  MOST POPULAR
                </div>
              )}
              <CardHeader>
                <CardTitle className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold">{pkg.tokens}</span>
                  <span className="text-lg text-muted-foreground">Tokens</span>
                </CardTitle>
                {pkg.savings && (
                  <div className="text-sm font-medium text-green-600">{pkg.savings}</div>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="text-3xl font-bold">₹{pkg.price.toLocaleString()}</div>
                  <div className="text-sm text-muted-foreground">
                    ₹{pkg.price / pkg.tokens} per token
                  </div>
                </div>
                
                <Button 
                  size="lg" 
                  className="w-full group"
                  onClick={() => handlePurchase(pkg.tokens)}
                  disabled={loadingPackage !== null}
                  variant={pkg.popular ? "default" : "outline"}
                >
                  {loadingPackage === pkg.tokens ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      Purchase Now
                      <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </Button>

                <div className="text-xs text-muted-foreground space-y-1">
                  <div>• Process {pkg.tokens} TAT reports</div>
                  <div>• Process {Math.floor(pkg.tokens / 2)} STAT reports</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
