import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { TokenPurchase } from "@/components/TokenPurchase";
import { AnimatedCounter } from "@/components/ui/animated-counter";

export default function Wallet() {
  const { data: walletData, isLoading: walletLoading } = useQuery({
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
  const isLoading = walletLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

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

      {/* Token Purchase */}
      <TokenPurchase />
    </div>
  );
}
