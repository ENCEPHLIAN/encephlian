/**
 * Compare-to-Prior — P0 template-rendered "Compared to prior" section.
 *
 * Pure presentational. Reads study_comparison_runs by id from Supabase,
 * renders the per-finding state + biomarker deltas + caveats per
 * docs/compare_to_prior_design.md §4. Honest empty state when no prior
 * is available — the absence is the message, not a placeholder banner.
 *
 * P0 intentionally template-only. AUGUR prose generation for this
 * section is a P1 item.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AlertCircle, GitCompare, Info, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import dayjs from "dayjs";

interface BiomarkerDelta {
  biomarker_kind: string;
  current_value: number;
  prior_value: number;
  delta_abs: number;
  delta_signed: number;
  percentile_rank: "p75+" | "p50-p75" | "below_p50" | string;
  tier: "change" | "noteworthy" | "noise" | string;
  reportable: boolean;
  caveat: string | null;
  threshold_source: string;
  p75: number;
}

interface FindingChange {
  kind: string;
  state: "unchanged" | "new" | "resolved" | "changed" | string;
  current_value: unknown;
  prior_value: unknown;
  caveat?: string | null;
}

interface Caveat {
  kind: string;
  reason?: string;
  current?: string | Record<string, string>;
  prior?: string | Record<string, string>;
  finding_kind?: string;
  deprecated?: string;
}

interface ComparisonRow {
  id: string;
  current_study_id: string;
  prior_study_id: string;
  computed_at: string;
  current_report_sha: string;
  prior_report_sha: string;
  biomarker_deltas: BiomarkerDelta[];
  finding_changes: FindingChange[];
  caveats: Caveat[];
  suppressed: boolean;
  model_versions_used: Record<string, Record<string, string>>;
}

interface PriorStudyLite {
  id: string;
  created_at: string | null;
  state: string | null;
  meta: Record<string, unknown> | null;
}

const FINDING_LABELS: Record<string, string> = {
  "background.pdr": "Posterior dominant rhythm",
  "background.interhemispheric_asymmetry": "Interhemispheric asymmetry",
  "background.generalized_slowing": "Generalised slowing",
};

const BIOMARKER_LABELS: Record<string, string> = {
  ripple_rate_per_min: "Ripple rate (events/min)",
  sharp_transient_rate_per_min: "Sharp transient rate (events/min)",
  burst_suppression_ratio: "Burst-suppression ratio",
  background_continuity_pct: "Background continuity (%)",
  amplitude_asymmetry_max_index: "Amplitude asymmetry index",
  pdr_frequency_hz_lower: "PDR frequency (Hz, lower bound)",
  pdr_asymmetry_index: "PDR asymmetry index",
};

const STATE_LABELS: Record<string, { label: string; cls: string }> = {
  unchanged: { label: "Persistent", cls: "bg-muted text-muted-foreground" },
  new:       { label: "New",        cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30" },
  resolved:  { label: "Resolved",   cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" },
  changed:   { label: "Changed",    cls: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30" },
};

const CAVEAT_LABELS: Record<string, string> = {
  vendor_mismatch:     "Vendor mismatch",
  model_version_skew:  "Model version differs",
  prior_hand_edited:   "Prior hand-edited",
  deprecated_model:    "Deprecated prior model",
  no_prior_available:  "No prior on file",
  channel_gate_prior:  "Prior channel gate",
};

function fmtNum(n: number | null | undefined, digits = 2): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

function describeFindingValue(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    if ("frequency_hz_range" in obj) return String(obj.frequency_hz_range);
    if ("grade" in obj) return String(obj.grade);
    if ("symmetry" in obj) return String(obj.symmetry);
    if ("asymmetry_index" in obj) return `index ${fmtNum(Number(obj.asymmetry_index))}`;
    try { return JSON.stringify(obj); } catch { return "—"; }
  }
  return "—";
}

export interface ComparedToPriorProps {
  comparisonRunId: string | null | undefined;
  /** When falsy, render the honest "no prior" empty state. */
  comparedToStudyId: string | null | undefined;
  className?: string;
}

