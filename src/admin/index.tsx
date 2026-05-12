// =============================================================================
// AdminReadApi — EEG inspection cockpit
//
// Admin-side explorer for the Read API: pick a canonical study, pull /meta,
// stream a binary window from /chunk.bin, render the waveforms through the
// existing EEGViewer. This is the page a super_admin opens when they want to
// verify "is this specific study actually in the canonical store and does it
// decode correctly?" — it is NOT a dev-env tuner for flipping base URLs.
//
// Historical bugs this rewrite fixes:
//   1. The old page hit /chunk (JSON+b64) and /artifact (singular). Neither
//      endpoint exists on prod Read API — it only serves /chunk.bin. So
//      every "Load Window" click 404'd. That's why it "felt bad".
//   2. Study ID was hard-coded to TUH_CANON_001, which was wiped during the
//      ESF-v1 reset. Same ghost-study problem the diagnostics page had.
//   3. Base URL + API key inputs sat at the top of the page, in front of the
//      actual work. Moved to an Advanced accordion; config is already in
//      env vars for prod.
//   4. MiniViewer was stacked above EEGViewer rendering the same data
//      twice. Dropped; EEGViewer carries spacing + downsample controls.
//
// /chunk.bin contract (verified live from apps/read_api/main.py):
//   • body:    raw planar f32le, row-major [n_channels × samples_per_channel]
//   • headers:
//       x-eeg-channel-count, x-eeg-samples-per-channel, x-eeg-length,
//       x-eeg-sample-rate-hz, x-eeg-channel-ids (csv),
//       x-eeg-layout="planar", x-eeg-dtype="f32le", x-eeg-unit="uV",
//       x-eeg-content-sha256, x-eeg-server-ms
// =============================================================================

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUserSession } from "@/contexts/UserSessionContext";
import SignalViewer from "./SignalViewer";
import {
  AlertCircle,
  CheckCircle2,
  XCircle,
  Loader2,
  Activity,
  Database,
  HardDrive,
  Save,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import { toast } from "sonner";
import type { CanonicalMeta } from "./readApi";
import {
  resolveReadApiBase,
  setReadApiOverride,
  clearReadApiOverride,
  getReadApiKey,
  getEnvBase as getEnvReadApiBase,
  READ_API_OVERRIDE_LS_KEY,
  PROD_READ_API_DEFAULT,
  LOCAL_READ_API_DEFAULT,
} from "@/shared/readApiConfig";
import { getReadApiProxyBase } from "@/shared/readApiClient";

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────
type PickableStudy = {
  id: string;
  study_key: string | null;
  state: string | null;
  latest_run_id: string | null;
  created_at: string;
};

type WindowInfo = {
  nChannels: number;
  length: number;
  dtype: string;
  layout: string;
  unit: string;
  sampleRateHz: number;
  channelIds: string[];
  sha256: string;
  serverMs: number;
  clientMs: number;
  start: number;
};

type NormalAbnormal = {
  decision?: string;
  score_abnormal?: number;
  label?: string;
  confidence?: number;
} | null;

function getMetaChannelLabel(meta: CanonicalMeta | null, i: number): string {
  const ch = meta?.channel_map?.find((x) => x.index === i);
  return ch?.canonical_id || ch?.original_label || `Ch ${i}`;
}

// ──────────────────────────────────────────────────────────────────────────
// Studies loader (same pattern as AdminDiagnostics)
// ──────────────────────────────────────────────────────────────────────────
async function fetchProbableStudies(isSuperAdmin: boolean): Promise<PickableStudy[]> {
  if (isSuperAdmin) {
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
      .slice(0, 50);
  }
  const { data, error } = await supabase
    .from("studies")
    .select("id, study_key, state, latest_run_id, created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data as any[]) || [];
}

// ──────────────────────────────────────────────────────────────────────────
// UI atoms
// ──────────────────────────────────────────────────────────────────────────
function KV({ label, value, mono = true }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 text-xs py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-right truncate max-w-[240px] ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────────────────────────────────
export default function AdminReadApi() {
  const { roles, isLoading: sessionLoading } = useUserSession();
  const isSuperAdmin = roles.includes("super_admin");

  // Studies list + selection
  const [studies, setStudies] = useState<PickableStudy[]>([]);
  const [studiesLoading, setStudiesLoading] = useState(false);
  const [studiesError, setStudiesError] = useState<string | null>(null);
  const [studyId, setStudyId] = useState<string>("");
  const [manualMode, setManualMode] = useState(false);
  const [manualStudyId, setManualStudyId] = useState<string>("");

  // Window params
  const [startSample, setStartSample] = useState(0);
  const [lengthSamples, setLengthSamples] = useState(2500); // ~10s @ 250Hz

  // Meta + window state
  const [meta, setMeta] = useState<CanonicalMeta | null>(null);
  const [normalAbnormal, setNormalAbnormal] = useState<NormalAbnormal>(null);
  const [signals, setSignals] = useState<Float32Array[]>([]);
  const [channelNames, setChannelNames] = useState<string[]>([]);
  const [samplingRate, setSamplingRate] = useState(250);
  const [windowInfo, setWindowInfo] = useState<WindowInfo | null>(null);
  const [spacing, setSpacing] = useState(40);
  const [downsampleFactor, setDownsampleFactor] = useState(2);

  const [loadingMeta, setLoadingMeta] = useState(false);
  const [loadingWindow, setLoadingWindow] = useState(false);
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [healthResult, setHealthResult] = useState<{ status: number; body: string; ms: number } | null>(null);

  // Resolved config (display-only on the primary view)
  const resolvedBase = useMemo(() => resolveReadApiBase(), []);
  const keyPresent = !!getReadApiKey();
  const proxyBase = getReadApiProxyBase();

  const effectiveStudyId = manualMode ? manualStudyId.trim() : studyId;
  const canQuery = !!effectiveStudyId && !!resolvedBase;

  const nSamples = meta?.n_samples ?? 0;
  const sRate = meta?.sampling_rate_hz ?? 250;
  const maxStart = nSamples > 0 ? Math.max(0, nSamples - 1) : 0;
  const maxLength = nSamples > 0 ? Math.min(500000, nSamples - startSample) : 500000;

  // ── Load studies on mount ──────────────────────────────────────────────
  async function loadStudies() {
    setStudiesLoading(true);
    setStudiesError(null);
    try {
      const rows = await fetchProbableStudies(isSuperAdmin);
      setStudies(rows);
      const firstWithRun = rows.find((r) => r.latest_run_id);
      if (firstWithRun) setStudyId(firstWithRun.id);
      else if (rows[0]) setStudyId(rows[0].id);
    } catch (e: any) {
      setStudiesError(e?.message || String(e));
    } finally {
      setStudiesLoading(false);
    }
  }

  useEffect(() => {
    if (!sessionLoading) loadStudies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionLoading, isSuperAdmin]);

  // ── Shared header builder (direct + optional API key) ──────────────────
  function authHeaders(): Record<string, string> {
    const k = getReadApiKey();
    return k ? { "X-API-KEY": k } : {};
  }

  // ── Actions ────────────────────────────────────────────────────────────
  async function handleTestHealth() {
    if (!resolvedBase) {
      toast.error("Read API base URL is not configured");
      return;
    }
    setLoadingHealth(true);
    setHealthResult(null);
    const t0 = performance.now();
    try {
      const res = await fetch(`${resolvedBase.replace(/\/+$/, "")}/health`, {
        headers: authHeaders(),
      });
      const body = await res.text();
      const ms = Math.round(performance.now() - t0);
      setHealthResult({ status: res.status, body, ms });
      if (res.ok) toast.success(`Health OK (${ms}ms)`);
      else toast.error(`Health ${res.status} (${ms}ms)`);
    } catch (err) {
      const ms = Math.round(performance.now() - t0);
      const msg = err instanceof Error ? err.message : "Network error";
      setHealthResult({ status: 0, body: msg, ms });
      toast.error(msg);
    } finally {
      setLoadingHealth(false);
    }
  }

  async function handleLoadMeta() {
    if (!canQuery) {
      toast.error("Pick a study first");
      return;
    }
    setError(null);
    setLoadingMeta(true);
    setMeta(null);
    setNormalAbnormal(null);
    setSignals([]);
    setWindowInfo(null);

    try {
      const url = `${resolvedBase.replace(/\/+$/, "")}/studies/${encodeURIComponent(
        effectiveStudyId,
      )}/meta?root=.`;
      const t0 = performance.now();
      const res = await fetch(url, { headers: authHeaders() });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status}: ${body || res.statusText}`);
      }
      const json = await res.json();
      const metaObj: CanonicalMeta = json.meta ?? json;
      const naObj: NormalAbnormal = json.normal_abnormal ?? null;

      if (typeof metaObj.n_samples !== "number") {
        throw new Error("Invalid response: missing n_samples");
      }

      setMeta(metaObj);
      setNormalAbnormal(naObj);

      const nCh = metaObj.n_channels ?? metaObj.channel_map?.length ?? 0;
      const names = Array.from({ length: nCh }, (_, i) => getMetaChannelLabel(metaObj, i));
      setChannelNames(names);
      setSamplingRate(metaObj.sampling_rate_hz ?? 250);

      setStartSample(0);
      setLengthSamples(Math.min((metaObj.sampling_rate_hz ?? 250) * 10, metaObj.n_samples));

      const ms = Math.round(performance.now() - t0);
      toast.success(`Meta loaded (${ms}ms)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load meta";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoadingMeta(false);
    }
  }

  async function handleLoadWindow() {
    if (!canQuery) {
      toast.error("Pick a study first");
      return;
    }

    const maxSamples = meta?.n_samples ?? 1_000_000;
    const clampedStart = Math.max(0, Math.min(startSample, Math.max(0, maxSamples - 1)));
    const clampedReqLen = Math.max(
      1,
      Math.min(lengthSamples, Math.min(500_000, maxSamples - clampedStart)),
    );

    setError(null);
    setLoadingWindow(true);
    setWindowInfo(null);

    try {
      const url = `${resolvedBase.replace(/\/+$/, "")}/studies/${encodeURIComponent(
        effectiveStudyId,
      )}/chunk.bin?root=.&start=${clampedStart}&length=${clampedReqLen}`;
      const t0 = performance.now();
      const res = await fetch(url, { headers: authHeaders() });
      if (!res.ok) {
        const body = await res.text().catch(() => res.statusText);
        throw new Error(`chunk.bin HTTP ${res.status}: ${body}`);
      }

      // Pull EEG metadata from response headers (defined in apps/read_api/main.py)
      const h = (name: string) => res.headers.get(name) || "";
      const nChannels = parseInt(h("x-eeg-channel-count") || "0", 10);
      const length =
        parseInt(h("x-eeg-samples-per-channel") || h("x-eeg-length") || "0", 10);
      const dtype = h("x-eeg-dtype") || "f32le";
      const layout = h("x-eeg-layout") || "planar";
      const unit = h("x-eeg-unit") || "uV";
      const sampleRateHz = Number(h("x-eeg-sample-rate-hz")) || samplingRate;
      const channelIds = (h("x-eeg-channel-ids") || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const sha256 = h("x-eeg-content-sha256") || "";
      const serverMs = parseInt(h("x-eeg-server-ms") || "0", 10);

      if (!nChannels || !length) {
        throw new Error(
          `Read API returned chunk.bin without shape headers (got nCh=${nChannels}, len=${length})`,
        );
      }

      const buf = await res.arrayBuffer();
      const expectedBytes = nChannels * length * 4;
      if (buf.byteLength < expectedBytes) {
        throw new Error(
          `chunk.bin truncated: got ${buf.byteLength}B, expected ${expectedBytes}B`,
        );
      }

      // Planar f32le row-major: one big Float32Array, slice per channel.
      const flat = new Float32Array(buf, 0, nChannels * length);
      const perChannel: Float32Array[] = [];
      for (let ch = 0; ch < nChannels; ch++) {
        perChannel.push(flat.subarray(ch * length, (ch + 1) * length));
      }
      setSignals(perChannel);

      // If meta hasn't been loaded yet, fall back to channel_ids header for labels.
      if (channelNames.length !== nChannels) {
        const names =
          channelIds.length === nChannels
            ? channelIds
            : Array.from({ length: nChannels }, (_, i) => `Ch ${i}`);
        setChannelNames(names);
      }
      if (!meta) setSamplingRate(sampleRateHz || 250);

      const clientMs = Math.round(performance.now() - t0);
      setWindowInfo({
        nChannels,
        length,
        dtype,
        layout,
        unit,
        sampleRateHz,
        channelIds,
        sha256,
        serverMs,
        clientMs,
        start: clampedStart,
      });
      toast.success(`Window loaded (${clientMs}ms, server ${serverMs}ms)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load window";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoadingWindow(false);
    }
  }

  const selectedPick = studies.find((s) => s.id === studyId);

  return (
    <div className="space-y-6 max-w-5xl">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight">EEG Read API</h1>
            <Badge
              variant="secondary"
              className="h-5 text-[10px] bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20"
            >
              admin inspector
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Pull <span className="font-mono">/meta</span> and a binary{" "}
            <span className="font-mono">/chunk.bin</span> window for any canonical
            study and render the waveforms. Infra health lives on{" "}
            <a href="/admin/diagnostics" className="underline hover:text-foreground">
              /admin/diagnostics
            </a>
            .
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={`text-[10px] ${
              keyPresent
                ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                : proxyBase
                  ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
                  : "bg-red-500/10 text-red-600 border-red-500/20"
            }`}
          >
            {keyPresent ? "DIRECT" : proxyBase ? "PROXY" : "no auth"}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={handleTestHealth}
            disabled={!resolvedBase || loadingHealth}
          >
            {loadingHealth ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Activity className="h-3.5 w-3.5 mr-1.5" />
            )}
            Ping
          </Button>
        </div>
      </div>

      {healthResult && (
        <Alert
          className={
            healthResult.status >= 200 && healthResult.status < 300
              ? "border-emerald-500/40 bg-emerald-500/5"
              : "border-destructive/40 bg-destructive/5"
          }
        >
          {healthResult.status >= 200 && healthResult.status < 300 ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          ) : (
            <XCircle className="h-3.5 w-3.5 text-destructive" />
          )}
          <AlertTitle className="text-xs">
            HTTP {healthResult.status} · {healthResult.ms}ms
          </AlertTitle>
          <AlertDescription className="font-mono text-[10px] whitespace-pre-wrap break-all">
            {healthResult.body.slice(0, 400)}
          </AlertDescription>
        </Alert>
      )}

      {/* ── Study picker + query params ─────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Database className="h-4 w-4 text-muted-foreground" />
            Query
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {studiesError && (
            <Alert variant="destructive">
              <AlertCircle className="h-3.5 w-3.5" />
              <AlertTitle className="text-xs">Could not list studies</AlertTitle>
              <AlertDescription className="font-mono text-[10px]">{studiesError}</AlertDescription>
            </Alert>
          )}

          {!studiesLoading && studies.length === 0 && !studiesError && !manualMode && (
            <div className="rounded-lg border border-dashed border-border/60 p-4 text-xs text-muted-foreground space-y-2">
              <p className="font-medium text-foreground">No studies in the database.</p>
              <p>
                Either nothing has been uploaded yet, or you just ran the ESF-v1.0
                reset and the canonical store is empty on purpose.
              </p>
              <div className="flex gap-2 pt-1">
                <Button size="sm" variant="outline" onClick={() => setManualMode(true)}>
                  Enter study ID manually
                </Button>
                <Button size="sm" variant="ghost" asChild>
                  <a href="/app/upload">Go to upload</a>
                </Button>
              </div>
            </div>
          )}

          {(studies.length > 0 || manualMode) && (
            <div className="grid md:grid-cols-[1fr_120px_120px_auto] gap-2 items-end">
              <div className="flex flex-col gap-1">
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Study
                </Label>
                {manualMode ? (
                  <Input
                    className="text-xs font-mono"
                    placeholder="study_id or study_key"
                    value={manualStudyId}
                    onChange={(e) => setManualStudyId(e.target.value)}
                  />
                ) : (
                  <Select value={studyId} onValueChange={setStudyId}>
                    <SelectTrigger className="text-xs">
                      <SelectValue placeholder="Pick a study" />
                    </SelectTrigger>
                    <SelectContent>
                      {studies.map((s) => {
                        const label = s.study_key || s.id;
                        const canonicalized = !!s.latest_run_id;
                        return (
                          <SelectItem key={s.id} value={s.id} className="text-xs">
                            <span className="font-mono">{label.slice(0, 36)}</span>
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
                )}
              </div>

              <div className="flex flex-col gap-1">
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Start sample
                </Label>
                <Input
                  type="number"
                  min={0}
                  max={maxStart || undefined}
                  value={startSample}
                  onChange={(e) =>
                    setStartSample(Math.max(0, Math.min(Number(e.target.value), maxStart || Infinity)))
                  }
                  className="text-xs font-mono"
                  disabled={!canQuery}
                />
              </div>

              <div className="flex flex-col gap-1">
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Length
                </Label>
                <Input
                  type="number"
                  min={1}
                  max={maxLength || undefined}
                  value={lengthSamples}
                  onChange={(e) =>
                    setLengthSamples(
                      Math.max(1, Math.min(Number(e.target.value), maxLength || 500_000)),
                    )
                  }
                  className="text-xs font-mono"
                  disabled={!canQuery}
                />
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleLoadMeta}
                  disabled={loadingMeta || !canQuery}
                >
                  {loadingMeta && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                  Meta
                </Button>
                <Button size="sm" onClick={handleLoadWindow} disabled={loadingWindow || !canQuery}>
                  {loadingWindow && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                  Load window
                </Button>
              </div>
            </div>
          )}

          {meta?.n_samples != null && (
            <div className="text-[10px] text-muted-foreground font-mono">
              max start: {maxStart.toLocaleString()} · max length:{" "}
              {maxLength.toLocaleString()} (~{(maxLength / sRate).toFixed(1)}s)
            </div>
          )}

          {studies.length > 0 && (
            <div className="flex items-center justify-between text-[10px] text-muted-foreground border-t border-border/40 pt-2">
              <span>
                {studies.length} studies ·{" "}
                {studies.filter((s) => s.latest_run_id).length} canonicalized
              </span>
              <button
                onClick={() => setManualMode((m) => !m)}
                className="underline hover:text-foreground"
              >
                {manualMode ? "Use dropdown" : "Enter ID manually"}
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertTitle className="text-xs">Error</AlertTitle>
          <AlertDescription className="font-mono text-[10px] whitespace-pre-wrap break-all">
            {error}
          </AlertDescription>
        </Alert>
      )}

      {/* ── Meta card ───────────────────────────────────────────────────── */}
      {meta && (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              Metadata
              {selectedPick?.study_key && (
                <Badge variant="outline" className="text-[10px] font-mono">
                  {selectedPick.study_key.slice(0, 24)}
                </Badge>
              )}
            </CardTitle>
            {normalAbnormal && (
              <Badge
                variant={normalAbnormal.decision === "normal" ? "default" : "destructive"}
                className="text-[10px]"
              >
                {normalAbnormal.decision}
                {typeof normalAbnormal.score_abnormal === "number" &&
                  ` · ${normalAbnormal.score_abnormal.toFixed(2)}`}
              </Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Channels
                </div>
                <div className="font-mono text-sm">{meta.n_channels ?? "—"}</div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Sample rate
                </div>
                <div className="font-mono text-sm">{meta.sampling_rate_hz ?? "—"} Hz</div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Samples
                </div>
                <div className="font-mono text-sm">
                  {meta.n_samples ? meta.n_samples.toLocaleString() : "—"}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Duration
                </div>
                <div className="font-mono text-sm">
                  {meta.n_samples && meta.sampling_rate_hz
                    ? `${(meta.n_samples / meta.sampling_rate_hz).toFixed(1)}s`
                    : "—"}
                </div>
              </div>
            </div>

            {meta.channel_map && meta.channel_map.length > 0 && (
              <div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                  First {Math.min(8, meta.channel_map.length)} channels
                </div>
                <div className="flex flex-wrap gap-1">
                  {meta.channel_map.slice(0, 8).map((ch, i) => (
                    <Badge key={i} variant="secondary" className="font-mono text-[10px]">
                      {ch.canonical_id}
                    </Badge>
                  ))}
                  {meta.channel_map.length > 8 && (
                    <Badge variant="outline" className="text-[10px]">
                      +{meta.channel_map.length - 8}
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Window info ─────────────────────────────────────────────────── */}
      {windowInfo && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-muted-foreground" />
              Window
              <Badge
                variant="secondary"
                className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
              >
                loaded
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <KV
              label="Shape"
              value={`[${windowInfo.nChannels} × ${windowInfo.length}]`}
            />
            <KV label="dtype / layout" value={`${windowInfo.dtype} / ${windowInfo.layout}`} />
            <KV label="Unit" value={windowInfo.unit} />
            <KV label="Sample rate" value={`${windowInfo.sampleRateHz} Hz`} />
            <KV
              label="Duration"
              value={`${(windowInfo.length / (windowInfo.sampleRateHz || 250)).toFixed(2)}s`}
            />
            <KV label="Start sample" value={windowInfo.start.toLocaleString()} />
            <KV
              label="Latency"
              value={
                <span>
                  client {windowInfo.clientMs}ms · server {windowInfo.serverMs}ms
                </span>
              }
            />
            <KV
              label="sha256"
              value={
                <span className="text-[10px] opacity-80">
                  {windowInfo.sha256 ? windowInfo.sha256.slice(0, 16) + "…" : "—"}
                </span>
              }
            />
            {windowInfo.channelIds.length > 0 && (
              <div className="pt-2 border-t border-border/40">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                  Channel IDs ({windowInfo.channelIds.length})
                </div>
                <div className="flex flex-wrap gap-1">
                  {windowInfo.channelIds.slice(0, 12).map((c, i) => (
                    <Badge key={i} variant="outline" className="font-mono text-[10px]">
                      {c}
                    </Badge>
                  ))}
                  {windowInfo.channelIds.length > 12 && (
                    <Badge variant="outline" className="text-[10px]">
                      +{windowInfo.channelIds.length - 12}
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── EEG viewer ──────────────────────────────────────────────────── */}
      {signals.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Waveforms</CardTitle>
          </CardHeader>
          <CardContent>
            <SignalViewer
              signals={signals}
              channelNames={channelNames}
              samplingRate={samplingRate}
              spacing={spacing}
              downsampleFactor={downsampleFactor}
              onSpacingChange={setSpacing}
              onDownsampleChange={setDownsampleFactor}
            />
          </CardContent>
        </Card>
      )}

      {/* ── Advanced: override base URL + API key ──────────────────────── */}
      <Accordion type="single" collapsible className="rounded-lg border border-border/60">
        <AccordionItem value="advanced" className="border-0">
          <AccordionTrigger className="px-4 py-2.5 text-xs font-medium hover:no-underline">
            Advanced — connection override
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <AdvancedConnection
              resolvedBase={resolvedBase}
              onSaved={() => {
                // Force re-read of the resolved base so other pages also pick up the change.
                toast.success("Override saved · reloading");
                setTimeout(() => window.location.reload(), 500);
              }}
              onCleared={() => {
                toast.success("Override cleared · reloading");
                setTimeout(() => window.location.reload(), 500);
              }}
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Advanced panel (tucked away)
// ──────────────────────────────────────────────────────────────────────────
function AdvancedConnection({
  resolvedBase,
  onSaved,
  onCleared,
}: {
  resolvedBase: string;
  onSaved: () => void;
  onCleared: () => void;
}) {
  const [baseInput, setBaseInput] = useState<string>(() => {
    try {
      return (localStorage.getItem(READ_API_OVERRIDE_LS_KEY) || "").trim();
    } catch {
      return "";
    }
  });

  function save() {
    const v = baseInput.trim().replace(/\/+$/, "");
    if (!v) {
      clearReadApiOverride();
      onCleared();
      return;
    }
    setReadApiOverride(v);
    onSaved();
  }

  function clear() {
    clearReadApiOverride();
    setBaseInput("");
    onCleared();
  }

  function useProd() {
    setBaseInput(PROD_READ_API_DEFAULT);
  }

  function useLocal() {
    setBaseInput(LOCAL_READ_API_DEFAULT);
  }

  return (
    <div className="space-y-4 text-xs">
      <div>
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
          Currently resolved
        </div>
        <div className="rounded-md border border-border/60 p-2 font-mono text-[11px] break-all">
          {resolvedBase || "(unset)"}
        </div>
        <div className="mt-1.5 grid grid-cols-2 gap-2 text-[10px] text-muted-foreground">
          <div>
            env: <code className="font-mono">VITE_ENCEPH_READ_API_BASE</code> →{" "}
            {getEnvReadApiBase() || "(unset)"}
          </div>
          <div>
            key: <code className="font-mono">VITE_ENCEPH_READ_API_KEY</code> →{" "}
            {getReadApiKey() ? "present" : "missing"}
          </div>
        </div>
      </div>

      <div>
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
          localStorage override
        </div>
        <div className="flex gap-2">
          <Input
            value={baseInput}
            onChange={(e) => setBaseInput(e.target.value)}
            placeholder="https://…"
            className="text-xs font-mono"
          />
          <Button size="sm" variant="secondary" onClick={save}>
            <Save className="h-3.5 w-3.5 mr-1.5" />
            Save
          </Button>
          <Button size="sm" variant="outline" onClick={clear}>
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Clear
          </Button>
        </div>
        <div className="flex gap-2 mt-2">
          <Button size="sm" variant="ghost" onClick={useProd}>
            Use prod default
          </Button>
          <Button size="sm" variant="ghost" onClick={useLocal}>
            Use local
          </Button>
        </div>
        <div className="mt-2 text-[10px] text-muted-foreground font-mono">
          localStorage key: {READ_API_OVERRIDE_LS_KEY}
        </div>
      </div>
    </div>
  );
}
