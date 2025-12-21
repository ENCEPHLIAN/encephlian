import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Loader2,
  ArrowLeft,
  Trash2,
  AlertCircle,
  Maximize2,
  X,
  Menu,
  RefreshCw,
  AlertTriangle,
  Eye,
  EyeOff,
  Zap,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useIsMobile } from "@/hooks/use-mobile";

import { WebGLEEGViewer } from "@/components/eeg/WebGLEEGViewer";
import { EEGControls } from "@/components/eeg/EEGControls";
import { applyMontage } from "@/lib/eeg/montage-transforms";
import { ChannelGroup, groupChannels } from "@/lib/eeg/channel-groups";
import { filterStandardChannels } from "@/lib/eeg/standard-channels";
import { cn } from "@/lib/utils";

/** Hard-lock study ID */
const STUDY_ID = "TUH_CANON_001";

/** Read API */
const API_BASE = (
  import.meta.env.VITE_ENCEPH_READ_API_BASE || "https://atmospheric-wage-drama-glucose.trycloudflare.com"
)
  .trim()
  .replace(/\/+$/, "");
const API_KEY = import.meta.env.VITE_ENCEPH_READ_API_KEY || "e3sg-bdNyNfP5LIaDP75Ko4d7JybGTJnMCCBNHgXMEM";

/**
 * Viewer policy:
 * - Always windowed (no bulk preload)
 * - While playing, fetch only when the desired window start moves enough
 */
const DEFAULT_WINDOW_SEC = 10;
const PREFETCH_AHEAD = true; // prefetch next window (small + fast)
const MAX_INFLIGHT = 2; // concurrency cap (current + prefetch)
const SEEK_DEBOUNCE_MS = 120; // not 50ms (too aggressive)
const PLAY_WINDOW_STEP_SEC = 0.5; // only refetch when window start changes by >= this

type CanonicalMeta = {
  study_id: string;
  n_channels: number;
  sampling_rate_hz: number;
  n_samples: number;
  channel_map?: Array<{
    index: number;
    canonical_id: string;
    original_label: string;
    unit: string;
  }>;
};

type Marker = {
  id: string;
  timestamp_sec: number;
  marker_type: string;
  label?: string | null;
  notes?: string | null;
};

type ArtifactInterval = {
  start_sec: number;
  end_sec: number;
  label?: string;
  channel?: string;
};

type Annotation = {
  timestamp_sec: number;
  duration_sec?: number;
  label: string;
  channel?: string;
};

function getHeaders() {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (API_KEY) h["X-API-KEY"] = API_KEY;
  return h;
}

/** Decode base64 float32 chunk (row-major [n_channels, n_samples]) */
function decodeFloat32B64(b64: string, nChannels: number, nSamples: number): number[][] {
  const binaryString = atob(b64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);

  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const float32 = new Float32Array(buf);

  const out: number[][] = new Array(nChannels);
  for (let ch = 0; ch < nChannels; ch++) {
    const start = ch * nSamples;
    const seg = float32.subarray(start, start + nSamples);
    out[ch] = Array.from(seg);
  }
  return out;
}

/** Convert unit to microvolts multiplier */
function getUnitMultiplier(unit: string): number {
  const u = (unit || "").toLowerCase().trim();
  if (u === "v" || u === "volt" || u === "volts") return 1e6;
  if (u === "mv" || u === "millivolt" || u === "millivolts") return 1e3;
  if (u === "uv" || u === "µv" || u === "microvolt" || u === "microvolts") return 1;
  return 1;
}

/** Deterministic channel colors */
const CHANNEL_PALETTE = [
  "#60a5fa",
  "#4ade80",
  "#fbbf24",
  "#a78bfa",
  "#f87171",
  "#34d399",
  "#fb923c",
  "#818cf8",
  "#f472b6",
  "#22d3d8",
  "#a3e635",
  "#e879f9",
  "#fcd34d",
  "#6ee7b7",
  "#93c5fd",
  "#c084fc",
  "#fdba74",
  "#86efac",
  "#fca5a5",
  "#67e8f9",
];

