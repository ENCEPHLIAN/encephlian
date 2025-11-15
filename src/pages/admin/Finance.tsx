import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import dayjs from "dayjs";

export default function AdminFinance() {
  const { data: payments, isLoading: paymentsLoading } = useQuery({
    queryKey: ['admin-payments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payments')
        .select('*, profiles(email)')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    }
  });

  const { data: withdrawals, isLoading: withdrawalsLoading } = useQuery({
    queryKey: ['admin-withdrawals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('withdrawal_requests')
        .select('*, profiles(email)')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    }
  });

  const { data: commissions, isLoading: commissionsLoading } = useQuery({
    queryKey: ['admin-commissions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('commissions')
        .select('*, profiles(email)')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    }
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold logo-text">Finance</h1>
        <p className="text-muted-foreground mt-1">Payments, withdrawals, and commissions</p>
      </div>

      <Tabs defaultValue="payments" className="space-y-4">
        <TabsList>
          <TabsTrigger value="payments">Token Purchases</TabsTrigger>
          <TabsTrigger value="withdrawals">Withdrawals</TabsTrigger>
          <TabsTrigger value="commissions">Commissions</TabsTrigger>
        </TabsList>

        <TabsContent value="payments">
          <Card>
            <CardHeader>
              <CardTitle>Token Purchases</CardTitle>
            </CardHeader>
            <CardContent>
              {paymentsLoading ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b">
                      <tr className="text-left text-sm text-muted-foreground">
                        <th className="p-3 font-medium">User</th>
                        <th className="p-3 font-medium">Tokens</th>
                        <th className="p-3 font-medium">Amount</th>
                        <th className="p-3 font-medium">Status</th>
                        <th className="p-3 font-medium">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments?.map((payment) => (
                        <tr key={payment.id} className="border-b hover:bg-muted/50">
                          <td className="p-3 text-sm">{(payment.profiles as any)?.email || '-'}</td>
                          <td className="p-3">{payment.credits_purchased}</td>
                          <td className="p-3">₹{payment.amount_inr.toLocaleString()}</td>
                          <td className="p-3">
                            <Badge variant={payment.status === 'completed' ? 'default' : 'secondary'}>
                              {payment.status}
                            </Badge>
                          </td>
                          <td className="p-3 text-sm text-muted-foreground">
                            {dayjs(payment.created_at).format('YYYY-MM-DD HH:mm')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="withdrawals">
          <Card>
            <CardHeader>
              <CardTitle>Withdrawal Requests</CardTitle>
            </CardHeader>
            <CardContent>
              {withdrawalsLoading ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b">
                      <tr className="text-left text-sm text-muted-foreground">
                        <th className="p-3 font-medium">User</th>
                        <th className="p-3 font-medium">Amount</th>
                        <th className="p-3 font-medium">Tier</th>
                        <th className="p-3 font-medium">Status</th>
                        <th className="p-3 font-medium">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {withdrawals?.map((withdrawal) => (
                        <tr key={withdrawal.id} className="border-b hover:bg-muted/50">
                          <td className="p-3 text-sm">{(withdrawal.profiles as any)?.email || '-'}</td>
                          <td className="p-3">₹{withdrawal.net_amount_inr.toLocaleString()}</td>
                          <td className="p-3">
                            <Badge variant="outline">{withdrawal.tier}</Badge>
                          </td>
                          <td className="p-3">
                            <Badge
                              variant={
                                withdrawal.status === 'completed'
                                  ? 'default'
                                  : withdrawal.status === 'failed'
                                  ? 'destructive'
                                  : 'secondary'
                              }
                            >
                              {withdrawal.status}
                            </Badge>
                          </td>
                          <td className="p-3 text-sm text-muted-foreground">
                            {dayjs(withdrawal.created_at).format('YYYY-MM-DD HH:mm')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="commissions">
          <Card>
            <CardHeader>
              <CardTitle>Commission Payouts</CardTitle>
            </CardHeader>
            <CardContent>
              {commissionsLoading ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b">
                      <tr className="text-left text-sm text-muted-foreground">
                        <th className="p-3 font-medium">Neurologist</th>
                        <th className="p-3 font-medium">SLA</th>
                        <th className="p-3 font-medium">Rate</th>
                        <th className="p-3 font-medium">Amount</th>
                        <th className="p-3 font-medium">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {commissions?.map((commission) => (
                        <tr key={commission.id} className="border-b hover:bg-muted/50">
                          <td className="p-3 text-sm">{(commission.profiles as any)?.email || '-'}</td>
                          <td className="p-3">
                            <Badge variant={commission.sla === 'STAT' ? 'destructive' : 'secondary'}>
                              {commission.sla}
                            </Badge>
                          </td>
                          <td className="p-3">{commission.commission_rate}%</td>
                          <td className="p-3 font-medium text-green-600">
                            ₹{commission.amount_inr.toLocaleString()}
                          </td>
                          <td className="p-3 text-sm text-muted-foreground">
                            {dayjs(commission.created_at).format('YYYY-MM-DD HH:mm')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
