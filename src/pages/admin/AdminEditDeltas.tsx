/**
 * AdminEditDeltas — append-only view of every clinician_edit_deltas row.
 *
 * Surfaces the per-field override rate and the most-rejected field IDs.
 * Used by the training-pipeline operator to decide which findings most
 * need a new model. The information_value column is computed offline by
 * the supervised-flywheel job; we just show it.
 *
 * Filterable by edit_type and field_id (substring). Most-rejected fields
 * roll up at the top so triage is instant.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Activity, AlertCircle, ThumbsDown, Edit3, X, Check, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

type DeltaRow = {
  id: string;
  study_id: string;
  clinician_id: string | null;
  field_id: string;
  edit_type: "accept" | "edit" | "clear" | "reject" | string;
  original_value: unknown;
  new_value: unknown;
  original_derived_from: string | null;
  source_emission_id: string | null;
  reason_code: string | null;
  reason_text: string | null;
  information_value: number | null;
  created_at: string;
};

const EDIT_TYPE_STYLES: Record<string, { cls: string; icon: React.ComponentType<{ className?: string }>; label: string }> = {
  accept: { cls: "border-emerald-500/40 text-emerald-700 dark:text-emerald-300", icon: Check,    label: "accept" },
  edit:   { cls: "border-blue-500/40 text-blue-700 dark:text-blue-300",          icon: Edit3,    label: "edit"   },
  clear:  { cls: "border-muted-foreground/30 text-muted-foreground",             icon: X,        label: "clear"  },
  reject: { cls: "border-destructive/40 text-destructive",                        icon: ThumbsDown, label: "reject" },
};

type EditTypeFilter = "all" | "accept" | "edit" | "clear" | "reject";

const FILTER_OPTIONS: { id: EditTypeFilter; label: string }[] = [
  { id: "all",    label: "All" },
  { id: "edit",   label: "Edit" },
  { id: "accept", label: "Accept" },
  { id: "clear",  label: "Clear" },
  { id: "reject", label: "Reject" },
];

function valuePreview(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string") return v.length > 50 ? v.slice(0, 50) + "…" : v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try { return JSON.stringify(v).slice(0, 60); } catch { return String(v); }
}

export default function AdminEditDeltas() {
  const [filter, setFilter] = useState<EditTypeFilter>("all");
  const [search, setSearch] = useState("");

  const deltas = useQuery<DeltaRow[]>({
    queryKey: ["admin", "clinician_edit_deltas", filter],
    queryFn: async () => {
      let q = supabase
        .from("clinician_edit_deltas")
        .select("id, study_id, clinician_id, field_id, edit_type, original_value, new_value, original_derived_from, source_emission_id, reason_code, reason_text, information_value, created_at")
        .order("created_at", { ascending: false })
        .limit(500);
      if (filter !== "all") q = q.eq("edit_type", filter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as DeltaRow[];
    },
  });

  const filteredRows = useMemo(() => {
    const rows = deltas.data ?? [];
    if (!search) return rows;
    const s = search.toLowerCase();
    return rows.filter((r) =>
      r.field_id.toLowerCase().includes(s) ||
      (r.reason_code ?? "").toLowerCase().includes(s) ||
      (r.reason_text ?? "").toLowerCase().includes(s) ||
      r.study_id.toLowerCase().includes(s),
    );
  }, [deltas.data, search]);

  const byField = useMemo(() => {
    const map: Record<string, { total: number; rejects: number; edits: number; clears: number }> = {};
    for (const r of (deltas.data ?? [])) {
      const k = r.field_id;
      if (!map[k]) map[k] = { total: 0, rejects: 0, edits: 0, clears: 0 };
      map[k].total += 1;
      if (r.edit_type === "reject") map[k].rejects += 1;
      if (r.edit_type === "edit")   map[k].edits   += 1;
      if (r.edit_type === "clear")  map[k].clears  += 1;
    }
    return Object.entries(map)
      .map(([field, c]) => ({ field, ...c, rejectRate: c.total > 0 ? c.rejects / c.total : 0 }))
      .sort((a, b) => b.rejectRate - a.rejectRate)
      .slice(0, 10);
  }, [deltas.data]);

  if (deltas.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading edit deltas…</div>;
  }
  if (deltas.isError) {
    return (
      <div className="p-6">
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
            <p className="text-sm text-destructive">
              Failed to load edit deltas: {(deltas.error as Error)?.message}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalRows = (deltas.data ?? []).length;
  const totalRejects = (deltas.data ?? []).filter((r) => r.edit_type === "reject").length;

  return (
    <div className="p-6 space-y-5 max-w-6xl animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Edit Deltas</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Every accept / edit / clear / reject a clinician performs on a draft field. Append-only.
          Top {totalRows.toLocaleString()} most-recent rows. Override rate per field surfaces here so
          the next training cycle knows what to fix.
        </p>
      </div>

      {/* Top-rejected fields */}
      {byField.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-1.5">
            <ThumbsDown className="h-3.5 w-3.5 text-destructive" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Most-rejected fields (top 10)
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {byField.map((f) => (
              <div key={f.field}
                className={cn(
                  "rounded-md border px-3 py-2 text-xs flex items-center justify-between gap-2",
                  f.rejectRate > 0.4
                    ? "border-destructive/40 bg-destructive/5"
                    : f.rejectRate > 0.2
                      ? "border-amber-500/40 bg-amber-500/5"
                      : "border-border/60 bg-muted/30",
                )}
                onClick={() => setSearch(f.field)}
                role="button"
              >
                <span className="font-mono text-[10px] truncate" title={f.field}>{f.field}</span>
                <span className="font-mono tabular-nums shrink-0">
                  {(f.rejectRate * 100).toFixed(0)}% reject
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          {FILTER_OPTIONS.map((o) => (
            <button
              key={o.id}
              onClick={() => setFilter(o.id)}
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors border",
                filter === o.id
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
            placeholder="field_id, reason, study uuid…"
            className="pl-7 h-7 text-xs font-mono"
          />
        </div>
        <Badge variant="outline" className="text-[10px] ml-auto">
          <Activity className="h-2.5 w-2.5 mr-1" />
          {filteredRows.length} of {totalRows} shown · {totalRejects} rejects total
        </Badge>
      </div>

      {/* Rows */}
      <ScrollArea className="h-[calc(100vh-380px)] rounded-md border">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 bg-background/95 backdrop-blur border-b">
            <tr className="text-[9px] uppercase tracking-wider text-muted-foreground">
              <th className="text-left p-2 font-semibold">When</th>
              <th className="text-left p-2 font-semibold">Type</th>
              <th className="text-left p-2 font-semibold">Field</th>
              <th className="text-left p-2 font-semibold">From</th>
              <th className="text-left p-2 font-semibold">→ Old</th>
              <th className="text-left p-2 font-semibold">→ New</th>
              <th className="text-left p-2 font-semibold">Reason</th>
              <th className="text-right p-2 font-semibold">IV</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 && (
              <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">No deltas match.</td></tr>
            )}
            {filteredRows.map((r) => {
              const style = EDIT_TYPE_STYLES[r.edit_type] ?? EDIT_TYPE_STYLES.edit;
              const Icon = style.icon;
              return (
                <tr key={r.id} className="border-b border-border/40 hover:bg-muted/30">
                  <td className="p-2 text-muted-foreground whitespace-nowrap" title={r.created_at}>
                    {dayjs(r.created_at).fromNow()}
                  </td>
                  <td className="p-2">
                    <Badge variant="outline" className={cn("text-[9px] gap-1", style.cls)}>
                      <Icon className="h-2.5 w-2.5" />
                      {style.label}
                    </Badge>
                  </td>
                  <td className="p-2 font-mono text-[10px]">{r.field_id}</td>
                  <td className="p-2 text-muted-foreground font-mono text-[10px]">
                    {r.original_derived_from ?? "—"}
                  </td>
                  <td className="p-2 font-mono text-[10px] max-w-[160px] truncate" title={valuePreview(r.original_value)}>
                    {valuePreview(r.original_value)}
                  </td>
                  <td className="p-2 font-mono text-[10px] max-w-[160px] truncate" title={valuePreview(r.new_value)}>
                    {valuePreview(r.new_value)}
                  </td>
                  <td className="p-2 text-[10px] max-w-[160px] truncate" title={r.reason_text ?? ""}>
                    {r.reason_code ?? "—"}
                    {r.reason_text && <span className="text-muted-foreground"> · {r.reason_text}</span>}
                  </td>
                  <td className="p-2 text-right font-mono tabular-nums">
                    {r.information_value != null ? r.information_value.toFixed(3) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </ScrollArea>
    </div>
  );
}
