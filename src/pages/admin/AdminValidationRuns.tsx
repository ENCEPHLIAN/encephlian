/**
 * AdminValidationRuns — append-only view of every model_validation_runs row.
 *
 * Per the 20260602000100 gate, no model_versions row can be promoted to
 * status='serving' without at least one row here whose verdict is in
 * (functional, excellent). This page is how operators audit that gate:
 * what models have been validated, against which corpus, with what
 * verdict, and on what evidence. Read-only — runs are appended by the
 * offline validation job (super_admin / management writes only).
 *
 * Layout mirrors AdminEditDeltas: a sticky-headed scrollable table with
 * inline filters. Click a row to expand and see the full metrics JSON +
 * notes. Joined to model_versions client-side so the surface works even
 * if the PostgREST embed types lag behind the migration.
 */

import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Activity, AlertCircle, CheckCircle2, ChevronDown, ChevronRight,
  Gauge, Search, ShieldAlert, ShieldCheck, XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

type Verdict = "broken" | "middling" | "functional" | "excellent";

type RunRow = {
  id: string;
  model_version_id: string;
  corpus_name: string;
  corpus_version: string | null;
  n_files: number;
  n_samples: number;
  metrics: Record<string, unknown>;
  verdict: Verdict | string;
  run_at: string;
  run_by: string | null;
  script_blob_path: string | null;
  report_blob_path: string | null;
  notes: string | null;
};

type ModelLite = {
  id: string;
  name: string;
  version: string;
  family: string;
  status: string;
};

const VERDICT_STYLES: Record<string, { cls: string; icon: React.ComponentType<{ className?: string }>; label: string }> = {
  broken:     { cls: "border-destructive/40 text-destructive bg-destructive/5",                                      icon: XCircle,      label: "broken"     },
  middling:   { cls: "border-amber-500/40 text-amber-700 dark:text-amber-300 bg-amber-500/5",                        icon: ShieldAlert,  label: "middling"   },
  functional: { cls: "border-emerald-500/40 text-emerald-700 dark:text-emerald-300 bg-emerald-500/5",                icon: ShieldCheck,  label: "functional" },
  excellent:  { cls: "border-cyan-500/40 text-cyan-700 dark:text-cyan-300 bg-cyan-500/5",                            icon: CheckCircle2, label: "excellent"  },
};

type VerdictFilter = "all" | Verdict;

const FILTER_OPTIONS: { id: VerdictFilter; label: string }[] = [
  { id: "all",        label: "All" },
  { id: "excellent",  label: "Excellent" },
  { id: "functional", label: "Functional" },
  { id: "middling",   label: "Middling" },
  { id: "broken",     label: "Broken" },
];

