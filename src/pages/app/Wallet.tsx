import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { TokenPurchase } from "@/components/TokenPurchase";

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

  const { data: earningsData, isLoading: earningsLoading } = useQuery({
    queryKey: ["earnings-wallet"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("earnings_wallets")
        .select("*")
        .single();

      if (error) return null;
      return data;
    }
  });

  const tokenBalance = walletData?.tokens || 0;
  const earningsBalance = earningsData?.balance_inr || 0;
  const lockedAmount = earningsData?.locked_amount_inr || 0;
  const availableBalance = earningsBalance - lockedAmount;
  const isLoading = walletLoading || earningsLoading;

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
        <p className="text-muted-foreground">Manage your tokens and earnings</p>
      </div>

      {/* Token Balance Card */}
      <Card className="border-none shadow-lg bg-gradient-to-br from-blue-500/10 to-blue-500/5">
        <CardContent className="pt-6">
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">Token Balance</div>
            <div className="text-4xl font-bold">{tokenBalance}</div>
            <div className="text-xs text-muted-foreground">Available for signing reports</div>
          </div>
        </CardContent>
      </Card>

      {/* Token Purchase */}
      <TokenPurchase />

      {/* Earnings Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-none shadow-lg bg-gradient-to-br from-primary/10 to-primary/5">
          <CardContent className="pt-6">
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">Total Earned</div>
              <div className="text-4xl font-bold">₹{earningsData?.total_earned_inr || 0}</div>
              <div className="text-xs text-muted-foreground">Lifetime earnings</div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-lg bg-gradient-to-br from-green-500/10 to-green-500/5">
          <CardContent className="pt-6">
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">Available Balance</div>
              <div className="text-4xl font-bold text-green-600">₹{availableBalance}</div>
              <div className="text-xs text-muted-foreground">Ready to withdraw</div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-lg bg-gradient-to-br from-orange-500/10 to-orange-500/5">
          <CardContent className="pt-6">
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">Pending</div>
              <div className="text-4xl font-bold text-orange-600">₹{lockedAmount}</div>
              <div className="text-xs text-muted-foreground">In processing</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Coming Soon Section */}
      <Card className="border-2 border-dashed">
        <CardContent className="pt-6">
          <div className="text-center space-y-4 py-8">
            <div className="text-2xl font-bold">Withdrawals Coming Soon</div>
            <p className="text-muted-foreground max-w-md mx-auto">
              We're working on adding bank account linking and instant withdrawals via Razorpay. 
              You'll be able to transfer your earnings directly to your bank account.
            </p>
            <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                Instant transfers
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                Secure payment gateway
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                No hidden fees
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Earnings Info */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="font-semibold mb-4">How do I earn?</h3>
          <div className="space-y-3 text-sm text-muted-foreground">
            <div className="flex items-start gap-3">
              <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-xs font-bold text-primary">1</span>
              </div>
              <div>
                <div className="font-medium text-foreground">Sign Reports</div>
                <div>Review and sign EEG reports uploaded by clinic owners</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-xs font-bold text-primary">2</span>
              </div>
              <div>
                <div className="font-medium text-foreground">Earn Commission</div>
                <div>3% for TAT reports (₹6) • 5% for STAT reports (₹20)</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-xs font-bold text-primary">3</span>
              </div>
              <div>
                <div className="font-medium text-foreground">Instant Credit</div>
                <div>Earnings are credited immediately after signing</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
