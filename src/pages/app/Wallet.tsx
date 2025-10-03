import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Wallet as WalletIcon } from "lucide-react";

export default function Wallet() {
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

  const totalCredits = wallet?.credits || 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold">Credits Wallet</h1>
        <p className="text-muted-foreground">Manage your report credits</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Total Credits</CardTitle>
          <WalletIcon className="h-6 w-6 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-4xl font-bold">{totalCredits}</div>
          <p className="text-sm text-muted-foreground mt-2">
            Available across all clinics
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Button size="lg" className="h-24 flex flex-col">
          <Plus className="h-6 w-6 mb-2" />
          <span>Buy 10 Credits</span>
          <span className="text-sm opacity-80">₹500</span>
        </Button>
        <Button size="lg" className="h-24 flex flex-col">
          <Plus className="h-6 w-6 mb-2" />
          <span>Buy 50 Credits</span>
          <span className="text-sm opacity-80">₹2,000</span>
        </Button>
        <Button size="lg" className="h-24 flex flex-col">
          <Plus className="h-6 w-6 mb-2" />
          <span>Buy 100 Credits</span>
          <span className="text-sm opacity-80">₹3,500</span>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Wallet Info</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
              <div>
                <p className="font-medium">Your Credits</p>
                <p className="text-sm text-muted-foreground">Available balance</p>
              </div>
              <div className="text-2xl font-bold">{totalCredits}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
