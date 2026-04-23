// =============================================================================
// AdminDiagnostics — live health of the three data planes
//
//   • C-Plane      (conversion: EDF → ESF v1.0)
//   • I-Plane      (inference: MIND®Triage + MIND®Clean ONNX)
//   • Read API     (canonical EEG read-serving)
//
// The page deliberately does TWO things in TWO separate sections:
//
//   1. Infrastructure probe (always runs) — hits /health on each plane, no
//      study ID required. Green here means the paid Azure Container Apps are
//      up, the ONNX models are loaded, ESF v1.0 is pinned, storage is
//      reachable. This is what we check first whenever a clinic reports a
//      stuck upload.
//
//   2. Data-plane probe (optional) — picks a real study from the database and
//      walks the full read ladder (meta → chunk determinism → artifacts →
//      annotations → segments → run_id consistency). Skipped gracefully when
//      no canonical studies exist yet (common right after the ESF-v1 reset).
//
// Historical note: the old page hard-coded STUDY_ID="TUH_CANON_001" which was
// wiped in the legacy-study cleanup, so every check ran red even though all
// three planes were 100% healthy. That's why it "felt dead".
// =============================================================================

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUserSession } from "@/contexts/UserSessionContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Activity,
  Brain,
  Cpu,
  HardDrive,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  RefreshCw,
  Database,
} from "lucide-react";
import {
  getAnnotations,
  getArtifacts,
  getChunkHeaders,
  getHealth,
  getMeta,
  getSegments,
} from "@/admin/readApi";
import {
  PROD_READ_API_DEFAULT,
  LOCAL_READ_API_DEFAULT,
  resolveReadApiBase,
  setReadApiOverride,
  clearReadApiOverride,
  getEnvBase as getEnvReadApiBase,
  getReadApiKey,
  READ_API_OVERRIDE_LS_KEY,
} from "@/shared/readApiConfig";
import { getReadApiProxyBase } from "@/shared/readApiClient";

// ──────────────────────────────────────────────────────────────────────────
// Plane URLs — resolved once per page load from Vite env.
// ──────────────────────────────────────────────────────────────────────────
const IPLANE_LS_KEY = "enceph_iplane_base";
const IPLANE_ENV_DEFAULT = String((import.meta as any).env?.VITE_IPLANE_BASE || "").replace(/\/+$/, "");
const CPLANE_ENV_DEFAULT = String((import.meta as any).env?.VITE_CPLANE_BASE || "").replace(/\/+$/, "");

function getIPlaneBase(): string {
  try {
    const saved = (localStorage.getItem(IPLANE_LS_KEY) || "").trim();
    if (saved) return saved.replace(/\/+$/, "");
  } catch { /* noop */ }
  return IPLANE_ENV_DEFAULT;
}

// ──────────────────────────────────────────────────────────────────────────
// Health types — matches what the three planes actually return (we verified
// each of these live when wiring this page).
// ──────────────────────────────────────────────────────────────────────────
type PlaneStatus = "healthy" | "degraded" | "down" | "checking" | "idle";

type PlaneHealth = {
  status: PlaneStatus;
  latencyMs: number | null;
  version?: string;
  raw?: Record<string, any>;
  error?: string;
  checkedAt?: string;
};

type IPlaneRaw = {
  status?: string;
  version?: string;
  triage_model?: string;
  clean_model?: string;
  supabase?: string;
  azure_storage?: string;
  pipeline_spec?: {
    esf_channels?: number;
    esf_sample_rate_hz?: number;
    normalization?: string;
    montage?: string;
  };
};

type CPlaneRaw = {
  status?: string;
  version?: string;
  storage?: string;
  esf_version?: string;
  converter_git_sha?: string;
  iplane?: string;
};

type ReadApiRaw = {
  ok?: boolean;
  version?: string;
  storage?: string;
  azure_available?: boolean;
  azure_configured?: boolean;
  container?: string;
};

// ──────────────────────────────────────────────────────────────────────────
// Data-plane probe row (kept from old page, tightened)
// ──────────────────────────────────────────────────────────────────────────
type CheckRow = {
  name: string;
  ok: boolean;
  ms: number;
  notes?: string;
};

