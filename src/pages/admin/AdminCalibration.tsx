/**
 * AdminCalibration — every model_calibration_runs row, grouped by model.
 *
 * Read-only. Calibration rows are written by the offline measurement job
 * (super_admin/management only). This page surfaces the latest reliability
 * diagram per model so operators can see drift and re-calibrate decisions.
 *
 * Empty state matters: until a model is calibrated, the gate that demotes
 * low-confidence fields to pending can't fire. The page calls that out.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  LineChart, Line, XAxis, YAxis, Tooltip as ReTooltip,
  ResponsiveContainer, ReferenceLine, CartesianGrid,
} from "recharts";
import { Activity, AlertCircle, Gauge, TrendingUp } from "lucide-react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

type ModelRow = {
  id: string;
  name: string;
  version: string;
  family: string;
  status: string;
};

type RunRow = {
  id: string;
  model_version_id: string;
  measured_at: string;
  holdout_set_label: string;
  n_samples: number;
  ece: number | null;
  brier_score: number | null;
  platt_a: number | null;
  platt_b: number | null;
  reliability_diagram: { bins?: Array<{ pred: number; actual: number; n: number }> } | null;
};

function eceQualityClass(ece: number | null): string {
  if (ece == null) return "border-muted-foreground/30 text-muted-foreground";
  if (ece < 0.03)   return "border-emerald-500/40 text-emerald-700 dark:text-emerald-300 bg-emerald-500/5";
  if (ece < 0.10)   return "border-amber-500/40 text-amber-700 dark:text-amber-300 bg-amber-500/5";
  return "border-destructive/40 text-destructive bg-destructive/5";
}

export default function AdminCalibration() {
  const models = useQuery<ModelRow[]>({
    queryKey: ["admin", "calibration", "models"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("model_versions")
        .select("id, name, version, family, status")
        .order("family")
        .order("name");
      if (error) throw error;
      return (data ?? []) as ModelRow[];
    },
  });

  const runs = useQuery<RunRow[]>({
    queryKey: ["admin", "calibration", "runs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("model_calibration_runs")
        .select("id, model_version_id, measured_at, holdout_set_label, n_samples, ece, brier_score, platt_a, platt_b, reliability_diagram")
        .order("measured_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as RunRow[];
    },
  });

  const latestByModel = useMemo(() => {
    const m: Record<string, RunRow> = {};
    for (const r of runs.data ?? []) {
      if (!m[r.model_version_id]) m[r.model_version_id] = r;
    }
    return m;
  }, [runs.data]);

  if (models.isLoading || runs.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading calibration…</div>;
  }
  if (models.isError || runs.isError) {
    const err = (models.error || runs.error) as Error | undefined;
    return (
      <div className="p-6">
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
            <p className="text-sm text-destructive">{err?.message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const mRows = models.data ?? [];
  const rRows = runs.data ?? [];
  const totalRuns       = rRows.length;
  const calibratedCount = Object.keys(latestByModel).length;
  const servingCount    = mRows.filter((m) => m.status === "serving").length;

  return (
    <div className="p-6 space-y-5 max-w-6xl animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Calibration</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Per-model reliability. ECE &lt; 0.03 is well-calibrated; &lt; 0.10 acceptable; ≥ 0.10 needs Platt rescaling.
          Until a model has a calibration row, the calibration gate cannot demote its low-confidence outputs.
        </p>
      </div>

      {/* Top-line counters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="text-[10px] gap-1">
          <Gauge className="h-2.5 w-2.5" />
          serving · <span className="font-mono">{servingCount}</span>
        </Badge>
        <Badge variant="outline" className="text-[10px] gap-1 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 bg-emerald-500/5">
          calibrated · <span className="font-mono">{calibratedCount}</span> of {mRows.length}
        </Badge>
        <Badge variant="outline" className="text-[10px] gap-1">
          <Activity className="h-2.5 w-2.5" />
          {totalRuns} runs in last 500
        </Badge>
      </div>

      {totalRuns === 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">No calibration runs yet</p>
              <p className="text-xs text-muted-foreground leading-snug">
                Schedule the offline measurement job to populate this surface. Until any rows land, the
                calibration gate inside <span className="font-mono">enforce_channel_gate</span> can only act
                on the per-field <span className="font-mono">calibrated_confidence</span> embedded in the
                payload, not on a model-wide threshold.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Per-model panels */}
      <div className="space-y-3">
        {mRows.map((m) => {
          const latest = latestByModel[m.id];
          const allRuns = rRows.filter((r) => r.model_version_id === m.id);
          const bins   = latest?.reliability_diagram?.bins ?? [];
          const trend  = allRuns
            .slice()
            .reverse()
            .map((r) => ({
              t:    dayjs(r.measured_at).format("MMM D"),
              ece:  r.ece,
              brier: r.brier_score,
            }));

          return (
            <Card key={m.id} className="border-border/60">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs font-semibold">{m.name}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">v{m.version}</span>
                  <Badge variant="outline" className="text-[9px]">{m.family}</Badge>
                  {latest ? (
                    <Badge variant="outline" className={`text-[9px] gap-1 ${eceQualityClass(latest.ece)}`}>
                      ECE <span className="font-mono">{latest.ece?.toFixed(3) ?? "—"}</span>
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[9px] text-muted-foreground">never measured</Badge>
                  )}
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {latest ? `${allRuns.length} run${allRuns.length === 1 ? "" : "s"} · last ${dayjs(latest.measured_at).fromNow()}` : "—"}
                  </span>
                </div>

                {latest && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Reliability diagram (predicted vs actual per bin) */}
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <TrendingUp className="h-3 w-3 text-muted-foreground" />
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                          Reliability diagram
                        </span>
                        <span className="text-[10px] text-muted-foreground/60 font-mono ml-auto">
                          n={latest.n_samples} · {latest.holdout_set_label}
                        </span>
                      </div>
                      <div className="h-40 rounded-md border border-border/40 bg-muted/10 p-2">
                        {bins.length > 0 ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={bins}>
                              <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.3} strokeDasharray="2 2" />
                              <XAxis dataKey="pred" tick={{ fontSize: 9 }} domain={[0, 1]} type="number" />
                              <YAxis dataKey="actual" tick={{ fontSize: 9 }} domain={[0, 1]} />
                              <ReTooltip
                                contentStyle={{ fontSize: 10, padding: 4 }}
                                labelStyle={{ fontSize: 9 }}
                                formatter={(v: any) => (typeof v === "number" ? v.toFixed(3) : v)}
                              />
                              {/* perfect-calibration diagonal */}
                              <ReferenceLine
                                segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]}
                                stroke="hsl(var(--muted-foreground))"
                                strokeDasharray="2 2"
                              />
                              <Line
                                type="monotone"
                                dataKey="actual"
                                stroke="hsl(var(--primary))"
                                strokeWidth={1.5}
                                dot={{ r: 2 }}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="h-full flex items-center justify-center text-[10px] text-muted-foreground">
                            No reliability_diagram payload on the latest run
                          </div>
                        )}
                      </div>
                    </div>

                    {/* ECE trend over time */}
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <Activity className="h-3 w-3 text-muted-foreground" />
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                          ECE drift
                        </span>
                      </div>
                      <div className="h-40 rounded-md border border-border/40 bg-muted/10 p-2">
                        {trend.length > 1 ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={trend}>
                              <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.3} strokeDasharray="2 2" />
                              <XAxis dataKey="t" tick={{ fontSize: 9 }} />
                              <YAxis tick={{ fontSize: 9 }} />
                              <ReTooltip contentStyle={{ fontSize: 10, padding: 4 }} />
                              <ReferenceLine y={0.03} stroke="hsl(var(--muted-foreground))" strokeDasharray="2 2" />
                              <Line type="monotone" dataKey="ece"   stroke="hsl(var(--primary))"     strokeWidth={1.5} dot={{ r: 2 }} />
                              <Line type="monotone" dataKey="brier" stroke="hsl(var(--destructive))" strokeWidth={1}   dot={{ r: 1.5 }} strokeOpacity={0.7} />
                            </LineChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="h-full flex items-center justify-center text-[10px] text-muted-foreground">
                            Need ≥ 2 runs to plot drift
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Platt coefficients */}
                    {(latest.platt_a != null || latest.platt_b != null) && (
                      <div className="col-span-1 lg:col-span-2 flex items-center gap-3 text-[10px] text-muted-foreground">
                        <span className="font-semibold uppercase tracking-wider">Platt scaling</span>
                        {latest.platt_a != null && (
                          <span>a = <span className="font-mono">{latest.platt_a.toFixed(3)}</span></span>
                        )}
                        {latest.platt_b != null && (
                          <span>b = <span className="font-mono">{latest.platt_b.toFixed(3)}</span></span>
                        )}
                        <span className="font-mono opacity-60 ml-auto">calibrated = σ(a · raw + b)</span>
                      </div>
                    )}
                  </div>
                )}

                {!latest && (
                  <p className="text-[11px] text-muted-foreground/70">
                    No calibration runs for this model yet.
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
