import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  RefreshCw, CheckCircle2, XCircle, AlertCircle, Loader2,
  Brain, Server, Database, HardDrive, Cpu, Zap, Activity,
  ChevronDown, ChevronRight, Clock, Package, GitBranch, Settings
} from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveReadApiBase, getReadApiKey } from "@/shared/readApiConfig";

const CPLANE_BASE = String((import.meta as any).env?.VITE_CPLANE_BASE || "").replace(/\/+$/, "");
const IPLANE_BASE = String((import.meta as any).env?.VITE_IPLANE_BASE || "").replace(/\/+$/, "");
const READ_API_BASE = resolveReadApiBase().replace(/\/+$/, "");
const READ_API_KEY = getReadApiKey();
const SUPABASE_URL = String((import.meta as any).env?.VITE_SUPABASE_URL || "");

// ─── Types ──────────────────────────────────────────────────────────────────

type ServiceStatus = "healthy" | "degraded" | "down" | "unchecked";

type ServiceResult = {
  status: ServiceStatus;
  latencyMs: number | null;
  data?: Record<string, any>;
  error?: string;
  checkedAt: string;
};

type HealthState = {
  cplane: ServiceResult | null;
  iplane: ServiceResult | null;
  readapi: ServiceResult | null;
  database: ServiceResult | null;
  storage: ServiceResult | null;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

async function probe(url: string, opts: RequestInit = {}): Promise<{ ok: boolean; ms: number; data?: any; error?: string }> {
  const t0 = performance.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000), ...opts });
    const ms = Math.round(performance.now() - t0);
    if (!res.ok) return { ok: false, ms, error: `HTTP ${res.status} ${res.statusText}` };
    let data: any;
    try { data = await res.json(); } catch { data = {}; }
    return { ok: true, ms, data };
  } catch (e: any) {
    return { ok: false, ms: Math.round(performance.now() - t0), error: e?.message || String(e) };
  }
}

function statusFromProbe(r: { ok: boolean; ms: number }): ServiceStatus {
  if (!r.ok) return "down";
  if (r.ms > 2000) return "degraded";
  return "healthy";
}

// ─── UI primitives ──────────────────────────────────────────────────────────

function Dot({ status }: { status: ServiceStatus | "unchecked" }) {
  return (
    <span className={cn("h-2.5 w-2.5 rounded-full shrink-0 inline-block", {
      "bg-emerald-500": status === "healthy",
      "bg-amber-400 animate-pulse": status === "degraded",
      "bg-red-500 animate-pulse": status === "down",
      "bg-muted-foreground/30": status === "unchecked",
    })} />
  );
}

function StatusPill({ status }: { status: ServiceStatus | "unchecked" }) {
  const variants: Record<string, string> = {
    healthy: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    degraded: "bg-amber-400/10 text-amber-400 border-amber-400/20",
    down: "bg-red-500/10 text-red-500 border-red-500/20",
    unchecked: "bg-muted/30 text-muted-foreground border-border/40",
  };
  return (
    <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded border tracking-wide", variants[status] || variants.unchecked)}>
      {status.toUpperCase()}
    </span>
  );
}

function KV({ label, value, mono = false, dim = false }: { label: string; value: React.ReactNode; mono?: boolean; dim?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1 border-b border-border/30 last:border-0">
      <span className={cn("text-xs shrink-0", dim ? "text-muted-foreground/60" : "text-muted-foreground")}>{label}</span>
      <span className={cn("text-xs text-right break-all", mono && "font-mono", dim && "text-muted-foreground/60")}>{value}</span>
    </div>
  );
}

function EnvBadge({ set }: { set: boolean }) {
  return (
    <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-mono", set
      ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
      : "bg-red-500/10 text-red-500 border-red-500/20")}>
      {set ? "SET" : "MISSING"}
    </span>
  );
}

