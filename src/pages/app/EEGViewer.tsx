// src/pages/app/EEGViewer.tsx
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, X, Focus, PanelRightOpen } from "lucide-react";
import { WebGLEEGViewer } from "@/components/eeg/WebGLEEGViewer";
import { EEGControls } from "@/components/eeg/EEGControls";
import { SegmentSidebar, getSegmentColor } from "@/components/eeg/SegmentSidebar";
import { MontageSelector } from "@/components/eeg/MontageSelector";
import { ChannelGroupList } from "@/components/eeg/ChannelGroupList";
import { applyMontage } from "@/lib/eeg/montage-transforms";
import { getChannelGroup, ChannelGroup } from "@/lib/eeg/channel-groups";
import { filterStandardChannels } from "@/lib/eeg/standard-channels";
import { groupChannels } from "@/lib/eeg/channel-groups";
import { useTheme } from "next-themes";
import { fetchJson, fetchBinary, getReadApiProxyBase } from "@/shared/readApiClient";
import { resolveReadApiBase, getReadApiKey } from "@/shared/readApiConfig";
import { Button } from "@/components/ui/button";

/* =======================
   MVP LOCK - Demo study ID
======================= */
const DEMO_STUDY_ID = "TUH_CANON_001";

const DIRECT_BASE = resolveReadApiBase();
const DIRECT_KEY = getReadApiKey();
const PROXY_BASE = getReadApiProxyBase() || "";

const IS_LOCAL_BASE = DIRECT_BASE.includes("127.0.0.1") || DIRECT_BASE.includes("localhost");
const USING_PROXY = !DIRECT_KEY && !IS_LOCAL_BASE && !!PROXY_BASE;
const API_AVAILABLE = !!(DIRECT_KEY || IS_LOCAL_BASE || PROXY_BASE);

const MAX_CACHE_ENTRIES = 20;

/* =======================
   TYPES
======================= */
type Meta = {
  n_channels: number;
  sampling_rate_hz: number;
  n_samples: number;
  channel_map: { index: number; canonical_id: string; unit: string }[];
  channel_names?: string[];
  channels?: { name: string }[];
};

type Artifact = {
  start_sec: number;
  end_sec: number;
  label?: string;
  channel?: number;
};

type Annotation = {
  start_sec: number;
  end_sec?: number;
  label?: string;
  channel?: number;
};

type Marker = {
  id: string;
  timestamp_sec: number;
  marker_type: string;
  label?: string;
};

type FocusedSegment = {
  label: string;
  t_start_s: number;
  t_end_s: number;
  channel_index?: number;
  score?: number;
};

type Segment = {
  t_start_s: number;
  t_end_s: number;
  label: string;
  channel_index?: number | null;
  score?: number | null;
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function keyFor(startSample: number, length: number) {
  return `${startSample}:${length}`;
}

/**
 * Binary layout ambiguity guard
 */
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
  for (let i = 0; i < nSamp; i++) {
    for (let ch = 0; ch < nCh; ch++) {
      out[ch][i] = f32[p++];
    }
  }
  return out;
}

function scoreContinuity(channels: number[][], probeSamples = 2048) {
  const nCh = channels.length;
  if (nCh === 0) return Number.POSITIVE_INFINITY;
  const nSamp = channels[0]?.length ?? 0;
  const n = Math.min(nSamp, probeSamples);
  if (n < 8) return Number.POSITIVE_INFINITY;

  let acc = 0;
  let count = 0;
  const idxs = [0, Math.floor(nCh / 2), nCh - 1].filter((x, i, a) => x >= 0 && x < nCh && a.indexOf(x) === i);

  for (const ch of idxs) {
    const x = channels[ch];
    let s = 0;
    for (let i = 1; i < n; i++) {
      const d = x[i] - x[i - 1];
      s += Math.abs(d);
    }
    acc += s / (n - 1);
    count++;
  }
  return acc / Math.max(1, count);
}

