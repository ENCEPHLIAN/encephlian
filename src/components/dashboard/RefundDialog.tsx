import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface Study {
  id: string;
  meta: any;
  tokens_deducted?: number;
}

interface RefundDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  study: Study | null;
}

export default function RefundDialog({ open, onOpenChange, study }: RefundDialogProps) {
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const queryClient = useQueryClient();

  const handleSubmit = async () => {
    if (!study) return;

    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.rpc("request_token_refund", {
        p_study_id: study.id,
        p_reason: reason || null,
      });

      if (error) throw error;

      const result = data as { success: boolean; tokens_refunded?: number; new_balance?: number };

      if (!result.success) {
        throw new Error("Failed to process refund");
      }

      // Invalidate queries
      await queryClient.invalidateQueries({ queryKey: ["wallet-balance"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard-studies"] });
      await queryClient.invalidateQueries({ queryKey: ["recent-reports"] });

      toast.success(
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          <span>{result.tokens_refunded} token(s) refunded. New balance: {result.new_balance}</span>
        </div>
      );

      onOpenChange(false);
      setReason("");
    } catch (err: any) {
      console.error("Refund error:", err);
      toast.error(err.message || "Failed to process refund");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    setReason("");
  };

  const meta = (study?.meta || {}) as Record<string, any>;
  const patientId = meta.patient_id || meta.patientId || (study ? `ID-${study.id.slice(0, 6).toUpperCase()}` : "");

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Request Token Refund</DialogTitle>
          <DialogDescription>
            Request a refund for study {patientId}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground">
              If the triage report quality is not acceptable or the analysis is inaccurate, 
              you can request a refund for the {study?.tokens_deducted || 0} token(s) used.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Reason (optional)</Label>
            <Textarea
              id="reason"
              placeholder="Describe the issue with the report..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={handleClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                "Confirm Refund"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