function getChannelColors(n: number): string[] {
  return Array.from({ length: n }, (_, i) => CHANNEL_PALETTE[i % CHANNEL_PALETTE.length]);
}

/** Tiny util */
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

/** Persist autogain amplitude per study (so refresh never flatlines) */
function ampKey(studyId: string) {
  return `enceph_amp_${studyId}`;
}

export default function EEGViewer() {
  const isMobile = useIsMobile();
  const { theme } = useTheme();

  const studyId = STUDY_ID;

  // UI
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const [isMarkerPanelOpen, setIsMarkerPanelOpen] = useState(false);

  // Playback
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0); // global time (sec) in recording
  const [timeWindow, setTimeWindow] = useState(DEFAULT_WINDOW_SEC);
  const [playbackSpeed, setPlaybackSpeed] = useState(2);
  const [montage, setMontage] = useState("referential");

  // Toggles
  const [autoGain, setAutoGain] = useState(true);
  const [showArtifacts, setShowArtifacts] = useState(true);
  const [suppressArtifacts, setSuppressArtifacts] = useState(false);

  // Loading / errors
  const [isLoadingMeta, setIsLoadingMeta] = useState(false);
  const [isLoadingChunk, setIsLoadingChunk] = useState(false);
  const [loadError, setLoadError] = useState<{ message: string; url?: string; status?: number } | null>(null);

  // Meta
  const [meta, setMeta] = useState<CanonicalMeta | null>(null);
  const [durationSec, setDurationSec] = useState(0);
  const [channelLabels, setChannelLabels] = useState<string[]>([]);
  const [channelColors, setChannelColors] = useState<string[]>([]);

  // Unit multipliers need to be stable for chunk decode (avoid state-race)
  const unitMultRef = useRef<number[]>([]);
  const labelsRef = useRef<string[]>([]);
  const colorsRef = useRef<string[]>([]);

  // Windowed data
  const [windowSignals, setWindowSignals] = useState<number[][] | null>(null);
  const [windowStartTime, setWindowStartTime] = useState(0); // sec (global) aligned to the fetched chunk

  // User markers + overlays
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [artifactIntervals, setArtifactIntervals] = useState<ArtifactInterval[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [newMarkerType, setNewMarkerType] = useState("event");
  const [newMarkerLabel, setNewMarkerLabel] = useState("");
  const [newMarkerNotes, setNewMarkerNotes] = useState("");

  // Channel groups
  const [visibleGroups, setVisibleGroups] = useState<Set<ChannelGroup>>(
    new Set(["frontal", "central", "temporal", "occipital", "other"]),
  );

  // Amplitude: default should NOT flatline. Use persisted if present.
  const [amplitudeScale, setAmplitudeScale] = useState(() => {
    const saved = localStorage.getItem(ampKey(studyId));
    const v = saved ? Number(saved) : NaN;
    // sensible default for your WebGL viewer – not tiny:
    return Number.isFinite(v) ? v : 0.1;
  });

  // Abort + in-flight control
  const abortRef = useRef<AbortController | null>(null);
  const inflightRef = useRef(0);
  const reqIdRef = useRef(0);

  // Debounce
  const seekDebounceRef = useRef<number | null>(null);

  // Prefetch cache (tiny)
  const chunkCacheRef = useRef<Map<string, { start: number; len: number; signals: number[][] }>>(new Map());

  /** ===== Derived: visible channels (fallback ALL) ===== */
  const eegData = useMemo(() => {
    if (!windowSignals || labelsRef.current.length === 0) return null;

    const fs = meta?.sampling_rate_hz ?? 250;
    const winDur = windowSignals[0]?.length ? windowSignals[0].length / fs : 0;

    // Apply suppression only on overlap, only if toggle enabled
    let processed = windowSignals;
    if (suppressArtifacts && artifactIntervals.length) {
      const overlaps = artifactIntervals.filter(
        (a) => a.start_sec < windowStartTime + winDur && a.end_sec > windowStartTime,
      );
      if (overlaps.length) {
        processed = windowSignals.map((ch) => {
          const out = ch.slice();
          for (const a of overlaps) {
            const s0 = Math.floor((a.start_sec - windowStartTime) * fs);
            const s1 = Math.floor((a.end_sec - windowStartTime) * fs);
            const i0 = clamp(s0, 0, out.length);
            const i1 = clamp(s1, 0, out.length);
            for (let i = i0; i < i1; i++) out[i] *= 0.2;
          }
          return out;
        });
      }
    }

    const transformed = applyMontage(processed, labelsRef.current, montage);

    return {
      signals: transformed.signals,
      channelLabels: transformed.labels,
      sampleRate: fs,
      duration: winDur,
    };
  }, [windowSignals, montage, meta?.sampling_rate_hz, suppressArtifacts, artifactIntervals, windowStartTime]);

  const visibleChannels = useMemo(() => {
    if (!eegData) return new Set<number>();

    const standardIndices = filterStandardChannels(eegData.channelLabels);
    if (!standardIndices.length) return new Set(eegData.channelLabels.map((_, i) => i));

    const standardLabels = standardIndices.map((i) => eegData.channelLabels[i]);
    const groups = groupChannels(standardLabels);

    const visible = new Set<number>();
    groups.forEach((localIdxs, group) => {
      if (visibleGroups.has(group)) {
        localIdxs.forEach((li) => visible.add(standardIndices[li]));
      }
    });

    if (!visible.size) return new Set(eegData.channelLabels.map((_, i) => i));
    return visible;
  }, [eegData?.channelLabels, visibleGroups]);

  /** ===== AutoGain (stable + non-destructive) =====
   * Only updates when autoGain is ON.
   * Persists result so refresh doesn’t flatline.
   */
  useEffect(() => {
    if (!autoGain || !eegData || !visibleChannels.size) return;

    // collect a light sample of abs amplitudes
    const samples: number[] = [];
    visibleChannels.forEach((chIdx) => {
      const sig = eegData.signals[chIdx];
      if (!sig?.length) return;
      const step = Math.max(1, Math.floor(sig.length / 250)); // ~250 points
      for (let i = 0; i < sig.length; i += step) samples.push(Math.abs(sig[i]));
    });

    if (samples.length < 20) return;

    samples.sort((a, b) => a - b);
    const p95 = samples[Math.floor(samples.length * 0.95)] || samples[samples.length - 1];
    if (!p95 || p95 <= 0) return;

    // map p95 into a pleasant on-screen range
    // IMPORTANT: clamp so it never becomes tiny (flatline) or insane
    const target = clamp(0.08 / p95, 0.02, 0.5);

    // smooth a little (don’t jump)
    setAmplitudeScale((prev) => {
      const next = prev * 0.7 + target * 0.3;
      localStorage.setItem(ampKey(studyId), String(next));
      return next;
    });
  }, [autoGain, eegData, visibleChannels, studyId]);

  /** ===== Fetch meta ===== */
  const fetchMeta = useCallback(async () => {
    setIsLoadingMeta(true);
    setLoadError(null);

    const url = `${API_BASE}/studies/${encodeURIComponent(studyId)}/meta?root=.`;

    try {
      const res = await fetch(url, { headers: getHeaders() });
      const body = await res.text();
      if (!res.ok) throw { message: `HTTP ${res.status}: ${body}`, url, status: res.status };

      const json = JSON.parse(body);
      const m = (json.meta ?? json) as CanonicalMeta;

      setMeta(m);

      const duration = m.n_samples / m.sampling_rate_hz;
      setDurationSec(duration);

      const labels = m.channel_map?.length
        ? m.channel_map
            .slice()
            .sort((a, b) => a.index - b.index)
            .map((c) => c.canonical_id)
        : Array.from({ length: m.n_channels }, (_, i) => `CH${i}`);

      const mults = m.channel_map?.length
        ? m.channel_map
            .slice()
            .sort((a, b) => a.index - b.index)
            .map((c) => getUnitMultiplier(c.unit))
        : Array.from({ length: m.n_channels }, () => 1);

      const colors = getChannelColors(m.n_channels);

      labelsRef.current = labels;
      unitMultRef.current = mults;
      colorsRef.current = colors;

      setChannelLabels(labels);
      setChannelColors(colors);

      toast.success(`Meta: ${labels.length}ch @ ${m.sampling_rate_hz}Hz (${Math.round(duration)}s)`);
      return m;
    } catch (e: any) {
      console.error("Meta fetch error:", e);
      setLoadError({ message: e?.message ?? "Failed to load meta", url: e?.url, status: e?.status });
      toast.error(e?.message ?? "Failed to load meta");
      return null;
    } finally {
      setIsLoadingMeta(false);
    }
  }, [studyId]);

  /** Optional overlays (ignore 404) */
  const fetchAnnotations = useCallback(async () => {
    const url = `${API_BASE}/studies/${encodeURIComponent(studyId)}/annotations?root=.`;
    try {
      const res = await fetch(url, { headers: getHeaders() });
      if (res.status === 404) return;
      if (!res.ok) return;
      const json = await res.json();
      setAnnotations((json.annotations || json || []) as Annotation[]);
    } catch {
      // ignore
    }
  }, [studyId]);

  const fetchArtifacts = useCallback(async () => {
    const url = `${API_BASE}/studies/${encodeURIComponent(studyId)}/artifacts?root=.`;
    try {
      const res = await fetch(url, { headers: getHeaders() });
      if (res.status === 404) return;
      if (!res.ok) return;
      const json = await res.json();
      setArtifactIntervals((json.artifacts || json || []) as ArtifactInterval[]);
    } catch {
      // ignore
    }
  }, [studyId]);

  /** ===== Chunk fetch (windowed, concurrency-safe) ===== */
  const fetchWindow = useCallback(
    async (startSec: number, winSec: number, m: CanonicalMeta, signal: AbortSignal) => {
      const fs = m.sampling_rate_hz;
      const startSample = Math.floor(startSec * fs);
      const lenSamples = Math.max(1, Math.floor(winSec * fs));

      const maxStart = Math.max(0, m.n_samples - lenSamples);
      const clampedStart = clamp(startSample, 0, maxStart);
      const clampedLen = Math.min(lenSamples, m.n_samples - clampedStart);

      if (clampedLen <= 0) return null;

      const cacheKey = `${clampedStart}:${clampedLen}`;
      const cached = chunkCacheRef.current.get(cacheKey);
      if (cached) return cached;

      const url = `${API_BASE}/studies/${encodeURIComponent(studyId)}/chunk?root=.&start=${clampedStart}&length=${clampedLen}`;
      const res = await fetch(url, { headers: getHeaders(), signal });

      const body = await res.text();
      if (!res.ok) throw { message: `HTTP ${res.status}: ${body}`, url, status: res.status };

      const json = JSON.parse(body);
      const nCh = json.shape?.[0] ?? json.n_channels ?? m.n_channels;
      const nS = json.shape?.[1] ?? json.length ?? clampedLen;

      const decoded = decodeFloat32B64(json.data_b64, nCh, nS);

      // Unit conversion (to microvolts)
      const mults = unitMultRef.current;
      for (let ch = 0; ch < decoded.length; ch++) {
        const mult = mults[ch] ?? 1;
        if (mult !== 1) for (let i = 0; i < decoded[ch].length; i++) decoded[ch][i] *= mult;
      }

      const payload = { start: clampedStart, len: clampedLen, signals: decoded };

      // cache (keep small)
      chunkCacheRef.current.set(cacheKey, payload);
      if (chunkCacheRef.current.size > 8) {
        // delete oldest
        const first = chunkCacheRef.current.keys().next().value;
        if (first) chunkCacheRef.current.delete(first);
      }

      return payload;
    },
    [studyId],
  );

  /** Decide desired window start for fetching */
  const desiredWindowStart = useMemo(() => {
    // keep window start = currentTime, but clamp so we never ask beyond end
    const maxStart = Math.max(0, durationSec - timeWindow);
    return clamp(currentTime, 0, maxStart);
  }, [currentTime, durationSec, timeWindow]);

  /** Load meta on mount, then overlays, then first window */
  useEffect(() => {
    const init = async () => {
      const m = await fetchMeta();
      if (!m) return;
      // overlays (best-effort)
      fetchAnnotations();
      fetchArtifacts();
      // first window load at t=0
      setCurrentTime(0);
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchMeta, fetchAnnotations, fetchArtifacts]);

  /** Window fetch scheduler (debounced for seeks; stepped for playback) */
  useEffect(() => {
    if (!meta) return;

    // cancel previous scheduled
    if (seekDebounceRef.current) {
      window.clearTimeout(seekDebounceRef.current);
      seekDebounceRef.current = null;
    }

    // while playing: only fetch when start changes enough
    const lastStart = windowStartTime;
    const shouldFetchNow = !isPlaying || Math.abs(desiredWindowStart - lastStart) >= PLAY_WINDOW_STEP_SEC;

    if (!shouldFetchNow) return;

    seekDebounceRef.current = window.setTimeout(async () => {
      // abort older requests
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      const myReq = ++reqIdRef.current;

      try {
        // concurrency cap
        if (inflightRef.current >= MAX_INFLIGHT) return;
        inflightRef.current++;
        setIsLoadingChunk(true);
        setLoadError(null);

        const primary = await fetchWindow(desiredWindowStart, timeWindow, meta, ac.signal);
        if (ac.signal.aborted) return;
        if (!primary) return;
        if (myReq !== reqIdRef.current) return;

        const fs = meta.sampling_rate_hz;
        setWindowSignals(primary.signals);
        setWindowStartTime(primary.start / fs);

        // optional prefetch next window (concurrent, but capped)
        if (PREFETCH_AHEAD && inflightRef.current < MAX_INFLIGHT) {
          inflightRef.current++;
          const nextStart = clamp(desiredWindowStart + timeWindow, 0, Math.max(0, durationSec - timeWindow));
          fetchWindow(nextStart, timeWindow, meta, ac.signal)
            .catch(() => null)
            .finally(() => {
              inflightRef.current = Math.max(0, inflightRef.current - 1);
            });
        }
      } catch (e: any) {
        if (ac.signal.aborted) return;
        console.error("Chunk fetch error:", e);
        setLoadError({ message: e?.message ?? "Failed to load chunk", url: e?.url, status: e?.status });
      } finally {
        inflightRef.current = Math.max(0, inflightRef.current - 1);
        setIsLoadingChunk(false);
      }
    }, SEEK_DEBOUNCE_MS);

    return () => {
      if (seekDebounceRef.current) window.clearTimeout(seekDebounceRef.current);
    };
  }, [meta, desiredWindowStart, timeWindow, isPlaying, durationSec, windowStartTime, fetchWindow]);

  /** Playback loop (does NOT fetch directly; fetch is handled by effect above) */
  useEffect(() => {
    if (!isPlaying || !meta) return;

    const maxStart = Math.max(0, durationSec - timeWindow);

    const interval = window.setInterval(() => {
      setCurrentTime((prev) => {
        const next = prev + 0.1 * playbackSpeed;
        if (next >= maxStart) {
          setIsPlaying(false);
          return maxStart;
        }
        return next;
      });
    }, 100);

    return () => window.clearInterval(interval);
  }, [isPlaying, meta, playbackSpeed, durationSec, timeWindow]);

  /** Controls */
  const handlePlayPause = () => setIsPlaying((p) => !p);

  const handleSeek = (t: number) => {
    const maxStart = Math.max(0, durationSec - timeWindow);
    setCurrentTime(clamp(t, 0, maxStart));
  };

  const handleTimeWindowChange = (v: number) => {
    // avoid absurd sizes that stress origin
    const next = clamp(v, 5, 60);
    setTimeWindow(next);
    // clamp current time after changing window
    const maxStart = Math.max(0, durationSec - next);
    setCurrentTime((p) => clamp(p, 0, maxStart));
  };

  const handleAmplitudeScaleChange = (v: number) => {
    setAutoGain(false);
    const next = clamp(v, 0.02, 2);
    setAmplitudeScale(next);
    localStorage.setItem(ampKey(studyId), String(next));
  };

  const handleSkipBackward = () => setCurrentTime((p) => Math.max(0, p - timeWindow));
  const handleSkipForward = () => {
    const maxStart = Math.max(0, durationSec - timeWindow);
    setCurrentTime((p) => Math.min(maxStart, p + timeWindow));
  };

  const handleExport = () => {
    const data = { markers, studyId, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `eeg-markers-${studyId}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Markers exported");
  };

  const handleAddMarker = () => {
    if (!newMarkerLabel.trim()) {
      toast.error("Marker label required");
      return;
    }
    const marker: Marker = {
      id: `marker-${Date.now()}`,
      timestamp_sec: currentTime,
      marker_type: newMarkerType,
      label: newMarkerLabel.trim(),
      notes: newMarkerNotes.trim() || null,
    };
    setMarkers((prev) => [...prev, marker].sort((a, b) => a.timestamp_sec - b.timestamp_sec));
    setNewMarkerLabel("");
    setNewMarkerNotes("");
    toast.success("Marker added");
  };

  const handleDeleteMarker = (id: string) => {
    setMarkers((prev) => prev.filter((m) => m.id !== id));
    toast.success("Marker deleted");
  };

  const handleRetry = async () => {
    setLoadError(null);
    abortRef.current?.abort();
    chunkCacheRef.current.clear();
    const m = await fetchMeta();
    if (m) {
      fetchAnnotations();
      fetchArtifacts();
      setCurrentTime(0);
    }
  };

  /** Debug banner */
  const debugInfo = {
    duration: Math.round(durationSec),
    channels: channelLabels.length,
    windowStart: desiredWindowStart.toFixed(1),
    windowLen: timeWindow,
    hasData: !!(windowSignals && windowSignals.length && windowSignals[0]?.length),
  };
  const hasWarning = debugInfo.duration === 0 || debugInfo.channels === 0 || !debugInfo.hasData;

  /** Viewer markers: shift into [0..timeWindow] because viewer displays windowed data */
  const windowMarkers = useMemo(() => {
    const start = windowStartTime;
    const end = windowStartTime + timeWindow;

    const userMarkers = markers
      .filter((m) => m.timestamp_sec >= start && m.timestamp_sec <= end)
      .map((m) => ({ ...m, timestamp_sec: m.timestamp_sec - start }));

    const annotMarkers = annotations
      .filter((a) => a.timestamp_sec >= start && a.timestamp_sec <= end)
      .map((a) => ({
        id: `annot-${a.timestamp_sec}`,
        timestamp_sec: a.timestamp_sec - start,
        marker_type: "annotation",
        label: a.label,
      }));

    return [...userMarkers, ...annotMarkers];
  }, [markers, annotations, windowStartTime, timeWindow]);

  /** Viewer artifact overlays: shift into window coords */
  const windowArtifacts = useMemo(() => {
    if (!showArtifacts) return [];
    const start = windowStartTime;
    const end = windowStartTime + timeWindow;

    return artifactIntervals
      .filter((a) => a.start_sec < end && a.end_sec > start)
      .map((a) => ({
        start_sec: clamp(a.start_sec - start, 0, timeWindow),
        end_sec: clamp(a.end_sec - start, 0, timeWindow),
        label: a.label,
        channel: a.channel,
      }));
  }, [artifactIntervals, showArtifacts, windowStartTime, timeWindow]);

  /** Error state (meta not loaded) */
  if (loadError && !meta) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8">
        <Card className="max-w-lg w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Failed to Load EEG
            </CardTitle>
            <CardDescription>Study: {studyId}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground">{loadError.message}</div>
            {loadError.url && <div className="p-2 bg-muted rounded text-xs font-mono break-all">{loadError.url}</div>}
            {loadError.status && <Badge variant="destructive">HTTP {loadError.status}</Badge>}
            <div className="flex gap-2">
              <Button onClick={handleRetry}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
              <Link to="/app/studies">
                <Button variant="outline">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Debug Banner */}
      <div
        className={cn(
          "px-4 py-2 text-xs font-mono flex items-center gap-4 border-b",
          hasWarning ? "bg-destructive/10 text-destructive" : "bg-muted/50 text-muted-foreground",
        )}
      >
        {hasWarning && <AlertTriangle className="h-4 w-4" />}
        <span>duration={debugInfo.duration}s</span>
        <span>channels={debugInfo.channels}</span>
        <span>
          win={debugInfo.windowStart}s +{debugInfo.windowLen}s
        </span>
        <span>data={debugInfo.hasData ? "yes" : "no"}</span>
        {isLoadingMeta && <span className="text-primary">(meta...)</span>}
        {isLoadingChunk && <span className="text-primary">(chunk...)</span>}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b shrink-0">
        <div className="flex items-center gap-4">
          <Link to="/app/studies">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-semibold">EEG Viewer</h1>
            <p className="text-sm text-muted-foreground">{studyId}</p>
          </div>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Switch
              id="auto-gain"
              checked={autoGain}
              onCheckedChange={(v) => {
                setAutoGain(v);
                if (!v) toast.info("AutoGain off (manual amplitude)");
                else toast.info("AutoGain on");
              }}
            />
            <Label htmlFor="auto-gain" className="text-sm flex items-center gap-1">
              <Zap className="h-3 w-3" />
              AutoGain
            </Label>
          </div>

          <div className="flex items-center gap-2">
            <Switch id="show-artifacts" checked={showArtifacts} onCheckedChange={setShowArtifacts} />
            <Label htmlFor="show-artifacts" className="text-sm flex items-center gap-1">
              <Eye className="h-3 w-3" />
              Artifacts
            </Label>
          </div>

          <div className="flex items-center gap-2">
            <Switch id="suppress-artifacts" checked={suppressArtifacts} onCheckedChange={setSuppressArtifacts} />
            <Label htmlFor="suppress-artifacts" className="text-sm flex items-center gap-1">
              <EyeOff className="h-3 w-3" />
              Suppress
            </Label>
          </div>

          <Button variant="outline" size="icon" onClick={() => setIsMarkerPanelOpen(true)}>
            <Menu className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => setIsFullscreenOpen(true)}>
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Controls */}
      {meta && (
        <div className="p-4 border-b shrink-0">
          <EEGControls
            isPlaying={isPlaying}
            onPlayPause={handlePlayPause}
            currentTime={currentTime}
            duration={durationSec}
            onTimeChange={handleSeek}
            timeWindow={timeWindow}
            onTimeWindowChange={handleTimeWindowChange}
            amplitudeScale={amplitudeScale}
            onAmplitudeScaleChange={handleAmplitudeScaleChange}
            playbackSpeed={playbackSpeed}
            onPlaybackSpeedChange={setPlaybackSpeed}
            onSkipBackward={handleSkipBackward}
            onSkipForward={handleSkipForward}
            onExport={handleExport}
          />

          <div className="mt-3 flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              windowStart={windowStartTime.toFixed(2)}s
            </Badge>
            <Badge variant="outline" className="text-xs">
              amp={amplitudeScale.toFixed(4)}x
            </Badge>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setAutoGain(true);
                toast.info("AutoGain re-enabled");
              }}
            >
              Reset AutoGain
            </Button>
          </div>
        </div>
      )}

      {/* Viewer */}
      <div className="flex-1 min-h-0 relative">
        {isLoadingMeta && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Loading metadata...</p>
            </div>
          </div>
        )}

        {meta && eegData ? (
          <WebGLEEGViewer
            signals={eegData.signals}
            channelLabels={eegData.channelLabels}
            sampleRate={eegData.sampleRate}
            currentTime={0}
            timeWindow={timeWindow}
            amplitudeScale={amplitudeScale}
            visibleChannels={visibleChannels}
            theme={theme ?? "dark"}
            markers={windowMarkers}
            // If your WebGLEEGViewer supports these props, they will render overlays + colors.
            // If it doesn't, TS will tell you immediately and we’ll adjust.
            artifactIntervals={windowArtifacts as any}
            channelColors={colorsRef.current as any}
            showArtifactsAsRed={showArtifacts as any}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-muted-foreground">No data loaded</p>
          </div>
        )}
      </div>

      {/* Marker Panel */}
      <Dialog open={isMarkerPanelOpen} onOpenChange={setIsMarkerPanelOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Markers & Annotations</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-3 p-4 border rounded-lg">
              <h4 className="text-sm font-medium">Add Marker at {currentTime.toFixed(2)}s</h4>

              <Select value={newMarkerType} onValueChange={setNewMarkerType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="event">Event</SelectItem>
                  <SelectItem value="seizure">Seizure</SelectItem>
                  <SelectItem value="spike">Spike</SelectItem>
                  <SelectItem value="artifact">Artifact</SelectItem>
                </SelectContent>
              </Select>

              <Input placeholder="Label" value={newMarkerLabel} onChange={(e) => setNewMarkerLabel(e.target.value)} />
              <Textarea
                placeholder="Notes (optional)"
                value={newMarkerNotes}
                onChange={(e) => setNewMarkerNotes(e.target.value)}
                rows={2}
              />

              <Button onClick={handleAddMarker} className="w-full">
                Add Marker
              </Button>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {markers.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No markers yet</p>}

              {markers.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between p-2 border rounded hover:bg-muted/50 cursor-pointer"
                  onClick={() => handleSeek(m.timestamp_sec)}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {m.marker_type}
                      </Badge>
                      <span className="text-sm font-medium">{m.label}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{m.timestamp_sec.toFixed(2)}s</span>
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteMarker(m.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Fullscreen */}
      <Dialog open={isFullscreenOpen} onOpenChange={setIsFullscreenOpen}>
        <DialogContent className="max-w-[95vw] w-full h-[90vh] p-0">
          <div className="h-full flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">EEG Viewer — {studyId}</h2>
              <Button variant="ghost" size="icon" onClick={() => setIsFullscreenOpen(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>

            {meta && (
              <div className="p-4 border-b">
                <EEGControls
                  isPlaying={isPlaying}
                  onPlayPause={handlePlayPause}
                  currentTime={currentTime}
                  duration={durationSec}
                  onTimeChange={handleSeek}
                  timeWindow={timeWindow}
                  onTimeWindowChange={handleTimeWindowChange}
                  amplitudeScale={amplitudeScale}
                  onAmplitudeScaleChange={handleAmplitudeScaleChange}
                  playbackSpeed={playbackSpeed}
                  onPlaybackSpeedChange={setPlaybackSpeed}
                  onSkipBackward={handleSkipBackward}
                  onSkipForward={handleSkipForward}
                  onExport={handleExport}
                />
              </div>
            )}

            <div className="flex-1 min-h-0">
              {meta && eegData && (
                <WebGLEEGViewer
                  signals={eegData.signals}
                  channelLabels={eegData.channelLabels}
                  sampleRate={eegData.sampleRate}
                  currentTime={0}
                  timeWindow={timeWindow}
                  amplitudeScale={amplitudeScale}
                  visibleChannels={visibleChannels}
                  theme={theme ?? "dark"}
                  markers={windowMarkers}
                  artifactIntervals={windowArtifacts as any}
                  channelColors={colorsRef.current as any}
                  showArtifactsAsRed={showArtifacts as any}
                />
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
