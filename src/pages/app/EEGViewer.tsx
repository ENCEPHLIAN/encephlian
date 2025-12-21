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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  Loader2,
  ArrowLeft,
  Trash2,
  AlertCircle,
  Maximize2,
  Layers,
  X,
  Menu,
  RefreshCw,
  AlertTriangle,
  Eye,
  EyeOff,
  Zap,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTheme } from "next-themes";
import { useIsMobile } from "@/hooks/use-mobile";
import { useEEGChunkCache } from "@/hooks/useEEGChunkCache";

import { WebGLEEGViewer } from "@/components/eeg/WebGLEEGViewer";
import { EEGControls } from "@/components/eeg/EEGControls";
import { applyMontage } from "@/lib/eeg/montage-transforms";
import { ChannelGroup, groupChannels } from "@/lib/eeg/channel-groups";
import { filterStandardChannels } from "@/lib/eeg/standard-channels";
import { cn } from "@/lib/utils";

// Hard-lock study ID
const STUDY_ID = "TUH_CANON_001";

// API Base URL
const API_BASE = (
  import.meta.env.VITE_ENCEPH_READ_API_BASE || "https://atmospheric-wage-drama-glucose.trycloudflare.com"
)
  .trim()
  .replace(/\/+$/, "");

const API_KEY = import.meta.env.VITE_ENCEPH_READ_API_KEY || "e3sg-bdNyNfP5LIaDP75Ko4d7JybGTJnMCCBNHgXMEM";

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

/** Compute unit multiplier to convert to microvolts */
function getUnitMultiplier(unit: string): number {
  const u = (unit || "").toLowerCase().trim();
  if (u === "v" || u === "volt" || u === "volts") return 1e6;
  if (u === "mv" || u === "millivolt" || u === "millivolts") return 1e3;
  if (u === "uv" || u === "µv" || u === "microvolt" || u === "microvolts") return 1;
  return 1;
}

/** Generate deterministic channel colors */
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

function getChannelColors(nChannels: number): string[] {
  const colors: string[] = [];
  for (let i = 0; i < nChannels; i++) {
    colors.push(CHANNEL_PALETTE[i % CHANNEL_PALETTE.length]);
  }
  return colors;
}