export function ComparedToPrior({
  comparisonRunId,
  comparedToStudyId,
  className,
}: ComparedToPriorProps) {
  const row = useQuery<ComparisonRow | null>({
    queryKey: ["study_comparison_runs", comparisonRunId],
    enabled: !!comparisonRunId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("study_comparison_runs" as never)
        .select("*")
        .eq("id", comparisonRunId as string)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as ComparisonRow | null;
    },
  });

  const priorStudy = useQuery<PriorStudyLite | null>({
    queryKey: ["studies", "prior", comparedToStudyId],
    enabled: !!comparedToStudyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("studies")
        .select("id, created_at, state, meta")
        .eq("id", comparedToStudyId as string)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as PriorStudyLite | null;
    },
  });

  // ── Empty state: no eligible prior ─────────────────────────────────────
  // Per design §4: "The compare section is suppressed entirely if
  // compared_to_study_id is null. No 'comparison not available' banner —
  // the absence is the message." We render a minimal muted line so the
  // report has a visible anchor where a prior would appear, without
  // confabulating context.
  if (!comparedToStudyId) {
    return (
      <Card className={cn("border-muted/40 bg-muted/10", className)}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
            <GitCompare className="h-4 w-4" />
            Compared to prior
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground py-2">
          First study on file for this patient — no prior available for comparison.
        </CardContent>
      </Card>
    );
  }

  if (row.isLoading || priorStudy.isLoading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <GitCompare className="h-4 w-4" />
            Compared to prior
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading comparison…
        </CardContent>
      </Card>
    );
  }

  if (row.isError || !row.data) {
    return (
      <Card className={cn("border-muted/40 bg-muted/10", className)}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
            <GitCompare className="h-4 w-4" />
            Compared to prior
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground py-2">
          Comparison record unavailable. The prior study exists, but the comparison row
          could not be loaded.
        </CardContent>
      </Card>
    );
  }

  const data = row.data;

  // Per design §4: if everything is suppressed AND no caveats worth
  // surfacing, hide the entire section rather than emit a useless card.
  const interestingFindingChanges = (data.finding_changes ?? []).filter(
    (f) => f.state !== "unchanged",
  );
  const reportableBiomarkers = (data.biomarker_deltas ?? []).filter((b) => b.reportable);
  const noteworthyBiomarkers = (data.biomarker_deltas ?? []).filter(
    (b) => !b.reportable && b.tier === "noteworthy",
  );
  const meaningfulCaveats = (data.caveats ?? []).filter(
    (c) =>
      c.kind === "vendor_mismatch" ||
      c.kind === "model_version_skew" ||
      c.kind === "prior_hand_edited" ||
      c.kind === "deprecated_model",
  );

  if (
    interestingFindingChanges.length === 0
    && reportableBiomarkers.length === 0
    && meaningfulCaveats.length === 0
  ) {
    return (
      <Card className={cn("border-muted/40 bg-muted/10", className)}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
            <GitCompare className="h-4 w-4" />
            Compared to prior
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground py-2 space-y-1">
          <p>
            No meaningful change since prior study
            {priorStudy.data?.created_at && (
              <> ({dayjs(priorStudy.data.created_at).format("YYYY-MM-DD")},{" "}
              {dayjs(priorStudy.data.created_at).fromNow()})</>
            )}.
          </p>
          <p className="text-[10px]">
            All biomarker deltas fell below the {data.biomarker_deltas.length > 0 ? "75th-percentile reportable threshold" : "comparison threshold"}.
          </p>
        </CardContent>
      </Card>
    );
  }

  const priorMeta = (priorStudy.data?.meta ?? {}) as Record<string, unknown>;
  const priorPatientRef = typeof priorMeta.patient_id === "string" ? priorMeta.patient_id : null;

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <GitCompare className="h-4 w-4" />
          Compared to prior
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {/* Prior study line */}
        <div className="text-xs text-muted-foreground">
          Prior study {priorPatientRef && <span className="font-mono">{priorPatientRef.slice(0, 12)}</span>}{" "}
          {priorStudy.data?.created_at && (
            <>
              signed {dayjs(priorStudy.data.created_at).format("YYYY-MM-DD")}{" "}
              ({dayjs(priorStudy.data.created_at).fromNow()})
            </>
          )}.
        </div>

        {/* Caveats — surfaced as a strip above the tables */}
        {meaningfulCaveats.length > 0 && (
          <div className="space-y-1.5">
            {meaningfulCaveats.map((c, i) => (
              <div
                key={i}
                className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-1.5 text-xs"
              >
                <AlertCircle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <span className="font-medium text-amber-700 dark:text-amber-300">
                    {CAVEAT_LABELS[c.kind] ?? c.kind}
                  </span>
                  {c.reason && (
                    <span className="text-muted-foreground"> — {c.reason}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Finding-level changes */}
        {interestingFindingChanges.length > 0 && (
          <div>
            <h4 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Findings change since prior
            </h4>
            <ul className="space-y-1.5">
              {interestingFindingChanges.map((f, i) => {
                const meta = STATE_LABELS[f.state] ?? STATE_LABELS.unchanged;
                const label = FINDING_LABELS[f.kind] ?? f.kind;
                return (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <Badge variant="outline" className={cn("shrink-0 text-[10px] font-medium", meta.cls)}>
                      {meta.label}
                    </Badge>
                    <span className="text-foreground">
                      <span className="font-medium">{label}</span>
                      {f.state === "changed" && (
                        <>
                          {" — was "}
                          <span className="font-mono text-xs">{describeFindingValue(f.prior_value)}</span>
                          {", now "}
                          <span className="font-mono text-xs">{describeFindingValue(f.current_value)}</span>
                        </>
                      )}
                      {f.state === "new" && (
                        <>
                          {" — "}
                          <span className="font-mono text-xs">{describeFindingValue(f.current_value)}</span>
                          {" (absent on prior)"}
                        </>
                      )}
                      {f.state === "resolved" && (
                        <>
                          {" — was "}
                          <span className="font-mono text-xs">{describeFindingValue(f.prior_value)}</span>
                          {" (not present on current)"}
                        </>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Biomarker deltas — reportable first, then noteworthy strip */}
        {(reportableBiomarkers.length > 0 || noteworthyBiomarkers.length > 0) && (
          <>
            <Separator />
            <div>
              <h4 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Biomarker deltas
              </h4>
              {reportableBiomarkers.length > 0 && (
                <ul className="space-y-1 font-mono text-xs">
                  {reportableBiomarkers.map((b, i) => {
                    const label = BIOMARKER_LABELS[b.biomarker_kind] ?? b.biomarker_kind;
                    const sign = b.delta_signed > 0 ? "+" : "";
                    return (
                      <li key={i} className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-foreground">{label}</span>
                        <span className="text-muted-foreground">
                          {fmtNum(b.prior_value, 3)} → {fmtNum(b.current_value, 3)}
                        </span>
                        <span className="text-sky-700 dark:text-sky-300">
                          ({sign}{fmtNum(b.delta_signed, 3)}, {b.percentile_rank})
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              {noteworthyBiomarkers.length > 0 && (
                <div className="mt-3 pt-2 border-t border-dashed border-muted-foreground/20">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                    Noteworthy (below reportable threshold)
                  </p>
                  <ul className="space-y-1 font-mono text-[11px] text-muted-foreground">
                    {noteworthyBiomarkers.map((b, i) => {
                      const label = BIOMARKER_LABELS[b.biomarker_kind] ?? b.biomarker_kind;
                      const sign = b.delta_signed > 0 ? "+" : "";
                      return (
                        <li key={i}>
                          {label}: {fmtNum(b.prior_value, 3)} → {fmtNum(b.current_value, 3)} ({sign}{fmtNum(b.delta_signed, 3)})
                          {b.caveat && <span className="ml-1 text-amber-600 dark:text-amber-400">[{b.caveat}]</span>}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          </>
        )}

        {/* Debug-source line — only visible under ?debug=1 (design §4 last para) */}
        {typeof window !== "undefined" && window.location.search.includes("debug=1") && (
          <div className="text-[10px] font-mono text-muted-foreground/70 flex items-center gap-1 pt-2 border-t">
            <Info className="h-3 w-3" />
            study_comparison_runs row {data.id.slice(0, 8)} · computed {dayjs(data.computed_at).fromNow()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
