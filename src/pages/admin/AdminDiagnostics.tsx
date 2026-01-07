import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { BackendStatusCard } from "@/admin/components/BackendStatusCard";
import {
  getAnnotations,
  getArtifacts,
  getChunkHeaders,
  getHealth,
  getMeta,
  getResolvedBaseForUI,
  getResolvedKeyPresent,
  getSegments,
} from "@/admin/readApi";
import {
  READ_API_OVERRIDE_LS_KEY,
  LOCAL_READ_API_DEFAULT,
  PROD_READ_API_DEFAULT,
  resolveReadApiBase,
  setReadApiOverride,
  clearReadApiOverride,
  getEnvBase as getEnvReadApiBase,
  getReadApiKey,
} from "@/shared/readApiConfig";
import { fetchJson, fetchBinary, getReadApiProxyBase } from "@/shared/readApiClient";
import { Activity } from "lucide-react";

type CheckRow = {
  name: string;
  ok: boolean;
  ms: number;
  notes?: string;
  mode?: "direct" | "proxy";
};

type BenchmarkResult = {
  endpoint: string;
  directMs: number | null;
  proxyMs: number | null;
  diff: number | null;
  winner: "direct" | "proxy" | "tie" | null;
};

// Latency thresholds (ms)
const LATENCY_GOOD = 200;
const LATENCY_WARN = 500;

function getLatencyColor(ms: number): string {
  if (ms <= LATENCY_GOOD) return "text-green-500";
  if (ms <= LATENCY_WARN) return "text-yellow-500";
  return "text-red-500";
}

function getLatencyBadge(ms: number): { variant: "default" | "secondary" | "destructive"; label: string } {
  if (ms <= LATENCY_GOOD) return { variant: "default", label: "Fast" };
  if (ms <= LATENCY_WARN) return { variant: "secondary", label: "Moderate" };
  return { variant: "destructive", label: "Slow" };
}

const STUDY_ID = "TUH_CANON_001";
const ROOT = ".";

function setOverrideBase(v: string) {
  const trimmed = v.trim().replace(/\/+$/, "");
  if (!trimmed) clearReadApiOverride();
  else setReadApiOverride(trimmed);
}

