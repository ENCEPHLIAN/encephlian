import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Clock, Zap } from "lucide-react";
import { toast } from "sonner";
import type { PilotStudy } from "@/hooks/usePilotData";
import { selectSlaAndStartPipeline } from "@/lib/analysisPipeline";

type Props = {
  study: PilotStudy;
  tokenBalance: number;
  onNeedTokens: () => void;
  /** Called after successful SLA + pipeline kick */
  onStarted?: () => void;
  compact?: boolean;
};

export function PilotInlineSla({ study, tokenBalance, onNeedTokens, onStarted, compact }: Props) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<"TAT" | "STAT" | null>(null);
  const [statOpen, setStatOpen] = useState(false);

  const run = async (sla: "TAT" | "STAT") => {
    const need = sla === "STAT" ? 2 : 1;
    if (tokenBalance < need) {
      onNeedTokens();
      return;
    }
    setBusy(sla);
    try {
      const result = await selectSlaAndStartPipeline(study.id, sla);
      if (!result.success) {
        if (result.error === "insufficient_tokens") {
          onNeedTokens();
          return;
        }
        throw new Error(result.error || "Could not start triage");
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["pilot-studies"] }),
        queryClient.invalidateQueries({ queryKey: ["wallet-balance"] }),
        queryClient.invalidateQueries({ queryKey: ["study-detail", study.id] }),
        queryClient.invalidateQueries({ queryKey: ["study", study.id] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-studies"] }),
      ]);
      toast.success(sla === "STAT" ? "Priority triage started" : "Standard triage started", {
        description: `${result.tokens_deducted ?? need} token(s) used · analysis is running`,
      });
      onStarted?.();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to start triage";
      toast.error(msg);
    } finally {
      setBusy(null);
      setStatOpen(false);
    }
  };

  const gap = compact ? "gap-1.5" : "gap-2";

  return (
    <>
      <div className={`flex flex-wrap items-center justify-end ${gap}`}>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="rounded-full h-8 px-3 gap-1"
          disabled={!!busy || tokenBalance < 1}
          onClick={() => void run("TAT")}
        >
          {busy === "TAT" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clock className="h-3.5 w-3.5" />}
          Standard · 1
        </Button>
        <Button
          type="button"
          size="sm"
          className="rounded-full h-8 px-3 gap-1 bg-amber-600 hover:bg-amber-600/90 text-white"
          disabled={!!busy || tokenBalance < 2}
          onClick={() => setStatOpen(true)}
        >
          <Zap className="h-3.5 w-3.5" />
          Priority · 2
        </Button>
      </div>

      <AlertDialog open={statOpen} onOpenChange={setStatOpen}>
        <AlertDialogContent className="sm:max-w-md z-[110]">
          <AlertDialogHeader>
            <AlertDialogTitle>Start priority triage?</AlertDialogTitle>
            <AlertDialogDescription>
              This uses <strong>2 tokens</strong> for faster turnaround. Billing applies now; analysis begins
              immediately after you confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void run("STAT");
              }}
              disabled={!!busy}
            >
              {busy === "STAT" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm & start"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
