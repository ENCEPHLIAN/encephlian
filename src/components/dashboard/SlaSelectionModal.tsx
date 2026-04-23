import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Clock, Zap, Coins, AlertCircle, CheckCircle2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface Study {
  id: string;
  meta: any;
}

interface SlaSelectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  study: Study | null;
  tokenBalance: number;
  onInsufficientTokens: () => void;
  /** When true, TAT selection skips confirmation (1-tap). STAT still confirms. */
  isPilot?: boolean;
}

type SlaType = "TAT" | "STAT";

// Trigger C-Plane processing (idempotent — safe to call even if already running)
function triggerCPlane(studyId: string) {
  const cplaneBase = (import.meta as any).env?.VITE_CPLANE_BASE as string | undefined;
  if (!cplaneBase) return;
  fetch(`${cplaneBase}/process`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ study_id: studyId }),
  }).catch((e) => console.warn("[SLA] C-Plane trigger failed:", e));
}

export default function SlaSelectionModal({
  open,
  onOpenChange,
  study,
  tokenBalance,
  onInsufficientTokens,
  isPilot = false,
}: SlaSelectionModalProps) {
  const [selectedSla, setSelectedSla] = useState<SlaType | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const queryClient = useQueryClient();

  const submitTriage = async (sla: SlaType) => {
    if (!study) return;
    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.rpc("select_sla_and_start_triage", {
        p_study_id: study.id,
        p_sla: sla,
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string; new_balance?: number; tokens_deducted?: number };

      if (!result.success) {
        if (result.error === "insufficient_tokens") {
          toast.error("Insufficient tokens. Please purchase more.");
          onInsufficientTokens();
          return;
        }
        throw new Error(result.error || "Failed to start triage");
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["wallet-balance"] }),
        queryClient.invalidateQueries({ queryKey: ["pilot-studies"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-studies"] }),
      ]);

      toast.success(
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          <span>Analysis started! {result.tokens_deducted} token(s) deducted.</span>
        </div>
      );

      // Ensure C-Plane is running (idempotent)
      triggerCPlane(study.id);
      handleClose();
    } catch (err: any) {
      console.error("SLA selection error:", err);
      toast.error(err.message || "Failed to start triage");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSelectSla = (sla: SlaType) => {
    const required = sla === "STAT" ? 2 : 1;
    if (tokenBalance < required) {
      onInsufficientTokens();
      return;
    }

    // Pilot mode: TAT (1 token) goes straight through, no confirmation
    if (isPilot && sla === "TAT") {
      submitTriage(sla);
      return;
    }

    setSelectedSla(sla);
    setIsConfirming(true);
  };

  const handleConfirm = () => {
    if (selectedSla) submitTriage(selectedSla);
  };

  const handleCancel = () => {
    setIsConfirming(false);
    setSelectedSla(null);
  };

  const handleClose = () => {
    onOpenChange(false);
    setIsConfirming(false);
    setSelectedSla(null);
  };

  const tokensRequired = selectedSla === "STAT" ? 2 : 1;
  const newBalance = tokenBalance - tokensRequired;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {isConfirming ? "Confirm Analysis" : "Start AI Analysis"}
          </DialogTitle>
          <DialogDescription>
            {isConfirming
              ? "Review your selection before starting"
              : "Choose turnaround for this EEG. Tokens are charged here only — review and sign does not deduct again."}
          </DialogDescription>
        </DialogHeader>

        {/* Token Balance */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
          <div className="flex items-center gap-2">
            <Coins className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Current Balance</span>
          </div>
          <Badge variant="secondary" className="text-base font-bold">
            {tokenBalance} tokens
          </Badge>
        </div>

        {!isConfirming ? (
          <div className="grid grid-cols-2 gap-4 mt-2">
            {/* TAT */}
            <Card
              className={`p-4 cursor-pointer transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 ${
                tokenBalance < 1 ? "opacity-50 pointer-events-none" : ""
              } ${isSubmitting ? "pointer-events-none opacity-70" : ""}`}
              onClick={() => handleSelectSla("TAT")}
            >
              <div className="flex flex-col items-center text-center space-y-3">
                <div className="p-3 rounded-full bg-gradient-to-br from-blue-500/20 to-cyan-500/20">
                  {isSubmitting && selectedSla === null ? (
                    <Loader2 className="h-6 w-6 text-blue-500 animate-spin" />
                  ) : (
                    <Clock className="h-6 w-6 text-blue-500" />
                  )}
                </div>
                <div>
                  <h3 className="font-semibold">Standard</h3>
                  <Badge variant="outline" className="mt-1">1 Token</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Report in 12–24 hours. Suitable for routine cases.
                </p>
              </div>
            </Card>

            {/* STAT */}
            <Card
              className={`p-4 cursor-pointer transition-all hover:border-destructive/50 hover:shadow-lg hover:shadow-destructive/5 ${
                tokenBalance < 2 ? "opacity-50 pointer-events-none" : ""
              } ${isSubmitting ? "pointer-events-none opacity-70" : ""}`}
              onClick={() => handleSelectSla("STAT")}
            >
              <div className="flex flex-col items-center text-center space-y-3">
                <div className="p-3 rounded-full bg-gradient-to-br from-red-500/20 to-orange-500/20">
                  <Zap className="h-6 w-6 text-red-500" />
                </div>
                <div>
                  <h3 className="font-semibold">Priority</h3>
                  <Badge variant="destructive" className="mt-1">2 Tokens</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Report in 30–90 minutes. For critical cases.
                </p>
              </div>
            </Card>
          </div>
        ) : (
          <div className="space-y-4 mt-2">
            <div className="p-4 rounded-lg border bg-muted/30">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Analysis Type</span>
                  <Badge variant={selectedSla === "STAT" ? "destructive" : "default"}>
                    {selectedSla === "STAT" ? "Priority (STAT)" : "Standard (TAT)"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Tokens to Deduct</span>
                  <span className="font-semibold">{tokensRequired}</span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t">
                  <span className="text-sm text-muted-foreground">Balance After</span>
                  <span className="font-semibold">{newBalance} tokens</span>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <AlertCircle className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                If the report quality is not acceptable, you can request a refund within 48 hours.
              </p>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={handleCancel} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button
                className="flex-1 btn-gradient-analysis rounded-full"
                onClick={handleConfirm}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Begin Analysis
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
