/**
 * AdminReprocess — bulk reprocess jobs surface.
 *
 * Lists every reprocess_jobs row. Operators can start a new job (picks
 * target model_version + filter criteria) and cancel a running/queued
 * one. The actual EXECUTOR runs outside this page (a separate edge fn /
 * cron worker that picks up status='queued' rows). Until that's
 * deployed, jobs created here sit in 'queued' indefinitely; the page
 * makes that explicit instead of hiding it.
 */

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertCircle, Play, X, RotateCcw, Clock, CheckCircle2, AlertTriangle, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { systemFeedback } from "@/lib/systemFeedback";
import { formatEdgeFunctionError } from "@/lib/edgeFunctionError";
import { cn } from "@/lib/utils";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

type ModelRow = {
  id: string;
  name: string;
  version: string;
  status: string;
};

type JobRow = {
  id: string;
  description: string | null;
  target_filter: Record<string, unknown>;
  target_model_version_id: string | null;
  status: "queued" | "running" | "partial" | "completed" | "failed" | "cancelled";
  studies_total: number | null;
  studies_processed: number;
  studies_failed: number;
  started_at: string | null;
  finished_at: string | null;
  error_summary: string | null;
  request_id: string | null;
  created_at: string;
};

const STATUS_STYLES: Record<JobRow["status"], { cls: string; icon: any }> = {
  queued:    { cls: "border-muted-foreground/30 text-muted-foreground",                  icon: Clock },
  running:   { cls: "border-primary/40 text-primary bg-primary/5",                       icon: Loader2 },
  partial:   { cls: "border-amber-500/40 text-amber-700 dark:text-amber-300 bg-amber-500/5", icon: AlertTriangle },
  completed: { cls: "border-emerald-500/40 text-emerald-700 dark:text-emerald-300 bg-emerald-500/5", icon: CheckCircle2 },
  failed:    { cls: "border-destructive/40 text-destructive bg-destructive/5",           icon: AlertCircle },
  cancelled: { cls: "border-muted-foreground/30 text-muted-foreground line-through",     icon: X },
};

function shortRequest(s: string | null): string {
  if (!s) return "";
  return s.length > 16 ? s.slice(0, 16) + "…" : s;
}