function getOverrideBase(): string {
  try {
    return (localStorage.getItem(READ_API_OVERRIDE_LS_KEY) || "").trim().replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function getEnvBase(): string {
  return getEnvReadApiBase();
}

export default function AdminDiagnostics() {
  const [inputBase, setInputBase] = useState<string>(() => getOverrideBase() || getResolvedBaseForUI());
  const [resolvedBase, setResolvedBase] = useState<string>(() => resolveReadApiBase());
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<CheckRow[]>([]);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [benchmarkResults, setBenchmarkResults] = useState<BenchmarkResult[]>([]);
  const [benchmarkRunning, setBenchmarkRunning] = useState(false);

  const [backend, setBackend] = useState<{
    base: string;
    keyPresent: boolean;
    health?: any;
    meta?: any;
    segments?: any;
    chunk?: { ms: number; headers: Record<string, string> } | null;
    err?: string;
    ts: number;
  }>({ base: resolveReadApiBase(), keyPresent: getResolvedKeyPresent(), ts: Date.now() });

  const passCount = useMemo(() => rows.filter((r) => r.ok).length, [rows]);
  const failCount = useMemo(() => rows.filter((r) => !r.ok).length, [rows]);

  function syncResolved() {
    const r = resolveReadApiBase();
    setResolvedBase(r);
    setBackend((b) => ({ ...b, base: r, keyPresent: getResolvedKeyPresent(), ts: Date.now() }));
  }

  function applyBase() {
    setOverrideBase(inputBase);
    syncResolved();
  }

  function clearOverride() {
    setOverrideBase("");
    setInputBase(resolveReadApiBase());
    syncResolved();
  }

  function useLocal() {
    setInputBase(LOCAL_READ_API_DEFAULT);
    setOverrideBase(LOCAL_READ_API_DEFAULT);
    syncResolved();
  }

  function useEnvDefault() {
    // Clear override; resolver will use env if present, else fallback
    clearOverride();
  }

  async function runDiagnostics() {
    setRunning(true);
    setRows([]);

    // Re-resolve right before running
    const base = resolveReadApiBase();
    const keyPresent = getResolvedKeyPresent();
    const ts = Date.now();
    setBackend({ base, keyPresent, ts });

    const out: CheckRow[] = [];
    const mode: "direct" | "proxy" = keyPresent ? "direct" : "proxy";
    const push = (name: string, ok: boolean, ms: number, notes?: string) => out.push({ name, ok, ms, notes, mode });

    const h = await getHealth();
    push("Read API /health", h.ok, h.ms, h.ok ? "" : (h as any).error);
    if (!h.ok) {
      setRows(out);
      setBackend({ base, keyPresent, err: (h as any).error, ts });
      setRunning(false);
      setLastRun(new Date().toISOString());
      return;
    }

    if (!keyPresent) {
      const msg = "Missing VITE_ENCEPH_READ_API_KEY (auth endpoints will fail).";
      push("Auth key present", false, 0, msg);
      setRows(out);
      setBackend({ base, keyPresent, health: h.ok ? h.data : undefined, err: msg, ts });
      setRunning(false);
      setLastRun(new Date().toISOString());
      return;
    }

    const m = await getMeta(STUDY_ID, ROOT);
    push("Meta (C-plane)", m.ok, m.ms, m.ok ? `channels=${m.data?.channels?.length ?? "?"}, sr=${m.data?.sample_rate_hz ?? "?"}` : (m as any).error);

    const c1 = await getChunkHeaders(STUDY_ID, 0, 256, ROOT);
    push("Chunk #1 (binary + headers)", c1.ok, c1.ms, c1.ok ? `sha=${(c1.headers["x-eeg-content-sha256"] || "").slice(0, 10)}…, dtype=${c1.headers["x-eeg-dtype"] || "?"}` : (c1 as any).error);

    const c2 = await getChunkHeaders(STUDY_ID, 0, 256, ROOT);
    let detOk = false;
    let detNotes = "";
    if (c1.ok && c2.ok) {
      const sha1 = c1.headers["x-eeg-content-sha256"] || "";
      const sha2 = c2.headers["x-eeg-content-sha256"] || "";
      detOk = !!sha1 && sha1 === sha2;
      detNotes = detOk ? "hdr_sha=match" : `hdr_sha=mismatch (${sha1.slice(0, 10)}… vs ${sha2.slice(0, 10)}…)`;
    } else {
      detOk = false;
      detNotes = "chunk fetch failed";
    }
    push("Chunk determinism (same request twice)", detOk, c2.ok ? c2.ms : 0, detNotes);

    const a = await getArtifacts(STUDY_ID, ROOT);
    push("Artifacts (derived)", a.ok, a.ms, a.ok ? `items=${(a.data?.items?.length ?? a.data?.length ?? 0)}, run_id=${a.data?.run_id ? String(a.data.run_id).slice(0, 12) + "…" : "?"}` : (a as any).error);

    const an = await getAnnotations(STUDY_ID, ROOT);
    push("Annotations (derived)", an.ok, an.ms, an.ok ? `items=${(an.data?.items?.length ?? an.data?.length ?? 0)}, run_id=${an.data?.run_id ? String(an.data.run_id).slice(0, 12) + "…" : "?"}` : (an as any).error);

    const s = await getSegments(STUDY_ID, ROOT);
    push("Segments (derived)", s.ok, s.ms, s.ok ? `schema=${s.data?.schema_version || s.data?.schema || "?"}, run_id=${s.data?.run_id ? String(s.data.run_id).slice(0, 12) + "…" : "?"}` : (s as any).error);

    let runOk = false;
    let runNotes = "";
    if (a.ok && an.ok && s.ok) {
      const r1 = a.data?.run_id || null;
      const r2 = an.data?.run_id || null;
      const r3 = s.data?.run_id || null;
      runOk = !!r1 && r1 === r2 && r2 === r3;
      runNotes = runOk ? `run_id consistent: ${String(r1).slice(0, 12)}…` : `run_id mismatch: artifacts=${r1}, annotations=${r2}, segments=${r3}`;
    } else {
      runOk = false;
      runNotes = "one or more derived endpoints failed";
    }
    push("I-plane publish consistency (run_id match)", runOk, 0, runNotes);

    setRows(out);
    setBackend({
      base,
      keyPresent,
      health: h.data,
      meta: m.ok ? m.data : undefined,
      segments: s.ok ? s.data : undefined,
      chunk: c1.ok ? { ms: c1.ms, headers: c1.headers } : null,
      err: out.some((r) => !r.ok) ? "One or more checks failed." : undefined,
      ts,
    });
    setLastRun(new Date().toISOString());
    setRunning(false);
  }

  async function runBenchmark() {
    setBenchmarkRunning(true);
    setBenchmarkResults([]);

    const key = getReadApiKey();
    const proxyBase = getReadApiProxyBase();
    const directBase = resolveReadApiBase();

    if (!key) {
      setBenchmarkResults([{
        endpoint: "N/A",
        directMs: null,
        proxyMs: null,
        diff: null,
        winner: null,
      }]);
      setBenchmarkRunning(false);
      return;
    }

    if (!proxyBase) {
      setBenchmarkResults([{
        endpoint: "N/A",
        directMs: null,
        proxyMs: null,
        diff: null,
        winner: null,
      }]);
      setBenchmarkRunning(false);
      return;
    }

    const results: BenchmarkResult[] = [];
    const studyId = STUDY_ID;
    const root = ROOT;

    // Benchmark endpoints
    const endpoints = [
      { name: "Health", path: "/health", requireKey: false },
      { name: "Meta", path: `/studies/${studyId}/meta?root=${encodeURIComponent(root)}`, requireKey: true },
      { name: "Chunk (1KB)", path: `/studies/${studyId}/chunk.bin?root=${encodeURIComponent(root)}&start=0&length=1024`, requireKey: true, binary: true },
    ];

    for (const ep of endpoints) {
      // Direct request
      const directStart = performance.now();
      let directMs: number | null = null;
      try {
        if (ep.binary) {
          const res = await fetch(`${directBase}${ep.path}`, {
            headers: { "X-API-KEY": key },
          });
          if (res.ok) await res.arrayBuffer();
          directMs = Math.round(performance.now() - directStart);
        } else {
          const res = await fetch(`${directBase}${ep.path}`, {
            headers: ep.requireKey ? { "X-API-KEY": key } : {},
          });
          if (res.ok) await res.json();
          directMs = Math.round(performance.now() - directStart);
        }
      } catch {
        directMs = null;
      }

      // Proxy request
      const proxyStart = performance.now();
      let proxyMs: number | null = null;
      try {
        const anon = String((import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY || "").trim();
        const proxyUrl = `${proxyBase}${ep.path}`;
        if (ep.binary) {
          const res = await fetch(proxyUrl, {
            headers: { apikey: anon, Authorization: `Bearer ${anon}` },
          });
          if (res.ok) await res.arrayBuffer();
          proxyMs = Math.round(performance.now() - proxyStart);
        } else {
          const res = await fetch(proxyUrl, {
            headers: ep.requireKey ? { apikey: anon, Authorization: `Bearer ${anon}` } : {},
          });
          if (res.ok) await res.json();
          proxyMs = Math.round(performance.now() - proxyStart);
        }
      } catch {
        proxyMs = null;
      }

      const diff = directMs !== null && proxyMs !== null ? proxyMs - directMs : null;
      let winner: BenchmarkResult["winner"] = null;
      if (directMs !== null && proxyMs !== null) {
        if (Math.abs(directMs - proxyMs) < 20) winner = "tie";
        else winner = directMs < proxyMs ? "direct" : "proxy";
      }

      results.push({ endpoint: ep.name, directMs, proxyMs, diff, winner });
    }

    setBenchmarkResults(results);
    setBenchmarkRunning(false);
  }

  useEffect(() => {
    syncResolved();
    runDiagnostics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const envBase = getEnvBase();
  const overrideBase = getOverrideBase();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Diagnostics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm opacity-80">
            Validates Read API health, meta, chunk determinism, derived endpoints, and run_id consistency.
          </div>

          <BackendStatusCard
            base={backend.base}
            keyPresent={backend.keyPresent}
            err={backend.err}
            health={backend.health}
            segments={backend.segments}
            chunk={backend.chunk || null}
            ts={backend.ts}
          />

          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="text-base">Config truth table</CardTitle>
            </CardHeader>
            <CardContent className="text-xs space-y-2">
              <div><span className="opacity-70">localStorage override:</span> {overrideBase || "(none)"}</div>
              <div><span className="opacity-70">VITE_ENCEPH_READ_API_BASE:</span> {envBase || "(missing)"} </div>
              <div><span className="opacity-70">resolved base (used):</span> <span className="font-mono">{resolvedBase}</span></div>
              <div><span className="opacity-70">prod default:</span> {PROD_READ_API_DEFAULT}</div>
              <div><span className="opacity-70">local default:</span> {LOCAL_READ_API_DEFAULT}</div>
            </CardContent>
          </Card>

          <div className="space-y-2">
            <div className="text-sm font-medium">Read API base override</div>
            <div className="flex gap-2">
              <Input value={inputBase} onChange={(e) => setInputBase(e.target.value)} />
              <Button variant="secondary" onClick={applyBase}>Apply</Button>
              <Button variant="outline" onClick={clearOverride}>Clear Override</Button>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={useLocal}>Use Local</Button>
              <Button variant="outline" onClick={useEnvDefault}>Use Env Default</Button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={runDiagnostics} disabled={running}>
              {running ? "Running…" : "Run Diagnostics"}
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant={getReadApiKey() ? "default" : "secondary"} className="cursor-help">
                  {getReadApiKey() ? "DIRECT" : "PROXY"}
                </Badge>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                {getReadApiKey() ? (
                  <p><strong>DIRECT mode:</strong> API key is available in browser. Requests go directly to Read API with lower latency.</p>
                ) : (
                  <p><strong>PROXY mode:</strong> API key is injected server-side via Edge Function. Adds ~50-100ms latency but keeps key secure.</p>
                )}
              </TooltipContent>
            </Tooltip>
            <Badge variant={failCount > 0 ? "destructive" : "default"}>
              {failCount > 0 ? `FAIL (${failCount})` : `PASS (${passCount})`}
            </Badge>
            {lastRun && <div className="text-xs opacity-70">Last run: {lastRun}</div>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Checks</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Check</TableHead>
                <TableHead className="text-right">Latency (ms)</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.name}>
                  <TableCell>
                    {r.ok ? <span className="text-green-500">PASS</span> : <span className="text-red-500">FAIL</span>}
                  </TableCell>
                  <TableCell>{r.name}</TableCell>
                  <TableCell className="text-right">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className={`font-mono ${getLatencyColor(r.ms)} cursor-help`}>
                          {r.ms}ms
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <div className="text-xs space-y-1">
                          <div>≤{LATENCY_GOOD}ms = <span className="text-green-500">Good</span></div>
                          <div>{LATENCY_GOOD}-{LATENCY_WARN}ms = <span className="text-yellow-500">Moderate</span></div>
                          <div>≥{LATENCY_WARN}ms = <span className="text-red-500">Slow</span></div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    {r.mode && (
                      <Badge variant={r.mode === "direct" ? "default" : "secondary"} className="text-xs">
                        {r.mode.toUpperCase()}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs opacity-80">{r.notes || ""}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Latency Benchmark Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Latency Benchmark
          </CardTitle>
          <CardDescription>
            Compare response times between DIRECT (browser → API) and PROXY (browser → Edge Function → API) modes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Button onClick={runBenchmark} disabled={benchmarkRunning || !getReadApiKey() || !getReadApiProxyBase()}>
              {benchmarkRunning ? "Running Benchmark…" : "Run Benchmark"}
            </Button>
            {!getReadApiKey() && (
              <span className="text-xs text-muted-foreground">API key required for benchmark</span>
            )}
            {getReadApiKey() && !getReadApiProxyBase() && (
              <span className="text-xs text-muted-foreground">Proxy not available</span>
            )}
          </div>

          {benchmarkResults.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Endpoint</TableHead>
                  <TableHead className="text-right">Direct (ms)</TableHead>
                  <TableHead className="text-right">Proxy (ms)</TableHead>
                  <TableHead className="text-right">Δ (ms)</TableHead>
                  <TableHead>Faster</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {benchmarkResults.map((r) => (
                  <TableRow key={r.endpoint}>
                    <TableCell className="font-medium">{r.endpoint}</TableCell>
                    <TableCell className="text-right">
                      {r.directMs !== null ? (
                        <span className={getLatencyColor(r.directMs)}>{r.directMs}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.proxyMs !== null ? (
                        <span className={getLatencyColor(r.proxyMs)}>{r.proxyMs}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {r.diff !== null ? (
                        <span className={r.diff > 0 ? "text-green-500" : r.diff < 0 ? "text-red-500" : ""}>
                          {r.diff > 0 ? "+" : ""}{r.diff}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {r.winner === "direct" && <Badge variant="default">DIRECT</Badge>}
                      {r.winner === "proxy" && <Badge variant="secondary">PROXY</Badge>}
                      {r.winner === "tie" && <Badge variant="outline">TIE</Badge>}
                      {r.winner === null && <span className="text-muted-foreground">—</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
            <p><strong>DIRECT:</strong> Request goes directly from browser to Read API (requires API key in browser).</p>
            <p><strong>PROXY:</strong> Request routes through Edge Function which injects API key server-side (more secure, adds latency).</p>
            <p><strong>Δ (Delta):</strong> Positive = DIRECT is faster by that amount. Negative = PROXY is faster.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
