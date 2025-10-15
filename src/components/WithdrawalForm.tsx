import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, AlertCircle, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

const withdrawalSchema = z.object({
  amount_inr: z.number().min(100, "Minimum withdrawal is ₹100"),
  bank_account_id: z.string().optional(),
});

type WithdrawalFormData = z.infer<typeof withdrawalSchema>;

interface WithdrawalFormProps {
  availableBalance: number;
  onSuccess: () => void;
  onCancel: () => void;
}

interface Breakdown {
  requested_amount: number;
  tds_amount: number;
  platform_fee: number;
  net_amount: number;
  tier: string;
}

export function WithdrawalForm({ availableBalance, onSuccess, onCancel }: WithdrawalFormProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [breakdown, setBreakdown] = useState<Breakdown | null>(null);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);

  const form = useForm<WithdrawalFormData>({
    resolver: zodResolver(withdrawalSchema),
    defaultValues: {
      amount_inr: 0,
      bank_account_id: "",
    },
  });

  const amount = form.watch("amount_inr");

  useEffect(() => {
    fetchBankAccounts();
  }, []);

  useEffect(() => {
    if (amount >= 100 && amount <= availableBalance) {
      calculateBreakdown(amount);
    } else {
      setBreakdown(null);
    }
  }, [amount, availableBalance]);

  const fetchBankAccounts = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("bank_accounts")
      .select("*")
      .eq("user_id", user.id)
      .order("is_primary", { ascending: false });

    if (!error && data) {
      setBankAccounts(data);
      if (data.length > 0) {
        form.setValue("bank_account_id", data[0].id);
      }
    }
  };

  const calculateBreakdown = async (requestedAmount: number) => {
    try {
      setCalculating(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase.rpc("calculate_withdrawal_breakdown", {
        p_user_id: user.id,
        p_requested_amount: requestedAmount,
      });

      if (error) throw error;
      setBreakdown(data ? data as unknown as Breakdown : null);
    } catch (error: any) {
      console.error("Error calculating breakdown:", error);
    } finally {
      setCalculating(false);
    }
  };

  const onSubmit = async (data: WithdrawalFormData) => {
    try {
      if (bankAccounts.length === 0) {
        toast({
          title: "No Bank Account",
          description: "Please add a bank account first",
          variant: "destructive",
        });
        return;
      }

      setLoading(true);

      const selectedAccount = bankAccounts.find((acc) => acc.id === data.bank_account_id) || bankAccounts[0];

      // Decrypt account number (simple base64 decode)
      const accountNumber = atob(selectedAccount.account_number_encrypted);

      const { data: result, error } = await supabase.functions.invoke("initiate_withdrawal", {
        body: {
          amount_inr: data.amount_inr,
          bank_account_id: selectedAccount.id,
          account_number: accountNumber,
          ifsc: selectedAccount.ifsc,
          account_holder_name: selectedAccount.account_holder_name,
          bank_name: selectedAccount.bank_name,
        },
      });

      if (error) throw error;

      toast({
        title: "Withdrawal Initiated! 🎉",
        description: result.message,
      });

      onSuccess();
    } catch (error: any) {
      console.error("Withdrawal error:", error);
      toast({
        title: "Withdrawal Failed",
        description: error.message || "Failed to process withdrawal",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getTierBadge = (tier: string) => {
    const variants: Record<string, any> = {
      instant: "default",
      standard: "secondary",
      manual: "outline",
    };
    
    return (
      <Badge variant={variants[tier]}>
        {tier === "instant" ? "⚡ Instant (< 2 min)" : tier === "standard" ? "🕐 Standard (< 24 hrs)" : "👤 Manual Review (2-3 days)"}
      </Badge>
    );
  };

  if (bankAccounts.length === 0) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Please add a bank account before initiating a withdrawal.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Available Balance: ₹{availableBalance.toLocaleString("en-IN")}
          </AlertDescription>
        </Alert>

        <FormField
          control={form.control}
          name="amount_inr"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Withdrawal Amount (₹)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  placeholder="Enter amount"
                  {...field}
                  onChange={(e) => field.onChange(Number(e.target.value))}
                />
              </FormControl>
              <FormDescription>Minimum: ₹100 | Maximum: ₹{availableBalance.toLocaleString("en-IN")}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="bank_account_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Bank Account</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select bank account" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {bankAccounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.account_holder_name} - {account.ifsc} {account.is_primary && "(Primary)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {calculating && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Calculating fees...
          </div>
        )}

        {breakdown && (
          <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Processing Tier</span>
              {getTierBadge(breakdown.tier)}
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Gross Amount</span>
                <span className="font-medium">₹{breakdown.requested_amount.toLocaleString("en-IN")}</span>
              </div>

              {breakdown.tds_amount > 0 && (
                <div className="flex justify-between text-destructive">
                  <span>TDS (10%)</span>
                  <span>- ₹{breakdown.tds_amount.toLocaleString("en-IN")}</span>
                </div>
              )}

              <div className="flex justify-between text-muted-foreground">
                <span>Platform Fee</span>
                <span>- ₹{breakdown.platform_fee}</span>
              </div>

              <div className="border-t pt-2 flex justify-between font-semibold text-base">
                <span>Net Amount</span>
                <span className="text-primary">₹{breakdown.net_amount.toLocaleString("en-IN")}</span>
              </div>
            </div>

            {breakdown.tds_amount > 0 && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  TDS deducted as per Income Tax Act Section 194J. Claimable when filing ITR.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <div className="flex gap-3 pt-4">
          <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
            Cancel
          </Button>
          <Button type="submit" disabled={loading || !breakdown || calculating} className="flex-1">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirm Withdrawal
          </Button>
        </div>
      </form>
    </Form>
  );
}
