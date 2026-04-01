// src/pages/app/EEGViewer.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useParams } from "react-router-dom";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, X, Focus, PanelRightOpen } from "lucide-react";
import { WebGLEEGViewer } from "@/components/eeg/WebGLEEGViewer";
import { EEGControls } from "@/components/eeg/EEGControls";
import { SegmentSidebar, getSegmentColor } from "@/components/eeg/SegmentSidebar";
import { useTheme } from "next-themes";
import { fetchJson, fetchBinary, getReadApiProxyBase } from "@/shared/readApiClient";
import { resolveReadApiBase, getReadApiKey } from "@/shared/readApiConfig";
import { Button } from "@/components/ui/button";

// ─── Constants ────────────────────────────────────────────────
const FALLBACK_STUDY_ID = "TUH_CANON_001";

const DIRECT_BASE = resolveReadApiBase();
const DIRECT_KEY = getReadApiKey();
const PROXY_BASE = getReadApiProxyBase() || "";
const IS_LOCAL_BASE = DIRECT_BASE.includes("127.0.0.1") || DIRECT_BASE.includes("localhost");
const API_AVAILABLE = !!(DIRECT_KEY || IS_LOCAL_BASE || PROXY_BASE);

// ─── Types ────────────────────────────────────────────────────
type Meta = {
  n_channels: number;
  sampling_rate_hz: number;
  n_samples: number;
  channel_map: { index: number; canonical_id: string; unit: string }[];
  channel_names?: string[];
  channels?: { name: string }[];
};

type Artifact = { start_sec: number; end_sec: number; label?: string; channel?: number };
type Annotation = { start_sec: number; end_sec?: number; label?: string; channel?: number };
type Marker = { id: string; timestamp_sec: number; marker_type: string; label?: string };
type Segment = { t_start_s: number; t_end_s: number; label: string; channel_index?: number | null; score?: number | null };
type FocusedSegment = { label: string; t_start_s: number; t_end_s: number; channel_index?: number; score?: number };

// ─── Helpers ──────────────────────────────────────────────────
function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)); }
function keyFor(s: number, l: number) { return `${s}:${l}`; }

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// Binary layout detection — channel-major vs sample-major
function reshapeChannelMajor(f32: Float32Array, nCh: number, nSamp: number): number[][] {
  const out: number[][] = Array.from({ length: nCh }, () => new Array(nSamp));
  for (let ch = 0; ch < nCh; ch++) {
    const base = ch * nSamp;
    for (let i = 0; i < nSamp; i++) out[ch][i] = f32[base + i];
  }
  return out;
}

function reshapeSampleMajor(f32: Float32Array, nCh: number, nSamp: number): number[][] {
  const out: number[][] = Array.from({ length: nCh }, () => new Array(nSamp));
  let p = 0;
  for (let i = 0; i < nSamp; i++) for (let ch = 0; ch < nCh; ch++) out[ch][i] = f32[p++];
  return out;
}

function scoreContinuity(channels: number[][], probeSamples = 2048): number {
  const nCh = channels.length;
  if (!nCh) return Infinity;
  const nSamp = channels[0]?.length ?? 0;
  const n = Math.min(nSamp, probeSamples);
  if (n < 8) return Infinity;
  let acc = 0, count = 0;
  const idxs = [0, Math.floor(nCh / 2), nCh - 1].filter((x, i, a) => x >= 0 && x < nCh && a.indexOf(x) === i);
  for (const ch of idxs) {
    const x = channels[ch];
    let s = 0;
    for (let i = 1; i < n; i++) s += Math.abs(x[i] - x[i - 1]);
    acc += s / (n - 1);
    count++;
  }
  return acc / Math.max(1, count);
}

function reshapeAuto(f32: Float32Array, nCh: number, nSamp: number) {
  const a = reshapeChannelMajor(f32, nCh, nSamp);
  const b = reshapeSampleMajor(f32, nCh, nSamp);
  const sa = scoreContinuity(a), sb = scoreContinuity(b);
  return sa <= sb
    ? { signals: a, layout: "channel-major" as const, score: sa }
    : { signals: b, layout: "sample-major" as const, score: sb };
}

