/**
 * PipelineHealthPanel — Panel B of the per-clinic management dashboard.
 *
 * 24h uptime per pipeline source, 7d mean processing time, 7d failure rate
 * with breakdown by step, 5 most-recent failure rows. Silent failures (rows
 * marked failed with no `study_pipeline_events` trace) are surfaced as a
 * distinct amber strip — that's the "honest unknown" rule from design §3.
 *
 * Failure-bucket copy borrows the what/why/action framing from
 * `docs/failover_ux_design.md` §2 — no generic "an error occurred".
 *
 * Honesty rule: a source with zero events in 24h renders as "no traffic"
 * (NULL uptime) rather than a misleading 100%. Cold start should look like
 * cold start, not "everything is fine".
 *
 * Spec: docs/per_clinic_ops_dashboard_design.md §3 Panel B + §4.
 */

import { useNavigate } from "react-router-dom";
import { AlertTriangle, Clock, ShieldCheck, ShieldAlert, Activity, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import type { PipelineHealthSummary, PipelineUptimeRow, PipelineFailureRow } from "@/hooks/useManagementDashboardData";

dayjs.extend(relativeTime);

interface PipelineHealthPanelProps {
  data: PipelineHealthSummary | null;
  isLoading: boolean;
  isPilot: boolean;
}

// Mapping from `study_pipeline_events.step` → human copy. Borrowed from
// failover_ux_design.md §2. Any step we don't recognise falls back to the
// raw machine name so we don't pretend to know what we don't.
const STEP_LABELS: Record<string, { label: string; why: string }> = {
  vendor_parse:    { label: "Vendor file parse",          why: "We could not read the recording in its native format." },
  channel_resolve: { label: "Channel resolution",         why: "We could not map the recording channels onto the 10-20 system." },
  esf_emit:        { label: "Canonical signal emission",  why: "We could not write the canonical signal to storage." },
  iplane_invoke:   { label: "Model inference (I-Plane)",  why: "The model inference service did not return a result." },
  cplane_trigger:  { label: "Pipeline trigger (C-Plane)", why: "The processing service was not reachable after upload." },
  report_emit:     { label: "Report emission",            why: "The triage draft could not be written." },
};

const SOURCE_LABELS: Record<string, string> = {
  cplane:        "C-Plane",
  iplane:        "I-Plane",
  supabase_edge: "Supabase Edge",
};

export default function PipelineHealthPanel({ data, isLoading, isPilot }: PipelineHealthPanelProps) {
  const navigate = useNavigate();

  if (isLoading && !data) {
    return (
      <section className="rounded-lg border border-border/60 p-4 animate-pulse">
        <div className="h-4 w-32 bg-muted/40 rounded mb-3" />
        <div className="grid grid-cols-3 gap-3">
          <div className="h-14 bg-muted/30 rounded" />
          <div className="h-14 bg-muted/30 rounded" />
          <div className="h-14 bg-muted/30 rounded" />
        </div>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="rounded-lg border border-border/60 p-4">
        <header className="flex items-center gap-2 mb-2">
          <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
          <h2 className="text-sm font-medium">Pipeline health</h2>
        </header>
        <p className="text-xs text-muted-foreground">Pipeline data unavailable for this clinic.</p>
      </section>
    );
  }

  const {
    uptime_24h_by_source,
    mean_processing_seconds_7d,
    failure_rate_7d,
    studies_7d,
    failed_7d,
    failure_breakdown_7d,
    recent_failures,
    silent_failures_7d,
  } = data;

  // Worst-case uptime sets the headline tone; "no data anywhere" stays neutral.
  const observedUptimes = uptime_24h_by_source
    .map((s) => s.uptime)
    .filter((u): u is number => u !== null);
  const headlineUptime = observedUptimes.length > 0 ? Math.min(...observedUptimes) : null;

  const meanProcessingLabel = mean_processing_seconds_7d
    ? formatProcessingTime(mean_processing_seconds_7d)
    : null;

  return (
    <section className="rounded-lg border border-border/60 p-4 space-y-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {failed_7d > 0 || silent_failures_7d > 0 ? (
            <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />
          ) : (
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
          )}
          <h2 className="text-sm font-medium">Pipeline health</h2>
        </div>
        <span className="text-[10px] text-muted-foreground/60 font-mono tabular-nums">
          {studies_7d} studies (7d)
        </span>
      </header>

      {/* Uptime row: one tile per source */}
      <div className="grid grid-cols-3 gap-2">
        {uptime_24h_by_source.map((row) => (
          <UptimeTile key={row.source} row={row} />
        ))}
      </div>

      {/* Mean processing time + failure rate */}
      <div className="grid grid-cols-2 gap-3 pt-1">
        <Metric
          icon={<Clock className="h-3 w-3" />}
          label="Mean processing time (7d)"
          value={meanProcessingLabel}
          fallback={
            isPilot
              ? "No completed studies in the last 7 days yet."
              : "n/a (no triage in 7d)"
          }
        />
        <Metric
          icon={<AlertTriangle className="h-3 w-3" />}
          label="Failure rate (7d)"
          value={
            failure_rate_7d === null
              ? null
              : `${(failure_rate_7d * 100).toFixed(1)}%`
          }
          fallback={isPilot ? "No studies in the last 7 days." : "n/a"}
          accent={failure_rate_7d && failure_rate_7d > 0.05 ? "amber" : undefined}
          sub={failure_rate_7d !== null ? `${failed_7d} of ${studies_7d} failed` : undefined}
        />
      </div>

      {/* Silent-failures honest-unknown strip */}
      {silent_failures_7d > 0 && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs space-y-1">
          <div className="flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-3 w-3" />
            {silent_failures_7d} silent {silent_failures_7d === 1 ? "failure" : "failures"} (7d)
          </div>
          <p className="text-amber-700/80 dark:text-amber-300/80 leading-snug">
            {silent_failures_7d === 1
              ? "1 study is marked failed but has no pipeline trace."
              : `${silent_failures_7d} studies are marked failed but have no pipeline trace.`}{" "}
            Please report — these predate the failure-event instrumentation and we cannot diagnose
            them from the dashboard alone.
          </p>
        </div>
      )}

      {/* Failure breakdown by step */}
      {failure_breakdown_7d.length > 0 && (
        <div className="space-y-1.5 pt-1 border-t border-border/40">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
            Failure breakdown (7d)
          </div>
          <ul className="space-y-1">
            {failure_breakdown_7d.slice(0, isPilot ? 3 : 5).map((row) => {
              const meta = STEP_LABELS[row.step];
              return (
                <li key={row.step} className="text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-foreground/90 truncate">
                      {meta?.label ?? row.step}
                    </span>
                    <Badge variant="outline" className="h-4 text-[10px] tabular-nums font-mono">
                      {row.count}
                    </Badge>
                  </div>
                  {meta?.why && (
                    <p className="text-[11px] text-muted-foreground/80 leading-snug">{meta.why}</p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Recent failure rows */}
      {recent_failures.length > 0 && (
        <div className="space-y-1.5 pt-1 border-t border-border/40">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 flex items-center justify-between">
            <span>Recent failures</span>
            <span className="text-muted-foreground/50 font-mono">{recent_failures.length} shown</span>
          </div>
          <ul className="space-y-1">
            {recent_failures.map((row) => (
              <RecentFailureRow
                key={`${row.study_id}-${row.created_at}`}
                row={row}
                onClick={() => navigate(`/admin/studies/${row.study_id}`)}
              />
            ))}
          </ul>
        </div>
      )}

      {/* Cold start state */}
      {failed_7d === 0 && silent_failures_7d === 0 && headlineUptime === null && (
        <div className="rounded-md border border-border/40 bg-muted/20 p-3 text-xs text-muted-foreground leading-snug">
          {isPilot
            ? "No failures recorded in the last 24h. Uptime baseline appears after 7 days of pipeline events."
            : "no failures, no events in 24h — baseline pending"}
        </div>
      )}
    </section>
  );
}

function UptimeTile({ row }: { row: PipelineUptimeRow }) {
  const noData = row.uptime === null;
  const uptimePct = noData ? null : Math.round(row.uptime! * 1000) / 10;
  const tone = noData
    ? "border-border/40 text-muted-foreground"
    : uptimePct! >= 99
      ? "border-emerald-500/30 text-emerald-700 dark:text-emerald-300 bg-emerald-500/5"
      : uptimePct! >= 95
        ? "border-amber-500/30 text-amber-700 dark:text-amber-300 bg-amber-500/5"
        : "border-red-500/30 text-red-700 dark:text-red-300 bg-red-500/5";

  return (
    <div className={cn("p-2 rounded-md border text-center", tone)}>
      <div className="text-[10px] uppercase tracking-wider opacity-70">
        {SOURCE_LABELS[row.source] ?? row.source}
      </div>
      <div className="text-base font-semibold tabular-nums">
        {noData ? "no data" : `${uptimePct}%`}
      </div>
      <div className="text-[9px] opacity-60 font-mono">
        {noData ? "no traffic in 24h" : `${row.error_events}/${row.total_events} err`}
      </div>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  fallback,
  accent,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  fallback: string;
  accent?: "amber";
  sub?: string;
}) {
  return (
    <div className="p-3 rounded-md border border-border/40 bg-background space-y-0.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/70">
        {icon}
        {label}
      </div>
      {value === null ? (
        <p className="text-xs text-muted-foreground/80 leading-snug pt-0.5">{fallback}</p>
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
          {sub && <div className="text-[10px] text-muted-foreground/60 font-mono">{sub}</div>}
        </>
      )}
    </div>
  );
}

function RecentFailureRow({
  row,
  onClick,
}: {
  row: PipelineFailureRow;
  onClick: () => void;
}) {
  const meta = STEP_LABELS[row.step];
  return (
    <li>
      <button
        onClick={onClick}
        className="w-full flex items-center justify-between gap-2 p-2 rounded-md hover:bg-accent/30 transition-colors text-left"
      >
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-center gap-1.5">
            <Activity className="h-2.5 w-2.5 text-amber-500 shrink-0" />
            <span className="text-xs font-medium text-foreground/90 truncate">
              {meta?.label ?? row.step}
            </span>
            <Badge variant="outline" className="h-4 text-[9px] font-mono">
              {SOURCE_LABELS[row.source] ?? row.source}
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground/70 font-mono">
            <span>{row.study_id.slice(0, 8)}</span>
            <span>·</span>
            <span>{dayjs(row.created_at).fromNow()}</span>
            {row.correlation_id && (
              <>
                <span>·</span>
                <span className="truncate max-w-[120px]" title={row.correlation_id}>
                  {row.correlation_id.slice(0, 12)}
                </span>
              </>
            )}
          </div>
        </div>
        <ExternalLink className="h-3 w-3 text-muted-foreground/50 shrink-0" />
      </button>
    </li>
  );
}

function formatProcessingTime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86400).toFixed(1)}d`;
}
