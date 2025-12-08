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
import { Shield, Loader2 } from "lucide-react";
import { toast } from "sonner";

const TFA_SESSION_KEY = "encephlian_admin_tfa";
const TFA_TIMESTAMP_KEY = "encephlian_admin_tfa_time";
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const TFA_CODE = "742156"; // Temporary static code for MVP

interface AdminTFAGateProps {
  onVerified: () => void;
  onLogout: () => void;
}

export default function AdminTFAGate({ onVerified, onLogout }: AdminTFAGateProps) {
  const [code, setCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState("");

  const handleVerify = async () => {
    setIsVerifying(true);
    setError("");

    // Simulate verification delay
    await new Promise((r) => setTimeout(r, 500));

    if (code === TFA_CODE) {
      sessionStorage.setItem(TFA_SESSION_KEY, "verified");
      sessionStorage.setItem(TFA_TIMESTAMP_KEY, Date.now().toString());
      toast.success("Access granted");
      onVerified();
    } else {
      setError("Invalid code. Please try again.");
    }
    setIsVerifying(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && code.length === 6) {
      handleVerify();
    }
  };

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent className="max-w-sm" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <Shield className="h-5 w-5 text-primary" />
            <DialogTitle className="font-mono">Admin Access Verification</DialogTitle>
          </div>
          <DialogDescription>
            Enter your 6-digit security code to access the Operations Control panel.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label>Security Code</Label>
            <Input
              type="text"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              onKeyDown={handleKeyDown}
              placeholder="••••••"
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