/** Pull AUC / accuracy / F1 from a metrics jsonb in a forgiving way. */
function metricNumber(metrics: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = metrics?.[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

function truncate(s: string | null | undefined, n: number): string {
  if (!s) return "—";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

export default function AdminValidationRuns() {
  const [verdictFilter, setVerdictFilter] = useState<VerdictFilter>("all");
  const [search,        setSearch]        = useState("");
  const [expandedId,    setExpandedId]    = useState<string | null>(null);

  const runs = useQuery<RunRow[]>({
    queryKey: ["admin", "model_validation_runs", verdictFilter],
    queryFn: async () => {
      let q = supabase
        .from("model_validation_runs")
        .select("id, model_version_id, corpus_name, corpus_version, n_files, n_samples, metrics, verdict, run_at, run_by, script_blob_path, report_blob_path, notes")
        .order("run_at", { ascending: false })
        .limit(500);
      if (verdictFilter !== "all") q = q.eq("verdict", verdictFilter);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as unknown as RunRow[]);
    },
  });

  const models = useQuery<Record<string, ModelLite>>({
    queryKey: ["admin", "model_validation_runs", "models_index"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("model_versions")
        .select("id, name, version, family, status");
      if (error) throw error;
      const idx: Record<string, ModelLite> = {};
      for (const m of (data ?? []) as ModelLite[]) idx[m.id] = m;
      return idx;
    },
  });

  const filteredRows = useMemo(() => {
    const rows = runs.data ?? [];
    if (!search) return rows;
    const s = search.toLowerCase();
    const idx = models.data ?? {};
    return rows.filter((r) => {
      const m = idx[r.model_version_id];
      return (
        (m?.name        ?? "").toLowerCase().includes(s) ||
        (m?.version     ?? "").toLowerCase().includes(s) ||
        (m?.family      ?? "").toLowerCase().includes(s) ||
        r.corpus_name.toLowerCase().includes(s) ||
        (r.notes ?? "").toLowerCase().includes(s) ||
        (r.script_blob_path ?? "").toLowerCase().includes(s)
      );
    });
  }, [runs.data, models.data, search]);

  const verdictCounts = useMemo(() => {
    const rows = runs.data ?? [];
    const c = { broken: 0, middling: 0, functional: 0, excellent: 0 } as Record<Verdict, number>;
    for (const r of rows) {
      if (r.verdict in c) c[r.verdict as Verdict] += 1;
    }
    return c;
  }, [runs.data]);

  if (runs.isLoading || models.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading validation runs…</div>;
  }
  if (runs.isError || models.isError) {
    const err = (runs.error || models.error) as Error | undefined;
    return (
      <div className="p-6">
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
            <p className="text-sm text-destructive">
              Failed to load validation runs: {err?.message}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const allRows  = runs.data ?? [];
  const idx      = models.data ?? {};
  const totalRows = allRows.length;
  const qualifying = verdictCounts.functional + verdictCounts.excellent;

  return (
    <div className="p-6 space-y-5 max-w-6xl animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Validation runs</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Independent ground-truth validation per model_version. Required to promote a model to{" "}
          <span className="font-mono">serving</span>. Append-only: rows are written by the offline
          validation job and gate the registry trigger. Distinct from calibration, which measures
          probability quality on already-trusted outputs.
        </p>
      </div>

      {/* Summary */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="text-[10px] gap-1">
          <Gauge className="h-2.5 w-2.5" />
          runs · <span className="font-mono">{totalRows}</span>
        </Badge>
        <Badge variant="outline" className={cn("text-[10px] gap-1", VERDICT_STYLES.excellent.cls)}>
          excellent · <span className="font-mono">{verdictCounts.excellent}</span>
        </Badge>
        <Badge variant="outline" className={cn("text-[10px] gap-1", VERDICT_STYLES.functional.cls)}>
          functional · <span className="font-mono">{verdictCounts.functional}</span>
        </Badge>
        <Badge variant="outline" className={cn("text-[10px] gap-1", VERDICT_STYLES.middling.cls)}>
          middling · <span className="font-mono">{verdictCounts.middling}</span>
        </Badge>
        <Badge variant="outline" className={cn("text-[10px] gap-1", VERDICT_STYLES.broken.cls)}>
          broken · <span className="font-mono">{verdictCounts.broken}</span>
        </Badge>
        <Badge variant="outline" className="text-[10px] gap-1 ml-auto">
          <Activity className="h-2.5 w-2.5" />
          {qualifying} qualify for serving
        </Badge>
      </div>

      {totalRows === 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                No validation runs yet — first one will appear after a model is independently validated
              </p>
              <p className="text-xs text-muted-foreground leading-snug">
                The <span className="font-mono">enforce_model_validation_for_serving</span> trigger on{" "}
                <span className="font-mono">model_versions</span> will refuse any promotion to{" "}
                <span className="font-mono">serving</span> until at least one row lands here with
                verdict in (functional, excellent).
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          {FILTER_OPTIONS.map((o) => (
            <button
              key={o.id}
              onClick={() => setVerdictFilter(o.id)}
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors border",
                verdictFilter === o.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted/40 text-muted-foreground border-border hover:text-foreground",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="model name, corpus, notes, script path…"
            className="pl-7 h-7 text-xs font-mono"
          />
        </div>
        <Badge variant="outline" className="text-[10px] ml-auto">
          {filteredRows.length} of {totalRows} shown
        </Badge>
      </div>

      {/* Rows */}
      <ScrollArea className="h-[calc(100vh-380px)] rounded-md border">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 bg-background/95 backdrop-blur border-b z-10">
            <tr className="text-[9px] uppercase tracking-wider text-muted-foreground">
              <th className="w-4 p-2" />
              <th className="text-left p-2 font-semibold">When</th>
              <th className="text-left p-2 font-semibold">Model</th>
              <th className="text-left p-2 font-semibold">Verdict</th>
              <th className="text-left p-2 font-semibold">Corpus</th>
              <th className="text-right p-2 font-semibold">Files / Samples</th>
              <th className="text-right p-2 font-semibold">AUC</th>
              <th className="text-right p-2 font-semibold">Acc</th>
              <th className="text-right p-2 font-semibold">F1</th>
              <th className="text-left p-2 font-semibold">Script</th>
              <th className="text-left p-2 font-semibold">Notes</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 && allRows.length > 0 && (
              <tr><td colSpan={11} className="text-center py-8 text-muted-foreground">No runs match.</td></tr>
            )}
            {filteredRows.map((r) => {
              const style   = VERDICT_STYLES[r.verdict] ?? VERDICT_STYLES.middling;
              const Icon    = style.icon;
              const m       = idx[r.model_version_id];
              const auc     = metricNumber(r.metrics, ["auc", "AUC", "roc_auc"]);
              const acc     = metricNumber(r.metrics, ["accuracy", "acc", "top1_accuracy"]);
              const f1      = metricNumber(r.metrics, ["f1", "F1", "f1_score", "macro_f1"]);
              const isOpen  = expandedId === r.id;
              const onToggle = () => setExpandedId(isOpen ? null : r.id);

              return (
                <Fragment key={r.id}>
                  <tr
                    className={cn(
                      "border-b border-border/40 hover:bg-muted/30 cursor-pointer",
                      isOpen && "bg-muted/40",
                    )}
                    onClick={onToggle}
                  >
                    <td className="p-2 text-muted-foreground">
                      {isOpen
                        ? <ChevronDown className="h-3 w-3" />
                        : <ChevronRight className="h-3 w-3" />}
                    </td>
                    <td className="p-2 text-muted-foreground whitespace-nowrap" title={r.run_at}>
                      {dayjs(r.run_at).fromNow()}
                    </td>
                    <td className="p-2 font-mono text-[10px]">
                      {m ? (
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold">{m.name}</span>
                          <span className="text-muted-foreground">v{m.version}</span>
                          <Badge variant="outline" className="text-[9px]">{m.family}</Badge>
                          {m.status === "serving" && (
                            <span
                              className="text-[9px] uppercase tracking-wider text-emerald-700 dark:text-emerald-300"
                              title="model currently serving"
                            >
                              serving
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">{r.model_version_id.slice(0, 8)}</span>
                      )}
                    </td>
                    <td className="p-2">
                      <Badge variant="outline" className={cn("text-[9px] gap-1", style.cls)}>
                        <Icon className="h-2.5 w-2.5" />
                        {style.label}
                      </Badge>
                    </td>
                    <td className="p-2 font-mono text-[10px]">
                      {r.corpus_name}
                      {r.corpus_version && (
                        <span className="text-muted-foreground"> · {r.corpus_version}</span>
                      )}
                    </td>
                    <td className="p-2 text-right font-mono tabular-nums">
                      <span className="text-muted-foreground">{r.n_files.toLocaleString()}</span>
                      <span className="text-muted-foreground/60"> / </span>
                      {r.n_samples.toLocaleString()}
                    </td>
                    <td className="p-2 text-right font-mono tabular-nums">
                      {auc != null ? auc.toFixed(3) : "—"}
                    </td>
                    <td className="p-2 text-right font-mono tabular-nums">
                      {acc != null ? acc.toFixed(3) : "—"}
                    </td>
                    <td className="p-2 text-right font-mono tabular-nums">
                      {f1 != null ? f1.toFixed(3) : "—"}
                    </td>
                    <td className="p-2 font-mono text-[10px] text-muted-foreground max-w-[180px] truncate" title={r.script_blob_path ?? ""}>
                      {truncate(r.script_blob_path, 28)}
                    </td>
                    <td className="p-2 text-[10px] text-muted-foreground max-w-[200px] truncate" title={r.notes ?? ""}>
                      {truncate(r.notes, 40)}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="border-b border-border/40 bg-muted/20">
                      <td />
                      <td colSpan={10} className="p-3">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                          {/* Metrics JSON */}
                          <div className="space-y-1">
                            <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">
                              Metrics
                            </div>
                            <pre className="text-[10px] font-mono leading-snug bg-background/60 border border-border/40 rounded p-2 overflow-x-auto whitespace-pre-wrap break-words">
                              {JSON.stringify(r.metrics, null, 2)}
                            </pre>
                          </div>
                          {/* Notes + paths */}
                          <div className="space-y-2">
                            {r.notes && (
                              <div className="space-y-1">
                                <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">
                                  Notes
                                </div>
                                <p className="text-[11px] leading-snug text-foreground/90 whitespace-pre-wrap break-words">
                                  {r.notes}
                                </p>
                              </div>
                            )}
                            <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-[10px]">
                              <span className="text-muted-foreground/70">script</span>
                              <span className="font-mono break-all">{r.script_blob_path ?? "—"}</span>
                              <span className="text-muted-foreground/70">report</span>
                              <span className="font-mono break-all">{r.report_blob_path ?? "—"}</span>
                              <span className="text-muted-foreground/70">run_by</span>
                              <span className="font-mono">{r.run_by ?? "—"}</span>
                              <span className="text-muted-foreground/70">run_at</span>
                              <span className="font-mono">{dayjs(r.run_at).format("YYYY-MM-DD HH:mm:ss")}</span>
                              <span className="text-muted-foreground/70">id</span>
                              <span className="font-mono">{r.id}</span>
                              <span className="text-muted-foreground/70">model_version_id</span>
                              <span className="font-mono">{r.model_version_id}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </ScrollArea>
    </div>
  );
}
