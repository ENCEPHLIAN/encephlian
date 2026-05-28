/**
 * AdminModels — read-only registry view of every model the platform knows.
 *
 * Status is the deploy ladder. Grouped by family for at-a-glance auditing.
 * Mutations happen via DB / migration only — registries shouldn't have UI
 * edit affordances. Validation metrics + latest calibration shown inline.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Activity, Brain, Layers, Shield, Workflow, MessageSquare, Zap, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

type ModelRow = {
  id: string;
  name: string;
  version: string;
  family: string;
  status: string;
  training_corpus: string | null;
  validation_metrics: Record<string, unknown> | null;
  weights_sha256: string | null;
  emits_schema_name: string | null;
  emits_schema_version: string | null;
  deployed_at: string | null;
  notes: string | null;
};

type CalibrationRow = {
  model_version_id: string;
  measured_at: string;
  ece: number | null;
  brier_score: number | null;
  n_samples: number;
  holdout_set_label: string;
};

const STATUS_STYLES: Record<string, string> = {
  planned:              "border-muted-foreground/30 text-muted-foreground",
  training:             "border-blue-500/40 text-blue-700 dark:text-blue-300 bg-blue-500/5",
  trained_not_deployed: "border-amber-500/40 text-amber-700 dark:text-amber-300 bg-amber-500/5",
  deployed_in_blob:     "border-cyan-500/40 text-cyan-700 dark:text-cyan-300 bg-cyan-500/5",
  loaded_in_iplane:     "border-purple-500/40 text-purple-700 dark:text-purple-300 bg-purple-500/5",
  serving:              "border-emerald-500/40 text-emerald-700 dark:text-emerald-300 bg-emerald-500/5",
  deprecated:           "border-muted-foreground/30 text-muted-foreground/70 line-through",
  failed:               "border-destructive/40 text-destructive bg-destructive/5",
};

const FAMILY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  triage:        Brain,
  quality:       Shield,
  cleaning:      Workflow,
  normalization: Layers,
  foundation:    Activity,
  finding:       Brain,
  language:      MessageSquare,
  heuristic:     Zap,
};

const FAMILY_ORDER = [
  "triage", "quality", "cleaning", "normalization",
  "foundation", "finding", "language", "heuristic",
];

export default function AdminModels() {
  const models = useQuery<ModelRow[]>({
    queryKey: ["admin", "model_versions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("model_versions")
        .select("id, name, version, family, status, training_corpus, validation_metrics, weights_sha256, emits_schema_name, emits_schema_version, deployed_at, notes")
        .order("name", { ascending: true })
        .order("version", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ModelRow[];
    },
  });

  const calibrations = useQuery<Record<string, CalibrationRow>>({
    queryKey: ["admin", "model_calibration_latest"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("model_calibration_runs")
        .select("model_version_id, measured_at, ece, brier_score, n_samples, holdout_set_label")
        .order("measured_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      const latest: Record<string, CalibrationRow> = {};
      for (const r of (data ?? []) as CalibrationRow[]) {
        if (!latest[r.model_version_id]) latest[r.model_version_id] = r;
      }
      return latest;
    },
  });

  if (models.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading models…</div>;
  }
  if (models.isError) {
    return (
      <div className="p-6">
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
            <p className="text-sm text-destructive">
              Failed to load model registry: {(models.error as Error)?.message}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const rows = models.data ?? [];
  const byFamily = FAMILY_ORDER.map((family) => ({
    family,
    models: rows.filter((r) => r.family === family),
  })).filter((g) => g.models.length > 0);

  const totalServing = rows.filter((r) => r.status === "serving").length;
  const totalTrainedAwaiting = rows.filter((r) => r.status === "trained_not_deployed").length;
  const totalPlanned = rows.filter((r) => r.status === "planned").length;

  return (
    <div className="p-6 space-y-5 max-w-6xl animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Model registry</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Every model the system knows about, with deploy status and calibration.
          Identity is content-addressable via <span className="font-mono">weights_sha256</span>.
          Registry is read-only from the UI — mutations happen via migration.
        </p>
      </div>

      {/* Summary */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className={cn("gap-1 text-[10px]", STATUS_STYLES.serving)}>
          serving · <span className="font-mono">{totalServing}</span>
        </Badge>
        <Badge variant="outline" className={cn("gap-1 text-[10px]", STATUS_STYLES.trained_not_deployed)}>
          trained, awaiting deploy · <span className="font-mono">{totalTrainedAwaiting}</span>
        </Badge>
        <Badge variant="outline" className={cn("gap-1 text-[10px]", STATUS_STYLES.planned)}>
          planned · <span className="font-mono">{totalPlanned}</span>
        </Badge>
      </div>

      {/* Grouped rows */}
      {byFamily.map(({ family, models }) => {
        const Icon = FAMILY_ICONS[family] ?? Brain;
        return (
          <section key={family} className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                {family}
              </span>
              <span className="text-[10px] text-muted-foreground/60 tabular-nums">
                ({models.length})
              </span>
            </div>
            <div className="space-y-1.5">
              {models.map((m) => {
                const cal = calibrations.data?.[m.id];
                const metrics = (m.validation_metrics ?? {}) as Record<string, unknown>;
                return (
                  <Card key={m.id} className="border-border/60">
                    <CardContent className="p-3 flex items-start gap-3">
                      {/* Name + version */}
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-semibold">{m.name}</span>
                          <span className="font-mono text-[10px] text-muted-foreground">v{m.version}</span>
                          <Badge
                            variant="outline"
                            className={cn("text-[9px] gap-1", STATUS_STYLES[m.status] ?? "")}
                          >
                            {m.status.replaceAll("_", " ")}
                          </Badge>
                          {m.emits_schema_name && (
                            <Badge variant="outline" className="text-[9px] font-mono text-muted-foreground">
                              emits {m.emits_schema_name}@{m.emits_schema_version}
                            </Badge>
                          )}
                        </div>
                        {m.notes && (
                          <p className="text-[11px] text-muted-foreground leading-snug">{m.notes}</p>
                        )}
                        <div className="flex items-center gap-3 flex-wrap text-[10px] text-muted-foreground/80">
                          {m.training_corpus && (
                            <span><span className="text-muted-foreground/60">corpus:</span> {m.training_corpus}</span>
                          )}
                          {Object.entries(metrics).slice(0, 3).map(([k, v]) => (
                            <span key={k}>
                              <span className="text-muted-foreground/60">{k}:</span>{" "}
                              <span className="font-mono">{typeof v === "number" ? v.toFixed(3) : String(v)}</span>
                            </span>
                          ))}
                          {m.deployed_at && (
                            <span><span className="text-muted-foreground/60">deployed:</span> {dayjs(m.deployed_at).fromNow()}</span>
                          )}
                        </div>
                        {cal && (
                          <div className="flex items-center gap-3 text-[10px] mt-0.5">
                            <span className="text-muted-foreground/60">calibration:</span>
                            {cal.ece != null && (
                              <span><span className="text-muted-foreground/60">ECE</span>{" "}<span className="font-mono">{cal.ece.toFixed(3)}</span></span>
                            )}
                            {cal.brier_score != null && (
                              <span><span className="text-muted-foreground/60">Brier</span>{" "}<span className="font-mono">{cal.brier_score.toFixed(3)}</span></span>
                            )}
                            <span><span className="text-muted-foreground/60">n=</span><span className="font-mono">{cal.n_samples}</span></span>
                            <span className="text-muted-foreground/60">{dayjs(cal.measured_at).fromNow()}</span>
                          </div>
                        )}
                      </div>
                      {/* Right column: weights sha + ID */}
                      <div className="text-right shrink-0 space-y-0.5">
                        {m.weights_sha256 && (
                          <div className="font-mono text-[9px] text-muted-foreground/70" title={m.weights_sha256}>
                            sha256 {m.weights_sha256.slice(0, 10)}
                          </div>
                        )}
                        <div className="font-mono text-[9px] text-muted-foreground/40">{m.id.slice(0, 8)}</div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        );
      })}

      {rows.length === 0 && (
        <div className="text-center py-12 text-sm text-muted-foreground">
          No models registered yet. Migration 20260528010000 seeds the known set.
        </div>
      )}
    </div>
  );
}
