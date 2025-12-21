import { useEffect, useMemo, useCallback, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import { useIsMobile } from "@/hooks/use-mobile";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

import { AlertCircle, ArrowLeft, Loader2, Maximize2, Menu, RefreshCw, Trash2, X, Eye, EyeOff, Zap } from "lucide-react";

import { EEGControls } from "@/components/eeg/EEGControls";
import { WebGLEEGViewer } from "@/components/eeg/WebGLEEGViewer";

import { applyMontage } from "@/lib/eeg/montage-transforms";
import { ChannelGroup, groupChannels } from "@/lib/eeg/channel-groups";
import { filterStandardChannels } from "@/lib/eeg/standard-channels";
import { cn } from "@/lib/utils";

/** ===== Hard lock study ===== */
const STUDY_ID = "TUH_CANON_001";

/** ===== API config ===== */
const API_BASE = (
  import.meta.env.VITE_ENCEPH_READ_API_BASE || "https://atmospheric-wage-drama-glucose.trycloudflare.com"
)
  .trim()
  .replace(/\/+$/, "");

const API_KEY = import.meta.env.VITE_ENCEPH_READ_API_KEY || "e3sg-bdNyNfP5LIaDP75Ko4d7JybGTJnMCCBNHgXMEM";

function getHeaders() {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (API_KEY) h["X-API-KEY"] = API_KEY;
  return h;
}

/** ===== Streaming policy =====
 * We fetch a BUFFER (e.g., 60s) and render a VIEW window (e.g., 10s).
 * WebGLEEGViewer typically draws [currentTime .. currentTime + timeWindow] in the provided signals.
 * So we MUST guarantee the provided buffer covers that range → otherwise you get blank/black.
 */
const DEFAULT_VIEW_SEC = 10; // what the user sees
const MIN_VIEW_SEC = 5;
const MAX_VIEW_SEC = 60;

const DEFAULT_BUFFER_SEC = 60; // how much we fetch around the playhead (MVP fast)
const BUFFER_MARGIN_SEC = 8; // when near buffer edge, refetch
const FETCH_DEBOUNCE_MS = 120;

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

function clamp(x: number, a: number, b: number) {
  return Math.max(a, Math.min(b, x));
}

/** base64 float32 chunk (row-major [n_channels, n_samples]) */
function decodeFloat32B64(b64: string, nChannels: number, nSamples: number): number[][] {
  const binaryString = atob(b64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);

  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const float32 = new Float32Array(buf);

  const out: number[][] = new Array(nChannels);
  for (let ch = 0; ch < nChannels; ch++) {
    const start = ch * nSamples;
    out[ch] = Array.from(float32.subarray(start, start + nSamples));
  }
  return out;
}

/** Unit to uV */
function getUnitMultiplier(unit: string): number {
  const u = (unit || "").toLowerCase().trim();
  if (u === "v" || u === "volt" || u === "volts") return 1e6;
  if (u === "mv" || u === "millivolt" || u === "millivolts") return 1e3;
  if (u === "uv" || u === "µv" || u === "microvolt" || u === "microvolts") return 1;
  return 1;
}

/** Stable colors */
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
function getChannelColors(n: number) {
  return Array.from({ length: n }, (_, i) => CHANNEL_PALETTE[i % CHANNEL_PALETTE.length]);
}

function ampKey(studyId: string) {
  return `enceph_amp_${studyId}`;
}

export default function EEGViewer() {
  const isMobile = useIsMobile();
  const { theme } = useTheme();

  const studyId = STUDY_ID;

  /** UI */
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const [isMarkerPanelOpen, setIsMarkerPanelOpen] = useState(false);

  /** Playback */
  const [isPlaying, setIsPlaying] = useState(false);
  const [globalTime, setGlobalTime] = useState(0); // seconds in full recording
  const [viewSec, setViewSec] = useState(DEFAULT_VIEW_SEC);
  const [playbackSpeed, setPlaybackSpeed] = useState(2);
  const [montage, setMontage] = useState("referential");

  /** Toggles — MUST NOT change amplitude */
  const [autoGain, setAutoGain] = useState(false); // OFF by default for raw
  const [showArtifacts, setShowArtifacts] = useState(true);
  const [suppressArtifacts, setSuppressArtifacts] = useState(false);

  /** Loading / errors */
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [loadingChunk, setLoadingChunk] = useState(false);
  const [loadError, setLoadError] = useState<{ message: string; url?: string; status?: number } | null>(null);

  /** Meta */
  const [meta, setMeta] = useState<CanonicalMeta | null>(null);
  const [durationSec, setDurationSec] = useState(0);
  const [labels, setLabels] = useState<string[]>([]);
  const [colors, setColors] = useState<string[]>([]);
  const unitMultRef = useRef<number[]>([]);

  /** Buffer (what we actually render) */
  const [bufferStartSec, setBufferStartSec] = useState(0);
  const [bufferSec, setBufferSec] = useState(DEFAULT_BUFFER_SEC);
  const [bufferSignals, setBufferSignals] = useState<number[][] | null>(null);

  /** amplitude — RAW default (no flatline). Persist manual changes. */
  const [amplitudeScale, setAmplitudeScale] = useState(() => {
    const saved = localStorage.getItem(ampKey(studyId));
    const v = saved ? Number(saved) : NaN;
    return Number.isFinite(v) ? v : 1.0;
  });
  const manualAmpTouchedRef = useRef(false);

  /** overlays */
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [artifactIntervals, setArtifactIntervals] = useState<ArtifactInterval[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [newMarkerType, setNewMarkerType] = useState("event");
  const [newMarkerLabel, setNewMarkerLabel] = useState("");
  const [newMarkerNotes, setNewMarkerNotes] = useState("");

  /** Channel groups */
  const [visibleGroups, setVisibleGroups] = useState<Set<ChannelGroup>>(
    new Set(["frontal", "central", "temporal", "occipital", "other"]),
  );

  /** abort / debounce */
  const abortRef = useRef<AbortController | null>(null);
  const fetchDebounceRef = useRef<number | null>(null);

  /** ===== API: meta ===== */
  const fetchMeta = useCallback(async () => {
    setLoadingMeta(true);
    setLoadError(null);

    const url = `${API_BASE}/studies/${encodeURIComponent(studyId)}/meta?root=.`;

    try {
      const res = await fetch(url, { headers: getHeaders() });
      const body = await res.text();
      if (!res.ok) throw { message: `HTTP ${res.status}: ${body}`, url, status: res.status };

      const json = JSON.parse(body);
      const m = (json.meta ?? json) as CanonicalMeta;

      setMeta(m);
      const dur = m.n_samples / m.sampling_rate_hz;
      setDurationSec(dur);

      const sorted = m.channel_map?.length ? m.channel_map.slice().sort((a, b) => a.index - b.index) : null;

      const lbls = sorted?.length
        ? sorted.map((c) => c.canonical_id)
        : Array.from({ length: m.n_channels }, (_, i) => `CH${i}`);

      const mults = sorted?.length
        ? sorted.map((c) => getUnitMultiplier(c.unit))
        : Array.from({ length: m.n_channels }, () => 1);

      unitMultRef.current = mults;
      setLabels(lbls);
      setColors(getChannelColors(m.n_channels));

      toast.success(`Meta: ${lbls.length} ch @ ${m.sampling_rate_hz}Hz (${Math.round(dur)}s)`);
      return m;
    } catch (e: any) {
      console.error(e);
      setLoadError({ message: e?.message ?? "Failed to load meta", url: e?.url, status: e?.status });
      return null;
    } finally {
      setLoadingMeta(false);
    }
  }, [studyId]);

  /** ===== API: overlays (optional) ===== */
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

  /** ===== API: chunk fetch into buffer ===== */
  const fetchBuffer = useCallback(
    async (desiredStartSec: number, m: CanonicalMeta, desiredBufferSec: number) => {
      const fs = m.sampling_rate_hz;

      const startSample = Math.floor(desiredStartSec * fs);
      const lenSamples = Math.max(1, Math.floor(desiredBufferSec * fs));

      const maxStart = Math.max(0, m.n_samples - lenSamples);
      const clampedStart = clamp(startSample, 0, maxStart);
      const clampedLen = Math.min(lenSamples, m.n_samples - clampedStart);

      const url = `${API_BASE}/studies/${encodeURIComponent(studyId)}/chunk?root=.&start=${clampedStart}&length=${clampedLen}`;

      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      setLoadingChunk(true);
      setLoadError(null);

      try {
        const res = await fetch(url, { headers: getHeaders(), signal: ac.signal });
        const body = await res.text();
        if (!res.ok) throw { message: `HTTP ${res.status}: ${body}`, url, status: res.status };

        const json = JSON.parse(body);
        const nCh = json.shape?.[0] ?? json.n_channels ?? m.n_channels;
        const nS = json.shape?.[1] ?? json.length ?? clampedLen;

        const decoded = decodeFloat32B64(json.data_b64, nCh, nS);

        // unit conversion ONCE per fetch, no accumulation
        const mults = unitMultRef.current;
        for (let ch = 0; ch < decoded.length; ch++) {
          const mult = mults[ch] ?? 1;
          if (mult !== 1) for (let i = 0; i < decoded[ch].length; i++) decoded[ch][i] *= mult;
        }

        if (ac.signal.aborted) return;

        setBufferSignals(decoded);
        setBufferStartSec(clampedStart / fs);
      } catch (e: any) {
        if (ac.signal.aborted) return;
        console.error(e);
        setLoadError({ message: e?.message ?? "Failed to load chunk", url: e?.url, status: e?.status });
      } finally {
        setLoadingChunk(false);
      }
    },
    [studyId],
  );

  /** Decide if we need to refetch buffer to keep play smooth and avoid blank */
  const computeDesiredBufferStart = useCallback(() => {
    if (!meta) return 0;
    const maxT = Math.max(0, durationSec - 0.001);

    const t = clamp(globalTime, 0, maxT);

    // ensure buffer covers [t .. t+viewSec]
    const bufferEnd = bufferStartSec + bufferSec;

    const needs =
      bufferSignals == null || t < bufferStartSec + BUFFER_MARGIN_SEC || t + viewSec > bufferEnd - BUFFER_MARGIN_SEC;

    if (!needs) return null;

    // place t at ~1/3 into buffer so we have room to play forward
    const start = t - bufferSec * 0.33;
    const maxStart = Math.max(0, durationSec - bufferSec);
    return clamp(start, 0, maxStart);
  }, [meta, durationSec, globalTime, bufferStartSec, bufferSec, viewSec, bufferSignals]);

  /** Initial load */
  useEffect(() => {
    const init = async () => {
      const m = await fetchMeta();
      if (!m) return;
      fetchAnnotations();
      fetchArtifacts();

      // fetch initial buffer at t=0
      setGlobalTime(0);
      setBufferSec(DEFAULT_BUFFER_SEC);
      await fetchBuffer(0, m, DEFAULT_BUFFER_SEC);
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Refetch buffer when needed (debounced) */
  useEffect(() => {
    if (!meta) return;

    const desired = computeDesiredBufferStart();
    if (desired == null) return;

    if (fetchDebounceRef.current) window.clearTimeout(fetchDebounceRef.current);

    fetchDebounceRef.current = window.setTimeout(() => {
      fetchBuffer(desired, meta, bufferSec);
    }, FETCH_DEBOUNCE_MS);

    return () => {
      if (fetchDebounceRef.current) window.clearTimeout(fetchDebounceRef.current);
    };
  }, [meta, computeDesiredBufferStart, fetchBuffer, bufferSec]);

  /** Playback loop (global time) */
  useEffect(() => {
    if (!isPlaying || !meta) return;

    const maxT = Math.max(0, durationSec - 0.001);

    const interval = window.setInterval(() => {
      setGlobalTime((prev) => {
        const next = prev + 0.1 * playbackSpeed;
        if (next >= maxT) {
          setIsPlaying(false);
          return maxT;
        }
        return next;
      });
    }, 100);

    return () => window.clearInterval(interval);
  }, [isPlaying, meta, durationSec, playbackSpeed]);

  /** Local time inside buffer */
  const localTime = useMemo(() => {
    return clamp(globalTime - bufferStartSec, 0, Math.max(0, bufferSec - viewSec));
  }, [globalTime, bufferStartSec, bufferSec, viewSec]);

  /** Build signals to render:
   * - Suppression: optional attenuation, derived from bufferSignals (no mutation, no accumulation).
   * - Montage applied after suppression.
   */
  const eegData = useMemo(() => {
    if (!meta || !bufferSignals || !labels.length) return null;

    const fs = meta.sampling_rate_hz;

    let processed = bufferSignals;

    if (suppressArtifacts && artifactIntervals.length) {
      const bufStart = bufferStartSec;
      const bufEnd = bufferStartSec + (bufferSignals[0]?.length || 0) / fs;

      const overlaps = artifactIntervals.filter((a) => a.start_sec < bufEnd && a.end_sec > bufStart);

      if (overlaps.length) {
        processed = bufferSignals.map((ch) => {
          const out = ch.slice();
          for (const a of overlaps) {
            const s0 = Math.floor((a.start_sec - bufStart) * fs);
            const s1 = Math.floor((a.end_sec - bufStart) * fs);
            const i0 = clamp(s0, 0, out.length);
            const i1 = clamp(s1, 0, out.length);
            for (let i = i0; i < i1; i++) out[i] *= 0.2;
          }
          return out;
        });
      }
    }

    const transformed = applyMontage(processed, labels, montage);
    const dur = transformed.signals[0]?.length ? transformed.signals[0].length / fs : 0;

    return {
      signals: transformed.signals,
      channelLabels: transformed.labels,
      sampleRate: fs,
      duration: dur,
    };
  }, [meta, bufferSignals, labels, montage, suppressArtifacts, artifactIntervals, bufferStartSec]);

  /** Visible channels: if grouping yields nothing, show all */
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

  /** AutoGain: OFF by default. If ON, compute from RAW bufferSignals only (not suppressed) so toggles don’t ratchet. */
  useEffect(() => {
    if (!autoGain) return;
    if (manualAmpTouchedRef.current) return;
    if (!meta || !bufferSignals) return;

    const fs = meta.sampling_rate_hz;
    const step = Math.max(1, Math.floor((bufferSignals[0]?.length || 1) / 300));

    const samples: number[] = [];
    for (let ch = 0; ch < bufferSignals.length; ch++) {
      const sig = bufferSignals[ch];
      for (let i = 0; i < sig.length; i += step) samples.push(Math.abs(sig[i]));
    }
    if (samples.length < 50) return;

    samples.sort((a, b) => a - b);
    const p95 = samples[Math.floor(samples.length * 0.95)] || samples[samples.length - 1];
    if (!p95 || p95 <= 0) return;

    // pick a conservative gain so it’s never a flatline
    const target = clamp(0.12 / p95, 0.05, 2.0);

    setAmplitudeScale((prev) => prev * 0.6 + target * 0.4);
  }, [autoGain, meta, bufferSignals]);

  /** Overlays shifted into buffer coordinates (NOT view coordinates) */
  const bufferMarkers = useMemo(() => {
    const start = bufferStartSec;
    const end = bufferStartSec + bufferSec;

    const user = markers
      .filter((m) => m.timestamp_sec >= start && m.timestamp_sec <= end)
      .map((m) => ({ ...m, timestamp_sec: m.timestamp_sec - start }));

    const ann = annotations
      .filter((a) => a.timestamp_sec >= start && a.timestamp_sec <= end)
      .map((a) => ({
        id: `annot-${a.timestamp_sec}`,
        timestamp_sec: a.timestamp_sec - start,
        marker_type: "annotation",
        label: a.label,
      }));

    return [...user, ...ann];
  }, [markers, annotations, bufferStartSec, bufferSec]);

  const bufferArtifacts = useMemo(() => {
    if (!showArtifacts) return [];
    const start = bufferStartSec;
    const end = bufferStartSec + bufferSec;

    return artifactIntervals
      .filter((a) => a.start_sec < end && a.end_sec > start)
      .map((a) => ({
        start_sec: clamp(a.start_sec - start, 0, bufferSec),
        end_sec: clamp(a.end_sec - start, 0, bufferSec),
        label: a.label,
        channel: a.channel,
      }));
  }, [artifactIntervals, showArtifacts, bufferStartSec, bufferSec]);

  /** Controls */
  const onPlayPause = () => setIsPlaying((p) => !p);

  const onSeek = (t: number) => {
    const maxT = Math.max(0, durationSec - 0.001);
    setGlobalTime(clamp(t, 0, maxT));
  };

  const onSkipBackward = () => setGlobalTime((p) => Math.max(0, p - viewSec));
  const onSkipForward = () => {
    const maxT = Math.max(0, durationSec - 0.001);
    setGlobalTime((p) => Math.min(maxT, p + viewSec));
  };

  const onTimeWindowChange = (v: number) => {
    const next = clamp(v, MIN_VIEW_SEC, MAX_VIEW_SEC);
    setViewSec(next);

    // make buffer large enough vs view (keep it stable)
    const desiredBuffer = Math.max(DEFAULT_BUFFER_SEC, next * 6);
    setBufferSec(desiredBuffer);
  };

  const onAmplitudeChange = (v: number) => {
    manualAmpTouchedRef.current = true;
    setAutoGain(false);

    const next = clamp(v, 0.02, 5);
    setAmplitudeScale(next);
    localStorage.setItem(ampKey(studyId), String(next));
  };

  const onExport = () => {
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

  const addMarker = () => {
    if (!newMarkerLabel.trim()) {
      toast.error("Marker label required");
      return;
    }
    const marker: Marker = {
      id: `marker-${Date.now()}`,
      timestamp_sec: globalTime,
      marker_type: newMarkerType,
      label: newMarkerLabel.trim(),
      notes: newMarkerNotes.trim() || null,
    };
    setMarkers((prev) => [...prev, marker].sort((a, b) => a.timestamp_sec - b.timestamp_sec));
    setNewMarkerLabel("");
    setNewMarkerNotes("");
    toast.success("Marker added");
  };

  const deleteMarker = (id: string) => {
    setMarkers((prev) => prev.filter((m) => m.id !== id));
    toast.success("Marker deleted");
  };

  const retryAll = async () => {
    setLoadError(null);
    setBufferSignals(null);
    setIsPlaying(false);
    setGlobalTime(0);
    manualAmpTouchedRef.current = false;
    setAutoGain(false);
    setAmplitudeScale(1.0);
    localStorage.setItem(ampKey(studyId), "1.0");

    const m = await fetchMeta();
    if (m) {
      fetchAnnotations();
      fetchArtifacts();
      await fetchBuffer(0, m, bufferSec);
    }
  };

  /** Error (meta missing) */
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
              <Button onClick={retryAll}>
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

  /** Debug banner */
  const debug = {
    t: globalTime.toFixed(2),
    view: viewSec,
    bufStart: bufferStartSec.toFixed(2),
    bufSec: bufferSec,
    local: localTime.toFixed(2),
    ch: labels.length,
    data: bufferSignals ? (bufferSignals[0]?.length ? "yes" : "empty") : "no",
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Debug */}
      <div className={cn("px-4 py-2 text-xs font-mono flex flex-wrap items-center gap-3 border-b", "bg-muted/50")}>
        <span>t={debug.t}</span>
        <span>view={debug.view}s</span>
        <span>
          buf=[{debug.bufStart}..+{debug.bufSec}]
        </span>
        <span>local={debug.local}</span>
        <span>ch={debug.ch}</span>
        <span>data={debug.data}</span>
        {loadingMeta && <span className="text-primary">meta...</span>}
        {loadingChunk && <span className="text-primary">chunk...</span>}
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
                if (v) manualAmpTouchedRef.current = false;
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
            onPlayPause={onPlayPause}
            currentTime={globalTime}
            duration={durationSec}
            onTimeChange={onSeek}
            timeWindow={viewSec}
            onTimeWindowChange={onTimeWindowChange}
            amplitudeScale={amplitudeScale}
            onAmplitudeScaleChange={onAmplitudeChange}
            playbackSpeed={playbackSpeed}
            onPlaybackSpeedChange={setPlaybackSpeed}
            onSkipBackward={onSkipBackward}
            onSkipForward={onSkipForward}
            onExport={onExport}
          />

          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-xs">
              amp={amplitudeScale.toFixed(3)}x
            </Badge>

            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                manualAmpTouchedRef.current = false;
                setAutoGain(false);
                setAmplitudeScale(1.0);
                localStorage.setItem(ampKey(studyId), "1.0");
                toast.info("Amplitude reset to RAW (1.0x)");
              }}
            >
              Raw 1.0x
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setAutoGain(true);
                manualAmpTouchedRef.current = false;
                toast.info("AutoGain enabled");
              }}
            >
              AutoGain ON
            </Button>
          </div>
        </div>
      )}

      {/* Viewer */}
      <div className="flex-1 min-h-0 relative">
        {loadingMeta && (
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
            // IMPORTANT: currentTime is within buffer (local time)
            currentTime={localTime}
            timeWindow={viewSec}
            amplitudeScale={amplitudeScale}
            visibleChannels={useMemo(() => {
              // compute once in render path by reusing memo above
              return visibleChannels;
              // eslint-disable-next-line react-hooks/exhaustive-deps
            }, [visibleChannels])}
            theme={theme ?? "dark"}
            // Clicking time inside buffer → seek global
            onTimeClick={(t) => onSeek(bufferStartSec + t)}
            markers={bufferMarkers}
            // These may or may not exist in your WebGLEEGViewer types; if TS complains, cast to any at callsite.
            artifactIntervals={bufferArtifacts as any}
            channelColors={colors as any}
            showArtifactsAsRed={showArtifacts as any}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-muted-foreground">{loadingChunk ? "Loading signal..." : "No data loaded"}</p>
          </div>
        )}

        {loadError && meta && (
          <div className="absolute bottom-3 left-3 right-3 z-20">
            <Card className="border-destructive/30">
              <CardContent className="p-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm text-destructive font-medium">Chunk load failed</div>
                  <div className="text-xs text-muted-foreground break-words">{loadError.message}</div>
                </div>
                <Button size="sm" onClick={retryAll}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Marker Panel */}
      <Dialog open={isMarkerPanelOpen} onOpenChange={setIsMarkerPanelOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Markers</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-3 p-4 border rounded-lg">
              <div className="text-sm font-medium">Add marker @ {globalTime.toFixed(2)}s</div>

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

              <Button onClick={addMarker} className="w-full">
                Add Marker
              </Button>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {markers.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No markers yet</p>}
              {markers.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between p-2 border rounded hover:bg-muted/50 cursor-pointer"
                  onClick={() => onSeek(m.timestamp_sec)}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {m.marker_type}
                      </Badge>
                      <span className="text-sm font-medium truncate">{m.label}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">{m.timestamp_sec.toFixed(2)}s</div>
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteMarker(m.id);
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

            <div className="flex-1 min-h-0">
              {meta && eegData && (
                <WebGLEEGViewer
                  signals={eegData.signals}
                  channelLabels={eegData.channelLabels}
                  sampleRate={eegData.sampleRate}
                  currentTime={localTime}
                  timeWindow={viewSec}
                  amplitudeScale={amplitudeScale}
                  visibleChannels={visibleChannels}
                  theme={theme ?? "dark"}
                  onTimeClick={(t) => onSeek(bufferStartSec + t)}
                  markers={bufferMarkers}
                  artifactIntervals={bufferArtifacts as any}
                  channelColors={colors as any}
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
