import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Search, Copy, Check, AlertCircle, CheckCircle2, Info } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

/**
 * AdminTrace — Devops #2: audit-trail observability.
 *
 * Paste a request_id (prov_xxxxxxxx, sign_xxxxxxxx, cli_xxxxxxxx, etc.) and
 * see the full chain across audit_logs + study_pipeline_events + the source
 * row's review_events. Edge-function logs live in Supabase dashboard — the
 * Trace page just points the operator to the right log query.
 */

type AuditRow = {
  id: string;
  created_at: string;
  event_type: string;
  action: string | null;
  resource_type: string | null;
  resource_id: string | null;
  user_id: string | null;
  actor_email: string | null;
  actor_role: string | null;
  event_data: Record<string, unknown> | null;
  request_id: string | null;
};

type PipelineEvent = {
  id: string;
  created_at: string;
  study_id: string;
  step: string;
  status: string;
  source: string;
  detail: Record<string, unknown> | null;
  correlation_id: string | null;
};

const STATUS_STYLE: Record<string, string> = {
  ok: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  info: "bg-blue-500/10 text-blue-500",
  error: "bg-red-500/10 text-red-500",
  skipped: "bg-muted text-muted-foreground",
};

function CopyChip({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
      title="Copy"
    >
      <span className="font-mono text-[10px]">{value}</span>
      {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3 opacity-40" />}
    </button>
  );
}

export default function AdminTrace() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQ = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(initialQ);
  const [searchedQuery, setSearchedQuery] = useState<string | null>(initialQ || null);

  // Keep URL in sync when user searches. Allows deep-link from StudyDetail
  // ("Open in trace") and copy-pasteable shareable URLs.
  useEffect(() => {
    if (searchedQuery && searchParams.get("q") !== searchedQuery) {
      setSearchParams({ q: searchedQuery }, { replace: true });
    }
  }, [searchedQuery, searchParams, setSearchParams]);

  const audit = useQuery<AuditRow[]>({
    queryKey: ["admin-trace-audit", searchedQuery],
    enabled: !!searchedQuery,
    queryFn: async () => {
      // Search request_id, embedded request_id, AND resource_id — so a
      // study UUID, request_id, or audit-row id all hit.
      const { data, error } = await supabase
        .from("audit_logs")
        .select("id, created_at, event_type, action, resource_type, resource_id, user_id, actor_email, actor_role, event_data, request_id")
        .or(`request_id.eq.${searchedQuery},event_data->>request_id.eq.${searchedQuery},resource_id.eq.${searchedQuery}`)
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data as AuditRow[]) ?? [];
    },
  });

  const pipeline = useQuery<PipelineEvent[]>({
    queryKey: ["admin-trace-pipeline", searchedQuery],
    enabled: !!searchedQuery,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("study_pipeline_events")
        .select("id, created_at, study_id, step, status, source, detail, correlation_id")
        .eq("correlation_id", searchedQuery)
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data as PipelineEvent[]) ?? [];
    },
  });

  const handleSearch = () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setSearchedQuery(trimmed);
    setSearchParams({ q: trimmed }, { replace: true });
  };

  const auditCount = audit.data?.length ?? 0;
  const pipelineCount = pipeline.data?.length ?? 0;
  const studyIds = Array.from(new Set([
    ...(audit.data?.map((r) => r.event_data?.study_id as string).filter(Boolean) ?? []),
    ...(audit.data?.map((r) => r.resource_type === "study" ? r.resource_id : null).filter(Boolean) ?? []),
    ...(pipeline.data?.map((e) => e.study_id) ?? []),
  ]));

  return (
    <div className="space-y-6 max-w-5xl animate-fade-in">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Trace</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Paste a <span className="font-mono">request_id</span> and see every audit-log row,
          pipeline event, and resource it touched. Edge function HTTP logs live in the
          Supabase dashboard — search there with the same id for the network slice.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="prov_xxxxxxxx, sign_xxxxxxxx, cli_xxxxxxxx…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="pl-8 h-8 text-sm font-mono"
          />
        </div>
        <Button size="sm" onClick={handleSearch} disabled={!query.trim()}>
          Trace
        </Button>
      </div>

      {!searchedQuery ? (
        <Card>
          <CardContent className="p-6 text-center text-xs text-muted-foreground space-y-2">
            <Info className="h-5 w-5 mx-auto opacity-60" />
            <p>Every provisioning, clinician-create, and sign-report flow stamps a request_id.</p>
            <p>It appears in success toasts and error messages. Paste it above to see the full chain.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Card><CardContent className="p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">audit_logs hits</p>
              <p className="text-lg font-semibold mt-0.5">{audit.isLoading ? "—" : auditCount}</p>
            </CardContent></Card>
            <Card><CardContent className="p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">pipeline events</p>
              <p className="text-lg font-semibold mt-0.5">{pipeline.isLoading ? "—" : pipelineCount}</p>
            </CardContent></Card>
            <Card><CardContent className="p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">studies touched</p>
              <p className="text-lg font-semibold mt-0.5">{studyIds.length}</p>
            </CardContent></Card>
          </div>

          {/* Audit log timeline */}
          <div className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              audit_logs
            </h2>
            {audit.isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : auditCount === 0 ? (
              <p className="text-xs text-muted-foreground">No audit rows matched.</p>
            ) : (
              <div className="space-y-1.5">
                {audit.data?.map((r) => (
                  <Card key={r.id}>
                    <CardContent className="p-3 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className="text-[10px] h-4 px-1.5 capitalize">
                          {r.event_type}
                        </Badge>
                        {r.action && (
                          <span className="text-[10px] font-mono text-muted-foreground">{r.action}</span>
                        )}
                        {r.actor_role && (
                          <span className="text-[10px] font-mono text-muted-foreground">{r.actor_role}</span>
                        )}
                        <span className="text-[10px] text-muted-foreground ml-auto">
                          {format(new Date(r.created_at), "d MMM HH:mm:ss")}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 text-[11px]">
                        <div>
                          <span className="text-muted-foreground">actor</span>{" "}
                          <span className="font-mono">{r.actor_email ?? "—"}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">resource</span>{" "}
                          <span className="font-mono">{r.resource_type}/{r.resource_id?.slice(0, 8)}</span>
                        </div>
                      </div>
                      {r.event_data && (
                        <details className="text-[10px]">
                          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                            event_data
                          </summary>
                          <pre className="mt-1 p-2 bg-muted/40 rounded font-mono overflow-x-auto whitespace-pre-wrap">
                            {JSON.stringify(r.event_data, null, 2)}
                          </pre>
                        </details>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Pipeline events */}
          <div className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              study_pipeline_events
            </h2>
            {pipeline.isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : pipelineCount === 0 ? (
              <p className="text-xs text-muted-foreground">No pipeline events matched.</p>
            ) : (
              <div className="space-y-1">
                {pipeline.data?.map((e) => (
                  <div
                    key={e.id}
                    className="rounded-md border border-border/60 p-2 flex items-center gap-2 text-[11px]"
                  >
                    {e.status === "ok" ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    ) : e.status === "error" ? (
                      <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                    ) : (
                      <Info className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                    )}
                    <Badge
                      variant="secondary"
                      className={cn("text-[10px] h-4 px-1.5", STATUS_STYLE[e.status] ?? "bg-muted")}
                    >
                      {e.status}
                    </Badge>
                    <span className="font-mono">{e.step}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="font-mono text-muted-foreground">{e.source}</span>
                    <span className="text-muted-foreground ml-auto">
                      {format(new Date(e.created_at), "HH:mm:ss")}
                    </span>
                    <CopyChip value={e.study_id} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Hand-off to Supabase logs */}
          <Card>
            <CardContent className="p-3 text-[11px] text-muted-foreground">
              <p className="font-medium text-foreground mb-1">Edge function HTTP logs</p>
              <p>
                For HTTP-level traces (status codes, latencies, raw bodies), open
                Supabase Dashboard → Edge Functions → search by{" "}
                <span className="font-mono">{searchedQuery}</span>. The request_id is also
                returned in the response body and the <span className="font-mono">x-request-id</span> header.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
