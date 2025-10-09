import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Coins, TrendingUp, ArrowRight, Wallet as WalletIcon, AlertCircle, DollarSign, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

const TOKEN_PACKAGES = [
  { tokens: 10, price: 2000, popular: false, savings: 0 },
  { tokens: 50, price: 9500, popular: true, savings: 500 },
  { tokens: 100, price: 18000, popular: false, savings: 2000 },
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
      const { data, error } = await supabase.functions.invoke("create_order", {
        body: { tokens },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      // Open Razorpay checkout
      const options = {
        key: data.keyId,
        amount: data.amount * 100,
        currency: data.currency,
        name: "Encephalian",
        description: `Purchase ${loadingPackage} Tokens`,
        order_id: data.orderId,
        handler: async function (response: any) {
          toast({
            title: "Payment Successful",
            description: `${loadingPackage} tokens added to your wallet!`,
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
    <div className="space-y-8 max-w-6xl">
      <div className="animate-fade-in">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-cyan-400 bg-clip-text text-transparent">
          Wallet
        </h1>
        <p className="text-muted-foreground text-lg mt-2">Manage your tokens, earnings, and triage care processing</p>
      </div>

      <Alert className="border-primary/30 bg-primary/5 animate-fade-in">
        <AlertCircle className="h-5 w-5 text-primary" />
        <AlertDescription className="text-base">
          <strong className="text-primary">Clinical Decision Support System (CDSS)</strong> - Tokens are used to process EEG studies. 
          TAT reports consume 1 token, STAT reports consume 2 tokens. Earn commissions on signed reports!
        </AlertDescription>
      </Alert>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-primary/30 glow-cyan animate-fade-in hover:-translate-y-1 transition-transform duration-300">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Coins className="h-6 w-6 text-primary" />
              Available Tokens
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-6xl font-bold text-primary mb-4">{totalTokens}</div>
            <p className="text-sm text-muted-foreground mb-4">
              Tokens available for processing studies
            </p>
            <div className="space-y-3 pt-4 border-t border-border">
              <div className="flex items-center justify-between">
                <span className="text-sm">TAT Reports (1 token)</span>
                <span className="font-semibold">₹200 each</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">STAT Reports (2 tokens)</span>
                <span className="font-semibold">₹400 each</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {earnings && (
          <Card className="border-green-500/30 bg-green-500/5 animate-fade-in hover:-translate-y-1 transition-transform duration-300" style={{ animationDelay: '0.1s' }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <DollarSign className="h-6 w-6 text-green-500" />
                Earnings Wallet
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">Available Balance</p>
                  <div className="text-5xl font-bold text-green-500">₹{earnings.balance_inr || 0}</div>
                </div>
                <div className="pt-4 border-t border-green-500/20">
                  <p className="text-sm text-muted-foreground">Total Earned</p>
                  <div className="text-3xl font-bold text-green-500/80">₹{earnings.total_earned_inr || 0}</div>
                </div>
                <div className="pt-4 border-t border-green-500/20 space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>TAT: 3% commission</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>STAT: 5% commission</span>
                  </div>
                </div>
                <Button variant="outline" className="w-full mt-4 border-green-500/30 hover:bg-green-500/10">
                  Withdraw to Bank
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Card className="border-border animate-fade-in">
        <CardHeader>
          <CardTitle className="text-2xl">Purchase Token Packages</CardTitle>
          <CardDescription className="text-base">Each token costs ₹200. Choose a package to get started.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-3">
          {TOKEN_PACKAGES.map((pkg, index) => (
            <Card 
              key={pkg.tokens} 
              className={cn(
                "relative border-border hover:border-primary/50 transition-all duration-300 hover:shadow-lg hover:shadow-primary/10 hover:-translate-y-1",
                pkg.popular && "border-primary/50 glow-cyan scale-105"
              )}
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              {pkg.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <div className="bg-primary text-primary-foreground px-4 py-1 text-sm font-bold rounded-full glow-cyan">
                    MOST POPULAR
                  </div>
                </div>
              )}
              <CardHeader>
                <CardTitle className="text-4xl font-bold">{pkg.tokens} <span className="text-lg text-muted-foreground">Tokens</span></CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <div className="text-5xl font-bold text-primary">₹{pkg.price.toLocaleString()}</div>
                  {pkg.savings > 0 && (
                    <p className="text-base text-green-500 font-semibold mt-2">
                      Save ₹{pkg.savings}
                    </p>
                  )}
                </div>
                <Button 
                  onClick={() => handlePurchase(pkg.tokens)}
                  disabled={loadingPackage !== null}
                  className="w-full glow-cyan-hover group text-base py-6"
                  size="lg"
                >
                  {loadingPackage === pkg.tokens ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      Purchase Now
                      <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </Button>
                <div className="space-y-3 pt-4 border-t border-border">
                  <p className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" />
                    <span className="text-sm">Process {pkg.tokens} TAT reports</span>
                  </p>
                  <p className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" />
                    <span className="text-sm">Process {Math.floor(pkg.tokens / 2)} STAT reports</span>
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
