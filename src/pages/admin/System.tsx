import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity } from "lucide-react";

export default function AdminSystem() {
  const edgeFunctions = [
    { name: 'create_order', status: 'healthy' },
    { name: 'verify_payment', status: 'healthy' },
    { name: 'parse_eeg_study', status: 'healthy' },
    { name: 'initiate_withdrawal', status: 'healthy' },
    { name: 'razorpay_webhook', status: 'healthy' },
    { name: 'razorpay_payout_webhook', status: 'healthy' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold logo-text">System</h1>
        <p className="text-muted-foreground mt-1">Monitor system health and performance</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Edge Functions Health
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {edgeFunctions.map((func) => (
              <div key={func.name} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                <span className="font-mono text-sm">{func.name}</span>
                <Badge variant="default">
                  {func.status}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
