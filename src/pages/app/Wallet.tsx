import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Coins, TrendingUp, ArrowRight, Wallet as WalletIcon, AlertCircle, DollarSign, CheckCircle, Plus, ArrowDownToLine, History } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BankAccountForm } from "@/components/BankAccountForm";
import { WithdrawalForm } from "@/components/WithdrawalForm";
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
  const [showBankDialog, setShowBankDialog] = useState(false);
  const [showWithdrawDialog, setShowWithdrawDialog] = useState(false);
  const [activeTab, setActiveTab] = useState("withdraw");

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

  const { data: withdrawals, isLoading: withdrawalsLoading } = useQuery({
    queryKey: ["withdrawals"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("withdrawal_requests")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) throw error;
      return data;
    },
  });

  const { data: tdsRecords } = useQuery({
    queryKey: ["tds"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("tds_records")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
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
          try {
            toast({
              title: "Verifying Payment...",
              description: "Please wait while we confirm your payment",
            });

            const { data: verifyData, error: verifyError } = await supabase.functions.invoke("verify_payment", {
              body: {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                tokens: loadingPackage
              }
            });

            if (verifyError) throw verifyError;

            toast({
              title: "Payment Successful! 🎉",
              description: `${verifyData.tokens_credited} tokens added! New balance: ${verifyData.new_balance} tokens`,
            });
            
            await queryClient.invalidateQueries({ queryKey: ["wallet"] });
          } catch (error: any) {
            console.error('Payment verification failed:', error);
            toast({
              title: "Payment Verification Failed",
              description: error?.message || "Please contact support if amount was deducted",
              variant: "destructive"
            });
            
            // Refresh wallet anyway in case webhook processed it
            await queryClient.invalidateQueries({ queryKey: ["wallet"] });
          } finally {
            setLoadingPackage(null);
          }
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
  const availableBalance = (earnings?.balance_inr || 0) - (earnings?.locked_amount_inr || 0);
  const ytdTds = tdsRecords?.reduce((sum: number, record: any) => sum + (record.total_tds_deducted_inr || 0), 0) || 0;

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      pending: "outline",
      processing: "secondary",
      completed: "default",
      failed: "destructive",
      cancelled: "outline",
    };
    return <Badge variant={variants[status] || "outline"}>{status}</Badge>;
  };

  if (isLoading || withdrawalsLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 md:space-y-8 max-w-7xl animate-fade-in">
      <div>
        <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground">
          Wallet
        </h1>
        <p className="text-muted-foreground text-sm md:text-base lg:text-lg mt-2">Manage your tokens, earnings, and triage care processing</p>
      </div>

      <Alert className="border-primary/30 bg-primary/5">
        <AlertCircle className="h-4 w-4 md:h-5 md:w-5 text-primary" />
        <AlertDescription className="text-sm md:text-base">
          <strong className="text-primary">Clinical Decision Support System (CDSS)</strong> - Tokens are used to process EEG studies. 
          TAT reports consume 1 token, STAT reports consume 2 tokens. Earn commissions on signed reports!
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 md:gap-6 grid-cols-1 md:grid-cols-2">
        <Card className="border-primary/30 hover:-translate-y-1 transition-all duration-150 hover:shadow-xl">
          <CardHeader className="p-4 md:p-6">
            <CardTitle className="flex items-center gap-2 text-lg md:text-xl lg:text-2xl">
              <Coins className="h-5 w-5 md:h-6 md:w-6 text-primary" />
              Available Tokens
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 md:p-6">
            <div className="text-4xl md:text-5xl lg:text-6xl font-bold text-primary mb-3 md:mb-4">{totalTokens}</div>
            <p className="text-xs md:text-sm text-muted-foreground mb-3 md:mb-4">
              Tokens available for processing studies
            </p>
            <div className="space-y-2 md:space-y-3 pt-3 md:pt-4 border-t border-border">
              <div className="flex items-center justify-between text-sm md:text-base">
                <span>TAT Reports (1 token)</span>
                <span className="font-semibold">₹200 each</span>
              </div>
              <div className="flex items-center justify-between text-sm md:text-base">
                <span>STAT Reports (2 tokens)</span>
                <span className="font-semibold">₹400 each</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {earnings && (
          <Card className="border-green-500/30 bg-green-500/5 hover:-translate-y-1 transition-all duration-150 hover:shadow-xl">
            <CardHeader className="p-4 md:p-6">
              <CardTitle className="flex items-center gap-2 text-lg md:text-xl lg:text-2xl">
                <DollarSign className="h-5 w-5 md:h-6 md:w-6 text-green-500" />
                Earnings Wallet
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 md:p-6">
              <div className="space-y-3 md:space-y-4">
                <div>
                  <p className="text-xs md:text-sm text-muted-foreground">Available Balance</p>
                  <div className="text-3xl md:text-4xl lg:text-5xl font-bold text-green-500">₹{availableBalance.toLocaleString("en-IN")}</div>
                  {earnings.locked_amount_inr > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      (₹{earnings.locked_amount_inr.toLocaleString("en-IN")} locked)
                    </p>
                  )}
                </div>
                <div className="pt-3 md:pt-4 border-t border-green-500/20 grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs md:text-sm text-muted-foreground">Total Earned</p>
                    <div className="text-xl md:text-2xl font-bold text-green-500/80">₹{earnings.total_earned_inr?.toLocaleString("en-IN") || 0}</div>
                  </div>
                  <div>
                    <p className="text-xs md:text-sm text-muted-foreground">YTD TDS</p>
                    <div className="text-xl md:text-2xl font-bold text-green-500/80">₹{ytdTds.toLocaleString("en-IN")}</div>
                  </div>
                </div>
                <div className="pt-3 md:pt-4 border-t border-green-500/20 space-y-2 text-xs md:text-sm">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-3.5 w-3.5 md:h-4 md:w-4 text-green-500" />
                    <span>TAT: 3% commission</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-3.5 w-3.5 md:h-4 md:w-4 text-green-500" />
                    <span>STAT: 5% commission</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button 
                    className="flex-1" 
                    onClick={() => setShowWithdrawDialog(true)}
                    disabled={availableBalance < 100}
                  >
                    <ArrowDownToLine className="mr-2 h-4 w-4" />
                    Withdraw
                  </Button>
                  <Button variant="outline" onClick={() => setShowBankDialog(true)}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {availableBalance < 100 && (
                  <p className="text-xs text-muted-foreground text-center">
                    Minimum withdrawal: ₹100
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Withdrawal History */}
      {withdrawals && withdrawals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Withdrawal History
            </CardTitle>
            <CardDescription>Recent withdrawal requests and their status</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>TDS</TableHead>
                  <TableHead>Fee</TableHead>
                  <TableHead>Net</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {withdrawals.map((withdrawal: any) => (
                  <TableRow key={withdrawal.id}>
                    <TableCell className="text-sm">
                      {new Date(withdrawal.created_at).toLocaleDateString("en-IN")}
                    </TableCell>
                    <TableCell>₹{withdrawal.gross_amount_inr.toLocaleString("en-IN")}</TableCell>
                    <TableCell className="text-destructive">-₹{withdrawal.tds_amount_inr}</TableCell>
                    <TableCell className="text-muted-foreground">-₹{withdrawal.platform_fee_inr}</TableCell>
                    <TableCell className="font-semibold">₹{withdrawal.net_amount_inr.toLocaleString("en-IN")}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{withdrawal.tier}</Badge>
                    </TableCell>
                    <TableCell>{getStatusBadge(withdrawal.status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card className="border-border">
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="text-xl md:text-2xl">Purchase Token Packages</CardTitle>
          <CardDescription className="text-sm md:text-base">Each token costs ₹200. Choose a package to get started.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 p-4 md:p-6">
          {TOKEN_PACKAGES.map((pkg, index) => (
            <Card 
              key={pkg.tokens} 
              className={cn(
                "relative border-border hover:border-primary/50 transition-all duration-150 hover:shadow-lg hover:-translate-y-1",
                pkg.popular && "border-primary/50 md:scale-105"
              )}
            >
              {pkg.popular && (
                <div className="absolute -top-2.5 md:-top-3 left-1/2 -translate-x-1/2">
                  <div className="bg-primary text-primary-foreground px-3 py-0.5 md:px-4 md:py-1 text-xs md:text-sm font-bold rounded-full">
                    MOST POPULAR
                  </div>
                </div>
              )}
              <CardHeader className="p-4 md:p-6">
                <CardTitle className="text-2xl md:text-3xl lg:text-4xl font-bold">{pkg.tokens} <span className="text-sm md:text-base lg:text-lg text-muted-foreground">Tokens</span></CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 md:space-y-6 p-4 md:p-6">
                <div>
                  <div className="text-3xl md:text-4xl lg:text-5xl font-bold text-primary">₹{pkg.price.toLocaleString()}</div>
                  {pkg.savings > 0 && (
                    <p className="text-sm md:text-base text-green-500 font-semibold mt-2">
                      Save ₹{pkg.savings}
                    </p>
                  )}
                </div>
                <Button 
                  onClick={() => handlePurchase(pkg.tokens)}
                  disabled={loadingPackage !== null}
                  className="w-full group text-sm md:text-base py-5 md:py-6 transition-all duration-150 hover:scale-[1.02] active:scale-[0.98]"
                  size="lg"
                >
                  {loadingPackage === pkg.tokens ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 md:h-5 md:w-5 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      Purchase Now
                      <ArrowRight className="ml-2 h-4 w-4 md:h-5 md:w-5 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </Button>
                <div className="space-y-2 md:space-y-3 pt-3 md:pt-4 border-t border-border">
                  <p className="flex items-center gap-2 text-xs md:text-sm">
                    <CheckCircle className="h-3.5 w-3.5 md:h-4 md:w-4 text-primary flex-shrink-0" />
                    <span>Process {pkg.tokens} TAT reports</span>
                  </p>
                  <p className="flex items-center gap-2 text-xs md:text-sm">
                    <CheckCircle className="h-3.5 w-3.5 md:h-4 md:w-4 text-primary flex-shrink-0" />
                    <span>Process {Math.floor(pkg.tokens / 2)} STAT reports</span>
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </CardContent>
      </Card>

      {/* Bank Account Dialog */}
      <Dialog open={showBankDialog} onOpenChange={setShowBankDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Bank Account</DialogTitle>
            <DialogDescription>
              Add your bank account details for withdrawals
            </DialogDescription>
          </DialogHeader>
          <BankAccountForm
            onSuccess={() => {
              setShowBankDialog(false);
              queryClient.invalidateQueries({ queryKey: ["bankAccounts"] });
            }}
            onCancel={() => setShowBankDialog(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Withdrawal Dialog */}
      <Dialog open={showWithdrawDialog} onOpenChange={setShowWithdrawDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Withdraw to Bank</DialogTitle>
            <DialogDescription>
              Withdraw your earnings to your bank account. 20% EBITDA + TDS applies.
            </DialogDescription>
          </DialogHeader>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="withdraw">Withdraw</TabsTrigger>
              <TabsTrigger value="bank">Bank Accounts</TabsTrigger>
            </TabsList>
            <TabsContent value="withdraw">
              <WithdrawalForm
                availableBalance={availableBalance}
                onSuccess={() => {
                  setShowWithdrawDialog(false);
                  queryClient.invalidateQueries({ queryKey: ["earnings"] });
                  queryClient.invalidateQueries({ queryKey: ["withdrawals"] });
                }}
                onCancel={() => setShowWithdrawDialog(false)}
              />
            </TabsContent>
            <TabsContent value="bank">
              <BankAccountForm
                onSuccess={() => {
                  setActiveTab("withdraw");
                  queryClient.invalidateQueries({ queryKey: ["bankAccounts"] });
                }}
                onCancel={() => setShowWithdrawDialog(false)}
              />
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}