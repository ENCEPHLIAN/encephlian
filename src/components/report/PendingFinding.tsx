import { AlertCircle } from "lucide-react";
import type { FieldProposal } from "@/shared/mindReportV2";
import { cn } from "@/lib/utils";

export interface PendingFindingProps {
  label: string;
  field: FieldProposal<unknown>;
  className?: string;
}

/**
 * First-class display for `derived_from: "pending"` fields. Pending is a
 * deliberate refusal-to-assert — paper §9. Layout: field name + reason +
 * which channels or markers were missing.
 */
export function PendingFinding({ label, field, className }: PendingFindingProps) {
  const p = field.provenance;
  const missing = [
    ...(p.missing_channels ?? []).map((c) => `ch ${c}`),
    ...(p.missing_markers ?? []).map((m) => m),
  ];
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-2 text-xs",
        className,
      )}
      role="status"
      data-field-id={field.field_id}
    >
      <AlertCircle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">{label}</span>
          <span className="text-[9px] uppercase tracking-wide font-semibold text-amber-700 dark:text-amber-300">
            pending
          </span>
        </div>
        {p.pending_reason && (
          <p className="text-muted-foreground text-[11px] mt-0.5 leading-snug">
            {p.pending_reason}
          </p>
        )}
        {missing.length > 0 && (
          <p className="text-[10px] text-amber-700/80 dark:text-amber-300/80 mt-1 font-mono">
            Missing: {missing.join(", ")}
          </p>
        )}
      </div>
    </div>
  );
}
