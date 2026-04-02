// src/pages/app/EEGViewer.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, X, ChevronLeft, ChevronRight } from "lucide-react";
import { WebGLEEGViewer } from "@/components/eeg/WebGLEEGViewer";
import { EEGControls } from "@/components/eeg/EEGControls";
import { SegmentSidebar, getSegmentColor } from "@/components/eeg/SegmentSidebar";
import { useTheme } from "next-themes";
import { fetchJson, fetchBinary, getReadApiProxyBase } from "@/shared/readApiClient";
import { resolveReadApiBase, getReadApiKey } from "@/shared/readApiConfig";

// ── Constants ─────────────────────────────────────────────────────────────────
const FALLBACK_STUDY_ID = "TUH_CANON_001";

const DIRECT_BASE = resolveReadApiBase();
const DIRECT_KEY = getReadApiKey();
const PROXY_BASE = getReadApiProxyBase() || "";
const IS_LOCAL_BASE = DIRECT_BASE.includes("127.0.0.1") || DIRECT_BASE.includes("localhost");
const API_AVAILABLE = !!(DIRECT_KEY || IS_LOCAL_BASE || PROXY_BASE);

// ── Types ──────────────────────────────────────────────────────────────────────
type Meta = {
  n_channels: number;
  sampling_rate_hz: number;
  n_samples: number;
  channel_map: { index: number; canonical_id: string; unit: string }[];
  channel_names?: string[];
  channels?: { name: string }[];
};
type Artifact   = { start_sec: number; end_sec: number; label?: string; channel?: number };
type Annotation = { start_sec: number; end_sec?: number; label?: string; channel?: number };
type Marker     = { id: string; timestamp_sec: number; marker_type: string; label?: string };
type Segment    = { t_start_s: number; t_end_s: number; label: string; channel_index?: number | null; score?: number | null };
type FocusedSeg = { label: string; t_start_s: number; t_end_s: number; channel_index?: number; score?: number };

