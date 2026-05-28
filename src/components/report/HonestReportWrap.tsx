import { useMemo } from "react";
import { AlertCircle } from "lucide-react";
import { adaptV1ToV2 } from "@/lib/mindReportV2Adapter";
import { cn } from "@/lib/utils";

export interface HonestReportWrapProps {
  report: any;
  studyId: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Wraps a report consumer (TrustAuditPanel + AnalysisView) with a bottom
 * panel listing system limitations derived from the v1→v2 adapter.
 *
 * TrustAuditPanel already surfaces per-provenance counts in its header, so
 * we deliberately do NOT render a duplicate top counter strip — that would
 * be info-bloat. Only the limitations panel is additive here.
 *
 * Adapter failures fall through to children unwrapped — never breaks the
 * report view.
 */
export function HonestReportWrap({ report, studyId, children, className }: HonestReportWrapProps) {
  const v2 = useMemo(() => {
    try { return adaptV1ToV2(report, studyId); } catch { return null; }
  }, [report, studyId]);

  if (!v2 || v2.limitations.length === 0) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div className={cn("space-y-3", className)}>
      {children}
      <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2.5">
        <div className="flex items-center gap-1.5 mb-1.5">
          <AlertCircle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
          <span className="text-[10px] uppercase tracking-wider font-semibold text-amber-700 dark:text-amber-300">
            System limitations ({v2.limitations.length})
          </span>
        </div>
        <ul className="space-y-1 text-[11px] text-muted-foreground">
          {v2.limitations.map((lim, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <span className="text-amber-600 dark:text-amber-400 shrink-0">•</span>
              <span className="leading-snug">{lim.reason}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
