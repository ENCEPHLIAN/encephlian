import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

const bankAccountSchema = z.object({
  account_holder_name: z.string().min(3, "Name must be at least 3 characters"),
  account_number: z.string().min(9, "Invalid account number").max(18, "Invalid account number"),
  confirm_account_number: z.string(),
  ifsc: z.string().length(11, "IFSC code must be 11 characters").regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Invalid IFSC code"),
  bank_name: z.string().optional(),
}).refine((data) => data.account_number === data.confirm_account_number, {
  message: "Account numbers don't match",
  path: ["confirm_account_number"],
});

type BankAccountFormData = z.infer<typeof bankAccountSchema>;

interface BankAccountFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export function BankAccountForm({ onSuccess, onCancel }: BankAccountFormProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const form = useForm<BankAccountFormData>({
    resolver: zodResolver(bankAccountSchema),
    defaultValues: {
      account_holder_name: "",
      account_number: "",
      confirm_account_number: "",
      ifsc: "",
      bank_name: "",
    },
  });

  const onSubmit = async (data: BankAccountFormData) => {
    try {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Simple encryption (in production, use proper encryption)
      const encrypted = btoa(data.account_number);

      const { error } = await supabase.from("bank_accounts").insert({
        user_id: user.id,
        account_number_encrypted: encrypted,
        ifsc: data.ifsc.toUpperCase(),
        account_holder_name: data.account_holder_name,
        bank_name: data.bank_name || null,
        is_primary: true,
      });

      if (error) throw error;

      toast({
        title: "Bank Account Added",
        description: "Your bank account has been saved successfully.",
      });

      onSuccess();
    } catch (error: any) {
      console.error("Error adding bank account:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to add bank account",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="account_holder_name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Account Holder Name</FormLabel>
              <FormControl>
                <Input placeholder="As per bank records" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="account_number"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Account Number</FormLabel>
              <FormControl>
                <Input type="text" placeholder="Enter account number" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="confirm_account_number"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirm Account Number</FormLabel>
              <FormControl>
                <Input type="text" placeholder="Re-enter account number" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="ifsc"
          render={({ field }) => (
            <FormItem>
              <FormLabel>IFSC Code</FormLabel>
              <FormControl>
                <Input placeholder="e.g., SBIN0001234" {...field} onChange={(e) => field.onChange(e.target.value.toUpperCase())} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="bank_name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Bank Name (Optional)</FormLabel>
              <FormControl>
                <Input placeholder="e.g., State Bank of India" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex gap-3 pt-4">
          <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
            Cancel
          </Button>
          <Button type="submit" disabled={loading} className="flex-1">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Account
          </Button>
        </div>
      </form>
    </Form>
  );
}