function reshapeAuto(f32: Float32Array, nCh: number, nSamp: number) {
  const a = reshapeChannelMajor(f32, nCh, nSamp);
  const b = reshapeSampleMajor(f32, nCh, nSamp);

  const sa = scoreContinuity(a);
  const sb = scoreContinuity(b);

  return sa <= sb
    ? { signals: a, layout: "channel-major" as const, score: sa }
    : { signals: b, layout: "sample-major" as const, score: sb };
}

function hdrNum(headers: Record<string, string>, names: string[]): number {
  for (const n of names) {
    const v = headers[n.toLowerCase()];
    if (v != null) {
      const x = Number(v);
      if (Number.isFinite(x)) return x;
    }
  }
  return Number.NaN;
}

async function fetchChunkBin(studyId: string, startSample: number, length: number): Promise<{
  ok: true;
  data: ArrayBuffer;
  headers: Record<string, string>;
  ms: number;
} | {
  ok: false;
  error: string;
  ms: number;
}> {
  const result = await fetchBinary(
    `/studies/${encodeURIComponent(studyId)}/chunk.bin?root=.&start=${startSample}&length=${length}`,
    { timeoutMs: 30000, requireKey: true }
  );
  return result;
}

export default function EEGViewer() {
  const { theme } = useTheme();
  
  const [searchParams, setSearchParams] = useSearchParams();

  // Parse query params for focused segment
  const rawFocusParams = useMemo(() => {
    const t = searchParams.get("t");
    const label = searchParams.get("label");
    const focus = searchParams.get("focus");
    if (!t) return null;
    if (focus !== "segment" && !label) return null;
    const tStart = parseFloat(t);
    if (!Number.isFinite(tStart)) return null;
    const tEnd = searchParams.get("t_end");
    const tEndVal = tEnd ? parseFloat(tEnd) : tStart + 10;
    return {
      label: label || "marker",
      t_start_s: tStart,
      t_end_s: Number.isFinite(tEndVal) ? tEndVal : tStart + 10,
      ch: searchParams.get("ch"),
      score: searchParams.get("score"),
    };
  }, [searchParams]);

  const [meta, setMeta] = useState<Meta | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);

  // Window scheduler
  const [windowSec, setWindowSec] = useState(10);
  const [windowStartSec, setWindowStartSec] = useState(0);
  const [cursorSec, setCursorSec] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  // Viewer controls
  const [amplitude, setAmplitude] = useState(1.0);
  const [showArtifacts, setShowArtifacts] = useState(true);
  const [suppressArtifacts, setSuppressArtifacts] = useState(false);
  const [showSegmentOverlays, setShowSegmentOverlays] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Montage
  const [montage, setMontage] = useState("referential");

  // Channel group visibility
  const [visibleGroups, setVisibleGroups] = useState<Set<ChannelGroup>>(
    new Set(["frontal", "central", "temporal", "occipital"])
  );

  // Canonical overlays
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);

  // Data buffer
  const [signals, setSignals] = useState<number[][] | null>(null);

  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingWindow, setLoadingWindow] = useState(true);
  
  const didInitialSeek = useRef(false);
  
  const currentSegmentIndex = useMemo(() => {
    if (!focusedSegment || segments.length === 0) return -1;
    return segments.findIndex(
      s => s.t_start_s === focusedSegment.t_start_s && s.label === focusedSegment.label
    );
  }, [focusedSegment, segments]);

  // Cache with eviction
  const cacheRef = useRef<Map<string, number[][]>>(new Map());
  const cacheOrderRef = useRef<string[]>([]);
  const lastReqId = useRef(0);
  const lastFetchMs = useRef<number | null>(null);
  const lastFetchMode = useRef<"cache" | "net" | null>(null);
  const lastLayoutRef = useRef<string | null>(null);

  const addToCache = useCallback((key: string, data: number[][]) => {
    const cache = cacheRef.current;
    const order = cacheOrderRef.current;
    
    if (cache.has(key)) return;
    
    // Evict oldest entries if over limit
    while (order.length >= MAX_CACHE_ENTRIES) {
      const oldest = order.shift();
      if (oldest) cache.delete(oldest);
    }
    
    cache.set(key, data);
    order.push(key);
  }, []);

  // Hard sanity
  useEffect(() => {
    if (!API_AVAILABLE) {
      setFatalError("Read API is unavailable (no API key and no proxy configured).");
      setLoadingMeta(false);
      setLoadingWindow(false);
    }
  }, []);

  /* ---------- META ---------- */
  useEffect(() => {
    if (!API_AVAILABLE) return;
    let alive = true;

    setLoadingMeta(true);
    setFatalError(null);

    fetchJson<any>(`/studies/${DEMO_STUDY_ID}/meta?root=.`, { timeoutMs: 20000, requireKey: true })
      .then((result) => {
        if (!alive) return;
        if (result.ok === false) throw new Error(result.error);
        const j = result.data;
        setMeta((j?.meta ?? j) as Meta);
      })
      .catch((e) => {
        if (!alive) return;
        setFatalError(String(e?.message || e));
      })
      .finally(() => {
        if (alive) setLoadingMeta(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  /* ---------- AUTO-SEEK FROM QUERY PARAM ---------- */
  useEffect(() => {
    if (!meta || didInitialSeek.current) return;
    
    const tParam = searchParams.get("t");
    if (!tParam) return;
    
    const targetSec = parseFloat(tParam);
    if (!Number.isFinite(targetSec)) return;
    
    const fs = meta.sampling_rate_hz;
    const durationSec = meta.n_samples / fs;
    const tt = clamp(targetSec, 0, Math.max(0, durationSec - 1e-6));
    const stride = windowSec / 2;
    const ws = Math.floor(tt / stride) * stride;
    
    setWindowStartSec(clamp(ws, 0, Math.max(0, durationSec - windowSec)));
    setCursorSec(clamp(tt - ws, 0, windowSec));
    didInitialSeek.current = true;
  }, [meta, searchParams, windowSec]);

  /* ---------- ARTIFACTS + ANNOTATIONS + SEGMENTS ---------- */
  useEffect(() => {
    if (!API_AVAILABLE) return;

    fetchJson<any>(`/studies/${DEMO_STUDY_ID}/artifacts?root=.`, { timeoutMs: 20000, requireKey: true })
      .then((result) => setArtifacts(result.ok ? (result.data?.artifacts ?? []) : []))
      .catch(() => setArtifacts([]));

    fetchJson<any>(`/studies/${DEMO_STUDY_ID}/annotations?root=.`, { timeoutMs: 20000, requireKey: true })
      .then((result) => setAnnotations(result.ok ? (result.data?.annotations ?? []) : []))
      .catch(() => setAnnotations([]));

    fetchJson<any>(`/studies/${DEMO_STUDY_ID}/segments?root=/app/data`, { timeoutMs: 20000, requireKey: true })
      .then((result) => setSegments(result.ok ? (result.data?.segments ?? []) : []))
      .catch(() => setSegments([]));
  }, []);

  /* ---------- DERIVED (channel order is canonical) ---------- */
  const channelLabels = useMemo(() => {
    if (!meta) return [];
    if (Array.isArray(meta.channel_map) && meta.channel_map.length > 0) {
      return [...meta.channel_map].sort((a, b) => a.index - b.index).map((c) => c.canonical_id);
    }
    if (Array.isArray(meta.channel_names)) return meta.channel_names;
    if (Array.isArray(meta.channels)) return meta.channels.map((c) => c.name);
    return [];
  }, [meta]);

  // Channel group visibility → visible channel indices
  const visibleChannels = useMemo(() => {
    if (!meta) return new Set<number>();
    const s = new Set<number>();
    
    // When montage is not referential, show all derived channels
    if (montage !== "referential") {
      // After montage transform, all channels are visible
      // The montage transform produces new channel list, so show all
      for (let i = 0; i < meta.n_channels; i++) s.add(i);
      return s;
    }
    
    // For referential montage, filter by group visibility
    for (let i = 0; i < channelLabels.length; i++) {
      const group = getChannelGroup(channelLabels[i]);
      if (visibleGroups.has(group) || group === "other") {
        s.add(i);
      }
    }
    return s;
  }, [meta, channelLabels, visibleGroups, montage]);

  /* ---------- WINDOW FETCH ---------- */
  useEffect(() => {
    if (!API_AVAILABLE || !meta) return;

    const fs = meta.sampling_rate_hz;
    const durationSec = meta.n_samples / fs;

    const maxStart = Math.max(0, durationSec - windowSec);
    const ws = clamp(windowStartSec, 0, maxStart);
    if (ws !== windowStartSec) {
      setWindowStartSec(ws);
      return;
    }

    const c = clamp(cursorSec, 0, windowSec);
    if (c !== cursorSec) {
      setCursorSec(c);
      return;
    }

    const startSample = Math.floor(ws * fs);
    const length = Math.max(1, Math.floor(windowSec * fs));
    const k = keyFor(startSample, length);

    // Cache hit
    const cached = cacheRef.current.get(k);
    if (cached) {
      lastFetchMode.current = "cache";
      setSignals(cached);
      setLoadingWindow(false);
      return;
    }

    // Network
    setLoadingWindow(true);
    lastFetchMode.current = "net";
    const reqId = ++lastReqId.current;
    const t0 = performance.now();

    fetchChunkBin(DEMO_STUDY_ID, startSample, length)
      .then((result) => {
        if (result.ok === false) throw new Error(result.error);

        const hdrNCh = hdrNum(result.headers, ["x-eeg-nchannels", "x-eeg-channel-count"]);
        const hdrNSamp = hdrNum(result.headers, ["x-eeg-length", "x-eeg-samples-per-channel"]);

        const nCh = Number.isFinite(hdrNCh) ? hdrNCh : meta.n_channels;
        const nSamp = Number.isFinite(hdrNSamp) ? hdrNSamp : length;

        return { buf: result.data, nCh, nSamp };
      })
      .then(({ buf, nCh, nSamp }) => {
        if (reqId !== lastReqId.current) return;

        const f32 = new Float32Array(buf);
        const expected = nCh * nSamp;

        if (f32.length !== expected) {
          throw new Error(
            `Bad payload length: got ${f32.length}, expected ${expected}. ` +
              `nCh=${nCh}, nSamp=${nSamp}, meta.n_channels=${meta.n_channels}, req.length=${length}`,
          );
        }

        const reshaped = reshapeAuto(f32, nCh, nSamp);
        lastLayoutRef.current = `${reshaped.layout} (score=${reshaped.score.toFixed(3)})`;

        addToCache(k, reshaped.signals);
        setSignals(reshaped.signals);

        lastFetchMs.current = Math.round(performance.now() - t0);
      })
      .catch((e) => {
        if (reqId !== lastReqId.current) return;
        if (!signals) setFatalError(String(e));
      })
      .finally(() => {
        if (reqId === lastReqId.current) setLoadingWindow(false);
      });

    // Prefetch next window during playback
    if (playing) {
      const stride = windowSec / 2;
      const nextWs = clamp(ws + stride, 0, maxStart);
      const nextStartSample = Math.floor(nextWs * fs);
      const nk = keyFor(nextStartSample, length);

      if (!cacheRef.current.has(nk)) {
        fetchChunkBin(DEMO_STUDY_ID, nextStartSample, length)
          .then((result) => {
            if (result.ok === false) return null;

            const hdrNCh = hdrNum(result.headers, ["x-eeg-nchannels", "x-eeg-channel-count"]);
            const hdrNSamp = hdrNum(result.headers, ["x-eeg-length", "x-eeg-samples-per-channel"]);

            const nCh = Number.isFinite(hdrNCh) ? hdrNCh : meta.n_channels;
            const nSamp = Number.isFinite(hdrNSamp) ? hdrNSamp : length;

            return { buf: result.data, nCh, nSamp };
          })
          .then((x) => {
            if (!x) return;
            const f32 = new Float32Array(x.buf);
            const expected = x.nCh * x.nSamp;
            if (f32.length !== expected) return;
            const reshaped = reshapeAuto(f32, x.nCh, x.nSamp);
            addToCache(nk, reshaped.signals);
          })
          .catch(() => {});
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, windowStartSec, windowSec, playing, addToCache]);

  /* ---------- PLAYBACK (smooth + deterministic) ---------- */
  useEffect(() => {
    if (!playing || !meta) return;

    const fs = meta.sampling_rate_hz;
    const durationSec = meta.n_samples / fs;
    const maxStart = Math.max(0, durationSec - windowSec);
    const stride = windowSec / 2;

    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = ((now - last) / 1000) * playbackSpeed;
      last = now;

      setCursorSec((c) => {
        let nc = c + dt;

        if (nc < windowSec * 0.75) return nc;

        setWindowStartSec((ws) => clamp(ws + stride, 0, maxStart));
        return nc - stride;
      });

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, meta, windowSec, playbackSpeed]);

  /* ---------- KEYBOARD NAVIGATION (P/N for segment jumping) ---------- */
  useEffect(() => {
    if (segments.length === 0) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      const key = e.key.toLowerCase();
      if (key !== "p" && key !== "n") return;
      
      e.preventDefault();
      
      let targetIdx: number;
      if (key === "n") {
        targetIdx = currentSegmentIndex + 1;
        if (targetIdx >= segments.length) targetIdx = 0; // wrap
      } else {
        targetIdx = currentSegmentIndex - 1;
        if (targetIdx < 0) targetIdx = segments.length - 1; // wrap
      }
      
      navigateToSegment(segments[targetIdx]);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [segments, currentSegmentIndex]);

  /* ---------- DERIVED TIMES ---------- */
  const globalTime = windowStartSec + cursorSec;

  const durationSec = useMemo(() => {
    if (!meta) return 0;
    return meta.n_samples / meta.sampling_rate_hz;
  }, [meta]);

  /* ---------- WINDOW-LOCAL OVERLAYS ---------- */
  const windowArtifacts = useMemo(() => {
    if (!showArtifacts) return [];
    const ws = windowStartSec;
    const we = windowStartSec + windowSec;

    return artifacts
      .filter((a) => a.end_sec > ws && a.start_sec < we)
      .map((a) => ({
        start_sec: a.start_sec - ws,
        end_sec: a.end_sec - ws,
        label: a.label,
        channel: a.channel,
      }));
  }, [artifacts, showArtifacts, windowStartSec, windowSec]);

  const windowMarkers: Marker[] = useMemo(() => {
    const ws = windowStartSec;
    const we = windowStartSec + windowSec;

    return annotations
      .filter((m) => m.start_sec >= ws && m.start_sec <= we)
      .map((m, idx) => ({
        id: `${m.label ?? "ann"}-${idx}-${m.start_sec}`,
        timestamp_sec: m.start_sec - ws,
        marker_type: "event",
        label: m.label ?? "annotation",
      }));
  }, [annotations, windowStartSec, windowSec]);

  const windowSegmentOverlays = useMemo(() => {
    if (!showSegmentOverlays || segments.length === 0) return [];
    
    const ws = windowStartSec;
    const we = windowStartSec + windowSec;
    
    return segments
      .filter(seg => seg.t_end_s > ws && seg.t_start_s < we)
      .map(seg => {
        const color = getSegmentColor(seg.label);
        const isFocused = focusedSegment && 
          seg.t_start_s === focusedSegment.t_start_s && 
          seg.label === focusedSegment.label;
        
        return {
          start_sec: Math.max(0, seg.t_start_s - ws),
          end_sec: Math.min(windowSec, seg.t_end_s - ws),
          label: seg.label,
          color: isFocused ? "rgba(59, 130, 246, 0.25)" : color.bg,
          borderColor: isFocused ? "rgba(59, 130, 246, 0.8)" : color.border,
          isFocused: !!isFocused,
          channel: seg.channel_index ?? undefined,
        };
      });
  }, [segments, showSegmentOverlays, windowStartSec, windowSec, focusedSegment]);

  const windowHighlight = useMemo(() => {
    if (!focusedSegment || showSegmentOverlays) return null;
    const ws = windowStartSec;
    const we = windowStartSec + windowSec;
    
    if (focusedSegment.t_end_s <= ws || focusedSegment.t_start_s >= we) return null;
    
    return {
      start_sec: Math.max(0, focusedSegment.t_start_s - ws),
      end_sec: Math.min(windowSec, focusedSegment.t_end_s - ws),
      label: focusedSegment.label,
    };
  }, [focusedSegment, showSegmentOverlays, windowStartSec, windowSec]);

  // Navigate to a specific segment
  const navigateToSegment = useCallback((seg: Segment) => {
    if (!meta) return;
    
    const fs = meta.sampling_rate_hz;
    const dur = meta.n_samples / fs;
    const tt = clamp(seg.t_start_s, 0, Math.max(0, dur - 1e-6));
    const stride = windowSec / 2;
    const ws = Math.floor(tt / stride) * stride;
    
    setPlaying(false);
    setWindowStartSec(clamp(ws, 0, Math.max(0, dur - windowSec)));
    setCursorSec(clamp(tt - ws, 0, windowSec));
    
    const params = new URLSearchParams(searchParams);
    params.set("t", String(seg.t_start_s));
    params.set("t_end", String(seg.t_end_s));
    params.set("focus", "segment");
    params.set("label", seg.label);
    if (seg.channel_index != null) {
      params.set("ch", String(seg.channel_index));
    } else {
      params.delete("ch");
    }
    if (seg.score != null) {
      params.set("score", String(seg.score));
    } else {
      params.delete("score");
    }
    setSearchParams(params, { replace: true });
  }, [meta, windowSec, searchParams, setSearchParams]);

  /* ---------- MONTAGE TRANSFORM ---------- */
  const { renderSignals, renderLabels } = useMemo(() => {
    if (!signals || !channelLabels.length) {
      return { renderSignals: signals, renderLabels: channelLabels };
    }
    
    if (montage === "referential") {
      return { renderSignals: signals, renderLabels: channelLabels };
    }
    
    const result = applyMontage(signals, channelLabels, montage);
    return { renderSignals: result.signals, renderLabels: result.labels };
  }, [signals, channelLabels, montage]);

  // Visible channels after montage — need to recalculate for non-referential
  const renderVisibleChannels = useMemo(() => {
    if (montage !== "referential" && renderSignals) {
      // For bipolar/avg montages, show all derived channels
      const s = new Set<number>();
      for (let i = 0; i < renderSignals.length; i++) s.add(i);
      return s;
    }
    return visibleChannels;
  }, [montage, renderSignals, visibleChannels]);

  /* ---------- CLICK-TO-SEEK ---------- */
  const handleTimeClick = useCallback((localTime: number) => {
    setPlaying(false);
    setCursorSec(clamp(localTime, 0, windowSec));
  }, [windowSec]);

  /* ---------- EXPORT ---------- */
  const handleExport = useCallback(() => {
    const exportData = {
      study_id: DEMO_STUDY_ID,
      exported_at: new Date().toISOString(),
      montage,
      window: {
        start_sec: windowStartSec,
        end_sec: windowStartSec + windowSec,
        window_sec: windowSec,
      },
      annotations: annotations.map(a => ({
        start_sec: a.start_sec,
        end_sec: a.end_sec,
        label: a.label,
        channel: a.channel,
      })),
      segments: segments.map(s => ({
        t_start_s: s.t_start_s,
        t_end_s: s.t_end_s,
        label: s.label,
        channel_index: s.channel_index,
        score: s.score,
      })),
      artifacts: artifacts.map(a => ({
        start_sec: a.start_sec,
        end_sec: a.end_sec,
        label: a.label,
        channel: a.channel,
      })),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `eeg-annotations-${DEMO_STUDY_ID}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [annotations, segments, artifacts, montage, windowStartSec, windowSec]);

  // Channel group toggle handlers
  const handleToggleGroup = useCallback((group: ChannelGroup) => {
    setVisibleGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
      }
      return next;
    });
  }, []);

  const handleSelectAllGroups = useCallback(() => {
    setVisibleGroups(new Set(["frontal", "central", "temporal", "occipital"]));
  }, []);

  const handleDeselectAllGroups = useCallback(() => {
    setVisibleGroups(new Set());
  }, []);

  // Handler to dismiss focused segment banner
  const dismissFocusedSegment = () => {
    const params = new URLSearchParams(searchParams);
    params.delete("focus");
    params.delete("t");
    params.delete("t_end");
    params.delete("label");
    params.delete("ch");
    params.delete("score");
    setSearchParams(params, { replace: true });
  };

  if (fatalError) {
    return (
      <div className="h-full w-full p-4 space-y-2">
        <div className="text-sm font-semibold text-red-500">EEGViewer failed</div>
        <pre className="text-xs whitespace-pre-wrap break-words text-red-400">{fatalError}</pre>
      </div>
    );
  }

  if (loadingMeta || !meta || !renderSignals) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Focused Segment Banner */}
      {focusedSegment && (
        <div className="px-3 py-2 bg-primary/10 border-b border-primary/20 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-sm flex-wrap">
            <Focus className="h-4 w-4 text-primary" />
            <span className="font-medium text-primary">Focused Segment</span>
            <Badge variant="secondary">{focusedSegment.label}</Badge>
            <span className="text-muted-foreground font-mono text-xs">
              {focusedSegment.t_start_s.toFixed(2)}s – {focusedSegment.t_end_s.toFixed(2)}s
            </span>
            {focusedSegment.channel_index != null && (
              <span className="text-muted-foreground text-xs">
                Ch: {focusedSegment.channel_index}
              </span>
            )}
            {focusedSegment.score != null && (
              <span className="text-muted-foreground text-xs">
                Score: {focusedSegment.score.toFixed(3)}
              </span>
            )}
            {segments.length > 0 && (
              <span className="text-muted-foreground text-xs border-l pl-3 ml-2">
                {currentSegmentIndex + 1}/{segments.length}
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={dismissFocusedSegment}
            className="h-6 w-6 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      <div className="p-2 flex flex-wrap gap-3 items-center border-b">
        <Badge>{meta.n_channels} ch</Badge>
        <Badge>{meta.sampling_rate_hz} Hz</Badge>
        {loadingWindow && <Badge variant="secondary">Loading…</Badge>}
        {lastFetchMs.current != null && <Badge variant="secondary">{lastFetchMs.current}ms</Badge>}
        {lastFetchMode.current && <Badge variant="secondary">{lastFetchMode.current}</Badge>}

        <div className="h-4 border-l mx-1" />

        {/* Montage selector inline */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Montage:</span>
          <select
            value={montage}
            onChange={(e) => setMontage(e.target.value)}
            className="h-7 text-xs rounded border border-border bg-background px-2"
          >
            <option value="referential">Referential</option>
            <option value="bipolar-longitudinal">Bipolar Long.</option>
            <option value="bipolar-transverse">Bipolar Trans.</option>
            <option value="average-reference">Avg Reference</option>
            <option value="laplacian">Laplacian</option>
          </select>
        </div>

        <div className="h-4 border-l mx-1" />

        <Switch checked={showArtifacts} onCheckedChange={setShowArtifacts} />
        <span className="text-sm">Artifacts</span>

        <Switch checked={suppressArtifacts} onCheckedChange={setSuppressArtifacts} />
        <span className="text-sm">Suppress</span>

        <Switch checked={showSegmentOverlays} onCheckedChange={setShowSegmentOverlays} />
        <span className="text-sm">Segments</span>

        <div className="flex-1" />

        {!sidebarOpen && segments.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSidebarOpen(true)}
            className="h-7 gap-1"
          >
            <PanelRightOpen className="h-3.5 w-3.5" />
            <span className="text-xs">{segments.length} segments</span>
          </Button>
        )}
      </div>

      <EEGControls
        isPlaying={playing}
        onPlayPause={() => setPlaying((p) => !p)}
        currentTime={globalTime}
        duration={durationSec}
        onTimeChange={(t) => {
          setPlaying(false);
          const tt = clamp(t, 0, Math.max(0, durationSec - 1e-6));
          const stride = windowSec / 2;
          const ws = Math.floor(tt / stride) * stride;
          setWindowStartSec(clamp(ws, 0, Math.max(0, durationSec - windowSec)));
          setCursorSec(clamp(tt - ws, 0, windowSec));
        }}
        timeWindow={windowSec}
        onTimeWindowChange={(w) => {
          setPlaying(false);
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
        onSkipBackward={() => {
          setPlaying(false);
          const tt = clamp(globalTime - windowSec, 0, durationSec);
          const stride = windowSec / 2;
          const ws = Math.floor(tt / stride) * stride;
          setWindowStartSec(clamp(ws, 0, Math.max(0, durationSec - windowSec)));
          setCursorSec(clamp(tt - ws, 0, windowSec));
        }}
        onSkipForward={() => {
          setPlaying(false);
          const tt = clamp(globalTime + windowSec, 0, durationSec);
          const stride = windowSec / 2;
          const ws = Math.floor(tt / stride) * stride;
          setWindowStartSec(clamp(ws, 0, Math.max(0, durationSec - windowSec)));
          setCursorSec(clamp(tt - ws, 0, windowSec));
        }}
        onExport={handleExport}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Channel Group Panel (referential montage only) */}
        {montage === "referential" && (
          <div className="w-48 border-r overflow-y-auto shrink-0">
            <ChannelGroupList
              channelLabels={channelLabels}
              visibleGroups={visibleGroups}
              onToggleGroup={handleToggleGroup}
              onSelectAll={handleSelectAllGroups}
              onDeselectAll={handleDeselectAllGroups}
            />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <WebGLEEGViewer
            signals={renderSignals}
            channelLabels={renderLabels}
            sampleRate={meta.sampling_rate_hz}
            currentTime={cursorSec}
            timeWindow={windowSec}
            amplitudeScale={amplitude}
            visibleChannels={renderVisibleChannels}
            theme={theme ?? "dark"}
            markers={windowMarkers}
            artifactIntervals={windowArtifacts}
            highlightInterval={windowHighlight}
            segmentOverlays={windowSegmentOverlays}
            showArtifactsAsRed={true}
            suppressArtifacts={suppressArtifacts}
            onTimeClick={handleTimeClick}
          />
        </div>

        {segments.length > 0 && (
          <SegmentSidebar
            segments={segments}
            currentSegmentIndex={currentSegmentIndex}
            isOpen={sidebarOpen}
            onToggle={() => setSidebarOpen(!sidebarOpen)}
            onSegmentClick={(seg) => navigateToSegment(seg)}
          />
        )}
      </div>
    </div>
  );
}