export default function EEGViewer() {
  const isMobile = useIsMobile();
  const { theme } = useTheme();

  const studyId = STUDY_ID;

  // UI State
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const [isMarkerPanelOpen, setIsMarkerPanelOpen] = useState(false);

  // Playback State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [timeWindow, setTimeWindow] = useState(10); // Default 10 seconds
  const [amplitudeScale, setAmplitudeScale] = useState(0.01);
  const [playbackSpeed, setPlaybackSpeed] = useState(2);
  const [montage, setMontage] = useState("referential");

  // New toggles
  const [autoGain, setAutoGain] = useState(true);
  const [showArtifacts, setShowArtifacts] = useState(true);
  const [suppressArtifacts, setSuppressArtifacts] = useState(false);

  // Loading state
  const [isLoadingMeta, setIsLoadingMeta] = useState(false);
  const [isLoadingChunk, setIsLoadingChunk] = useState(false);
  const [loadError, setLoadError] = useState<{ message: string; url?: string; status?: number } | null>(null);

  // Meta state
  const [meta, setMeta] = useState<CanonicalMeta | null>(null);
  const [durationSec, setDurationSec] = useState(0);
  const [channelLabels, setChannelLabels] = useState<string[]>([]);
  const [channelColors, setChannelColors] = useState<string[]>([]);
  const [unitMultipliers, setUnitMultipliers] = useState<number[]>([]);

  // Current window signals (only the visible window, not full recording)
  const [windowSignals, setWindowSignals] = useState<number[][] | null>(null);
  const [windowStartTime, setWindowStartTime] = useState(0);

  // Markers + Artifacts + Annotations
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [artifactIntervals, setArtifactIntervals] = useState<ArtifactInterval[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [newMarkerType, setNewMarkerType] = useState("event");
  const [newMarkerLabel, setNewMarkerLabel] = useState("");
  const [newMarkerNotes, setNewMarkerNotes] = useState("");

  // Channel Group Visibility
  const [visibleGroups, setVisibleGroups] = useState<Set<ChannelGroup>>(
    new Set(["frontal", "central", "temporal", "occipital", "other"]),
  );

  // Debounce ref for chunk fetching
  const chunkFetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastFetchedWindowRef = useRef<{ start: number; length: number } | null>(null);

  // Smooth amplitude scale for auto-gain
  const targetAmplitudeRef = useRef(0.01);
  const smoothAmplitudeRef = useRef(0.01);

  // Compute eegData from windowSignals with optional artifact suppression
  const eegData = useMemo(() => {
    if (!windowSignals || !channelLabels.length) return null;

    const sampleRate = meta?.sampling_rate_hz ?? 250;
    const windowDuration = windowSignals[0]?.length ? windowSignals[0].length / sampleRate : 0;

    // Apply artifact suppression if enabled
    let processedSignals = windowSignals;
    if (suppressArtifacts && artifactIntervals.length > 0) {
      processedSignals = windowSignals.map((channelData) => {
        const suppressed = [...channelData];
        artifactIntervals.forEach((artifact) => {
          const artifactStartSample = Math.floor((artifact.start_sec - windowStartTime) * sampleRate);
          const artifactEndSample = Math.floor((artifact.end_sec - windowStartTime) * sampleRate);

          for (let i = Math.max(0, artifactStartSample); i < Math.min(suppressed.length, artifactEndSample); i++) {
            suppressed[i] *= 0.2; // Attenuate by 80%
          }
        });
        return suppressed;
      });
    }

    const transformed = applyMontage(processedSignals, channelLabels, montage);
    return {
      signals: transformed.signals,
      channelLabels: transformed.labels,
      sampleRate,
      duration: windowDuration,
    };
  }, [
    windowSignals,
    channelLabels,
    montage,
    meta?.sampling_rate_hz,
    suppressArtifacts,
    artifactIntervals,
    windowStartTime,
  ]);

  // Visible channels - fallback to ALL if standard filter returns empty
  const visibleChannels = useMemo(() => {
    if (!eegData) return new Set<number>();

    const standardIndices = filterStandardChannels(eegData.channelLabels);

    if (standardIndices.length === 0) {
      return new Set(eegData.channelLabels.map((_, i) => i));
    }

    const standardLabels = standardIndices.map((i) => eegData.channelLabels[i]);
    const groups = groupChannels(standardLabels);

    const visible = new Set<number>();
    groups.forEach((localIndices, group) => {
      if (visibleGroups.has(group)) {
        localIndices.forEach((localIdx) => visible.add(standardIndices[localIdx]));
      }
    });

    if (visible.size === 0) {
      return new Set(eegData.channelLabels.map((_, i) => i));
    }

    return visible;
  }, [eegData?.channelLabels, visibleGroups]);

  // Auto-gain computation using 95th percentile with smooth transition
  useEffect(() => {
    if (!autoGain || !eegData || visibleChannels.size === 0) return;

    // Collect samples for percentile calculation
    const allSamples: number[] = [];
    visibleChannels.forEach((ch) => {
      const signal = eegData.signals[ch];
      if (!signal) return;
      // Sample every Nth point for efficiency
      for (let i = 0; i < signal.length; i += Math.max(1, Math.floor(signal.length / 200))) {
        allSamples.push(Math.abs(signal[i]));
      }
    });

    if (allSamples.length === 0) return;

    // Calculate 95th percentile
    allSamples.sort((a, b) => a - b);
    const idx95 = Math.floor(allSamples.length * 0.95);
    const percentile95 = allSamples[idx95] || allSamples[allSamples.length - 1];

    if (percentile95 > 0) {
      // Target scale to fit 95th percentile nicely
      const targetScale = 80 / percentile95;
      targetAmplitudeRef.current = Math.max(0.001, Math.min(1, targetScale * 0.01));

      // Smooth transition
      const smoothFactor = 0.3;
      const newSmooth =
        smoothAmplitudeRef.current + (targetAmplitudeRef.current - smoothAmplitudeRef.current) * smoothFactor;
      smoothAmplitudeRef.current = newSmooth;
      setAmplitudeScale(newSmooth);
    }
  }, [autoGain, eegData, visibleChannels]);

  /** Fetch meta */
  const fetchMeta = useCallback(async () => {
    setIsLoadingMeta(true);
    setLoadError(null);

    const url = `${API_BASE}/studies/${encodeURIComponent(studyId)}/meta?root=.`;
    try {
      const res = await fetch(url, { headers: getHeaders() });
      const body = await res.text();
      if (!res.ok) {
        throw { message: `HTTP ${res.status}: ${body}`, url, status: res.status };
      }
      const json = JSON.parse(body);
      const m = (json.meta ?? json) as CanonicalMeta;

      setMeta(m);

      // Compute duration from meta
      const duration = m.n_samples / m.sampling_rate_hz;
      setDurationSec(duration);

      // Setup channel labels
      const labels = m.channel_map?.length
        ? m.channel_map
            .slice()
            .sort((a, b) => a.index - b.index)
            .map((c) => c.canonical_id)
        : Array.from({ length: m.n_channels }, (_, i) => `CH${i}`);

      const multipliers = m.channel_map?.length
        ? m.channel_map
            .slice()
            .sort((a, b) => a.index - b.index)
            .map((c) => getUnitMultiplier(c.unit))
        : Array.from({ length: m.n_channels }, () => 1);

      setChannelLabels(labels);
      setChannelColors(getChannelColors(m.n_channels));
      setUnitMultipliers(multipliers);

      toast.success(`Meta loaded: ${labels.length}ch @ ${m.sampling_rate_hz}Hz, ${Math.round(duration)}s`);
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

  /** Fetch chunk for current window */
  const fetchWindowChunk = useCallback(
    async (startTime: number, windowLen: number, metaData: CanonicalMeta) => {
      const fs = metaData.sampling_rate_hz;
      const startSample = Math.floor(startTime * fs);
      const lengthSamples = Math.floor(windowLen * fs);

      // Skip if same window already fetched
      if (
        lastFetchedWindowRef.current &&
        lastFetchedWindowRef.current.start === startSample &&
        lastFetchedWindowRef.current.length === lengthSamples
      ) {
        return;
      }

      // Clamp to valid range
      const maxStart = Math.max(0, metaData.n_samples - lengthSamples);
      const clampedStart = Math.max(0, Math.min(startSample, maxStart));
      const clampedLength = Math.min(lengthSamples, metaData.n_samples - clampedStart);

      if (clampedLength <= 0) return;

      setIsLoadingChunk(true);

      const url = `${API_BASE}/studies/${encodeURIComponent(studyId)}/chunk?root=.&start=${clampedStart}&length=${clampedLength}`;
      try {
        const res = await fetch(url, { headers: getHeaders() });
        const body = await res.text();
        if (!res.ok) {
          throw { message: `HTTP ${res.status}: ${body}`, url, status: res.status };
        }
        const json = JSON.parse(body);

        const nCh = json.shape?.[0] ?? json.n_channels ?? metaData.n_channels;
        const winLen = json.shape?.[1] ?? json.length ?? clampedLength;

        const decoded = decodeFloat32B64(json.data_b64, nCh, winLen);

        // Apply unit conversion
        for (let ch = 0; ch < decoded.length; ch++) {
          const mult = unitMultipliers[ch] ?? 1;
          for (let i = 0; i < decoded[ch].length; i++) {
            decoded[ch][i] *= mult;
          }
        }

        setWindowSignals(decoded);
        setWindowStartTime(clampedStart / fs);
        lastFetchedWindowRef.current = { start: clampedStart, length: clampedLength };
      } catch (e: any) {
        console.error("Chunk fetch error:", e);
        setLoadError({ message: e?.message ?? "Failed to load chunk", url: e?.url, status: e?.status });
      } finally {
        setIsLoadingChunk(false);
      }
    },
    [studyId, unitMultipliers],
  );

  /** Fetch annotations (optional - ignore 404) */
  const fetchAnnotations = useCallback(async () => {
    const url = `${API_BASE}/studies/${encodeURIComponent(studyId)}/annotations?root=.`;
    try {
      const res = await fetch(url, { headers: getHeaders() });
      if (res.status === 404) {
        console.log("No annotations endpoint available");
        return;
      }
      if (!res.ok) return;
      const json = await res.json();
      const annots = (json.annotations || json || []) as Annotation[];
      setAnnotations(annots);
      console.log(`Loaded ${annots.length} annotations`);
    } catch (e) {
      console.log("Annotations fetch failed (ignored):", e);
    }
  }, [studyId]);

  /** Fetch artifacts (optional - ignore 404) */
  const fetchArtifacts = useCallback(async () => {
    const url = `${API_BASE}/studies/${encodeURIComponent(studyId)}/artifacts?root=.`;
    try {
      const res = await fetch(url, { headers: getHeaders() });
      if (res.status === 404) {
        console.log("No artifacts endpoint available");
        return;
      }
      if (!res.ok) return;
      const json = await res.json();
      const artifacts = (json.artifacts || json || []) as ArtifactInterval[];
      setArtifactIntervals(artifacts);
      console.log(`Loaded ${artifacts.length} artifact intervals`);
    } catch (e) {
      console.log("Artifacts fetch failed (ignored):", e);
    }
  }, [studyId]);

  /** Initial load - fetch meta, then annotations/artifacts */
  useEffect(() => {
    const init = async () => {
      await fetchMeta();
      // Fetch overlays in parallel
      fetchAnnotations();
      fetchArtifacts();
    };
    init();
  }, [fetchMeta, fetchAnnotations, fetchArtifacts]);

  /** Fetch chunk when currentTime or timeWindow changes (debounced) */
  useEffect(() => {
    if (!meta) return;

    if (chunkFetchTimeoutRef.current) {
      clearTimeout(chunkFetchTimeoutRef.current);
    }

    chunkFetchTimeoutRef.current = setTimeout(() => {
      fetchWindowChunk(currentTime, timeWindow, meta);
    }, 50); // Small debounce

    return () => {
      if (chunkFetchTimeoutRef.current) {
        clearTimeout(chunkFetchTimeoutRef.current);
      }
    };
  }, [currentTime, timeWindow, meta, fetchWindowChunk]);

  /** Playback loop */
  useEffect(() => {
    if (!isPlaying || !meta) return;

    const maxTime = Math.max(0, durationSec - timeWindow);

    const interval = setInterval(() => {
      setCurrentTime((prev) => {
        const next = prev + 0.1 * playbackSpeed;
        if (next >= maxTime) {
          setIsPlaying(false);
          return maxTime;
        }
        return next;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [isPlaying, meta, timeWindow, playbackSpeed, durationSec]);

  /** Controls */
  const handlePlayPause = () => setIsPlaying((prev) => !prev);

  const handleSeek = (time: number) => {
    const maxTime = Math.max(0, durationSec - timeWindow);
    setCurrentTime(Math.max(0, Math.min(time, maxTime)));
  };

  const handleTimeWindowChange = (value: number) => {
    setTimeWindow(value);
  };

  const handleAmplitudeScaleChange = (value: number) => {
    setAutoGain(false);
    setAmplitudeScale(value);
  };

  const handleSkipBackward = () => {
    setCurrentTime((prev) => Math.max(0, prev - timeWindow));
  };

  const handleSkipForward = () => {
    const maxTime = Math.max(0, durationSec - timeWindow);
    setCurrentTime((prev) => Math.min(maxTime, prev + timeWindow));
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

  const handleJumpToMarker = (timestamp: number) => {
    handleSeek(timestamp);
  };

  const handleRetry = () => {
    setLoadError(null);
    fetchMeta();
  };

  const nChannels = channelLabels.length;

  // Debug info
  const debugInfo = {
    duration: Math.round(durationSec),
    channels: nChannels,
    windowStart: currentTime.toFixed(1),
    windowLen: timeWindow,
    hasData: windowSignals !== null && windowSignals.length > 0,
  };

  const hasWarning = debugInfo.duration === 0 || debugInfo.channels === 0 || !debugInfo.hasData;

  // Render error state
  if (loadError && !meta) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8">
        <Card className="max-w-lg w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Failed to Load EEG
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground">{loadError.message}</div>
            {loadError.url && <div className="p-2 bg-muted rounded text-xs font-mono break-all">{loadError.url}</div>}
            {loadError.status && <Badge variant="destructive">HTTP {loadError.status}</Badge>}
            <div className="flex gap-2">
              <Button onClick={handleRetry} variant="default">
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
          window={debugInfo.windowStart}s-{(parseFloat(debugInfo.windowStart) + timeWindow).toFixed(1)}s
        </span>
        <span>data={debugInfo.hasData ? "yes" : "no"}</span>
        {isLoadingMeta && <span className="text-primary">(loading meta...)</span>}
        {isLoadingChunk && <span className="text-primary">(loading chunk...)</span>}
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
          {/* AutoGain Toggle */}
          <div className="flex items-center gap-2">
            <Switch id="auto-gain" checked={autoGain} onCheckedChange={setAutoGain} />
            <Label htmlFor="auto-gain" className="text-sm flex items-center gap-1">
              <Zap className="h-3 w-3" />
              AutoGain
            </Label>
          </div>

          {/* Show Artifacts Toggle */}
          <div className="flex items-center gap-2">
            <Switch id="show-artifacts" checked={showArtifacts} onCheckedChange={setShowArtifacts} />
            <Label htmlFor="show-artifacts" className="text-sm flex items-center gap-1">
              <Eye className="h-3 w-3" />
              Artifacts
            </Label>
          </div>

          {/* Suppress Artifacts Toggle */}
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
            markers={[
              // Include user markers
              ...markers
                .filter((m) => m.timestamp_sec >= currentTime && m.timestamp_sec <= currentTime + timeWindow)
                .map((m) => ({ ...m, timestamp_sec: m.timestamp_sec - currentTime })),
              // Include annotations as markers
              ...annotations
                .filter((a) => a.timestamp_sec >= currentTime && a.timestamp_sec <= currentTime + timeWindow)
                .map((a) => ({
                  id: `annot-${a.timestamp_sec}`,
                  timestamp_sec: a.timestamp_sec - currentTime,
                  marker_type: "annotation",
                  label: a.label,
                })),
            ]}
            artifactIntervals={
              showArtifacts
                ? artifactIntervals
                    .filter((a) => a.start_sec < currentTime + timeWindow && a.end_sec > currentTime)
                    .map((a) => ({
                      start_sec: Math.max(0, a.start_sec - currentTime),
                      end_sec: Math.min(timeWindow, a.end_sec - currentTime),
                      label: a.label,
                    }))
                : []
            }
            channelColors={channelColors}
            showArtifactsAsRed={showArtifacts}
          />
        )}

        {!meta && !isLoadingMeta && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-muted-foreground">No data loaded</p>
          </div>
        )}
      </div>

      {/* Marker Panel Dialog */}
      <Dialog open={isMarkerPanelOpen} onOpenChange={setIsMarkerPanelOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Markers & Annotations</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Add Marker Form */}
            <div className="space-y-3 p-4 border rounded-lg">
              <h4 className="text-sm font-medium">Add Marker at {currentTime.toFixed(1)}s</h4>
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

            {/* Marker List */}
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {markers.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No markers yet</p>}
              {markers.map((marker) => (
                <div
                  key={marker.id}
                  className="flex items-center justify-between p-2 border rounded hover:bg-muted/50 cursor-pointer"
                  onClick={() => handleJumpToMarker(marker.timestamp_sec)}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {marker.marker_type}
                      </Badge>
                      <span className="text-sm font-medium">{marker.label}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{marker.timestamp_sec.toFixed(1)}s</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteMarker(marker.id);
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

      {/* Fullscreen Dialog */}
      <Dialog open={isFullscreenOpen} onOpenChange={setIsFullscreenOpen}>
        <DialogContent className="max-w-[95vw] w-full h-[90vh] p-0">
          <div className="h-full flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">EEG Viewer - {studyId}</h2>
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
              {eegData && (
                <WebGLEEGViewer
                  signals={eegData.signals}
                  channelLabels={eegData.channelLabels}
                  sampleRate={eegData.sampleRate}
                  currentTime={0}
                  timeWindow={timeWindow}
                  amplitudeScale={amplitudeScale}
                  visibleChannels={visibleChannels}
                  theme={theme ?? "dark"}
                  markers={[
                    ...markers
                      .filter((m) => m.timestamp_sec >= currentTime && m.timestamp_sec <= currentTime + timeWindow)
                      .map((m) => ({ ...m, timestamp_sec: m.timestamp_sec - currentTime })),
                    ...annotations
                      .filter((a) => a.timestamp_sec >= currentTime && a.timestamp_sec <= currentTime + timeWindow)
                      .map((a) => ({
                        id: `annot-${a.timestamp_sec}`,
                        timestamp_sec: a.timestamp_sec - currentTime,
                        marker_type: "annotation",
                        label: a.label,
                      })),
                  ]}
                  artifactIntervals={
                    showArtifacts
                      ? artifactIntervals
                          .filter((a) => a.start_sec < currentTime + timeWindow && a.end_sec > currentTime)
                          .map((a) => ({
                            start_sec: Math.max(0, a.start_sec - currentTime),
                            end_sec: Math.min(timeWindow, a.end_sec - currentTime),
                            label: a.label,
                          }))
                      : []
                  }
                  channelColors={channelColors}
                  showArtifactsAsRed={showArtifacts}
                />
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