// Latency thresholds (ms)
const LATENCY_GOOD = 200;
const LATENCY_WARN = 500;
function latencyTone(ms: number): string {
  if (ms <= LATENCY_GOOD) return "text-emerald-500";
  if (ms <= LATENCY_WARN) return "text-amber-500";
  return "text-red-500";
}

// ──────────────────────────────────────────────────────────────────────────
// Plane probers
// ──────────────────────────────────────────────────────────────────────────
async function probePlane<T>(base: string, path = "/health", timeoutMs = 8000): Promise<PlaneHealth> {
  if (!base) {
    return { status: "idle", latencyMs: null, error: "env var not set" };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const t0 = performance.now();
  try {
    const res = await fetch(`${base.replace(/\/+$/, "")}${path}`, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
    });
    const ms = Math.round(performance.now() - t0);
    if (!res.ok) {
      return {
        status: "down",
        latencyMs: ms,
        error: `HTTP ${res.status} ${res.statusText}`,
        checkedAt: new Date().toISOString(),
      };
    }
    const json = (await res.json()) as T;
    return {
      status: "healthy",
      latencyMs: ms,
      raw: json as any,
      checkedAt: new Date().toISOString(),
    };
  } catch (e: any) {
    const ms = Math.round(performance.now() - t0);
    const msg = e?.name === "AbortError" ? `timeout after ${timeoutMs}ms` : (e?.message || String(e));
    return { status: "down", latencyMs: ms, error: msg, checkedAt: new Date().toISOString() };
  } finally {
    clearTimeout(timer);
  }
}

// ──────────────────────────────────────────────────────────────────────────
// UI atoms
// ──────────────────────────────────────────────────────────────────────────
function StatusPill({ s }: { s: PlaneStatus }) {
  if (s === "healthy") {
    return (
      <Badge
        variant="secondary"
        className="text-[10px] gap-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
      >
        <CheckCircle2 className="h-3 w-3" />
        Healthy
      </Badge>
    );
  }
  if (s === "down") {
    return (
      <Badge variant="destructive" className="text-[10px] gap-1">
        <XCircle className="h-3 w-3" />
        Down
      </Badge>
    );
  }
  if (s === "degraded") {
    return (
      <Badge variant="secondary" className="text-[10px] gap-1 bg-amber-500/10 text-amber-600 border-amber-500/20">
        <AlertCircle className="h-3 w-3" />
        Degraded
      </Badge>
    );
  }
  if (s === "checking") {
    return (
      <Badge variant="outline" className="text-[10px] gap-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        Checking
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] gap-1 border-muted-foreground/30">
      Idle
    </Badge>
  );
}

function ModelBadge({ status }: { status?: string }) {
  if (status === "loaded") {
    return (
      <Badge
        variant="secondary"
        className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
      >
        loaded
      </Badge>
    );
  }
  if (status === "mock") {
    return <Badge variant="secondary" className="text-[10px]">mock</Badge>;
  }
  return <Badge variant="outline" className="text-[10px]">{status || "—"}</Badge>;
}

