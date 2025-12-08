import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, Loader2, QrCode, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import * as OTPAuth from "otpauth";

const TFA_SESSION_KEY = "encephlian_admin_tfa";
const TFA_TIMESTAMP_KEY = "encephlian_admin_tfa_time";
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

interface AdminTFAGateProps {
  onVerified: () => void;
  onLogout: () => void;
}

export default function AdminTFAGate({ onVerified, onLogout }: AdminTFAGateProps) {
  const [code, setCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [error, setError] = useState("");
  const [tfaStatus, setTfaStatus] = useState<{ is_enabled: boolean; needs_setup: boolean } | null>(null);
  const [setupSecret, setSetupSecret] = useState<string | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);

  // Check TFA status on mount
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setUserEmail(user.email || "");
        }

        const { data, error } = await supabase.rpc("check_tfa_status");
        if (error) throw error;
        
        const status = data as { is_enabled: boolean; needs_setup: boolean };
        setTfaStatus(status);
        
        if (status.needs_setup) {
          // Generate new secret for setup
          await generateNewSecret();
        }
      } catch (err) {
        console.error("Error checking TFA status:", err);
        // Default to setup mode if check fails
        setTfaStatus({ is_enabled: false, needs_setup: true });
        await generateNewSecret();
      } finally {
        setIsLoading(false);
      }
    };
    
    checkStatus();
  }, []);

  const generateNewSecret = async () => {
    try {
      const secret = new OTPAuth.Secret({ size: 20 });
      const secretBase32 = secret.base32;
      
      const totp = new OTPAuth.TOTP({
        issuer: "ENCEPHLIAN",
        label: userEmail || "Admin",
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret: secret,
      });
      
      setSetupSecret(secretBase32);
      setQrCodeUrl(totp.toString());
    } catch (err) {
      console.error("Error generating secret:", err);
    }
  };

  // Regenerate QR when email is available
  useEffect(() => {
    if (userEmail && setupSecret && tfaStatus?.needs_setup) {
      const secret = OTPAuth.Secret.fromBase32(setupSecret);
      const totp = new OTPAuth.TOTP({
        issuer: "ENCEPHLIAN",
        label: userEmail,
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret: secret,
      });
      setQrCodeUrl(totp.toString());
    }
  }, [userEmail, setupSecret, tfaStatus?.needs_setup]);

  const handleSetup = async () => {
    if (!setupSecret || code.length !== 6) return;
    
    setIsSettingUp(true);
    setError("");
    
    try {
      // Verify the code first
      const secret = OTPAuth.Secret.fromBase32(setupSecret);
      const totp = new OTPAuth.TOTP({
        issuer: "ENCEPHLIAN",
        label: userEmail,
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret: secret,
      });
      
      const delta = totp.validate({ token: code, window: 1 });
      
      if (delta === null) {
        setError("Invalid code. Please try again.");
        setIsSettingUp(false);
        return;
      }
      
      // Save secret to database
      const { error: setupError } = await supabase.rpc("admin_setup_tfa", {
        p_secret: setupSecret,
      });
      
      if (setupError) throw setupError;
      
      // Mark as verified
      const { error: verifyError } = await supabase.rpc("admin_verify_tfa");
      
      if (verifyError) throw verifyError;
      
      // Set session
      sessionStorage.setItem(TFA_SESSION_KEY, "verified");
      sessionStorage.setItem(TFA_TIMESTAMP_KEY, Date.now().toString());
      
      toast.success("TFA enabled successfully");
      onVerified();
    } catch (err: any) {
      console.error("TFA setup error:", err);
      setError(err.message || "Setup failed");
    } finally {
      setIsSettingUp(false);
    }
  };

  const handleVerify = async () => {
    if (code.length !== 6) return;
    
    setIsVerifying(true);
    setError("");

    try {
      // Get the stored secret
      const { data: secret, error: secretError } = await supabase.rpc("get_tfa_secret");
      
      if (secretError || !secret) {
        throw new Error("TFA not configured");
      }
      
      // Verify the code
      const secretObj = OTPAuth.Secret.fromBase32(secret);
      const totp = new OTPAuth.TOTP({
        issuer: "ENCEPHLIAN",
        label: userEmail,
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret: secretObj,
      });
      
      const delta = totp.validate({ token: code, window: 1 });
      
      if (delta === null) {
        setError("Invalid code. Please try again.");
        setIsVerifying(false);
        return;
      }
      
      // Set session
      sessionStorage.setItem(TFA_SESSION_KEY, "verified");
      sessionStorage.setItem(TFA_TIMESTAMP_KEY, Date.now().toString());
      
      toast.success("Access granted");
      onVerified();
    } catch (err: any) {
      console.error("TFA verify error:", err);
      setError(err.message || "Verification failed");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && code.length === 6) {
      if (tfaStatus?.needs_setup) {
        handleSetup();
      } else {
        handleVerify();
      }
    }
  };

  if (isLoading) {
    return (
      <Dialog open onOpenChange={() => {}}>
        <DialogContent className="max-w-sm" onPointerDownOutside={(e) => e.preventDefault()}>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Setup mode
  if (tfaStatus?.needs_setup) {
    return (
      <Dialog open onOpenChange={() => {}}>
        <DialogContent className="max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <div className="flex items-center gap-2 mb-2">
              <Shield className="h-5 w-5 text-primary" />
              <DialogTitle className="font-mono">Setup Two-Factor Authentication</DialogTitle>
            </div>
            <DialogDescription>
              Admin access requires TFA. Scan the QR code with your authenticator app.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            {qrCodeUrl && (
              <div className="flex flex-col items-center gap-4">
                <div className="bg-white p-4 rounded-lg">
                  <img 
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrCodeUrl)}`}
                    alt="QR Code"
                    className="w-48 h-48"
                  />
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground mb-1">Manual entry code:</p>
                  <code className="text-xs bg-muted px-2 py-1 rounded font-mono select-all">
                    {setupSecret}
                  </code>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label>Enter code from authenticator</Label>
              <Input
                type="text"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                onKeyDown={handleKeyDown}
                placeholder="000000"
                className="font-mono text-center text-lg tracking-widest"
                autoFocus
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={onLogout}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleSetup}
                disabled={code.length !== 6 || isSettingUp}
              >
                {isSettingUp && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <CheckCircle className="h-4 w-4 mr-2" />
                Enable TFA
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Verification mode
  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent className="max-w-sm" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <Shield className="h-5 w-5 text-primary" />
            <DialogTitle className="font-mono">Admin Access Verification</DialogTitle>
          </div>
          <DialogDescription>
            Enter your 6-digit code from your authenticator app.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label>Authentication Code</Label>
            <Input
              type="text"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              onKeyDown={handleKeyDown}
              placeholder="000000"
              className="font-mono text-center text-lg tracking-widest"
              autoFocus
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onLogout}>
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={handleVerify}
              disabled={code.length !== 6 || isVerifying}
            >
              {isVerifying && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Verify
            </Button>
          </div>
          <p className="text-xs text-muted-foreground text-center">
            Session expires after 30 minutes of inactivity
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Hook to check TFA status and handle idle timeout
export function useAdminTFA() {
  const [isVerified, setIsVerified] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(true);

  const checkTFAStatus = useCallback(() => {
    const tfaStatus = sessionStorage.getItem(TFA_SESSION_KEY);
    const tfaTime = sessionStorage.getItem(TFA_TIMESTAMP_KEY);

    if (tfaStatus === "verified" && tfaTime) {
      const elapsed = Date.now() - parseInt(tfaTime, 10);
      if (elapsed < IDLE_TIMEOUT_MS) {
        setIsVerified(true);
        setNeedsVerification(false);
        return true;
      }
    }
    
    // Clear expired session
    sessionStorage.removeItem(TFA_SESSION_KEY);
    sessionStorage.removeItem(TFA_TIMESTAMP_KEY);
    setIsVerified(false);
    setNeedsVerification(true);
    return false;
  }, []);

  const refreshActivity = useCallback(() => {
    if (sessionStorage.getItem(TFA_SESSION_KEY) === "verified") {
      sessionStorage.setItem(TFA_TIMESTAMP_KEY, Date.now().toString());
    }
  }, []);

  const clearTFA = useCallback(() => {
    sessionStorage.removeItem(TFA_SESSION_KEY);
    sessionStorage.removeItem(TFA_TIMESTAMP_KEY);
    setIsVerified(false);
    setNeedsVerification(true);
  }, []);

  const verify = useCallback(() => {
    setIsVerified(true);
    setNeedsVerification(false);
  }, []);

  // Check on mount and set up activity listeners
  useEffect(() => {
    checkTFAStatus();

    // Set up idle timeout check
    const intervalId = setInterval(() => {
      const tfaTime = sessionStorage.getItem(TFA_TIMESTAMP_KEY);
      if (tfaTime) {
        const elapsed = Date.now() - parseInt(tfaTime, 10);
        if (elapsed >= IDLE_TIMEOUT_MS) {
          clearTFA();
        }
      }
    }, 60000); // Check every minute

    // Refresh activity on user interaction
    const handleActivity = () => refreshActivity();
    window.addEventListener("click", handleActivity);
    window.addEventListener("keydown", handleActivity);
    window.addEventListener("mousemove", handleActivity);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener("click", handleActivity);
      window.removeEventListener("keydown", handleActivity);
      window.removeEventListener("mousemove", handleActivity);
    };
  }, [checkTFAStatus, clearTFA, refreshActivity]);

  return { isVerified, needsVerification, verify, clearTFA, checkTFAStatus };
}
