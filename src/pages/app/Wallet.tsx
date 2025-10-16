import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Wallet as WalletIcon, History, Building2, Plus, Send, Receipt, AlertCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { BankAccountForm } from "@/components/BankAccountForm";
import { WithdrawalForm } from "@/components/WithdrawalForm";
import dayjs from "dayjs";

export default function Wallet() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showBankDialog, setShowBankDialog] = useState(false);

  const { data: earningsData, isLoading } = useQuery({
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

  const { data: withdrawalHistory } = useQuery({
    queryKey: ["withdrawal-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("withdrawal_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) return [];
      return data;
    }
  });

  const { data: tdsRecords } = useQuery({
    queryKey: ["tds-records"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tds_records")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) return [];
      return data;
    }
  });

  const { data: bankAccounts } = useQuery({
    queryKey: ["bank-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_accounts")
        .select("*")
        .order("is_primary", { ascending: false });

      if (error) return [];
      return data;
    }
  });

  const earningsBalance = earningsData?.balance_inr || 0;
  const lockedAmount = earningsData?.locked_amount_inr || 0;
  const availableBalance = earningsBalance - lockedAmount;

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
        <p className="text-muted-foreground">Manage your earnings and withdrawals</p>
      </div>

      <Accordion type="multiple" defaultValue={["overview", "withdraw"]} className="space-y-4">
        
        {/* Wallet Overview */}
        <AccordionItem value="overview" className="border rounded-xl bg-card">
          <AccordionTrigger className="px-6 py-4 hover:no-underline">
            <div className="flex items-center gap-3">
              <WalletIcon className="h-5 w-5" />
              <span className="text-lg font-semibold">Wallet Overview</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-6 pb-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="border-none shadow-none bg-muted/30">
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground mb-1">Earnings Balance</div>
                  <div className="text-2xl font-bold">₹{earningsBalance}</div>
                </CardContent>
              </Card>
              <Card className="border-none shadow-none bg-muted/30">
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground mb-1">Locked Amount</div>
                  <div className="text-2xl font-bold">₹{lockedAmount}</div>
                </CardContent>
              </Card>
              <Card className="border-none shadow-none bg-muted/30">
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground mb-1">Available</div>
                  <div className="text-2xl font-bold text-green-600">₹{availableBalance}</div>
                </CardContent>
              </Card>
            </div>
            <div className="mt-4 p-4 bg-primary/5 rounded-lg border">
              <div className="text-sm text-muted-foreground mb-1">Total Earned (Lifetime)</div>
              <div className="text-xl font-semibold">₹{earningsData?.total_earned_inr || 0}</div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Bank Accounts */}
        <AccordionItem value="bank" className="border rounded-xl bg-card">
          <AccordionTrigger className="px-6 py-4 hover:no-underline">
            <div className="flex items-center gap-3">
              <Building2 className="h-5 w-5" />
              <span className="text-lg font-semibold">Bank Accounts</span>
              <Badge variant="secondary">{bankAccounts?.length || 0}</Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-6 pb-6">
            {bankAccounts && bankAccounts.length > 0 ? (
              <div className="space-y-3">
                {bankAccounts.map((account) => (
                  <Card key={account.id} className="border-none shadow-none bg-muted/30">
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">{account.account_holder_name}</div>
                          <div className="text-sm text-muted-foreground">
                            {account.bank_name} • {account.ifsc}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            •••• {account.account_number_encrypted?.slice(-4)}
                          </div>
                        </div>
                        {account.is_primary && (
                          <Badge variant="secondary">Primary</Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  No bank accounts added. Add a bank account to enable withdrawals.
                </AlertDescription>
              </Alert>
            )}
            <Button onClick={() => setShowBankDialog(true)} className="w-full mt-4">
              <Plus className="h-4 w-4 mr-2" />
              Add Bank Account
            </Button>
          </AccordionContent>
        </AccordionItem>

        {/* Withdrawal Form */}
        <AccordionItem value="withdraw" className="border rounded-xl bg-card">
          <AccordionTrigger className="px-6 py-4 hover:no-underline">
            <div className="flex items-center gap-3">
              <Send className="h-5 w-5" />
              <span className="text-lg font-semibold">Withdraw Earnings</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-6 pb-6">
            <WithdrawalForm
              availableBalance={availableBalance}
              onSuccess={() => {
                queryClient.invalidateQueries({ queryKey: ["earnings-wallet"] });
                queryClient.invalidateQueries({ queryKey: ["withdrawal-history"] });
                toast({ title: "Withdrawal initiated successfully" });
              }}
              onCancel={() => {}}
            />
          </AccordionContent>
        </AccordionItem>

        {/* Withdrawal History */}
        <AccordionItem value="history" className="border rounded-xl bg-card">
          <AccordionTrigger className="px-6 py-4 hover:no-underline">
            <div className="flex items-center gap-3">
              <History className="h-5 w-5" />
              <span className="text-lg font-semibold">Withdrawal History</span>
              <Badge variant="secondary">{withdrawalHistory?.length || 0}</Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-6 pb-6">
            {withdrawalHistory && withdrawalHistory.length > 0 ? (
              <div className="space-y-3">
                {withdrawalHistory.map((withdrawal) => (
                  <Card key={withdrawal.id} className="border-none shadow-none bg-muted/30">
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">₹{withdrawal.net_amount_inr}</div>
                          <div className="text-sm text-muted-foreground">
                            {dayjs(withdrawal.created_at).format("MMM D, YYYY HH:mm")}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {withdrawal.bank_name} • {withdrawal.tier.toUpperCase()}
                          </div>
                        </div>
                        <Badge variant={
                          withdrawal.status === "completed" ? "default" :
                          withdrawal.status === "failed" ? "destructive" :
                          "secondary"
                        }>
                          {withdrawal.status}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">No withdrawal history</p>
            )}
          </AccordionContent>
        </AccordionItem>

        {/* TDS Dashboard */}
        <AccordionItem value="tds" className="border rounded-xl bg-card">
          <AccordionTrigger className="px-6 py-4 hover:no-underline">
            <div className="flex items-center gap-3">
              <Receipt className="h-5 w-5" />
              <span className="text-lg font-semibold">TDS & Tax Information</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-6 pb-6">
            {tdsRecords && tdsRecords.length > 0 ? (
              <div className="space-y-3">
                {tdsRecords.map((record) => (
                  <Card key={record.id} className="border-none shadow-none bg-muted/30">
                    <CardContent className="pt-6">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-sm text-muted-foreground">Period</div>
                          <div className="font-medium">{record.financial_year} {record.quarter}</div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">Earnings</div>
                          <div className="font-medium">₹{record.total_earnings_inr}</div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">TDS Deducted</div>
                          <div className="font-medium text-orange-600">₹{record.total_tds_deducted_inr}</div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">Form 16A</div>
                          <div className="font-medium">
                            {record.form_16a_url ? (
                              <a href={record.form_16a_url} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                                Download
                              </a>
                            ) : (
                              <span className="text-muted-foreground">Pending</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  No TDS records available. TDS is deducted when your withdrawals exceed ₹30,000 in a financial year.
                </AlertDescription>
              </Alert>
            )}
          </AccordionContent>
        </AccordionItem>

      </Accordion>

      {/* Bank Account Dialog */}
      <Dialog open={showBankDialog} onOpenChange={setShowBankDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Bank Account</DialogTitle>
          </DialogHeader>
          <BankAccountForm
            onSuccess={() => {
              setShowBankDialog(false);
              queryClient.invalidateQueries({ queryKey: ["bank-accounts"] });
              toast({ title: "Bank account added successfully" });
            }}
            onCancel={() => setShowBankDialog(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