function KV({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 text-xs py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-right truncate max-w-[240px] ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

function LatencyInline({ ms }: { ms: number | null }) {
  if (ms === null) return <span className="text-muted-foreground text-[11px]">—</span>;
  return (
    <span className={`font-mono text-[11px] tabular-nums ${latencyTone(ms)}`}>{ms}ms</span>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Plane tiles
// ──────────────────────────────────────────────────────────────────────────
function CPlaneTile({ h, base }: { h: PlaneHealth; base: string }) {
  const d = h.raw as CPlaneRaw | undefined;
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Cpu className="h-4 w-4 text-muted-foreground" />
          C-Plane
          {d?.version && (
            <Badge variant="outline" className="text-[9px] h-4 px-1.5">v{d.version}</Badge>
          )}
        </CardTitle>
        <StatusPill s={h.status} />
      </CardHeader>
      <CardContent className="space-y-1">
        {h.error ? (
          <Alert variant="destructive" className="mt-1">
            <AlertCircle className="h-3.5 w-3.5" />
            <AlertTitle className="text-xs">Unreachable</AlertTitle>
            <AlertDescription className="font-mono text-[10px] break-all">{h.error}</AlertDescription>
          </Alert>
        ) : d ? (
          <>
            <KV label="Latency" value={<LatencyInline ms={h.latencyMs} />} />
            <KV label="ESF version" value={d.esf_version || "—"} mono />
            <KV label="Storage" value={d.storage || "—"} />
            <KV
              label="Converter SHA"
              value={
                <span className="font-mono text-[10px] opacity-80">
                  {d.converter_git_sha ? d.converter_git_sha.slice(0, 10) : "—"}
                </span>
              }
            />
          </>
        ) : (
          <div className="text-[11px] text-muted-foreground py-2">No data</div>
        )}
        <div className="mt-2 pt-2 border-t border-border/40 text-[10px] text-muted-foreground font-mono break-all">
          {base || "VITE_CPLANE_BASE unset"}
        </div>
      </CardContent>
    </Card>
  );
}

function IPlaneTile({ h, base }: { h: PlaneHealth; base: string }) {
  const d = h.raw as IPlaneRaw | undefined;
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Brain className="h-4 w-4 text-muted-foreground" />
          I-Plane
          {d?.version && (
            <Badge variant="outline" className="text-[9px] h-4 px-1.5">v{d.version}</Badge>
          )}
        </CardTitle>
        <StatusPill s={h.status} />
      </CardHeader>
      <CardContent className="space-y-1">
        {h.error ? (
          <Alert variant="destructive" className="mt-1">
            <AlertCircle className="h-3.5 w-3.5" />
            <AlertTitle className="text-xs">Unreachable</AlertTitle>
            <AlertDescription className="font-mono text-[10px] break-all">{h.error}</AlertDescription>
          </Alert>
        ) : d ? (
          <>
            <KV label="Latency" value={<LatencyInline ms={h.latencyMs} />} />
            <KV label="MIND®Triage" value={<ModelBadge status={d.triage_model} />} />
            <KV label="MIND®Clean" value={<ModelBadge status={d.clean_model} />} />
            <KV label="Supabase" value={d.supabase || "—"} />
            <KV label="Azure storage" value={d.azure_storage || "—"} />
            {d.pipeline_spec && (
              <div className="mt-2 pt-2 border-t border-border/40 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] font-mono text-muted-foreground">
                <span>ch</span><span className="text-right">{d.pipeline_spec.esf_channels}</span>
                <span>sr_hz</span><span className="text-right">{d.pipeline_spec.esf_sample_rate_hz}</span>
                <span>norm</span><span className="text-right truncate">{d.pipeline_spec.normalization}</span>
              </div>
            )}
          </>
        ) : (
          <div className="text-[11px] text-muted-foreground py-2">No data</div>
        )}
        <div className="mt-2 pt-2 border-t border-border/40 text-[10px] text-muted-foreground font-mono break-all">
          {base || "VITE_IPLANE_BASE unset"}
        </div>
      </CardContent>
    </Card>
  );
}

function ReadApiTile({ h, base }: { h: PlaneHealth; base: string }) {
  const d = h.raw as ReadApiRaw | undefined;
  const keyPresent = !!getReadApiKey();
  const proxyOn = !!getReadApiProxyBase();
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-muted-foreground" />
          Read API
          {d?.version && (
            <Badge variant="outline" className="text-[9px] h-4 px-1.5">v{d.version}</Badge>
          )}
        </CardTitle>
        <StatusPill s={h.status} />
      </CardHeader>
      <CardContent className="space-y-1">
        {h.error ? (
          <Alert variant="destructive" className="mt-1">
            <AlertCircle className="h-3.5 w-3.5" />
            <AlertTitle className="text-xs">Unreachable</AlertTitle>
            <AlertDescription className="font-mono text-[10px] break-all">{h.error}</AlertDescription>
          </Alert>
        ) : d ? (
          <>
            <KV label="Latency" value={<LatencyInline ms={h.latencyMs} />} />
            <KV label="Container" value={d.container || "—"} mono />
            <KV label="Azure" value={d.azure_configured ? "configured" : "not configured"} />
            <KV label="Storage" value={d.storage || "—"} />
            <KV
              label="Auth mode"
              value={
                keyPresent ? (
                  <Badge variant="secondary" className="text-[10px]">DIRECT</Badge>
                ) : proxyOn ? (
                  <Badge variant="secondary" className="text-[10px]">PROXY</Badge>
                ) : (
                  <Badge variant="destructive" className="text-[10px]">none</Badge>
                )
              }
            />
          </>
        ) : (
          <div className="text-[11px] text-muted-foreground py-2">No data</div>
        )}
        <div className="mt-2 pt-2 border-t border-border/40 text-[10px] text-muted-foreground font-mono break-all">
          {base || "VITE_ENCEPH_READ_API_BASE unset"}
        </div>
      </CardContent>
    </Card>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Studies picker (for data-plane probe)
// ──────────────────────────────────────────────────────────────────────────
type PickableStudy = {
  id: string;
  study_key: string | null;
  state: string | null;
  latest_run_id: string | null;
  created_at: string;
};

async function fetchProbableStudies(isSuperAdmin: boolean): Promise<PickableStudy[]> {
  if (isSuperAdmin) {
    // admin_get_all_studies is the super_admin-gated RPC
    const { data, error } = await supabase.rpc("admin_get_all_studies");
    if (error) throw new Error(error.message);
    const rows = (data as any[]) || [];
    return rows
      .map((r) => ({
        id: r.id,
        study_key: r.study_key ?? null,
        state: r.state ?? null,
        latest_run_id: r.latest_run_id ?? null,
        created_at: r.created_at,
      }))
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .slice(0, 25);
  }
  // Non-super-admin (management): normal RLS
  const { data, error } = await supabase
    .from("studies")
    .select("id, study_key, state, latest_run_id, created_at")
    .order("created_at", { ascending: false })
    .limit(25);
  if (error) throw new Error(error.message);
  return (data as any[]) || [];
}

// ──────────────────────────────────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────────────────────────────────
export default function AdminDiagnostics() {
  const { roles, isLoading: sessionLoading } = useUserSession();
  const isSuperAdmin = roles.includes("super_admin");

  const [readApi, setReadApi] = useState<PlaneHealth>({ status: "checking", latencyMs: null });
  const [iplane, setIplane] = useState<PlaneHealth>({ status: "checking", latencyMs: null });
  const [cplane, setCplane] = useState<PlaneHealth>({ status: "checking", latencyMs: null });
  const [planeCheckedAt, setPlaneCheckedAt] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const readApiBase = useMemo(() => resolveReadApiBase(), []);
  const iplaneBase = useMemo(() => getIPlaneBase(), []);
  const cplaneBase = CPLANE_ENV_DEFAULT;

  // Data-plane probe state
  const [studies, setStudies] = useState<PickableStudy[]>([]);
  const [studiesLoading, setStudiesLoading] = useState(false);
  const [studiesError, setStudiesError] = useState<string | null>(null);
  const [selectedStudy, setSelectedStudy] = useState<string>("");
  const [studyRoot, setStudyRoot] = useState<string>(".");
  const [probeRows, setProbeRows] = useState<CheckRow[]>([]);
  const [probing, setProbing] = useState(false);
  const [probeRanAt, setProbeRanAt] = useState<string | null>(null);

  // ── Probe all three planes in parallel ─────────────────────────────────
  async function refreshPlanes() {
    setRefreshing(true);
    setReadApi({ status: "checking", latencyMs: null });
    setIplane({ status: "checking", latencyMs: null });
    setCplane({ status: "checking", latencyMs: null });

    const [r, i, c] = await Promise.all([
      probePlane<ReadApiRaw>(readApiBase, "/health"),
      probePlane<IPlaneRaw>(iplaneBase, "/health"),
      probePlane<CPlaneRaw>(cplaneBase, "/health"),
    ]);
    setReadApi(r);
    setIplane(i);
    setCplane(c);
    setPlaneCheckedAt(new Date().toISOString());
    setRefreshing(false);
  }

  // ── Pull studies list (used by data-plane probe) ───────────────────────
  async function loadStudies() {
    setStudiesLoading(true);
    setStudiesError(null);
    try {
      const rows = await fetchProbableStudies(isSuperAdmin);
      setStudies(rows);
      // Auto-select the first one that has been canonicalized if any
      const firstWithRun = rows.find((r) => r.latest_run_id);
      if (firstWithRun) setSelectedStudy(firstWithRun.id);
    } catch (e: any) {
      setStudiesError(e?.message || String(e));
    } finally {
      setStudiesLoading(false);
    }
  }

  // ── Run the per-study read ladder ──────────────────────────────────────
  async function runProbe() {
    if (!selectedStudy) return;
    setProbing(true);
    setProbeRows([]);
    const out: CheckRow[] = [];
    const push = (name: string, ok: boolean, ms: number, notes?: string) =>
      out.push({ name, ok, ms, notes });

    // Read API base already validated by the hero tile — but health can
    // flap, so re-check before stabbing at the data plane.
    const h = await getHealth();
    push("Read API /health", h.ok, h.ms, h.ok ? "" : (h as any).error);
    if (!h.ok) {
      setProbeRows(out);
      setProbing(false);
      setProbeRanAt(new Date().toISOString());
      return;
    }

    const m = await getMeta(selectedStudy, studyRoot);
    push(
      "Meta",
      m.ok,
      m.ms,
      m.ok
        ? `channels=${m.data?.channels?.length ?? "?"}, sr=${m.data?.sample_rate_hz ?? "?"}Hz`
        : (m as any).error,
    );

    const c1 = await getChunkHeaders(selectedStudy, 0, 256, studyRoot);
    push(
      "Chunk headers",
      c1.ok,
      c1.ms,
      c1.ok
        ? `sha=${(c1.headers["x-eeg-content-sha256"] || "").slice(0, 10)}…, dtype=${c1.headers["x-eeg-dtype"] || "?"}`
        : (c1 as any).error,
    );

    const c2 = await getChunkHeaders(selectedStudy, 0, 256, studyRoot);
    let detOk = false;
    let detNotes = "";
    if (c1.ok && c2.ok) {
      const sha1 = c1.headers["x-eeg-content-sha256"] || "";
      const sha2 = c2.headers["x-eeg-content-sha256"] || "";
      detOk = !!sha1 && sha1 === sha2;
      detNotes = detOk ? "sha match (deterministic)" : "sha mismatch — non-deterministic!";
    } else {
      detNotes = "chunk fetch failed";
    }
    push("Chunk determinism (x2)", detOk, c2.ok ? c2.ms : 0, detNotes);

    const a = await getArtifacts(selectedStudy, studyRoot);
    push(
      "Artifacts",
      a.ok,
      a.ms,
      a.ok
        ? `items=${a.data?.items?.length ?? a.data?.length ?? 0}, run_id=${
            a.data?.run_id ? String(a.data.run_id).slice(0, 12) + "…" : "?"
          }`
        : (a as any).error,
    );

    const an = await getAnnotations(selectedStudy, studyRoot);
    push(
      "Annotations",
      an.ok,
      an.ms,
      an.ok
        ? `items=${an.data?.items?.length ?? an.data?.length ?? 0}`
        : (an as any).error,
    );

    const s = await getSegments(selectedStudy, studyRoot);
    push(
      "Segments",
      s.ok,
      s.ms,
      s.ok
        ? `schema=${s.data?.schema_version || "?"}, run_id=${s.data?.run_id ? String(s.data.run_id).slice(0, 12) + "…" : "?"}`
        : (s as any).error,
    );

    if (a.ok && an.ok && s.ok) {
      const r1 = a.data?.run_id || null;
      const r2 = an.data?.run_id || null;
      const r3 = s.data?.run_id || null;
      const runOk = !!r1 && r1 === r2 && r2 === r3;
      push(
        "run_id consistency",
        runOk,
        0,
        runOk
          ? `all three agree: ${String(r1).slice(0, 12)}…`
          : `mismatch: a=${r1}, an=${r2}, s=${r3}`,
      );
    } else {
      push("run_id consistency", false, 0, "one or more derived endpoints failed");
    }

    setProbeRows(out);
    setProbing(false);
    setProbeRanAt(new Date().toISOString());
  }

  useEffect(() => {
    refreshPlanes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!sessionLoading) loadStudies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionLoading, isSuperAdmin]);

  const probePass = useMemo(() => probeRows.filter((r) => r.ok).length, [probeRows]);
  const probeFail = useMemo(() => probeRows.filter((r) => !r.ok).length, [probeRows]);
  const allPlanesHealthy =
    readApi.status === "healthy" && iplane.status === "healthy" && cplane.status === "healthy";

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight">Diagnostics</h1>
            <Badge
              variant="secondary"
              className={`h-5 text-[10px] ${
                allPlanesHealthy
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                  : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
              }`}
            >
              {allPlanesHealthy ? "all planes green" : "investigate"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Live health of C-Plane, I-Plane, and Read API. Data-plane probe is
            study-scoped and runs the full read ladder.
            {planeCheckedAt && (
              <>
                {" "}· Last check {new Date(planeCheckedAt).toLocaleTimeString()}
              </>
            )}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refreshPlanes} disabled={refreshing}>
          {refreshing ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          )}
          Refresh planes
        </Button>
      </div>

      {/* ── Hero: three plane tiles ─────────────────────────────────────── */}
      {refreshing && readApi.status === "checking" ? (
        <div className="grid md:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-56" />
          ))}
        </div>
      ) : (
        <div className="grid md:grid-cols-3 gap-4">
          <CPlaneTile h={cplane} base={cplaneBase} />
          <IPlaneTile h={iplane} base={iplaneBase} />
          <ReadApiTile h={readApi} base={readApiBase} />
        </div>
      )}

      {/* ── Data-plane probe ────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Database className="h-4 w-4 text-muted-foreground" />
            Data-plane probe
            {probeRows.length > 0 && (
              <Badge
                variant={probeFail > 0 ? "destructive" : "secondary"}
                className={`text-[10px] ${
                  probeFail > 0
                    ? ""
                    : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                }`}
              >
                {probeFail > 0 ? `${probeFail} fail` : `${probePass} pass`}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Walks meta → chunk determinism → artifacts → annotations → segments,
            then cross-checks <span className="font-mono">run_id</span> across
            the three derived endpoints.
          </p>

          {studiesError && (
            <Alert variant="destructive">
              <AlertCircle className="h-3.5 w-3.5" />
              <AlertTitle className="text-xs">Could not list studies</AlertTitle>
              <AlertDescription className="font-mono text-[10px]">{studiesError}</AlertDescription>
            </Alert>
          )}

          {!studiesLoading && studies.length === 0 && !studiesError && (
            <div className="rounded-lg border border-dashed border-border/60 p-4 text-xs text-muted-foreground space-y-2">
              <p className="font-medium text-foreground">
                No studies available to probe.
              </p>
              <p>
                Either no clinic has uploaded yet, or you just ran the ESF-v1.0
                reset and the canonical store is empty on purpose. Upload a
                study via <code className="font-mono">/app/upload</code> or run
                the T5c TUSZ conversion to populate{" "}
                <code className="font-mono">eeg-canonical/</code>, then come
                back here.
              </p>
            </div>
          )}

          {studies.length > 0 && (
            <>
              <div className="grid md:grid-cols-[1fr_140px_auto] gap-2">
                <Select value={selectedStudy} onValueChange={setSelectedStudy}>
                  <SelectTrigger className="text-xs">
                    <SelectValue placeholder="Pick a study" />
                  </SelectTrigger>
                  <SelectContent>
                    {studies.map((s) => {
                      const label = s.study_key || s.id;
                      const canonicalized = !!s.latest_run_id;
                      return (
                        <SelectItem key={s.id} value={s.id} className="text-xs">
                          <span className="font-mono">{label.slice(0, 28)}</span>
                          {s.state && (
                            <span className="ml-2 text-muted-foreground text-[10px]">
                              {s.state}
                            </span>
                          )}
                          {canonicalized && (
                            <span className="ml-1 text-emerald-500 text-[10px]">•</span>
                          )}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <Input
                  className="text-xs font-mono"
                  placeholder="root (e.g. .)"
                  value={studyRoot}
                  onChange={(e) => setStudyRoot(e.target.value)}
                />
                <Button size="sm" onClick={runProbe} disabled={!selectedStudy || probing}>
                  {probing ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Activity className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Run probe
                </Button>
              </div>

              {probeRows.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">Status</TableHead>
                      <TableHead>Check</TableHead>
                      <TableHead className="text-right w-28">Latency</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {probeRows.map((r) => (
                      <TableRow key={r.name}>
                        <TableCell>
                          {r.ok ? (
                            <span className="inline-flex items-center gap-1 text-emerald-500 text-[11px]">
                              <CheckCircle2 className="h-3 w-3" /> pass
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-red-500 text-[11px]">
                              <XCircle className="h-3 w-3" /> fail
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">{r.name}</TableCell>
                        <TableCell className="text-right">
                          <LatencyInline ms={r.ms || null} />
                        </TableCell>
                        <TableCell className="text-[11px] font-mono text-muted-foreground break-all">
                          {r.notes || ""}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              {probeRanAt && (
                <p className="text-[10px] text-muted-foreground">
                  Last probe: {new Date(probeRanAt).toLocaleString()}
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Advanced (developer) ────────────────────────────────────────── */}
      <Accordion type="single" collapsible className="rounded-lg border border-border/60">
        <AccordionItem value="advanced" className="border-0">
          <AccordionTrigger className="px-4 py-2.5 text-xs font-medium hover:no-underline">
            Advanced — env overrides & benchmarks
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <AdvancedPanel
              readApiBase={readApiBase}
              iplaneBase={iplaneBase}
              cplaneBase={cplaneBase}
              onOverrideChanged={refreshPlanes}
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Advanced panel — localStorage overrides + benchmark. Collapsed by default
// so the primary view stays focused.
// ──────────────────────────────────────────────────────────────────────────
function AdvancedPanel({
  readApiBase,
  iplaneBase,
  cplaneBase,
  onOverrideChanged,
}: {
  readApiBase: string;
  iplaneBase: string;
  cplaneBase: string;
  onOverrideChanged: () => void;
}) {
  const [readOverride, setReadOverride] = useState<string>(() => {
    try {
      return (localStorage.getItem(READ_API_OVERRIDE_LS_KEY) || "").trim();
    } catch {
      return "";
    }
  });
  const [iplaneInput, setIplaneInput] = useState<string>(iplaneBase);

  function applyReadOverride() {
    const v = readOverride.trim();
    if (!v) clearReadApiOverride();
    else setReadApiOverride(v);
    onOverrideChanged();
  }

  function clearRead() {
    clearReadApiOverride();
    setReadOverride("");
    onOverrideChanged();
  }

  function useLocalRead() {
    setReadOverride(LOCAL_READ_API_DEFAULT);
    setReadApiOverride(LOCAL_READ_API_DEFAULT);
    onOverrideChanged();
  }

  function applyIplane() {
    try {
      const v = iplaneInput.trim().replace(/\/+$/, "");
      if (v) localStorage.setItem(IPLANE_LS_KEY, v);
      else localStorage.removeItem(IPLANE_LS_KEY);
    } catch { /* noop */ }
    onOverrideChanged();
  }

  return (
    <div className="space-y-5 text-xs">
      <div>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
          Resolved bases
        </p>
        <div className="grid md:grid-cols-3 gap-2">
          <div className="rounded-md border border-border/60 p-2 space-y-1">
            <div className="text-[10px] text-muted-foreground">C-Plane</div>
            <div className="font-mono text-[11px] break-all">{cplaneBase || "—"}</div>
          </div>
          <div className="rounded-md border border-border/60 p-2 space-y-1">
            <div className="text-[10px] text-muted-foreground">I-Plane</div>
            <div className="font-mono text-[11px] break-all">{iplaneBase || "—"}</div>
          </div>
          <div className="rounded-md border border-border/60 p-2 space-y-1">
            <div className="text-[10px] text-muted-foreground">Read API</div>
            <div className="font-mono text-[11px] break-all">{readApiBase || "—"}</div>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-muted-foreground">
          <div>
            env var: <code className="font-mono">VITE_ENCEPH_READ_API_BASE</code> →{" "}
            {getEnvReadApiBase() || "(unset)"}
          </div>
          <div>
            prod default: <code className="font-mono">{PROD_READ_API_DEFAULT}</code>
          </div>
        </div>
      </div>

      <div>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
          Read API override (localStorage)
        </p>
        <div className="flex gap-2">
          <Input
            value={readOverride}
            onChange={(e) => setReadOverride(e.target.value)}
            placeholder="https://…"
            className="text-xs font-mono"
          />
          <Button size="sm" variant="secondary" onClick={applyReadOverride}>
            Apply
          </Button>
          <Button size="sm" variant="outline" onClick={clearRead}>
            Clear
          </Button>
          <Button size="sm" variant="outline" onClick={useLocalRead}>
            Use local
          </Button>
        </div>
      </div>

      <div>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
          I-Plane override (localStorage)
        </p>
        <div className="flex gap-2">
          <Input
            value={iplaneInput}
            onChange={(e) => setIplaneInput(e.target.value)}
            placeholder="https://…"
            className="text-xs font-mono"
          />
          <Button size="sm" variant="secondary" onClick={applyIplane}>
            Apply
          </Button>
        </div>
      </div>

      <Benchmark />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Benchmark: DIRECT vs PROXY — mostly useful when deciding whether to put
// the Read API key in the browser or keep everything going through the
// edge-function proxy.
// ──────────────────────────────────────────────────────────────────────────
type BenchRow = {
  endpoint: string;
  directMs: number | null;
  proxyMs: number | null;
  diff: number | null;
  winner: "direct" | "proxy" | "tie" | null;
};

function Benchmark() {
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<BenchRow[]>([]);
  const [note, setNote] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setRows([]);
    setNote(null);

    const key = getReadApiKey();
    const proxyBase = getReadApiProxyBase();
    const directBase = resolveReadApiBase();

    if (!key) {
      setNote("API key not in browser — cannot run DIRECT mode, benchmark skipped.");
      setRunning(false);
      return;
    }
    if (!proxyBase) {
      setNote("Proxy not available — cannot benchmark DIRECT vs PROXY.");
      setRunning(false);
      return;
    }

    const endpoints = [
      { name: "Health", path: "/health", requireKey: false, binary: false },
      { name: "Meta", path: `/studies/TUH_CANON_001/meta?root=.`, requireKey: true, binary: false },
      { name: "Chunk 1KB", path: `/studies/TUH_CANON_001/chunk.bin?root=.&start=0&length=1024`, requireKey: true, binary: true },
    ];
    const anon = String((import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY || "").trim();

    const results: BenchRow[] = [];
    for (const ep of endpoints) {
      // DIRECT
      const d0 = performance.now();
      let directMs: number | null = null;
      try {
        const res = await fetch(`${directBase}${ep.path}`, {
          headers: ep.requireKey ? { "X-API-KEY": key } : {},
        });
        if (ep.binary) await res.arrayBuffer();
        else await res.json().catch(() => null);
        directMs = Math.round(performance.now() - d0);
      } catch {
        directMs = null;
      }

      // PROXY
      const p0 = performance.now();
      let proxyMs: number | null = null;
      try {
        const url = `${proxyBase}${ep.path}`;
        const res = await fetch(url, {
          headers: ep.requireKey ? { apikey: anon, Authorization: `Bearer ${anon}` } : {},
        });
        if (ep.binary) await res.arrayBuffer();
        else await res.json().catch(() => null);
        proxyMs = Math.round(performance.now() - p0);
      } catch {
        proxyMs = null;
      }

      const diff = directMs !== null && proxyMs !== null ? proxyMs - directMs : null;
      let winner: BenchRow["winner"] = null;
      if (directMs !== null && proxyMs !== null) {
        if (Math.abs(directMs - proxyMs) < 20) winner = "tie";
        else winner = directMs < proxyMs ? "direct" : "proxy";
      }
      results.push({ endpoint: ep.name, directMs, proxyMs, diff, winner });
    }

    setRows(results);
    setRunning(false);
  }

  return (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
        DIRECT vs PROXY latency benchmark
      </p>
      <div className="flex items-center gap-2 mb-2">
        <Button size="sm" onClick={run} disabled={running}>
          {running ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : null}
          Run benchmark
        </Button>
        {note && <span className="text-[11px] text-muted-foreground">{note}</span>}
      </div>
      {rows.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Endpoint</TableHead>
              <TableHead className="text-right">Direct</TableHead>
              <TableHead className="text-right">Proxy</TableHead>
              <TableHead className="text-right">Δ</TableHead>
              <TableHead>Faster</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.endpoint}>
                <TableCell className="text-xs">{r.endpoint}</TableCell>
                <TableCell className="text-right">
                  <LatencyInline ms={r.directMs} />
                </TableCell>
                <TableCell className="text-right">
                  <LatencyInline ms={r.proxyMs} />
                </TableCell>
                <TableCell className="text-right font-mono text-[11px]">
                  {r.diff !== null ? `${r.diff > 0 ? "+" : ""}${r.diff}ms` : "—"}
                </TableCell>
                <TableCell>
                  {r.winner === "direct" && <Badge variant="default" className="text-[10px]">DIRECT</Badge>}
                  {r.winner === "proxy" && <Badge variant="secondary" className="text-[10px]">PROXY</Badge>}
                  {r.winner === "tie" && <Badge variant="outline" className="text-[10px]">TIE</Badge>}
                  {r.winner === null && <span className="text-muted-foreground text-[11px]">—</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
