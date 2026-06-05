/**
 * SignalQualityPanel — Panel C of the per-clinic management dashboard.
 *
 * % studies with >=3 bad channels (7d default), avg bad-channel % over 30d,
 * top 5 most-bad-channels by label (30d), 4 weekly bins for trend.
 *
 * Honest unknown: if `channel_quality_assessments` rows are empty for recent
 * studies — which is the current state because VIGIL is deprecated and only
 * the deterministic rule fallback writes rows — surface "Channel quality
 * estimator under repair" with a link to the model status page. This is
 * design §3 Panel C "Honest unknown" applied literally: we render the gap
 * rather than zero-fill it.
 *
 * Spec: docs/per_clinic_ops_dashboard_design.md §3 Panel C + §4.
 */

import { useNavigate } from "react-router-dom";
import { Waves, AlertCircle, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { SignalQualitySummary } from "@/hooks/useManagementDashboardData";

interface SignalQualityPanelProps {
  data: SignalQualitySummary | null;
  isLoading: boolean;
  isPilot: boolean;
}

export default function SignalQualityPanel({ data, isLoading, isPilot }: SignalQualityPanelProps) {
  const navigate = useNavigate();

  if (isLoading && !data) {
    return (
      <section className="rounded-lg border border-border/60 p-4 animate-pulse">
        <div className="h-4 w-32 bg-muted/40 rounded mb-3" />
        <div className="h-20 bg-muted/30 rounded" />
      </section>
    );
  }

  if (!data) {
    return (
      <section className="rounded-lg border border-border/60 p-4">
        <header className="flex items-center gap-2 mb-2">
          <Waves className="h-3.5 w-3.5 text-muted-foreground" />
          <h2 className="text-sm font-medium">Signal quality</h2>
        </header>
        <p className="text-xs text-muted-foreground">Signal quality data unavailable.</p>
      </section>
    );
  }

  const {
    studies_in_window,
    poor_quality_studies,
    pct_poor_quality,
    avg_bad_channel_pct_30d,
    top_bad_channels_30d,
    weekly_bins_30d,
    window_days,
  } = data;

  // The honest-unknown trigger: no channel quality data at all (no studies
  // in the window have any channel_quality_assessments rows). Distinct from
  // "studies have rows but no bad channels", which would render 0% poor.
  const noQualityData = studies_in_window === 0;

  return (
    <section className="rounded-lg border border-border/60 p-4 space-y-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Waves className="h-3.5 w-3.5 text-muted-foreground" />
          <h2 className="text-sm font-medium">Signal quality</h2>
        </div>
        <span className="text-[10px] text-muted-foreground/60 font-mono tabular-nums">
          {studies_in_window} studies ({window_days}d)
        </span>
      </header>

      {noQualityData ? (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs space-y-2">
          <div className="flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-300">
            <AlertCircle className="h-3 w-3" />
            Channel quality estimator under repair
          </div>
          <p className="text-amber-700/80 dark:text-amber-300/80 leading-snug">
            {isPilot
              ? "No per-channel quality data has been recorded for recent studies. VIGIL (the per-channel quality estimator) is currently deprecated; per-channel quality is computed by a deterministic rule fallback while a replacement is in training."
              : "No channel_quality_assessments rows in window. VIGIL deprecated; rule fallback only."}
          </p>
          <button
            onClick={() => navigate("/admin/models")}
            className="inline-flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-300 hover:underline"
          >
            View model status
            <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <>
          {/* Headline metric */}
          <div className="grid grid-cols-2 gap-3">
            <Metric
              label={`Poor-quality studies (${window_days}d)`}
              value={
                pct_poor_quality === null
                  ? null
                  : `${(pct_poor_quality * 100).toFixed(0)}%`
              }
              sub={`${poor_quality_studies} of ${studies_in_window} had >=3 bad channels`}
              accent={pct_poor_quality && pct_poor_quality > 0.3 ? "amber" : undefined}
            />
            <Metric
              label="Avg bad channels per study (30d)"
              value={
                avg_bad_channel_pct_30d === null
                  ? null
                  : `${(avg_bad_channel_pct_30d * 100).toFixed(0)}%`
              }
              sub="across all completed 30d studies"
              accent={avg_bad_channel_pct_30d && avg_bad_channel_pct_30d > 0.2 ? "amber" : undefined}
            />
          </div>

          {/* Weekly bin trend */}
          <div className="space-y-1.5 pt-1 border-t border-border/40">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
              Trend (last 4 weeks)
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {weekly_bins_30d.map((bin) => (
                <WeekBin key={bin.week_start} bin={bin} />
              ))}
            </div>
          </div>

          {/* Top bad channels */}
          {top_bad_channels_30d.length > 0 && (
            <div className="space-y-1.5 pt-1 border-t border-border/40">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                Most-frequently-bad channels (30d)
              </div>
              <ul className="space-y-1">
                {top_bad_channels_30d.map((row) => (
                  <li key={row.channel} className="flex items-center justify-between text-xs">
                    <span className="font-mono text-foreground/80">{row.channel}</span>
                    <Badge variant="outline" className="h-4 text-[10px] tabular-nums font-mono">
                      {row.count}
                    </Badge>
                  </li>
                ))}
              </ul>
              {isPilot && (
                <p className="text-[11px] text-muted-foreground/70 leading-snug pt-1">
                  Channels appearing repeatedly are usually a placement issue — consider a
                  technician refresher on these electrodes.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Metric({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | null;
  sub: string;
  accent?: "amber";
}) {
  return (
    <div className="p-3 rounded-md border border-border/40 bg-background space-y-0.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70">{label}</div>
      {value === null ? (
        <p className="text-xs text-muted-foreground/70">n/a yet</p>
      ) : (
        <>
          <div
            className={cn(
              "text-lg font-semibold tabular-nums",
              accent === "amber" && "text-amber-600 dark:text-amber-400",
            )}
          >
            {value}
          </div>
          <div className="text-[10px] text-muted-foreground/60 leading-snug">{sub}</div>
        </>
      )}
    </div>
  );
}

function WeekBin({
  bin,
}: {
  bin: {
    week_start: string;
    total_studies: number;
    poor_quality_studies: number;
    pct_poor_quality: number | null;
  };
}) {
  const empty = bin.total_studies === 0;
  const pct = bin.pct_poor_quality;
  const tone = empty
    ? "border-border/30 bg-muted/10 text-muted-foreground/60"
    : pct && pct > 0.3
      ? "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300"
      : "border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300";
  return (
    <div className={cn("p-2 rounded-md border text-center", tone)} title={`Week of ${bin.week_start}`}>
      <div className="text-[9px] uppercase tracking-wider opacity-70">
        {bin.week_start.slice(5)}
      </div>
      <div className="text-sm font-semibold tabular-nums mt-0.5">
        {empty ? "—" : pct === null ? "—" : `${Math.round(pct * 100)}%`}
      </div>
      <div className="text-[9px] opacity-60 font-mono">
        n={bin.total_studies}
      </div>
    </div>
  );
}
