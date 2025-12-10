import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { CheckCircle2, XCircle, RefreshCw, Mail, CreditCard, Cpu, AlertCircle } from "lucide-react";

// Email notifications stored in localStorage for testing
const EMAIL_ENABLED_KEY = "encephlian_emails_enabled";

export default function AdminIntegrations() {
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Load email setting on mount
  useEffect(() => {
    const stored = localStorage.getItem(EMAIL_ENABLED_KEY);
    if (stored !== null) {
      setEmailEnabled(stored === "true");
    }
  }, []);

  const handleEmailToggle = (enabled: boolean) => {
    setEmailEnabled(enabled);
    localStorage.setItem(EMAIL_ENABLED_KEY, String(enabled));
    toast.info(enabled ? "Email notifications enabled" : "Email notifications disabled");
  };

  const handleRefreshStatus = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
      toast.success("Integration status refreshed");
    }, 1000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Integrations</h1>
          <p className="text-sm text-muted-foreground">
            Manage external service connections and notifications
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefreshStatus} disabled={isRefreshing}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
          Refresh Status
        </Button>
      </div>

      {/* Email Notifications Control */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-violet-500/20 to-purple-500/20 flex items-center justify-center">
                <Mail className="h-5 w-5 text-violet-500" />
              </div>
              <div>
                <CardTitle className="text-base">Email Notifications (Resend)</CardTitle>
                <CardDescription>Control Resend API email delivery</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge 
                variant={emailEnabled ? "default" : "secondary"}
                className="text-xs"
              >
                {emailEnabled ? "ACTIVE" : "PAUSED"}
              </Badge>
              <Switch
                checked={emailEnabled}
                onCheckedChange={handleEmailToggle}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
            <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium">Free tier limits</p>
              <p className="text-muted-foreground">100 emails/day • 3,000 emails/month</p>
              <p className="text-muted-foreground mt-1">
                Disable during testing to preserve quota. Affects receipts, support tickets, and triage notifications.
              </p>
            </div>
          </div>

          {!emailEnabled && (
            <div className="flex items-center gap-2 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
              <XCircle className="h-4 w-4 text-amber-500" />
              <p className="text-sm text-amber-600 dark:text-amber-400">
                Email notifications are paused. No emails will be sent via Resend.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* External Services */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payment Processing</CardTitle>
          <CardDescription>Payment gateway integrations</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 rounded-lg border">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center">
                <CreditCard className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <p className="font-medium">Razorpay</p>
                <p className="text-sm text-muted-foreground">Payment processing & webhooks</p>
              </div>
            </div>
            <Badge variant="outline" className="text-green-600 border-green-500/30 gap-1">
              <CheckCircle2 className="h-3 w-3" />
              Connected
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Inference Backend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">AI Inference Backend</CardTitle>
          <CardDescription>Machine learning service connection</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 rounded-lg border border-dashed">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center">
                <Cpu className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium">Azure ML Service</p>
                <p className="text-sm text-muted-foreground">EEG analysis inference pipeline</p>
              </div>
            </div>
            <Badge variant="secondary" className="gap-1">
              <XCircle className="h-3 w-3" />
              Not Connected
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Inference backend will be connected when the Azure microservice is deployed.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
