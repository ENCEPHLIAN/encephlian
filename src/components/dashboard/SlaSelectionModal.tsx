import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Clock, Zap, Coins, AlertCircle, CheckCircle2, Sparkles } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { selectSlaAndStartPipeline } from "@/lib/triagePipeline";

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

  useEffect(() => {
    if (!open) {
      setIsConfirming(false);
      setSelectedSla(null);
      setIsSubmitting(false);
    }
  }, [open]);

  const submitTriage = async (sla: SlaType) => {
    if (!study) return;
    setIsSubmitting(true);
    try {
      const result = await selectSlaAndStartPipeline(study.id, sla);

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
        queryClient.invalidateQueries({ queryKey: ["study-detail", study.id] }),
        queryClient.invalidateQueries({ queryKey: ["study", study.id] }),
      ]);

      toast.success(
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          <span>Analysis started! {result.tokens_deducted} token(s) deducted.</span>
        </div>
      );

      onOpenChange(false);
      setIsConfirming(false);
      setSelectedSla(null);
    } catch (err: unknown) {
      console.error("SLA selection error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to start triage");
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

    if (isPilot && sla === "TAT") {
      void submitTriage(sla);
      return;
    }

    setSelectedSla(sla);
    setIsConfirming(true);
  };

  const handleConfirm = () => {
    if (selectedSla) void submitTriage(selectedSla);
  };

  const handleCancel = () => {
    setIsConfirming(false);
    setSelectedSla(null);
  };

  const tokensRequired = selectedSla === "STAT" ? 2 : 1;
  const newBalance = tokenBalance - tokensRequired;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg z-[100]">
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
