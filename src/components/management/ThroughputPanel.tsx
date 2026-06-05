/**
 * ThroughputPanel — Panel A of the per-clinic management dashboard.
 *
 * Three time-window counts + a dense 14-day sparkline + 30d breakdowns by
 * vendor format and per-clinician owner. Pilot SKU gets full-sentence
 * empty-state copy ("5 studies so far this week — sparkline appears after
 * 7 days of data"); internal gets terse "n=5, pending bin".
 *
 * Honest unknown: a NULL `original_format` surfaces as the literal "unknown"
 * bucket rather than being dropped. NULL owner surfaces as "Unassigned".
 *
 * Spec: docs/per_clinic_ops_dashboard_design.md §3 Panel A + §4.
 */

import { Activity, FileText, TrendingUp, Users as UsersIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ThroughputSummary } from "@/hooks/useManagementDashboardData";

interface ThroughputPanelProps {
  data: ThroughputSummary | null;
  isLoading: boolean;
  isPilot: boolean;
}

export default function ThroughputPanel({ data, isLoading, isPilot }: ThroughputPanelProps) {
  if (isLoading && !data) {
    return (
      <section className="rounded-lg border border-border/60 p-4 space-y-3 animate-pulse">
        <div className="h-4 w-24 bg-muted/40 rounded" />
        <div className="grid grid-cols-3 gap-3">
          <div className="h-16 bg-muted/30 rounded" />
          <div className="h-16 bg-muted/30 rounded" />
          <div className="h-16 bg-muted/30 rounded" />
        </div>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="rounded-lg border border-border/60 p-4">
        <header className="flex items-center gap-2 mb-2">
          <Activity className="h-3.5 w-3.5 text-muted-foreground" />
          <h2 className="text-sm font-medium">Throughput</h2>
        </header>
        <p className="text-xs text-muted-foreground">
          Throughput data unavailable for this clinic. If this persists, your account may not be
          linked to a clinic yet — contact ENCEPHLIAN support.
        </p>
      </section>
    );
  }

  const { today_count, week_count, month_count, sparkline, by_vendor_30d, by_clinician_30d } = data;
  const totalThisMonth = month_count;
  const sparklineMax = Math.max(1, ...sparkline.map((d) => d.count));
  const nonZeroDays = sparkline.filter((d) => d.count > 0).length;

  // Honesty: only show the sparkline once we have at least 3 non-zero days.
  // On pilot SKU spell that out as a full sentence.
  const sparklineReady = nonZeroDays >= 3;

  return (
    <section className="rounded-lg border border-border/60 p-4 space-y-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-muted-foreground" />
          <h2 className="text-sm font-medium">Throughput</h2>
        </div>
        <span className="text-[10px] text-muted-foreground/60 font-mono tabular-nums">
          {totalThisMonth} this month
        </span>
      </header>

      {/* KPI tiles */}
      <div className="grid grid-cols-3 gap-3">
        <KpiTile label="Today" value={today_count} />
        <KpiTile label="This week" value={week_count} />
        <KpiTile label="This month" value={month_count} />
      </div>

      {/* Sparkline */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground/70 uppercase tracking-wider">
            Last 14 days
          </span>
          {sparklineReady && (
            <span className="text-[10px] text-muted-foreground/50 font-mono tabular-nums">
              peak {sparklineMax}/day
            </span>
          )}
        </div>
        {sparklineReady ? (
          <Sparkline data={sparkline} max={sparklineMax} />
        ) : (
          <p className="text-xs text-muted-foreground/80 leading-snug">
            {isPilot
              ? `${week_count} ${week_count === 1 ? "study" : "studies"} so far this week — sparkline appears after 7 days of data.`
              : `n=${week_count}, sparkline pending (need >=3 days w/ uploads)`}
          </p>
        )}
      </div>

      {/* Breakdowns */}
      <div className="grid sm:grid-cols-2 gap-4 pt-2 border-t border-border/40">
        <Breakdown
          icon={<FileText className="h-3 w-3" />}
          title="By vendor format (30d)"
          rows={by_vendor_30d.map((v) => ({ label: v.format, count: v.count }))}
          emptyCopy={isPilot ? "No uploads recorded yet." : "n=0"}
        />
        <Breakdown
          icon={<UsersIcon className="h-3 w-3" />}
          title="By clinician (30d)"
          rows={by_clinician_30d.map((c) => ({ label: c.full_name, count: c.count }))}
          emptyCopy={isPilot ? "No clinician activity in the last 30 days." : "n=0"}
        />
      </div>
    </section>
  );
}

function KpiTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="p-3 rounded-md border border-border/40 bg-background">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70">{label}</div>
      <div className="text-2xl font-semibold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}

function Sparkline({
  data,
  max,
}: {
  data: Array<{ day: string; count: number }>;
  max: number;
}) {
  // Minimal SVG bar sparkline. 14 bars in a horizontal strip. We keep the
  // markup tight so the dashboard mount stays under the 200ms target.
  const w = 200;
  const h = 36;
  const barWidth = w / data.length - 1;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-full h-9 text-primary"
      preserveAspectRatio="none"
      aria-label={`Studies per day, last ${data.length} days`}
    >
      {data.map((d, i) => {
        const barH = max === 0 ? 0 : (d.count / max) * (h - 2);
        const x = i * (barWidth + 1);
        const y = h - barH;
        return (
          <rect
            key={d.day}
            x={x}
            y={y}
            width={barWidth}
            height={Math.max(barH, 1)}
            className={d.count > 0 ? "fill-current" : "fill-muted-foreground/15"}
            rx={0.5}
          >
            <title>
              {d.day}: {d.count}
            </title>
          </rect>
        );
      })}
    </svg>
  );
}

function Breakdown({
  icon,
  title,
  rows,
  emptyCopy,
}: {
  icon: React.ReactNode;
  title: string;
  rows: Array<{ label: string; count: number }>;
  emptyCopy: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/70">
        {icon}
        {title}
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground/70">{emptyCopy}</p>
      ) : (
        <ul className="space-y-1">
          {rows.slice(0, 5).map((r) => (
            <li key={r.label} className="flex items-center justify-between text-xs">
              <span
                className={cn(
                  "truncate max-w-[200px]",
                  r.label === "unknown" || r.label === "Unassigned"
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-foreground/80",
                )}
              >
                {r.label === "unknown" ? "unknown (not yet recorded)" : r.label}
              </span>
              <Badge variant="outline" className="h-4 text-[10px] tabular-nums font-mono">
                {r.count}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Suppress unused-import lint (TrendingUp is reserved for the P1 trend sub-component)
void TrendingUp;