// ── Helpers ────────────────────────────────────────────────────────────────────
function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)); }
function keyFor(s: number, l: number) { return `${s}:${l}`; }
function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
}

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
function scoreContinuity(ch: number[][], n = 2048) {
  if (!ch.length) return Infinity;
  const ns = Math.min(ch[0]?.length ?? 0, n);
  if (ns < 8) return Infinity;
  const idxs = [0, Math.floor(ch.length / 2), ch.length - 1].filter((x, i, a) => x >= 0 && a.indexOf(x) === i);
  let acc = 0;
  for (const ci of idxs) { let s = 0; for (let i = 1; i < ns; i++) s += Math.abs(ch[ci][i] - ch[ci][i - 1]); acc += s / (ns - 1); }
  return acc / idxs.length;
}
function reshapeAuto(f32: Float32Array, nCh: number, nSamp: number) {
  const a = reshapeChannelMajor(f32, nCh, nSamp);
  const b = reshapeSampleMajor(f32, nCh, nSamp);
  return scoreContinuity(a) <= scoreContinuity(b) ? a : b;
}
function hdrNum(h: Record<string, string>, keys: string[]) {
  for (const k of keys) { const v = Number(h[k.toLowerCase()]); if (isFinite(v)) return v; }
  return NaN;
}
async function fetchChunk(studyId: string, start: number, len: number) {
  return fetchBinary(
    `/studies/${encodeURIComponent(studyId)}/chunk.bin?root=.&start=${start}&length=${len}`,
    { timeoutMs: 30000, requireKey: true },
  );
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function EEGViewer() {
  const { theme } = useTheme();
  const [searchParams, setSearchParams] = useSearchParams();
  const { id: routeId } = useParams<{ id?: string }>();

  // Study ID: route param → ?studyId= → fallback TUH demo
  const studyId = routeId || searchParams.get("studyId") || FALLBACK_STUDY_ID;

  // Focused segment from URL
  const focusedSeg = useMemo<FocusedSeg | null>(() => {
    if (searchParams.get("focus") !== "segment") return null;
    const t = parseFloat(searchParams.get("t") ?? "");
    const label = searchParams.get("label");
    if (!isFinite(t) || !label) return null;
    const t_end = parseFloat(searchParams.get("t_end") ?? "");
    return {
      label, t_start_s: t, t_end_s: isFinite(t_end) ? t_end : t,
      channel_index: searchParams.get("ch") ? parseInt(searchParams.get("ch")!) : undefined,
      score: searchParams.get("score") ? parseFloat(searchParams.get("score")!) : undefined,
    };
  }, [searchParams]);

  // ── Core state ───────────────────────────────────────────────────────────────
  const [meta, setMeta]           = useState<Meta | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [windowSec, setWindowSec] = useState(10);
  const [windowStart, setWindowStart] = useState(0);
  const [cursor, setCursor]       = useState(0);
  const [playing, setPlaying]     = useState(false);
  const [speed, setSpeed]         = useState(1);
  const [amplitude, setAmplitude] = useState(1.0);
  const [showArtifacts, setShowArtifacts]   = useState(true);
  const [suppressArts, setSuppressArts]     = useState(false);
  const [showSegments, setShowSegments]     = useState(true);
  const [sidebarOpen, setSidebarOpen]       = useState(true);

  // ── Data ─────────────────────────────────────────────────────────────────────
  const [signals, setSignals]         = useState<number[][] | null>(null);
  const [artifacts, setArtifacts]     = useState<Artifact[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [segments, setSegments]       = useState<Segment[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingWin, setLoadingWin]   = useState(true);

  const cache       = useRef<Map<string, number[][]>>(new Map());
  const reqId       = useRef(0);
  const didSeek     = useRef(false);

  // ── Derived ──────────────────────────────────────────────────────────────────
  const globalTime = windowStart + cursor;
  const duration   = useMemo(() => (meta ? meta.n_samples / meta.sampling_rate_hz : 0), [meta]);

  const segIdx = useMemo(() => {
    if (!focusedSeg || !segments.length) return -1;
    return segments.findIndex(s => s.t_start_s === focusedSeg.t_start_s && s.label === focusedSeg.label);
  }, [focusedSeg, segments]);

  const channelLabels = useMemo(() => {
    if (!meta) return [];
    if (meta.channel_map?.length) return [...meta.channel_map].sort((a, b) => a.index - b.index).map(c => c.canonical_id);
    if (meta.channel_names?.length) return meta.channel_names;
    if (meta.channels?.length) return meta.channels.map(c => c.name);
    return [];
  }, [meta]);

  const visibleChannels = useMemo(() => {
    const s = new Set<number>();
    if (meta) for (let i = 0; i < meta.n_channels; i++) s.add(i);
    return s;
  }, [meta]);

  // ── Seek ─────────────────────────────────────────────────────────────────────
  const seekTo = useCallback((t: number) => {
    if (!meta) return;
    const dur = meta.n_samples / meta.sampling_rate_hz;
    const tt  = clamp(t, 0, Math.max(0, dur - 1e-6));
    const stride = windowSec / 2;
    const ws = Math.floor(tt / stride) * stride;
    setPlaying(false);
    setWindowStart(clamp(ws, 0, Math.max(0, dur - windowSec)));
    setCursor(clamp(tt - ws, 0, windowSec));
  }, [meta, windowSec]);

  const gotoSegment = useCallback((seg: Segment) => {
    seekTo(seg.t_start_s);
    const p = new URLSearchParams(searchParams);
    p.set("t", String(seg.t_start_s));
    p.set("t_end", String(seg.t_end_s));
    p.set("focus", "segment");
    p.set("label", seg.label);
    if (seg.channel_index != null) p.set("ch", String(seg.channel_index)); else p.delete("ch");
    if (seg.score != null) p.set("score", String(seg.score)); else p.delete("score");
    setSearchParams(p, { replace: true });
  }, [seekTo, searchParams, setSearchParams]);

  const clearFocus = useCallback(() => {
    const p = new URLSearchParams(searchParams);
    ["focus", "t", "t_end", "label", "ch", "score"].forEach(k => p.delete(k));
    setSearchParams(p, { replace: true });
  }, [searchParams, setSearchParams]);

  // ── Effects: guard ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!API_AVAILABLE) {
      setFatalError("Read API unavailable — no API key configured.");
      setLoadingMeta(false);
      setLoadingWin(false);
    }
  }, []);

  // ── Effects: meta (reset on study change) ─────────────────────────────────────
  useEffect(() => {
    if (!API_AVAILABLE) return;
    let alive = true;
    setMeta(null); setSignals(null); setArtifacts([]); setAnnotations([]); setSegments([]);
    setWindowStart(0); setCursor(0); setFatalError(null);
    cache.current.clear(); didSeek.current = false;
    setLoadingMeta(true);

    fetchJson<any>(`/studies/${studyId}/meta?root=.`, { timeoutMs: 20000, requireKey: true })
      .then(r => { if (!alive) return; if (!r.ok) throw new Error(r.error); setMeta((r.data?.meta ?? r.data) as Meta); })
      .catch(e => { if (alive) setFatalError(String(e?.message || e)); })
      .finally(() => { if (alive) setLoadingMeta(false); });

    return () => { alive = false; };
  }, [studyId]);

  // ── Effects: overlays ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!API_AVAILABLE) return;
    fetchJson<any>(`/studies/${studyId}/artifacts?root=.`,         { timeoutMs: 20000, requireKey: true }).then(r => setArtifacts(r.ok ? (r.data?.artifacts ?? []) : [])).catch(() => setArtifacts([]));
    fetchJson<any>(`/studies/${studyId}/annotations?root=.`,       { timeoutMs: 20000, requireKey: true }).then(r => setAnnotations(r.ok ? (r.data?.annotations ?? []) : [])).catch(() => setAnnotations([]));
    fetchJson<any>(`/studies/${studyId}/segments?root=/app/data`,  { timeoutMs: 20000, requireKey: true }).then(r => setSegments(r.ok ? (r.data?.segments ?? []) : [])).catch(() => setSegments([]));
  }, [studyId]);

  // ── Effects: auto-seek from ?t= ───────────────────────────────────────────────
  useEffect(() => {
    if (!meta || didSeek.current) return;
    const t = parseFloat(searchParams.get("t") ?? "");
    if (!isFinite(t)) return;
    seekTo(t);
    didSeek.current = true;
  }, [meta, searchParams, seekTo]);

  // ── Effects: window fetch ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!API_AVAILABLE || !meta) return;
    const fs  = meta.sampling_rate_hz;
    const dur = meta.n_samples / fs;
    const max = Math.max(0, dur - windowSec);
    const ws  = clamp(windowStart, 0, max);
    if (ws !== windowStart) { setWindowStart(ws); return; }
    const c   = clamp(cursor, 0, windowSec);
    if (c !== cursor) { setCursor(c); return; }

    const startSamp = Math.floor(ws * fs);
    const len       = Math.max(1, Math.floor(windowSec * fs));
    const k         = keyFor(startSamp, len);

    const hit = cache.current.get(k);
    if (hit) { setSignals(hit); setLoadingWin(false); return; }

    setLoadingWin(true);
    const id = ++reqId.current;

    fetchChunk(studyId, startSamp, len)
      .then(r => {
        if (!r.ok) throw new Error(r.error);
        const nCh   = isFinite(hdrNum(r.headers, ["x-eeg-nchannels", "x-eeg-channel-count"])) ? hdrNum(r.headers, ["x-eeg-nchannels", "x-eeg-channel-count"]) : meta.n_channels;
        const nSamp = isFinite(hdrNum(r.headers, ["x-eeg-length", "x-eeg-samples-per-channel"])) ? hdrNum(r.headers, ["x-eeg-length", "x-eeg-samples-per-channel"]) : len;
        const f32   = new Float32Array(r.data);
        if (f32.length !== nCh * nSamp) throw new Error(`Payload mismatch: got ${f32.length}, expected ${nCh * nSamp}`);
        return reshapeAuto(f32, nCh, nSamp);
      })
      .then(sig => {
        if (id !== reqId.current) return;
        cache.current.set(k, sig);
        setSignals(sig);
      })
      .catch(e => { if (id === reqId.current && !signals) setFatalError(String(e)); })
      .finally(() => { if (id === reqId.current) setLoadingWin(false); });

    // Prefetch next window during playback
    if (playing) {
      const nextWs = clamp(ws + windowSec / 2, 0, max);
      const nk = keyFor(Math.floor(nextWs * fs), len);
      if (!cache.current.has(nk)) {
        fetchChunk(studyId, Math.floor(nextWs * fs), len)
          .then(r => {
            if (!r.ok) return;
            const f32 = new Float32Array(r.data);
            if (f32.length === meta.n_channels * len) cache.current.set(nk, reshapeAuto(f32, meta.n_channels, len));
          })
          .catch(() => {});
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, studyId, windowStart, windowSec, playing]);

  // ── Effects: playback ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!playing || !meta) return;
    const dur    = meta.n_samples / meta.sampling_rate_hz;
    const max    = Math.max(0, dur - windowSec);
    const stride = windowSec / 2;
    let raf = 0, last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setCursor(c => {
        const nc = c + dt * speed;
        if (nc < windowSec * 0.75) return nc;
        setWindowStart(ws => clamp(ws + stride, 0, max));
        return nc - stride;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, meta, windowSec, speed]);

  // ── Effects: keyboard ─────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.metaKey || e.ctrlKey) return;
      switch (e.key) {
        case " ":          e.preventDefault(); setPlaying(p => !p); break;
        case "ArrowLeft":  e.preventDefault(); seekTo(globalTime - windowSec); break;
        case "ArrowRight": e.preventDefault(); seekTo(globalTime + windowSec); break;
        case "=": case "+": e.preventDefault(); setAmplitude(a => +Math.min(10, a + 0.25).toFixed(2)); break;
        case "-":           e.preventDefault(); setAmplitude(a => +Math.max(0.1, a - 0.25).toFixed(2)); break;
        case "n": case "N":
          e.preventDefault();
          if (segments.length) gotoSegment(segments[(segIdx + 1) % segments.length]);
          break;
        case "p": case "P":
          e.preventDefault();
          if (segments.length) gotoSegment(segments[segIdx > 0 ? segIdx - 1 : segments.length - 1]);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [globalTime, windowSec, segments, segIdx, seekTo, gotoSegment]);

  // ── Window-local overlays ─────────────────────────────────────────────────────
  const winArtifacts = useMemo(() => {
    if (!showArtifacts) return [];
    return artifacts
      .filter(a => a.end_sec > windowStart && a.start_sec < windowStart + windowSec)
      .map(a => ({ start_sec: a.start_sec - windowStart, end_sec: a.end_sec - windowStart, label: a.label, channel: a.channel }));
  }, [artifacts, showArtifacts, windowStart, windowSec]);

  const winMarkers = useMemo<Marker[]>(() => {
    return annotations
      .filter(a => a.start_sec >= windowStart && a.start_sec <= windowStart + windowSec)
      .map((a, i) => ({ id: `ann-${i}`, timestamp_sec: a.start_sec - windowStart, marker_type: "event", label: a.label ?? "annotation" }));
  }, [annotations, windowStart, windowSec]);

  const winSegments = useMemo(() => {
    if (!showSegments || !segments.length) return [];
    const we = windowStart + windowSec;
    return segments
      .filter(s => s.t_end_s > windowStart && s.t_start_s < we)
      .map(s => {
        const color = getSegmentColor(s.label);
        const focused = !!focusedSeg && s.t_start_s === focusedSeg.t_start_s && s.label === focusedSeg.label;
        return {
          start_sec: Math.max(0, s.t_start_s - windowStart),
          end_sec:   Math.min(windowSec, s.t_end_s - windowStart),
          label: s.label,
          color:       focused ? "rgba(59,130,246,0.25)" : color.bg,
          borderColor: focused ? "rgba(59,130,246,0.8)"  : color.border,
          isFocused: focused,
          channel: s.channel_index ?? undefined,
        };
      });
  }, [segments, showSegments, windowStart, windowSec, focusedSeg]);

  const winHighlight = useMemo(() => {
    if (!focusedSeg || showSegments) return null;
    const we = windowStart + windowSec;
    if (focusedSeg.t_end_s <= windowStart || focusedSeg.t_start_s >= we) return null;
    return { start_sec: Math.max(0, focusedSeg.t_start_s - windowStart), end_sec: Math.min(windowSec, focusedSeg.t_end_s - windowStart), label: focusedSeg.label };
  }, [focusedSeg, showSegments, windowStart, windowSec]);

  // ── Overlay legend counts ─────────────────────────────────────────────────────
  const artifactCount  = artifacts.length;
  const annotationCount = annotations.length;

  // ── Render: error ─────────────────────────────────────────────────────────────
  if (fatalError) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 p-8">
        <div className="text-sm font-medium text-destructive">Viewer unavailable</div>
        <pre className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-3 max-w-lg whitespace-pre-wrap break-words">{fatalError}</pre>
      </div>
    );
  }

  // ── Render: loading ───────────────────────────────────────────────────────────
  if (loadingMeta || !meta || !signals) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-xs">{loadingMeta ? "Loading study…" : "Fetching signal…"}</span>
      </div>
    );
  }

  // ── Render: main ──────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col overflow-hidden bg-background" tabIndex={-1}>

      {/* ── Focused segment banner ── */}
      {focusedSeg && (
        <div className="flex items-center justify-between gap-3 px-3 py-1.5 bg-primary/8 border-b border-primary/15 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <Badge variant="secondary" className="text-xs capitalize shrink-0">{focusedSeg.label}</Badge>
            <span className="text-xs font-mono text-muted-foreground">
              {fmtTime(focusedSeg.t_start_s)} – {fmtTime(focusedSeg.t_end_s)}
            </span>
            {focusedSeg.score != null && (
              <span className="text-xs text-muted-foreground">
                conf: {(focusedSeg.score * 100).toFixed(0)}%
              </span>
            )}
            {segments.length > 1 && (
              <div className="flex items-center gap-1 border-l pl-2 ml-1">
                <Button variant="ghost" size="icon" className="h-5 w-5"
                  onClick={() => gotoSegment(segments[segIdx > 0 ? segIdx - 1 : segments.length - 1])}>
                  <ChevronLeft className="h-3 w-3" />
                </Button>
                <span className="text-xs text-muted-foreground tabular-nums">{segIdx + 1}/{segments.length}</span>
                <Button variant="ghost" size="icon" className="h-5 w-5"
                  onClick={() => gotoSegment(segments[(segIdx + 1) % segments.length])}>
                  <ChevronRight className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={clearFocus}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* ── Info + overlay toggles ── */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b flex-shrink-0 flex-wrap">
        {/* Signal metadata */}
        <span className="text-xs text-muted-foreground tabular-nums font-mono">
          {meta.n_channels}ch · {meta.sampling_rate_hz}Hz · {fmtTime(duration)}
        </span>

        {loadingWin && (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        )}

        <div className="h-3 border-l mx-1" />

        {/* Overlay toggles — pill buttons */}
        <div className="flex items-center gap-1">
          {artifactCount > 0 && (
            <button
              onClick={() => setShowArtifacts(v => !v)}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-colors ${
                showArtifacts
                  ? "bg-red-500/15 text-red-500 border border-red-500/30"
                  : "bg-muted text-muted-foreground border border-transparent"
              }`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current inline-block" />
              {artifactCount} artifact{artifactCount !== 1 ? "s" : ""}
            </button>
          )}

          {annotationCount > 0 && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-blue-500/10 text-blue-500 border border-blue-500/20">
              <span className="h-1.5 w-1.5 rounded-full bg-current inline-block" />
              {annotationCount} annotation{annotationCount !== 1 ? "s" : ""}
            </div>
          )}

          {segments.length > 0 && (
            <button
              onClick={() => setShowSegments(v => !v)}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-colors ${
                showSegments
                  ? "bg-primary/10 text-primary border border-primary/25"
                  : "bg-muted text-muted-foreground border border-transparent"
              }`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current inline-block" />
              {segments.length} finding{segments.length !== 1 ? "s" : ""}
            </button>
          )}

          {artifactCount > 0 && showArtifacts && (
            <button
              onClick={() => setSuppressArts(v => !v)}
              className={`px-2 py-0.5 rounded-full text-xs transition-colors ${
                suppressArts
                  ? "bg-muted-foreground/20 text-foreground border border-border"
                  : "bg-muted text-muted-foreground border border-transparent"
              }`}
            >
              suppress
            </button>
          )}
        </div>

        <div className="flex-1" />

        {/* Keyboard hint */}
        <span className="text-[10px] text-muted-foreground/50 hidden sm:block">
          <kbd className="px-1 bg-muted rounded">Space</kbd> ·{" "}
          <kbd className="px-1 bg-muted rounded">←/→</kbd> ·{" "}
          <kbd className="px-1 bg-muted rounded">+/−</kbd> ·{" "}
          <kbd className="px-1 bg-muted rounded">N/P</kbd>
        </span>
      </div>

      {/* ── Playback controls ── */}
      <EEGControls
        isPlaying={playing}
        onPlayPause={() => setPlaying(p => !p)}
        currentTime={globalTime}
        duration={duration}
        onTimeChange={seekTo}
        timeWindow={windowSec}
        onTimeWindowChange={w => {
          setWindowSec(w);
          const stride = w / 2;
          const ws = Math.floor(globalTime / stride) * stride;
          setWindowStart(clamp(ws, 0, Math.max(0, duration - w)));
          setCursor(clamp(globalTime - ws, 0, w));
        }}
        amplitudeScale={amplitude}
        onAmplitudeScaleChange={setAmplitude}
        playbackSpeed={speed}
        onPlaybackSpeedChange={setSpeed}
        onSkipBackward={() => seekTo(globalTime - windowSec)}
        onSkipForward={() => seekTo(globalTime + windowSec)}
        onExport={() => {}}
      />

      {/* ── Mini-map timeline ── */}
      <div
        className="relative h-7 border-t bg-muted/10 cursor-crosshair flex-shrink-0 select-none overflow-hidden"
        onClick={e => {
          const r = e.currentTarget.getBoundingClientRect();
          seekTo(((e.clientX - r.left) / r.width) * duration);
        }}
      >
        {/* Artifact spans */}
        {showArtifacts && artifacts.map((a, i) => (
          <div key={`a${i}`} className="absolute top-0 bottom-0 bg-red-500/25 pointer-events-none"
            style={{ left: `${(a.start_sec / duration) * 100}%`, width: `${Math.max(0.2, ((a.end_sec - a.start_sec) / duration) * 100)}%` }} />
        ))}

        {/* Segment spans */}
        {segments.map((s, i) => {
          const c = getSegmentColor(s.label);
          return (
            <div key={`s${i}`} className="absolute top-1 bottom-1 pointer-events-none opacity-75 rounded-sm"
              style={{ left: `${(s.t_start_s / duration) * 100}%`, width: `${Math.max(0.2, ((s.t_end_s - s.t_start_s) / duration) * 100)}%`, background: c.border }} />
          );
        })}

        {/* Annotation ticks */}
        {annotations.map((a, i) => (
          <div key={`n${i}`} className="absolute top-0 bottom-0 w-px bg-blue-400/50 pointer-events-none"
            style={{ left: `${(a.start_sec / duration) * 100}%` }} />
        ))}

        {/* Current window */}
        <div className="absolute top-0 bottom-0 border-x border-primary/50 bg-primary/8 pointer-events-none"
          style={{ left: `${(windowStart / duration) * 100}%`, width: `${Math.max(0.5, (windowSec / duration) * 100)}%` }} />

        {/* Time label */}
        <span className="absolute right-1.5 top-0.5 text-[9px] text-muted-foreground/50 font-mono pointer-events-none">
          {fmtTime(duration)}
        </span>
      </div>

      {/* ── Canvas + sidebar ── */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        <div className="flex-1 min-w-0">
          <WebGLEEGViewer
            signals={signals}
            channelLabels={channelLabels}
            sampleRate={meta.sampling_rate_hz}
            currentTime={cursor}
            timeWindow={windowSec}
            amplitudeScale={amplitude}
            visibleChannels={visibleChannels}
            theme={theme ?? "dark"}
            markers={winMarkers}
            artifactIntervals={winArtifacts}
            highlightInterval={winHighlight}
            segmentOverlays={winSegments}
            showArtifactsAsRed={true}
            suppressArtifacts={suppressArts}
            onTimeClick={t => setCursor(clamp(t, 0, windowSec))}
          />
        </div>

        {segments.length > 0 && (
          <SegmentSidebar
            segments={segments}
            currentSegmentIndex={segIdx}
            isOpen={sidebarOpen}
            onToggle={() => setSidebarOpen(o => !o)}
            onSegmentClick={gotoSegment}
          />
        )}
      </div>
    </div>
  );
}
