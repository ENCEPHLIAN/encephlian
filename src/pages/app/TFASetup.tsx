import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Shield, ArrowLeft } from "lucide-react";
import * as OTPAuth from "otpauth";

export default function TFASetup() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [secret, setSecret] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [step, setStep] = useState<"generate" | "verify">("generate");

  const generateSecret = async () => {
    setLoading(true);
    try {
      const totp = new OTPAuth.TOTP({
        issuer: "ENCEPHLIAN",
        label: "Clinician",
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(OTPAuth.Secret.generate(20, true)),
      });
      
      setSecret(totp.secret.base32);
      setStep("verify");
    } catch (error: any) {
      toast.error("Failed to generate secret");
    } finally {
      setLoading(false);
    }
  };

  const verifyAndEnable = async () => {
    if (!otpCode || otpCode.length !== 6) {
      toast.error("Please enter a 6-digit code");
      return;
    }

    setLoading(true);
    try {
      const totp = new OTPAuth.TOTP({
        issuer: "ENCEPHLIAN",
        label: "Clinician",
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(secret),
      });

      const isValid = totp.validate({ token: otpCode, window: 1 }) !== null;
      
      if (!isValid) {
        toast.error("Invalid code. Please try again.");
        setLoading(false);
        return;
      }

      const { error } = await supabase.rpc("admin_setup_tfa", { p_secret: secret });
      if (error) throw error;

      toast.success("Two-factor authentication enabled!");
      navigate("/app/settings");
    } catch (error: any) {
      toast.error(error.message || "Failed to enable TFA");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-md mx-auto space-y-6">
        <Button variant="ghost" onClick={() => navigate("/app/settings")} className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Settings
        </Button>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <CardTitle>Enable Two-Factor Authentication</CardTitle>
            </div>
            <CardDescription>
              Add an extra layer of security to your account
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {step === "generate" ? (
              <Button onClick={generateSecret} disabled={loading} className="w-full">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Generate Secret Key
              </Button>
            ) : (
              <div className="space-y-4">
                <div className="p-4 bg-muted rounded-lg">
                  <Label className="text-xs text-muted-foreground">Secret Key</Label>
                  <p className="font-mono text-sm break-all mt-1">{secret}</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Add this key to your authenticator app (Google Authenticator, Authy, etc.)
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label>Verification Code</Label>
                  <Input
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="Enter 6-digit code"
                    maxLength={6}
                  />
                </div>

                <Button onClick={verifyAndEnable} disabled={loading} className="w-full">
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Verify & Enable
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
