import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Shield, ArrowLeft, Copy, Check } from "lucide-react";
import * as OTPAuth from "otpauth";

export default function TFASetup() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [secret, setSecret] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [step, setStep] = useState<"generate" | "verify">("generate");
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) {
        setUserEmail(user.email);
      }
    };
    fetchUser();
  }, []);

  const generateSecret = async () => {
    setLoading(true);
    try {
      // Generate a random 20-byte secret
      const randomBytes = new Uint8Array(20);
      crypto.getRandomValues(randomBytes);
      const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
      let base32Secret = '';
      for (let i = 0; i < randomBytes.length; i++) {
        base32Secret += base32Chars[randomBytes[i] % 32];
      }
      
      setSecret(base32Secret);
      
      // Generate QR code URL using Google Charts API
      const totp = new OTPAuth.TOTP({
        issuer: "ENCEPHLIAN",
        label: userEmail || "Clinician",
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(base32Secret),
      });
      
      const otpauthUri = totp.toString();
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauthUri)}`;
      setQrCodeUrl(qrUrl);
      
      setStep("verify");
    } catch (error: any) {
      toast.error("Failed to generate secret");
    } finally {
      setLoading(false);
    }
  };

  const copySecret = () => {
    navigator.clipboard.writeText(secret);
    setCopied(true);
    toast.success("Secret copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
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
        label: userEmail || "Clinician",
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
                Generate QR Code
              </Button>
            ) : (
              <div className="space-y-6">
                {/* QR Code */}
                <div className="flex flex-col items-center space-y-4">
                  <div className="p-4 bg-white rounded-lg shadow-sm">
                    {qrCodeUrl ? (
                      <img 
                        src={qrCodeUrl} 
                        alt="TFA QR Code" 
                        className="w-48 h-48"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="w-48 h-48 flex items-center justify-center bg-muted rounded">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground text-center">
                    Scan this QR code with your authenticator app
                  </p>
                </div>
                
                {/* Manual Entry Secret */}
                <div className="p-4 bg-muted rounded-lg space-y-2">
                  <Label className="text-xs text-muted-foreground">Or enter this key manually:</Label>
                  <div className="flex items-center gap-2">
                    <code className="font-mono text-xs break-all flex-1 bg-background p-2 rounded border">
                      {secret}
                    </code>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={copySecret}
                      className="shrink-0 h-8 w-8"
                    >
                      {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                    </Button>
                  </div>
                </div>
                
                {/* Verification */}
                <div className="space-y-2">
                  <Label>Verification Code</Label>
                  <Input
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="Enter 6-digit code from your app"
                    maxLength={6}
                    className="text-center text-lg tracking-widest"
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
