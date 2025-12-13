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
}

type SlaType = "TAT" | "STAT";

// Simulates triage progress updates in the database
async function simulateTriageProgress(studyId: string) {
  const stages = [
    { progress: 10, status: "queueing" },
    { progress: 25, status: "artifact_cleanup" },
    { progress: 50, status: "artifact_cleanup" },
    { progress: 70, status: "triage_model" },
    { progress: 85, status: "generating_report" },
    { progress: 95, status: "generating_report" },
    { progress: 100, status: "completed" },
  ];

  for (const stage of stages) {
    await new Promise((resolve) => setTimeout(resolve, 1500 + Math.random() * 1000));
    
    const updateData: Record<string, any> = {
      triage_progress: stage.progress,
    };
    
    if (stage.status === "completed") {
      updateData.triage_status = "completed";
      updateData.triage_completed_at = new Date().toISOString();
      updateData.state = "completed";
    }

    await supabase
      .from("studies")
      .update(updateData)
      .eq("id", studyId);
  }
  
  // Send triage completion notification (check localStorage for email toggle)
  try {
    const emailEnabled = localStorage.getItem("encephlian_emails_enabled") !== "false";
    await supabase.functions.invoke("send_triage_notification", {
      body: { study_id: studyId, email_enabled: emailEnabled },
    });
  } catch (err) {
    console.error("Failed to send triage notification:", err);
  }
}

export default function SlaSelectionModal({
  open,
  onOpenChange,
  study,
  tokenBalance,
  onInsufficientTokens,
}: SlaSelectionModalProps) {
  const [selectedSla, setSelectedSla] = useState<SlaType | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const queryClient = useQueryClient();

  const handleSelectSla = (sla: SlaType) => {
    const required = sla === "STAT" ? 2 : 1;
    if (tokenBalance < required) {
      onInsufficientTokens();
      return;
    }
    setSelectedSla(sla);
    setIsConfirming(true);
  };

  const handleConfirm = async () => {
    if (!study || !selectedSla) return;

    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.rpc("select_sla_and_start_triage", {
        p_study_id: study.id,
        p_sla: selectedSla,
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

      // Invalidate queries to refresh data
      await queryClient.invalidateQueries({ queryKey: ["wallet-balance"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard-studies"] });
      await queryClient.invalidateQueries({ queryKey: ["pending-triage-studies"] });
      await queryClient.invalidateQueries({ queryKey: ["processing-studies"] });

      toast.success(
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          <span>Analysis started! {result.tokens_deducted} token(s) deducted.</span>
        </div>
      );

      onOpenChange(false);
      setSelectedSla(null);
      setIsConfirming(false);

      // Start background triage simulation
      simulateTriageProgress(study.id).catch(console.error);

    } catch (err: any) {
      console.error("SLA selection error:", err);
      toast.error(err.message || "Failed to start triage");
    } finally {
      setIsSubmitting(false);
    }
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
              : "Choose the turnaround time for this EEG analysis"}
          </DialogDescription>
        </DialogHeader>

        {/* Token Balance Display */}
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
          /* SLA Options */
          <div className="grid grid-cols-2 gap-4 mt-2">
            {/* TAT Option */}
            <Card
              className={`p-4 cursor-pointer transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 ${
                tokenBalance < 1 ? "opacity-50 pointer-events-none" : ""
              }`}
              onClick={() => handleSelectSla("TAT")}
            >
              <div className="flex flex-col items-center text-center space-y-3">
                <div className="p-3 rounded-full bg-gradient-to-br from-blue-500/20 to-cyan-500/20">
                  <Clock className="h-6 w-6 text-blue-500" />
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

            {/* STAT Option */}
            <Card
              className={`p-4 cursor-pointer transition-all hover:border-destructive/50 hover:shadow-lg hover:shadow-destructive/5 ${
                tokenBalance < 2 ? "opacity-50 pointer-events-none" : ""
              }`}
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
          /* Confirmation View */
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