export default function AdminReprocess() {
  const qc = useQueryClient();
  const [openForm, setOpenForm] = useState(false);

  // ── Lists ─────────────────────────────────────────────
  const models = useQuery<ModelRow[]>({
    queryKey: ["admin", "reprocess", "models"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("model_versions")
        .select("id, name, version, status")
        .order("name")
        .order("version", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ModelRow[];
    },
  });

  const jobs = useQuery<JobRow[]>({
    queryKey: ["admin", "reprocess", "jobs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reprocess_jobs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as JobRow[];
    },
    refetchInterval: 5000,
  });

  // ── New job form state ───────────────────────────────
  const [description, setDescription]      = useState("");
  const [modelId, setModelId]              = useState<string | undefined>();
  const [slaFilter, setSlaFilter]          = useState<string>("ALL");
  const [createdAfter, setCreatedAfter]    = useState("");
  const [schemaVersionFilter, setSchemaVersionFilter] = useState("ALL");
  const [submitting, setSubmitting]        = useState(false);
  const [processing, setProcessing]        = useState(false);

  const resetForm = () => {
    setDescription("");
    setModelId(undefined);
    setSlaFilter("ALL");
    setCreatedAfter("");
    setSchemaVersionFilter("ALL");
  };

  const handleCreate = async () => {
    setSubmitting(true);
    try {
      const target_filter: Record<string, unknown> = {};
      if (slaFilter !== "ALL")            target_filter.sla = slaFilter;
      if (createdAfter)                   target_filter.created_after = createdAfter;
      if (schemaVersionFilter !== "ALL")  target_filter.schema_version = schemaVersionFilter;

      const reqArr = new Uint8Array(4);
      crypto.getRandomValues(reqArr);
      const requestId = "rep_" + Array.from(reqArr, (b) => b.toString(16).padStart(2, "0")).join("");

      const { data: userRes } = await supabase.auth.getUser();
      const { error } = await supabase.from("reprocess_jobs").insert({
        initiated_by: userRes.user?.id ?? null,
        description:  description.trim() || null,
        target_filter,
        target_model_version_id: modelId ?? null,
        status: "queued",
        request_id: requestId,
      });
      if (error) throw error;
      toast.success("Reprocess job queued", { description: `Request id ${requestId}` });
      resetForm();
      setOpenForm(false);
      qc.invalidateQueries({ queryKey: ["admin", "reprocess", "jobs"] });
    } catch (e: any) {
      toast.error("Could not queue job", { description: e?.message ?? "unknown" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (jobId: string) => {
    const { error } = await supabase
      .from("reprocess_jobs")
      .update({ status: "cancelled", finished_at: new Date().toISOString() })
      .eq("id", jobId);
    if (error) {
      toast.error("Could not cancel", { description: error.message });
    } else {
      toast.success("Job cancelled");
      qc.invalidateQueries({ queryKey: ["admin", "reprocess", "jobs"] });
    }
  };

  const handleRetry = async (job: JobRow) => {
    const reqArr = new Uint8Array(4);
    crypto.getRandomValues(reqArr);
    const requestId = "rep_" + Array.from(reqArr, (b) => b.toString(16).padStart(2, "0")).join("");
    const { data: userRes } = await supabase.auth.getUser();
    const { error } = await supabase.from("reprocess_jobs").insert({
      initiated_by: userRes.user?.id ?? null,
      description:  `Retry of ${job.id.slice(0, 8)}: ${job.description ?? ""}`,
      target_filter: job.target_filter,
      target_model_version_id: job.target_model_version_id,
      status: "queued",
      request_id: requestId,
    });
    if (error) {
      toast.error("Could not retry", { description: error.message });
    } else {
      toast.success("Re-queued", { description: requestId });
      qc.invalidateQueries({ queryKey: ["admin", "reprocess", "jobs"] });
    }
  };

  const jobRows = jobs.data ?? [];
  const totalsByStatus = useMemo(() => {
    const m: Record<string, number> = {};
    for (const j of jobRows) m[j.status] = (m[j.status] ?? 0) + 1;
    return m;
  }, [jobRows]);

  const noExecutorYet = jobRows.some((j) => j.status === "queued");

  return (
    <div className="p-6 space-y-5 max-w-6xl animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Reprocess</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Bulk re-run studies through a chosen model. Jobs land here as
            <span className="font-mono"> queued </span> rows; a separate
            executor picks them up and updates progress.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              setProcessing(true);
              try {
                const { data, error } = await supabase.functions.invoke("reprocess_executor", { body: {} });
                if (error) {
                  const detail = await formatEdgeFunctionError(error, data);
                  systemFeedback.edgeFunctionFailed("reprocess_executor", detail);
                  return;
                }
                if (data?.idle) {
                  toast.info("Queue idle", { description: "No queued or running jobs to process." });
                } else if (data?.job_complete) {
                  toast.success(`Job complete · ${data.processed ?? 0} processed${data.failed ? `, ${data.failed} failed` : ""}`);
                } else {
                  toast.success(`Processed ${data?.processed ?? 0} / ${data?.total ?? "?"}`, {
                    description: `Run again to continue the batch. job=${data?.job_id?.slice(0, 8) ?? "?"}`,
                  });
                }
                qc.invalidateQueries({ queryKey: ["admin", "reprocess", "jobs"] });
              } catch (e: any) {
                systemFeedback.edgeFunctionFailed("reprocess_executor", e?.message ?? String(e));
              } finally {
                setProcessing(false);
              }
            }}
            disabled={processing}
            className="gap-1.5"
            title="Run reprocess_executor edge function once. Processes up to 25 studies of the oldest queued/running job."
          >
            {processing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
            Process queue
          </Button>
          <Button size="sm" onClick={() => setOpenForm((v) => !v)} className="gap-1.5">
            <Play className="h-3.5 w-3.5" />
            {openForm ? "Close" : "New job"}
          </Button>
        </div>
      </div>

      {/* Executor hint — explain the trigger options when jobs are queued */}
      {noExecutorYet && (
        <Card className="border-border/60 bg-muted/30">
          <CardContent className="p-3 flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-[11px] text-muted-foreground leading-snug">
              Jobs are picked up by <span className="font-mono">reprocess_executor</span>.
              Click <span className="font-medium">Process queue</span> to run one batch (≤ 25 studies)
              now, or wire pg_cron to invoke it every minute. Each batch calls
              <span className="font-mono"> promote_to_v2 </span> per study so all §9 gates fire on the
              re-validated payload.
            </p>
          </CardContent>
        </Card>
      )}

      {/* New job form */}
      {openForm && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                New reprocess job
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Description</label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. backfill v3.0.1 over Q1 2026"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Target model</label>
                <Select value={modelId} onValueChange={setModelId}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Pick a model_version…" /></SelectTrigger>
                  <SelectContent>
                    {(models.data ?? []).map((m) => (
                      <SelectItem key={m.id} value={m.id} className="text-xs font-mono">
                        {m.name} v{m.version} · {m.status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">SLA filter</label>
                <Select value={slaFilter} onValueChange={setSlaFilter}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["ALL", "STAT", "24H", "48H", "ROUTINE"].map((s) => (
                      <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Created after</label>
                <Input
                  type="date"
                  value={createdAfter}
                  onChange={(e) => setCreatedAfter(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Schema version filter</label>
                <Select value={schemaVersionFilter} onValueChange={setSchemaVersionFilter}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["ALL", "mind.report.v1", "mind.report.v2"].map((s) => (
                      <SelectItem key={s} value={s} className="text-xs font-mono">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Button size="sm" onClick={handleCreate} disabled={submitting || !modelId} className="gap-1.5">
                {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                Queue job
              </Button>
              <Button size="sm" variant="outline" onClick={() => { resetForm(); setOpenForm(false); }}>
                Cancel
              </Button>
              {!modelId && <span className="text-[10px] text-muted-foreground">Pick a target model to enable</span>}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Status counters */}
      <div className="flex items-center gap-2 flex-wrap">
        {(["queued", "running", "partial", "completed", "failed", "cancelled"] as const).map((s) => (
          <Badge key={s} variant="outline" className={cn("text-[10px] gap-1", STATUS_STYLES[s].cls)}>
            {s} · <span className="font-mono">{totalsByStatus[s] ?? 0}</span>
          </Badge>
        ))}
      </div>

      {/* Jobs list */}
      <div className="space-y-2">
        {jobRows.length === 0 && (
          <div className="text-center py-10 text-sm text-muted-foreground">
            No reprocess jobs yet.
          </div>
        )}
        {jobRows.map((j) => {
          const style = STATUS_STYLES[j.status];
          const Icon  = style.icon;
          const pct   = j.studies_total && j.studies_total > 0
            ? Math.round((j.studies_processed / j.studies_total) * 100)
            : null;
          const modelLabel = (models.data ?? []).find((m) => m.id === j.target_model_version_id);
          const cancellable = j.status === "queued" || j.status === "running";
          const retryable   = j.status === "failed" || j.status === "cancelled" || j.status === "partial";

          return (
            <Card key={j.id} className="border-border/60">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className={cn("text-[9px] gap-1", style.cls)}>
                    <Icon className={cn("h-2.5 w-2.5", j.status === "running" && "animate-spin")} />
                    {j.status}
                  </Badge>
                  {modelLabel && (
                    <Badge variant="outline" className="text-[9px] font-mono">
                      {modelLabel.name} v{modelLabel.version}
                    </Badge>
                  )}
                  <span className="text-[11px] text-foreground truncate">
                    {j.description || <span className="italic text-muted-foreground">(no description)</span>}
                  </span>
                  <span className="ml-auto text-[10px] text-muted-foreground font-mono">
                    {shortRequest(j.request_id)}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
                  <span>created {dayjs(j.created_at).fromNow()}</span>
                  {j.started_at  && <span>started {dayjs(j.started_at).fromNow()}</span>}
                  {j.finished_at && <span>finished {dayjs(j.finished_at).fromNow()}</span>}
                  {j.studies_total != null && (
                    <span>
                      <span className="font-mono">{j.studies_processed}</span>
                      {" / "}
                      <span className="font-mono">{j.studies_total}</span>
                      {j.studies_failed > 0 && <span className="text-destructive"> ({j.studies_failed} failed)</span>}
                    </span>
                  )}
                </div>

                {pct != null && (
                  <Progress value={pct} className="h-1" />
                )}

                {Object.keys(j.target_filter ?? {}).length > 0 && (
                  <div className="text-[10px] font-mono text-muted-foreground/80 bg-muted/30 rounded px-2 py-1 overflow-x-auto">
                    {JSON.stringify(j.target_filter)}
                  </div>
                )}

                {j.error_summary && (
                  <div className="text-[10px] text-destructive bg-destructive/5 rounded px-2 py-1">
                    {j.error_summary}
                  </div>
                )}

                <div className="flex items-center gap-1.5">
                  {cancellable && (
                    <Button size="sm" variant="ghost" onClick={() => handleCancel(j.id)} className="h-6 px-2 text-[10px] gap-1 text-muted-foreground hover:text-destructive">
                      <X className="h-3 w-3" />
                      Cancel
                    </Button>
                  )}
                  {retryable && (
                    <Button size="sm" variant="ghost" onClick={() => handleRetry(j)} className="h-6 px-2 text-[10px] gap-1 text-muted-foreground hover:text-foreground">
                      <RotateCcw className="h-3 w-3" />
                      Re-queue
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