function Section({ title, icon: Icon, children, defaultOpen = true }: {
  title: string; icon: React.ElementType; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-border/60 overflow-hidden">
      <button
        className="w-full flex items-center gap-2.5 px-4 py-3 bg-muted/20 hover:bg-muted/40 transition-colors text-left"
        onClick={() => setOpen(o => !o)}
      >
        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium flex-1">{title}</span>
        {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>
      {open && <div className="p-4 space-y-3">{children}</div>}
    </div>
  );
}

// ─── Service Card ────────────────────────────────────────────────────────────

function ServiceCard({
  icon: Icon, name, hint, url, result, children,
}: {
  icon: React.ElementType; name: string; hint: string; url: string;
  result: ServiceResult | null; children?: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const status: ServiceStatus = result ? result.status : "unchecked";

  return (
    <div className="rounded-lg border border-border/60 overflow-hidden">
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/20 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className={cn("h-8 w-8 rounded-md flex items-center justify-center shrink-0", {
          "bg-emerald-500/10": status === "healthy",
          "bg-amber-400/10": status === "degraded",
          "bg-red-500/10": status === "down",
          "bg-muted/20": status === "unchecked",
        })}>
          <Icon className={cn("h-4 w-4", {
            "text-emerald-500": status === "healthy",
            "text-amber-400": status === "degraded",
            "text-red-400": status === "down",
            "text-muted-foreground": status === "unchecked",
          })} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{name}</span>
            <Dot status={status} />
            <StatusPill status={status} />
            {result?.latencyMs != null && (
              <span className={cn("text-xs tabular-nums ml-auto", {
                "text-emerald-500": result.latencyMs < 200,
                "text-amber-400": result.latencyMs >= 200 && result.latencyMs < 800,
                "text-red-400": result.latencyMs >= 800,
              })}>{result.latencyMs}ms</span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground truncate mt-0.5">{hint}</p>
        </div>
        {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
      </div>

      {expanded && (
        <div className="border-t border-border/40 px-4 py-3 space-y-1 bg-muted/5">
          <KV label="URL" value={url || "not configured"} mono />
          {result?.checkedAt && <KV label="Checked" value={new Date(result.checkedAt).toLocaleTimeString()} />}
          {result?.error && <KV label="Error" value={<span className="text-red-400">{result.error}</span>} />}
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function AdminHealth() {
  const [health, setHealth] = useState<HealthState>({
    cplane: null, iplane: null, readapi: null, database: null, storage: null,
  });
  const [checking, setChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState(30);

  // ── Pipeline analytics from Supabase ──
  const { data: pipelineStats } = useQuery({
    queryKey: ["admin-pipeline-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("studies")
        .select("state, created_at, triage_status");
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const s of (data || [])) {
        counts[s.state] = (counts[s.state] || 0) + 1;
      }
      const total = data?.length || 0;
      const complete = (counts["complete"] || 0) + (counts["ai_draft"] || 0) + (counts["signed"] || 0) + (counts["in_review"] || 0);
      const failed = counts["failed"] || 0;
      const active = (counts["processing"] || 0) + (counts["uploaded"] || 0);
      const today = (data || []).filter(s => new Date(s.created_at) > new Date(Date.now() - 86400000)).length;
      return { counts, total, complete, failed, active, today, successRate: total > 0 ? Math.round((complete / total) * 1000) / 10 : 0 };
    },
    refetchInterval: 30000,
  });

  // ── Failed studies ──
  const { data: failedStudies } = useQuery({
    queryKey: ["admin-failed-studies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("studies")
        .select("id, state, created_at, meta, clinic_id")
        .in("state", ["failed", "uploaded"])
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 30000,
  });

  // ── Recent audit activity ──
  const { data: recentActivity } = useQuery({
    queryKey: ["admin-recent-activity-health"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("id, event_type, actor_id, created_at, event_data")
        .order("created_at", { ascending: false })
        .limit(12);
      if (error) return [];
      return data || [];
    },
    refetchInterval: 60000,
  });

  // ── Clinic + user counts ──
  const { data: platformStats } = useQuery({
    queryKey: ["admin-platform-stats-health"],
    queryFn: async () => {
      const [clinics, users] = await Promise.all([
        supabase.from("clinics").select("id, sku", { count: "exact" }),
        supabase.from("profiles").select("id, role", { count: "exact" }),
      ]);
      const clinicList = clinics.data || [];
      const userList = users.data || [];
      const skuCounts: Record<string, number> = {};
      for (const c of clinicList) skuCounts[c.sku || "unknown"] = (skuCounts[c.sku || "unknown"] || 0) + 1;
      const roleCounts: Record<string, number> = {};
      for (const u of userList) roleCounts[u.role || "unknown"] = (roleCounts[u.role || "unknown"] || 0) + 1;
      return {
        totalClinics: clinics.count || clinicList.length,
        totalUsers: users.count || userList.length,
        skuCounts, roleCounts,
      };
    },
    refetchInterval: 60000,
  });

  // ── Health check runner ──
  const runChecks = useCallback(async () => {
    setChecking(true);
    const now = new Date().toISOString();

    const [db, stor, cplane, iplane, readapi] = await Promise.all([
      // Database
      (async (): Promise<ServiceResult> => {
        const t0 = performance.now();
        try {
          const { error } = await supabase.from("clinics").select("id").limit(1);
          const ms = Math.round(performance.now() - t0);
          return { status: error ? "down" : ms > 1000 ? "degraded" : "healthy", latencyMs: ms, error: error?.message, checkedAt: now };
        } catch (e: any) {
          return { status: "down", latencyMs: Math.round(performance.now() - t0), error: e.message, checkedAt: now };
        }
      })(),
      // Storage
      (async (): Promise<ServiceResult> => {
        const t0 = performance.now();
        try {
          const { error } = await supabase.storage.from("clinic-logos").list("", { limit: 1 });
          const ms = Math.round(performance.now() - t0);
          return { status: error ? "down" : ms > 2000 ? "degraded" : "healthy", latencyMs: ms, error: error?.message, checkedAt: now };
        } catch (e: any) {
          return { status: "down", latencyMs: Math.round(performance.now() - t0), error: e.message, checkedAt: now };
        }
      })(),
      // C-Plane
      (async (): Promise<ServiceResult> => {
        if (!CPLANE_BASE) return { status: "unchecked", latencyMs: null, error: "VITE_CPLANE_BASE not set", checkedAt: now };
        const r = await probe(`${CPLANE_BASE}/health`);
        return { status: statusFromProbe(r), latencyMs: r.ms, data: r.data, error: r.error, checkedAt: now };
      })(),
      // I-Plane
      (async (): Promise<ServiceResult> => {
        if (!IPLANE_BASE) return { status: "unchecked", latencyMs: null, error: "VITE_IPLANE_BASE not set", checkedAt: now };
        const r = await probe(`${IPLANE_BASE}/health`);
        return { status: statusFromProbe(r), latencyMs: r.ms, data: r.data, error: r.error, checkedAt: now };
      })(),
      // Read API
      (async (): Promise<ServiceResult> => {
        if (!READ_API_BASE) return { status: "unchecked", latencyMs: null, error: "Read API base not configured", checkedAt: now };
        const r = await probe(`${READ_API_BASE}/health`, READ_API_KEY ? { headers: { "X-API-KEY": READ_API_KEY } } : {});
        return { status: statusFromProbe(r), latencyMs: r.ms, data: r.data, error: r.error, checkedAt: now };
      })(),
    ]);

    setHealth({ database: db, storage: stor, cplane, iplane, readapi });
    setLastChecked(new Date());
    setChecking(false);
    setCountdown(30);
  }, []);

  // Auto-run on mount + every 30s
  useEffect(() => { runChecks(); }, [runChecks]);
  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { runChecks(); return 30; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [runChecks]);

  const allStatuses = Object.values(health).map(r => r?.status ?? "unchecked");
  const anyDown = allStatuses.includes("down");
  const anyDegraded = allStatuses.includes("degraded");
  const allHealthy = allStatuses.every(s => s === "healthy");
  const allUnchecked = allStatuses.every(s => s === "unchecked");

  const cp = health.cplane?.data;
  const ip = health.iplane?.data;
  const ra = health.readapi?.data;

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold tracking-tight">System Operations</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {lastChecked
              ? `Last checked ${lastChecked.toLocaleTimeString()} — auto-refresh in ${countdown}s`
              : "Running initial checks…"}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={runChecks} disabled={checking}>
          {checking
            ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
          Refresh
        </Button>
      </div>

      {/* ── Overall status banner ── */}
      <div className={cn(
        "flex items-center gap-2.5 px-4 py-2.5 rounded-lg border text-sm font-medium",
        allUnchecked ? "bg-muted/20 border-border/40 text-muted-foreground" :
        allHealthy ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-500" :
        anyDown ? "bg-red-500/5 border-red-500/20 text-red-500" :
        "bg-amber-400/5 border-amber-400/20 text-amber-400"
      )}>
        {allUnchecked ? <Clock className="h-4 w-4" /> :
         allHealthy ? <CheckCircle2 className="h-4 w-4" /> :
         anyDown ? <XCircle className="h-4 w-4" /> :
         <AlertCircle className="h-4 w-4" />}
        {allUnchecked ? "Checking services…" :
         allHealthy ? "All Systems Operational" :
         anyDown ? "Service Outage Detected" :
         "Degraded Performance"}
        {checking && <Loader2 className="h-3.5 w-3.5 ml-auto animate-spin opacity-50" />}
      </div>

      {/* ── Platform KPIs ── */}
      {platformStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total Clinics", value: platformStats.totalClinics },
            { label: "Total Users", value: platformStats.totalUsers },
            { label: "Studies Processed", value: pipelineStats?.complete ?? "…" },
            { label: "Pipeline Success", value: pipelineStats ? `${pipelineStats.successRate}%` : "…" },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-lg border border-border/60 px-4 py-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-2xl font-semibold tabular-nums mt-0.5">{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Services ── */}
      <Section title="Services" icon={Server} defaultOpen>
        <div className="space-y-2">
          <ServiceCard icon={Cpu} name="C-Plane" hint="ESF canonicalization · Azure Central India" url={CPLANE_BASE} result={health.cplane}>
            {cp && <>
              <KV label="Version" value={cp.version || "—"} />
              <KV label="Storage" value={cp.storage} />
              <KV label="I-Plane URL" value={cp.iplane || "not configured"} mono />
              <KV label="AFD Host" value={cp.afd_blob_host || "not configured"} mono />
              {cp.blob_containers && <KV label="Blob containers" value={cp.blob_containers.join(", ")} />}
              {cp.esf_pipeline && <>
                <Separator className="my-1" />
                <KV label="ESF channels" value={cp.esf_pipeline.channels} />
                <KV label="ESF sample rate" value={`${cp.esf_pipeline.sample_rate_hz} Hz`} />
                <KV label="Normalization" value={cp.esf_pipeline.normalization} />
                <KV label="Triage feat dim" value={cp.esf_pipeline.feature_dims?.triage} />
                <KV label="Clean feat dim" value={cp.esf_pipeline.feature_dims?.clean} />
                <KV label="Clean window" value={`${cp.esf_pipeline.clean_window_sec}s`} />
              </>}
            </>}
          </ServiceCard>

          <ServiceCard icon={Brain} name="I-Plane" hint="MIND® ONNX inference · Azure Central India" url={IPLANE_BASE} result={health.iplane}>
            {ip && <>
              <KV label="Version" value={ip.version || "—"} />
              <KV label="ONNX runtime" value={ip.onnxruntime_version || "—"} />
              <KV label="Supabase" value={ip.supabase} />
              <KV label="Azure storage" value={ip.azure_storage} />
              {ip.triage_model_info && Object.keys(ip.triage_model_info).length > 0 && <>
                <Separator className="my-1" />
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">MIND®Triage</p>
                <KV label="File" value={ip.triage_model_info.file} mono />
                <KV label="Input shape" value={JSON.stringify(ip.triage_model_info.input_shape)} mono />
                <KV label="Feature dim" value={ip.triage_model_info.feature_dim} />
                <KV label="Classes" value={ip.triage_model_info.labels?.join(", ") || "2"} />
                <KV label="Corpus" value={ip.triage_model_info.training_corpus} />
              </>}
              {ip.clean_model_info && Object.keys(ip.clean_model_info).length > 0 && <>
                <Separator className="my-1" />
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">MIND®Clean</p>
                <KV label="File" value={ip.clean_model_info.file} mono />
                <KV label="Input shape" value={JSON.stringify(ip.clean_model_info.input_shape)} mono />
                <KV label="Feature dim" value={ip.clean_model_info.feature_dim} />
                <KV label="Window" value={`${ip.clean_model_info.window_sec}s`} />
                <KV label="Corpus" value={ip.clean_model_info.training_corpus} />
              </>}
            </>}
          </ServiceCard>

          <ServiceCard icon={HardDrive} name="Read API" hint="obstore/zarr chunk server · Azure Central India" url={READ_API_BASE} result={health.readapi}>
            {ra && <>
              <KV label="Version" value={ra.version || "—"} />
              <KV label="Storage backend" value={ra.storage} />
              <KV label="Container" value={ra.container} mono />
              <KV label="obstore" value={ra.obstore_version} mono />
              <KV label="zarr" value={ra.zarr_version} mono />
              <KV label="Meta cache" value={`${ra.meta_cache_entries} entries`} />
              {ra.zarr_arrays && <KV label="Zarr arrays" value={ra.zarr_arrays.join(", ")} />}
              {ra.json_assets && <KV label="JSON assets" value={ra.json_assets.join(", ")} />}
            </>}
          </ServiceCard>

          <ServiceCard icon={Database} name="Supabase DB" hint="PostgreSQL · mngkbtsummbknrbpjbye" url={SUPABASE_URL} result={health.database} />

          <ServiceCard icon={Package} name="Supabase Storage" hint="File storage · clinic-logos, eeg-uploads" url={SUPABASE_URL + "/storage/v1"} result={health.storage} />
        </div>
      </Section>

      {/* ── Pipeline Analytics ── */}
      {pipelineStats && (
        <Section title="Pipeline Analytics" icon={Activity}>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {[
              { label: "Pending", key: "pending", color: "text-muted-foreground" },
              { label: "Uploaded", key: "uploaded", color: "text-blue-400" },
              { label: "Processing", key: "processing", color: "text-purple-400" },
              { label: "Complete", key: "complete", color: "text-emerald-500" },
              { label: "AI Draft", key: "ai_draft", color: "text-cyan-400" },
              { label: "In Review", key: "in_review", color: "text-amber-400" },
              { label: "Signed", key: "signed", color: "text-emerald-600" },
              { label: "Failed", key: "failed", color: "text-red-500" },
            ].filter(s => (pipelineStats.counts[s.key] ?? 0) > 0 || s.key === "failed").map(({ label, key, color }) => (
              <div key={key} className="rounded border border-border/50 px-3 py-2">
                <p className="text-[10px] text-muted-foreground">{label}</p>
                <p className={cn("text-xl font-semibold tabular-nums", color)}>{pipelineStats.counts[key] ?? 0}</p>
              </div>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-muted-foreground border-t border-border/40 pt-2">
            <div>Total studies: <span className="text-foreground font-medium">{pipelineStats.total}</span></div>
            <div>Active: <span className="text-purple-400 font-medium">{pipelineStats.active}</span></div>
            <div>Today: <span className="text-foreground font-medium">{pipelineStats.today}</span></div>
          </div>
        </Section>
      )}

      {/* ── MIND® Model Registry ── */}
      <Section title="MIND® Model Registry" icon={Brain} defaultOpen>
        {ip ? (
          <div className="grid sm:grid-cols-2 gap-3">
            {/* Triage */}
            <div className="rounded border border-border/50 p-3 space-y-1.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold">MIND®Triage v1</span>
                <StatusPill status={ip.triage_model === "loaded" ? "healthy" : "down"} />
              </div>
              <KV label="File" value="mind_triage_v1.onnx" mono />
              <KV label="Input" value="147-dim feature vector" />
              <KV label="Spec" value="21ch × (5 spectral + 2 temporal)" />
              <KV label="Output" value="binary: normal / abnormal" />
              <KV label="Corpus" value="TUH EEG Abnormal v3.0.1" />
              <KV label="Scope" value="Full recording" />
              <KV label="Frequency bands" value="δ θ α β γ (0.5–70 Hz)" />
            </div>
            {/* Clean */}
            <div className="rounded border border-border/50 p-3 space-y-1.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold">MIND®Clean v1</span>
                <StatusPill status={ip.clean_model === "loaded" ? "healthy" : "down"} />
              </div>
              <KV label="File" value="mind_clean_v1.onnx" mono />
              <KV label="Input" value="231-dim feature vector" />
              <KV label="Spec" value="21ch × (5 spectral + 2 morphological)" />
              <KV label="Output" value="artifact probability per window" />
              <KV label="Corpus" value="TUH EEG Artifact v3.0.1" />
              <KV label="Window" value="2s sliding, non-overlapping" />
              <KV label="Threshold" value="prob > 0.5 → artifact" />
            </div>
          </div>
        ) : (
          <div className="rounded border border-dashed border-border/40 px-4 py-6 text-center">
            <Brain className="h-5 w-5 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">I-Plane not reachable — model registry unavailable</p>
          </div>
        )}
        {/* Seizure / SCORE placeholder */}
        <div className="grid sm:grid-cols-2 gap-3">
          {[
            { name: "MIND®Seizure v0.1", status: "heuristic", note: "Z-score heuristic, min 6s event" },
            { name: "MIND®SCORE v0.1", status: "heuristic", note: "Structured severity scoring from triage + clean outputs" },
          ].map(m => (
            <div key={m.name} className="rounded border border-dashed border-border/40 p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">{m.name}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded border bg-muted/30 text-muted-foreground border-border/40">HEURISTIC</span>
              </div>
              <p className="text-[11px] text-muted-foreground/70">{m.note}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── ESF Pipeline Spec ── */}
      <Section title="ESF Pipeline Specification" icon={Zap} defaultOpen={false}>
        <div className="grid sm:grid-cols-2 gap-4 text-xs">
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Signal Processing</p>
            <KV label="Output channels" value="19 (10-20 transverse)" />
            <KV label="Output sample rate" value="250 Hz (resampled)" />
            <KV label="Normalization" value="Robust z-score per channel" />
            <KV label="Source formats" value="EDF, BDF" />
            <KV label="Line noise notch" value="50 Hz / 60 Hz (auto-detect)" />
          </div>
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Feature Extraction</p>
            <KV label="Triage dim" value="147 = 21ch × 7 (5 PSD + kurtosis + entropy)" />
            <KV label="Clean dim" value="231 = 21ch × 11 (5 PSD + kurtosis + RMS) × 2s window" />
            <KV label="PSD method" value="Welch (nperseg=512 triage, 128 clean)" />
            <KV label="Channels for features" value="min(21, esf_channels)" />
          </div>
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Blob Layout</p>
            <KV label="eeg-raw" value="{study_id}.edf — raw upload" mono />
            <KV label="eeg-canonical" value="{study_id}/signals.zarr, meta.json" mono />
            <KV label="eeg-derived" value="{study_id}/triage_features.npy, clean_windows.npy, derived_meta.json" mono />
            <KV label="eeg-reports" value="{study_id}/report.json" mono />
          </div>
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Report Schema</p>
            <KV label="Version" value="mind.report.v1" mono />
            <KV label="Triage fields" value="classification, confidence, model, subtypes" />
            <KV label="Clean fields" value="clean_percentage, artifact_windows, total_windows" />
            <KV label="Seizure fields" value="events (onset_time, confidence)" />
            <KV label="State on complete" value="complete (set by I-Plane via Supabase PATCH)" />
          </div>
        </div>
      </Section>

      {/* ── Infrastructure ── */}
      <Section title="Infrastructure" icon={GitBranch} defaultOpen={false}>
        <div className="space-y-3">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Azure Container Apps — enceph-env · Central India</p>
          <div className="space-y-1.5">
            {[
              { name: "encephlian-cplane", image: "enceph.azurecr.io/cplane:latest", note: "ESF pipeline + blob ops" },
              { name: "encephlian-iplane", image: "enceph.azurecr.io/iplane:latest", note: "ONNX inference + Supabase updates" },
              { name: "enceph-readapi", image: "enceph.azurecr.io/enceph-readapi:latest", note: "obstore zarr chunk API" },
            ].map(svc => (
              <div key={svc.name} className="flex items-center gap-3 px-3 py-2 rounded border border-border/40 bg-muted/10">
                <Cpu className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono">{svc.name}</p>
                  <p className="text-[10px] text-muted-foreground">{svc.note}</p>
                </div>
                <span className="text-[10px] font-mono text-muted-foreground/60">{svc.image}</span>
              </div>
            ))}
          </div>

          <Separator />
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Environment Variables</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {[
              { key: "VITE_CPLANE_BASE", set: !!CPLANE_BASE, val: CPLANE_BASE },
              { key: "VITE_IPLANE_BASE", set: !!IPLANE_BASE, val: IPLANE_BASE },
              { key: "VITE_ENCEPH_READ_API_BASE", set: !!READ_API_BASE, val: READ_API_BASE },
              { key: "VITE_ENCEPH_READ_API_KEY", set: !!READ_API_KEY, val: READ_API_KEY ? "••••" + READ_API_KEY.slice(-4) : "" },
              { key: "VITE_SUPABASE_URL", set: !!SUPABASE_URL, val: SUPABASE_URL },
            ].map(({ key, set, val }) => (
              <div key={key} className="flex items-center gap-2 px-3 py-2 rounded border border-border/40 bg-muted/5">
                <EnvBadge set={set} />
                <span className="text-[11px] font-mono flex-1 truncate text-muted-foreground">{key}</span>
                {set && <span className="text-[10px] font-mono text-muted-foreground/50 truncate max-w-[120px]">{val}</span>}
              </div>
            ))}
          </div>

          <Separator />
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Azure Resources</p>
          <div className="grid grid-cols-2 gap-1.5 text-[11px]">
            {[
              ["ACR", "enceph.azurecr.io"],
              ["Blob account", "encephblob.blob.core.windows.net"],
              ["Region", "Central India"],
              ["Resource group", "enceph-mvp-rg"],
              ["Container env", "enceph-env"],
              ["Supabase project", "mngkbtsummbknrbpjbye"],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2 py-1 border-b border-border/30 last:border-0">
                <span className="text-muted-foreground">{k}</span>
                <span className="font-mono text-muted-foreground/70 text-right">{v}</span>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── SKU Distribution ── */}
      {platformStats && (
        <Section title="Platform Distribution" icon={Settings} defaultOpen={false}>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Clinics by SKU</p>
              <div className="space-y-1">
                {Object.entries(platformStats.skuCounts).map(([sku, count]) => (
                  <div key={sku} className="flex items-center justify-between px-3 py-1.5 rounded border border-border/40">
                    <span className="text-xs font-mono">{sku}</span>
                    <span className="text-xs font-semibold tabular-nums">{count}</span>
                  </div>
                ))}
                {Object.keys(platformStats.skuCounts).length === 0 && (
                  <p className="text-xs text-muted-foreground">No clinics found</p>
                )}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Users by Role</p>
              <div className="space-y-1">
                {Object.entries(platformStats.roleCounts).map(([role, count]) => (
                  <div key={role} className="flex items-center justify-between px-3 py-1.5 rounded border border-border/40">
                    <span className="text-xs font-mono">{role}</span>
                    <span className="text-xs font-semibold tabular-nums">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Section>
      )}

      {/* ── Failed / Stuck Studies ── */}
      {failedStudies && failedStudies.length > 0 && (
        <Section title={`Studies Needing Attention (${failedStudies.length})`} icon={AlertCircle} defaultOpen>
          <div className="space-y-1.5">
            {failedStudies.map(study => (
              <div key={study.id} className="flex items-center gap-3 px-3 py-2 rounded border border-border/40 bg-muted/5 text-xs">
                <span className={cn("h-2 w-2 rounded-full shrink-0", study.state === "failed" ? "bg-red-500" : "bg-amber-400")} />
                <span className="font-mono text-muted-foreground flex-1 truncate">{study.id}</span>
                <Badge variant="outline" className="text-[10px] shrink-0">{study.state}</Badge>
                <span className="text-muted-foreground/60 shrink-0">
                  {new Date(study.created_at).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── Recent Activity ── */}
      {recentActivity && recentActivity.length > 0 && (
        <Section title="Recent Activity" icon={Clock} defaultOpen={false}>
          <div className="space-y-0.5 max-h-64 overflow-y-auto">
            {recentActivity.map(event => (
              <div key={event.id} className="flex items-center gap-3 px-3 py-1.5 rounded hover:bg-muted/20 text-xs">
                <span className="font-mono text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded text-[10px] shrink-0">{event.event_type}</span>
                <span className="text-muted-foreground/60 flex-1 truncate">
                  {typeof event.event_data === 'object' ? JSON.stringify(event.event_data).slice(0, 80) : String(event.event_data || '')}
                </span>
                <span className="text-muted-foreground/40 shrink-0 tabular-nums">
                  {new Date(event.created_at).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
