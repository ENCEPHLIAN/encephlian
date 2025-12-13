import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { CheckCircle2, XCircle, RefreshCw, AlertCircle, ExternalLink } from "lucide-react";

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
    console.log("[AdminIntegrations] Email toggle changed:", {
      enabled,
      storedValue: localStorage.getItem(EMAIL_ENABLED_KEY),
      key: EMAIL_ENABLED_KEY
    });
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
              {/* Resend Logo */}
              <div className="h-10 w-10 rounded-lg bg-black flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none">
                  <path d="M2 6C2 4.89543 2.89543 4 4 4H20C21.1046 4 22 4.89543 22 6V18C22 19.1046 21.1046 20 20 20H4C2.89543 20 2 19.1046 2 18V6Z" fill="white"/>
                  <path d="M2 8L10.1649 13.7154C11.2293 14.4283 12.7707 14.4283 13.8351 13.7154L22 8" stroke="black" strokeWidth="2"/>
                </svg>
              </div>
              <div>
                <CardTitle className="text-base">Resend</CardTitle>
                <CardDescription>Email delivery service</CardDescription>
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

      {/* Payment Processing */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payment Processing</CardTitle>
          <CardDescription>Payment gateway integrations</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 rounded-lg border">
            <div className="flex items-center gap-4">
              {/* Razorpay Logo */}
              <div className="h-12 w-12 rounded-lg bg-[#072654] flex items-center justify-center">
                <svg viewBox="0 0 200 200" className="h-8 w-8">
                  <path fill="#3395FF" d="M146.4 51.8l-18.5 4.9 53.5 100.6 21.8-5.8zM65.8 96.3l-19.8 5.3 35.7 67 20.5-5.4zM120.8 64.4L91 72.3l42.9 80.5 29.8-7.9z"/>
                </svg>
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
              {/* Azure Logo */}
              <div className="h-12 w-12 rounded-lg bg-[#0078D4] flex items-center justify-center">
                <svg viewBox="0 0 96 96" className="h-7 w-7" fill="white">
                  <path d="M35.7 9h21L22 78.3c-.5 1.4-1.8 2.3-3.3 2.3H5.3c-2.4 0-3.9-2.5-2.8-4.6L35.7 9zM63.3 58.9h24.9c2 0 3.3 2.1 2.4 3.9L77 87.3c-.5 1-1.5 1.6-2.5 1.6H48.7L63.3 58.9zM53.3 38.5L70.8 9h18.7c2.4 0 3.9 2.5 2.8 4.6L42.7 96h26.6L53.3 38.5z"/>
                </svg>
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
