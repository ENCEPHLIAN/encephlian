import { CheckCircle2, AlertCircle, Info } from "lucide-react";
import type { ReportSummary } from "@/shared/mindReportV2";
import { cn } from "@/lib/utils";

export interface ThreeCounterStripProps {
  summary: ReportSummary;
  className?: string;
  size?: "sm" | "md";
}

/**
 * Asserted | Pending | Limitations — the card-level honesty strip (paper §9,
 * distillation §4 Shift 3). Counts come straight from MindReportV2.summary.
 */
export function ThreeCounterStrip({ summary, className, size = "md" }: ThreeCounterStripProps) {
  const isSm   = size === "sm";
  const iconCls = isSm ? "h-3 w-3"   : "h-3.5 w-3.5";
  const numCls  = isSm ? "text-xs"   : "text-sm";
  const labelCls = isSm ? "text-[9px]" : "text-[10px]";

  return (
    <div className={cn("flex items-center gap-3", className)} role="group" aria-label="Findings summary">
      <div
        className="flex items-center gap-1.5"
        title={`${summary.asserted_count} findings asserted with provenance`}
      >
        <CheckCircle2 className={cn(iconCls, "text-emerald-500")} />
        <span className={cn("font-mono font-semibold", numCls)}>{summary.asserted_count}</span>
        <span className={cn("text-muted-foreground", labelCls)}>asserted</span>
      </div>
      <div
        className="flex items-center gap-1.5"
        title={`${summary.pending_count} findings the system refused to assert (required inputs unavailable)`}
      >
        <AlertCircle className={cn(iconCls, "text-amber-500")} />
        <span className={cn("font-mono font-semibold", numCls)}>{summary.pending_count}</span>
        <span className={cn("text-muted-foreground", labelCls)}>pending</span>
      </div>
      <div
        className="flex items-center gap-1.5"
        title={`${summary.limitations_count} system limitations cited for this study`}
      >
        <Info className={cn(iconCls, "text-blue-500")} />
        <span className={cn("font-mono font-semibold", numCls)}>{summary.limitations_count}</span>
        <span className={cn("text-muted-foreground", labelCls)}>limitations</span>
      </div>
    </div>
  );
}