function hdrNum(headers: Record<string, string>, names: string[]): number {
  for (const n of names) { const v = headers[n.toLowerCase()]; if (v != null) { const x = Number(v); if (isFinite(x)) return x; } }
  return NaN;
}

async function fetchChunkBin(studyId: string, startSample: number, length: number) {
  return fetchBinary(
    `/studies/${encodeURIComponent(studyId)}/chunk.bin?root=.&start=${startSample}&length=${length}`,
    { timeoutMs: 30000, requireKey: true },
  );
}

// ─── Component ────────────────────────────────────────────────
export default function EEGViewer() {
  const { theme } = useTheme();
  const [searchParams, setSearchParams] = useSearchParams();
  const { id: routeStudyId } = useParams<{ id?: string }>();

  // Study ID: route param → query param → demo fallback
  const studyId = routeStudyId || searchParams.get("studyId") || FALLBACK_STUDY_ID;

  // Focused segment from URL params
  const focusedSegment = useMemo<FocusedSegment | null>(() => {
    const focus = searchParams.get("focus");
    const t = searchParams.get("t");
    const label = searchParams.get("label");
    if (focus !== "segment" || !t || !label) return null;
    const tStart = parseFloat(t);
    if (!isFinite(tStart)) return null;
    const tEnd = searchParams.get("t_end");
    const tEndVal = tEnd ? parseFloat(tEnd) : tStart;
    const ch = searchParams.get("ch");
    const score = searchParams.get("score");
    return {
      label,
      t_start_s: tStart,
      t_end_s: isFinite(tEndVal) ? tEndVal : tStart,
      channel_index: ch ? parseInt(ch, 10) : undefined,
      score: score ? parseFloat(score) : undefined,
    };
  }, [searchParams]);

  // ── Core state ────────────────────────────────────────────
  const [meta, setMeta] = useState<Meta | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [windowSec, setWindowSec] = useState(10);
  const [windowStartSec, setWindowStartSec] = useState(0);
  const [cursorSec, setCursorSec] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [amplitude, setAmplitude] = useState(1.0);
  const [showArtifacts, setShowArtifacts] = useState(true);
  const [suppressArtifacts, setSuppressArtifacts] = useState(false);
  const [showSegmentOverlays, setShowSegmentOverlays] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // ── Overlay data ──────────────────────────────────────────
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);

  // ── Signal buffer ─────────────────────────────────────────
  const [signals, setSignals] = useState<number[][] | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingWindow, setLoadingWindow] = useState(true);

  // ── Refs ──────────────────────────────────────────────────
  const didInitialSeek = useRef(false);
  const cacheRef = useRef<Map<string, number[][]>>(new Map());
  const lastReqId = useRef(0);
  const lastFetchMs = useRef<number | null>(null);
  const lastFetchMode = useRef<"cache" | "net" | null>(null);
  const lastLayoutRef = useRef<string | null>(null);

  // ── Derived ───────────────────────────────────────────────
  const globalTime = windowStartSec + cursorSec;

  const durationSec = useMemo(() => {
    if (!meta) return 0;
    return meta.n_samples / meta.sampling_rate_hz;
  }, [meta]);

  const currentSegmentIndex = useMemo(() => {
    if (!focusedSegment || !segments.length) return -1;
    return segments.findIndex(
      (s) => s.t_start_s === focusedSegment.t_start_s && s.label === focusedSegment.label,
    );
  }, [focusedSegment, segments]);

  // ── Seek helpers ──────────────────────────────────────────
  const seekToAbsolute = useCallback(
    (t: number) => {
      if (!meta) return;
      const dur = meta.n_samples / meta.sampling_rate_hz;
      const tt = clamp(t, 0, Math.max(0, dur - 1e-6));
      const stride = windowSec / 2;
      const ws = Math.floor(tt / stride) * stride;
      setPlaying(false);
      setWindowStartSec(clamp(ws, 0, Math.max(0, dur - windowSec)));
      setCursorSec(clamp(tt - ws, 0, windowSec));
    },
    [meta, windowSec],
  );

  const navigateToSegment = useCallback(
    (seg: Segment) => {
      seekToAbsolute(seg.t_start_s);
      const params = new URLSearchParams(searchParams);
      params.set("t", String(seg.t_start_s));
      params.set("t_end", String(seg.t_end_s));
      params.set("focus", "segment");
      params.set("label", seg.label);
      if (seg.channel_index != null) params.set("ch", String(seg.channel_index));
      else params.delete("ch");
      if (seg.score != null) params.set("score", String(seg.score));
      else params.delete("score");
      setSearchParams(params, { replace: true });
    },
    [seekToAbsolute, searchParams, setSearchParams],
  );

  const dismissFocusedSegment = useCallback(() => {
    const params = new URLSearchParams(searchParams);
    ["focus", "t", "t_end", "label", "ch", "score"].forEach((k) => params.delete(k));
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);

  // ── Effects: API availability guard ───────────────────────
  useEffect(() => {
    if (!API_AVAILABLE) {
      setFatalError("Read API unavailable — no API key and no proxy configured.");
      setLoadingMeta(false);
      setLoadingWindow(false);
    }
  }, []);

  // ── Effects: Meta (reset on study change) ─────────────────
  useEffect(() => {
    if (!API_AVAILABLE) return;
    let alive = true;

    // Reset on study change
    setMeta(null);
    setSignals(null);
    setArtifacts([]);
    setAnnotations([]);
    setSegments([]);
    setWindowStartSec(0);
    setCursorSec(0);
    setFatalError(null);
    cacheRef.current.clear();
    didInitialSeek.current = false;
    setLoadingMeta(true);

    fetchJson<any>(`/studies/${studyId}/meta?root=.`, { timeoutMs: 20000, requireKey: true })
      .then((r) => {
        if (!alive) return;
        if (!r.ok) throw new Error(r.error);
        const j = r.data;
        setMeta((j?.meta ?? j) as Meta);
      })
      .catch((e) => { if (alive) setFatalError(String(e?.message || e)); })
      .finally(() => { if (alive) setLoadingMeta(false); });

    return () => { alive = false; };
  }, [studyId]);

  // ── Effects: Auto-seek from URL param ─────────────────────
  useEffect(() => {
    if (!meta || didInitialSeek.current) return;
    const tParam = searchParams.get("t");
    if (!tParam) return;
    const targetSec = parseFloat(tParam);
    if (!isFinite(targetSec)) return;
    seekToAbsolute(targetSec);
    didInitialSeek.current = true;
  }, [meta, searchParams, seekToAbsolute]);

  // ── Effects: Overlays (artifacts / annotations / segments) ─
  useEffect(() => {
    if (!API_AVAILABLE) return;
    fetchJson<any>(`/studies/${studyId}/artifacts?root=.`, { timeoutMs: 20000, requireKey: true })
      .then((r) => setArtifacts(r.ok ? (r.data?.artifacts ?? []) : []))
      .catch(() => setArtifacts([]));
    fetchJson<any>(`/studies/${studyId}/annotations?root=.`, { timeoutMs: 20000, requireKey: true })
      .then((r) => setAnnotations(r.ok ? (r.data?.annotations ?? []) : []))
      .catch(() => setAnnotations([]));
    fetchJson<any>(`/studies/${studyId}/segments?root=/app/data`, { timeoutMs: 20000, requireKey: true })
      .then((r) => setSegments(r.ok ? (r.data?.segments ?? []) : []))
      .catch(() => setSegments([]));
  }, [studyId]);

  // ── Effects: Channel labels ────────────────────────────────
  const channelLabels = useMemo(() => {
    if (!meta) return [];
    if (Array.isArray(meta.channel_map) && meta.channel_map.length)
      return [...meta.channel_map].sort((a, b) => a.index - b.index).map((c) => c.canonical_id);
    if (Array.isArray(meta.channel_names)) return meta.channel_names;
    if (Array.isArray(meta.channels)) return meta.channels.map((c) => c.name);
    return [];
  }, [meta]);

  const visibleChannels = useMemo(() => {
    if (!meta) return new Set<number>();
    const s = new Set<number>();
    for (let i = 0; i < meta.n_channels; i++) s.add(i);
    return s;
  }, [meta]);

  // ── Effects: Window fetch ─────────────────────────────────
  useEffect(() => {
    if (!API_AVAILABLE || !meta) return;

    const fs = meta.sampling_rate_hz;
    const dur = meta.n_samples / fs;
    const maxStart = Math.max(0, dur - windowSec);
    const ws = clamp(windowStartSec, 0, maxStart);
    if (ws !== windowStartSec) { setWindowStartSec(ws); return; }

    const c = clamp(cursorSec, 0, windowSec);
    if (c !== cursorSec) { setCursorSec(c); return; }

    const startSample = Math.floor(ws * fs);
    const length = Math.max(1, Math.floor(windowSec * fs));
    const k = keyFor(startSample, length);

    const cached = cacheRef.current.get(k);
    if (cached) {
      lastFetchMode.current = "cache";
      setSignals(cached);
      setLoadingWindow(false);
      return;
    }

    setLoadingWindow(true);
    lastFetchMode.current = "net";
    const reqId = ++lastReqId.current;
    const t0 = performance.now();

    fetchChunkBin(studyId, startSample, length)
      .then((r) => {
        if (!r.ok) throw new Error(r.error);
        const hdrNCh = hdrNum(r.headers, ["x-eeg-nchannels", "x-eeg-channel-count"]);
        const hdrNSamp = hdrNum(r.headers, ["x-eeg-length", "x-eeg-samples-per-channel"]);
        const nCh = isFinite(hdrNCh) ? hdrNCh : meta.n_channels;
        const nSamp = isFinite(hdrNSamp) ? hdrNSamp : length;
        return { buf: r.data, nCh, nSamp };
      })
      .then(({ buf, nCh, nSamp }) => {
        if (reqId !== lastReqId.current) return;
        const f32 = new Float32Array(buf);
        if (f32.length !== nCh * nSamp)
          throw new Error(`Bad payload: got ${f32.length}, expected ${nCh * nSamp}`);
        const reshaped = reshapeAuto(f32, nCh, nSamp);
        lastLayoutRef.current = `${reshaped.layout} (${reshaped.score.toFixed(2)})`;
        cacheRef.current.set(k, reshaped.signals);
        setSignals(reshaped.signals);
        lastFetchMs.current = Math.round(performance.now() - t0);
      })
      .catch((e) => { if (reqId === lastReqId.current && !signals) setFatalError(String(e)); })
      .finally(() => { if (reqId === lastReqId.current) setLoadingWindow(false); });

    // Prefetch next window during playback
    if (playing) {
      const stride = windowSec / 2;
      const nextWs = clamp(ws + stride, 0, maxStart);
      const nk = keyFor(Math.floor(nextWs * fs), length);
      if (!cacheRef.current.has(nk)) {
        fetchChunkBin(studyId, Math.floor(nextWs * fs), length)
          .then((r) => {
            if (!r.ok) return;
            const f32 = new Float32Array(r.data);
            const nCh = meta.n_channels;
            if (f32.length !== nCh * length) return;
            cacheRef.current.set(nk, reshapeAuto(f32, nCh, length).signals);
          })
          .catch(() => {});
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, studyId, windowStartSec, windowSec, playing]);

  // ── Effects: Playback loop ────────────────────────────────
  useEffect(() => {
    if (!playing || !meta) return;
    const fs = meta.sampling_rate_hz;
    const dur = meta.n_samples / fs;
    const maxStart = Math.max(0, dur - windowSec);
    const stride = windowSec / 2;
    let raf = 0, last = performance.now();

    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setCursorSec((c) => {
        const nc = c + dt * playbackSpeed;
        if (nc < windowSec * 0.75) return nc;
        setWindowStartSec((ws) => clamp(ws + stride, 0, maxStart));
        return nc - stride;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, meta, windowSec, playbackSpeed]);

  // ── Effects: Keyboard shortcuts ───────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.metaKey || e.ctrlKey) return;

      switch (e.key) {
        case " ":
          e.preventDefault();
          setPlaying((p) => !p);
          break;
        case "ArrowLeft":
          e.preventDefault();
          seekToAbsolute(globalTime - windowSec);
          break;
        case "ArrowRight":
          e.preventDefault();
          seekToAbsolute(globalTime + windowSec);
          break;
        case "=" : case "+":
          e.preventDefault();
          setAmplitude((a) => parseFloat(Math.min(10, a + 0.25).toFixed(2)));
          break;
        case "-":
          e.preventDefault();
          setAmplitude((a) => parseFloat(Math.max(0.1, a - 0.25).toFixed(2)));
          break;
        case "n": case "N":
          e.preventDefault();
          if (segments.length) {
            const next = currentSegmentIndex < segments.length - 1 ? currentSegmentIndex + 1 : 0;
            navigateToSegment(segments[next]);
          }
          break;
        case "p": case "P":
          e.preventDefault();
          if (segments.length) {
            const prev = currentSegmentIndex > 0 ? currentSegmentIndex - 1 : segments.length - 1;
            navigateToSegment(segments[prev]);
          }
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [globalTime, windowSec, segments, currentSegmentIndex, seekToAbsolute, navigateToSegment]);

  // ── Window-local overlays ─────────────────────────────────
  const windowArtifacts = useMemo(() => {
    if (!showArtifacts) return [];
    const ws = windowStartSec, we = windowStartSec + windowSec;
    return artifacts
      .filter((a) => a.end_sec > ws && a.start_sec < we)
      .map((a) => ({ start_sec: a.start_sec - ws, end_sec: a.end_sec - ws, label: a.label, channel: a.channel }));
  }, [artifacts, showArtifacts, windowStartSec, windowSec]);

  const windowMarkers = useMemo<Marker[]>(() => {
    const ws = windowStartSec, we = windowStartSec + windowSec;
    return annotations
      .filter((m) => m.start_sec >= ws && m.start_sec <= we)
      .map((m, i) => ({
        id: `ann-${i}-${m.start_sec}`,
        timestamp_sec: m.start_sec - ws,
        marker_type: "event",
        label: m.label ?? "annotation",
      }));
  }, [annotations, windowStartSec, windowSec]);

  const windowSegmentOverlays = useMemo(() => {
    if (!showSegmentOverlays || !segments.length) return [];
    const ws = windowStartSec, we = windowStartSec + windowSec;
    return segments
      .filter((s) => s.t_end_s > ws && s.t_start_s < we)
      .map((s) => {
        const color = getSegmentColor(s.label);
        const isFocused = !!focusedSegment && s.t_start_s === focusedSegment.t_start_s && s.label === focusedSegment.label;
        return {
          start_sec: Math.max(0, s.t_start_s - ws),
          end_sec: Math.min(windowSec, s.t_end_s - ws),
          label: s.label,
          color: isFocused ? "rgba(59, 130, 246, 0.25)" : color.bg,
          borderColor: isFocused ? "rgba(59, 130, 246, 0.8)" : color.border,
          isFocused,
          channel: s.channel_index ?? undefined,
        };
      });
  }, [segments, showSegmentOverlays, windowStartSec, windowSec, focusedSegment]);

  const windowHighlight = useMemo(() => {
    if (!focusedSegment || showSegmentOverlays) return null;
    const ws = windowStartSec, we = windowStartSec + windowSec;
    if (focusedSegment.t_end_s <= ws || focusedSegment.t_start_s >= we) return null;
    return {
      start_sec: Math.max(0, focusedSegment.t_start_s - ws),
      end_sec: Math.min(windowSec, focusedSegment.t_end_s - ws),
      label: focusedSegment.label,
    };
  }, [focusedSegment, showSegmentOverlays, windowStartSec, windowSec]);

  // ── Render: error / loading ───────────────────────────────
  if (fatalError) {
    return (
      <div className="h-full w-full p-6 flex flex-col gap-2">
        <div className="text-sm font-semibold text-destructive">EEG Viewer — failed to load</div>
        <pre className="text-xs whitespace-pre-wrap break-words text-muted-foreground bg-muted/30 p-3 rounded-md">{fatalError}</pre>
      </div>
    );
  }

  if (loadingMeta || !meta || !signals) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="animate-spin h-6 w-6" />
        <span className="text-sm">{loadingMeta ? "Loading study…" : "Fetching signal…"}</span>
      </div>
    );
  }

  // ── Render: main ──────────────────────────────────────────
  return (
    <div className="h-full flex flex-col overflow-hidden" tabIndex={-1}>

      {/* ── Focused segment banner ── */}
      {focusedSegment && (
        <div className="px-3 py-1.5 bg-primary/10 border-b border-primary/20 flex items-center justify-between gap-4 flex-shrink-0">
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <Focus className="h-3.5 w-3.5 text-primary" />
            <span className="font-medium text-primary text-xs">Focused</span>
            <Badge variant="secondary" className="text-xs">{focusedSegment.label}</Badge>
            <span className="text-muted-foreground font-mono text-xs">
              {focusedSegment.t_start_s.toFixed(2)}s – {focusedSegment.t_end_s.toFixed(2)}s
            </span>
            {focusedSegment.channel_index != null && (
              <span className="text-muted-foreground text-xs">Ch {focusedSegment.channel_index}</span>
            )}
            {segments.length > 0 && (
              <span className="text-muted-foreground text-xs border-l pl-2 ml-1">
                {currentSegmentIndex + 1}/{segments.length}
                <kbd className="ml-2 px-1 py-0.5 bg-muted rounded text-[10px]">P</kbd>/
                <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">N</kbd>
              </span>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={dismissFocusedSegment} className="h-6 w-6 p-0">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* ── Status bar ── */}
      <div className="px-3 py-1.5 flex flex-wrap gap-2 items-center border-b flex-shrink-0">
        <Badge variant="outline" className="text-xs">{meta.n_channels} ch</Badge>
        <Badge variant="outline" className="text-xs">{meta.sampling_rate_hz} Hz</Badge>
        <Badge variant="outline" className="text-xs">{formatTime(durationSec)}</Badge>
        {loadingWindow && <Badge variant="secondary" className="text-xs">Loading…</Badge>}
        {lastFetchMs.current != null && !loadingWindow && (
          <Badge variant="secondary" className="text-xs">{lastFetchMs.current}ms</Badge>
        )}
        {artifacts.length > 0 && (
          <Badge variant="outline" className="text-xs text-red-600 border-red-300 dark:border-red-800">
            {artifacts.length} artifact{artifacts.length !== 1 ? "s" : ""}
          </Badge>
        )}
        {annotations.length > 0 && (
          <Badge variant="outline" className="text-xs text-blue-600 border-blue-300 dark:border-blue-800">
            {annotations.length} annotation{annotations.length !== 1 ? "s" : ""}
          </Badge>
        )}

        <div className="h-4 border-l mx-0.5" />

        <label className="flex items-center gap-1.5 text-xs cursor-pointer">
          <Switch checked={showArtifacts} onCheckedChange={setShowArtifacts} className="scale-75" />
          Artifacts
        </label>
        <label className="flex items-center gap-1.5 text-xs cursor-pointer">
          <Switch checked={suppressArtifacts} onCheckedChange={setSuppressArtifacts} className="scale-75" />
          Suppress
        </label>
        <label className="flex items-center gap-1.5 text-xs cursor-pointer">
          <Switch checked={showSegmentOverlays} onCheckedChange={setShowSegmentOverlays} className="scale-75" />
          Segments
        </label>

        <div className="flex-1" />

        {!sidebarOpen && segments.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => setSidebarOpen(true)} className="h-6 gap-1 text-xs">
            <PanelRightOpen className="h-3 w-3" />
            {segments.length} segments
          </Button>
        )}

        <div className="text-xs text-muted-foreground font-mono">
          <kbd className="px-1 py-0.5 bg-muted rounded">Space</kbd> play
          {" · "}
          <kbd className="px-1 py-0.5 bg-muted rounded">←/→</kbd> skip
          {" · "}
          <kbd className="px-1 py-0.5 bg-muted rounded">+/-</kbd> amp
        </div>
      </div>

      {/* ── Playback controls ── */}
      <EEGControls
        isPlaying={playing}
        onPlayPause={() => setPlaying((p) => !p)}
        currentTime={globalTime}
        duration={durationSec}
        onTimeChange={seekToAbsolute}
        timeWindow={windowSec}
        onTimeWindowChange={(w) => {
          setWindowSec(w);
          const tt = globalTime;
          const stride = w / 2;
          const ws = Math.floor(tt / stride) * stride;
          setWindowStartSec(clamp(ws, 0, Math.max(0, durationSec - w)));
          setCursorSec(clamp(tt - ws, 0, w));
        }}
        amplitudeScale={amplitude}
        onAmplitudeScaleChange={setAmplitude}
        playbackSpeed={playbackSpeed}
        onPlaybackSpeedChange={setPlaybackSpeed}
        onSkipBackward={() => seekToAbsolute(globalTime - windowSec)}
        onSkipForward={() => seekToAbsolute(globalTime + windowSec)}
        onExport={() => {}}
      />

      {/* ── Mini-map timeline ── */}
      <div
        className="relative h-8 border-t bg-muted/20 cursor-crosshair flex-shrink-0 select-none overflow-hidden"
        title="Click to seek"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          seekToAbsolute(((e.clientX - rect.left) / rect.width) * durationSec);
        }}
      >
        {/* Artifact spans */}
        {showArtifacts && artifacts.map((a, i) => (
          <div
            key={`a${i}`}
            className="absolute top-0 bottom-0 bg-red-500/30 pointer-events-none"
            style={{
              left: `${(a.start_sec / durationSec) * 100}%`,
              width: `${Math.max(0.15, ((a.end_sec - a.start_sec) / durationSec) * 100)}%`,
            }}
          />
        ))}
        {/* Segment spans */}
        {segments.map((s, i) => {
          const color = getSegmentColor(s.label);
          return (
            <div
              key={`s${i}`}
              className="absolute top-1.5 bottom-1.5 pointer-events-none opacity-70"
              style={{
                left: `${(s.t_start_s / durationSec) * 100}%`,
                width: `${Math.max(0.15, ((s.t_end_s - s.t_start_s) / durationSec) * 100)}%`,
                background: color.border,
              }}
            />
          );
        })}
        {/* Annotation ticks */}
        {annotations.map((a, i) => (
          <div
            key={`n${i}`}
            className="absolute top-0 bottom-0 w-px bg-blue-400/60 pointer-events-none"
            style={{ left: `${(a.start_sec / durationSec) * 100}%` }}
          />
        ))}
        {/* Current window highlight */}
        <div
          className="absolute top-0 bottom-0 border-x border-primary/60 bg-primary/10 pointer-events-none"
          style={{
            left: `${(windowStartSec / durationSec) * 100}%`,
            width: `${Math.max(0.5, (windowSec / durationSec) * 100)}%`,
          }}
        />
        {/* Duration label */}
        <span className="absolute right-1.5 top-0.5 text-[10px] text-muted-foreground font-mono pointer-events-none">
          {formatTime(durationSec)}
        </span>
        {/* Current time label */}
        <span
          className="absolute top-0.5 text-[10px] text-primary font-mono pointer-events-none"
          style={{ left: `${Math.max(0, Math.min(85, (globalTime / durationSec) * 100))}%` }}
        >
          {formatTime(globalTime)}
        </span>
      </div>

      {/* ── Main viewer + sidebar ── */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        <div className="flex-1 min-w-0">
          <WebGLEEGViewer
            signals={signals}
            channelLabels={channelLabels}
            sampleRate={meta.sampling_rate_hz}
            currentTime={cursorSec}
            timeWindow={windowSec}
            amplitudeScale={amplitude}
            visibleChannels={visibleChannels}
            theme={theme ?? "dark"}
            markers={windowMarkers}
            artifactIntervals={windowArtifacts}
            highlightInterval={windowHighlight}
            segmentOverlays={windowSegmentOverlays}
            showArtifactsAsRed={true}
            suppressArtifacts={suppressArtifacts}
            onTimeClick={(t) => setCursorSec(clamp(t, 0, windowSec))}
          />
        </div>

        {segments.length > 0 && (
          <SegmentSidebar
            segments={segments}
            currentSegmentIndex={currentSegmentIndex}
            isOpen={sidebarOpen}
            onToggle={() => setSidebarOpen((o) => !o)}
            onSegmentClick={(seg) => navigateToSegment(seg)}
          />
        )}
      </div>
    </div>
  );
}
