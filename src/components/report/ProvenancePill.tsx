import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Provenance, ProvenanceKind } from "@/shared/mindReportV2";
import { cn } from "@/lib/utils";

const KIND_STYLES: Record<ProvenanceKind, { label: string; cls: string; name: string }> = {
  model:     { label: "M", name: "Model",     cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" },
  rule:      { label: "R", name: "Rule",      cls: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30" },
  biomarker: { label: "B", name: "Biomarker", cls: "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30" },
  pending:   { label: "?", name: "Pending",   cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30" },
  clinician: { label: "C", name: "Clinician", cls: "bg-foreground/10 text-foreground border-foreground/30" },
};

export interface ProvenancePillProps {
  provenance: Provenance;
  derivation?: string[];
  className?: string;
}

export function ProvenancePill({ provenance, derivation, className }: ProvenancePillProps) {
  const style = KIND_STYLES[provenance.derived_from] ?? KIND_STYLES.pending;
  const rows: Array<{ k: string; v: string }> = [];
  rows.push({ k: "Source", v: provenance.source });
  if (provenance.model_version)  rows.push({ k: "Model", v: provenance.model_version });
  if (provenance.rule_name)      rows.push({ k: "Rule",  v: `${provenance.rule_name}${provenance.rule_version ? ` v${provenance.rule_version}` : ""}` });
  if (provenance.calibrated_confidence != null) rows.push({ k: "Calibrated", v: `${(provenance.calibrated_confidence * 100).toFixed(0)}%` });
  else if (provenance.confidence != null)       rows.push({ k: "Confidence", v: `${(provenance.confidence * 100).toFixed(0)}%` });
  if (provenance.pending_reason)                rows.push({ k: "Reason", v: provenance.pending_reason });
  if (provenance.missing_channels?.length)      rows.push({ k: "Missing channels", v: provenance.missing_channels.join(", ") });
  if (provenance.missing_markers?.length)       rows.push({ k: "Missing markers",  v: provenance.missing_markers.join(", ") });

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center justify-center h-4 min-w-4 px-1 rounded border font-mono text-[9px] font-semibold leading-none cursor-help select-none",
              style.cls,
              className,
            )}
            aria-label={`Provenance: ${style.name}`}
          >
            {style.label}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="text-[10px] space-y-0.5">
            <div className="font-semibold">{style.name}</div>
            {rows.map((r, i) => (
              <div key={i} className="leading-snug">
                <span className="text-muted-foreground">{r.k}: </span>
                <span>{r.v}</span>
              </div>
            ))}
            {derivation?.length ? (
              <>
                <div className="border-t border-border/30 mt-1 pt-1 text-muted-foreground">Derivation</div>
                {derivation.map((d, i) => (
                  <div key={i} className="font-mono text-[9px]">  {d}</div>
                ))}
              </>
            ) : null}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
