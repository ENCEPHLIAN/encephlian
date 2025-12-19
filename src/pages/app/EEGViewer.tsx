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
import { Loader2, ArrowLeft, Trash2, AlertCircle, Maximize2, Layers, X, Menu, RefreshCw, AlertTriangle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTheme } from "next-themes";
import { useIsMobile } from "@/hooks/use-mobile";

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
  import.meta.env.VITE_ENCEPH_READ_API_BASE ||
  "https://drops-patch-crucial-differential.trycloudflare.com"
)
  .trim()
  .replace(/\/+$/, "");

const API_KEY = import.meta.env.VITE_ENCEPH_READ_API_KEY || "e3sg-bdNyNfP5LIaDP75Ko4d7JybGTJnMCCBNHgXMEM";

/** Chunk streaming settings */
const BLOCK_SECONDS = 10;
const UI_UPDATE_INTERVAL_MS = 250;

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
  return 1; // Default: assume already in uV
}

/** Compute robust amplitude (95th percentile abs) */
function computeRobustAmplitude(signals: number[][], visibleChannels: Set<number>, startSample: number, endSample: number): number {
  const values: number[] = [];
  const step = Math.max(1, Math.floor((endSample - startSample) / 500)); // Sample up to 500 points per channel
  
  visibleChannels.forEach(ch => {
    const signal = signals[ch];
    if (!signal) return;
    for (let i = startSample; i < Math.min(endSample, signal.length); i += step) {
      values.push(Math.abs(signal[i]));
    }
  });
  
  if (values.length === 0) return 100; // Default 100 uV
  
  values.sort((a, b) => a - b);
  const p95Index = Math.floor(values.length * 0.95);
  return values[p95Index] || 100;
}

/** Generate deterministic artifact intervals (fallback) */
function generateDeterministicArtifacts(signals: number[][], sampleRate: number): ArtifactInterval[] {
  const artifacts: ArtifactInterval[] = [];
  if (!signals.length || !signals[0]?.length) return artifacts;
  
  const totalSamples = signals[0].length;
  const windowSamples = Math.floor(sampleRate * 0.5); // 0.5s windows
  const threshold = 500; // uV threshold for artifact
  
  for (let start = 0; start < totalSamples - windowSamples; start += windowSamples) {
    let maxAbs = 0;
    let highFreqEnergy = 0;
    
    for (let ch = 0; ch < Math.min(signals.length, 10); ch++) {
      const signal = signals[ch];
      for (let i = start; i < start + windowSamples && i < signal.length; i++) {
        maxAbs = Math.max(maxAbs, Math.abs(signal[i]));
        if (i > start) {
          highFreqEnergy += Math.abs(signal[i] - signal[i - 1]);
        }
      }
    }
    
    const avgHighFreq = highFreqEnergy / (windowSamples * Math.min(signals.length, 10));
    
    if (maxAbs > threshold || avgHighFreq > 50) {
      const startSec = start / sampleRate;
      const endSec = (start + windowSamples) / sampleRate;
      
      // Merge with previous if adjacent
      if (artifacts.length > 0 && Math.abs(artifacts[artifacts.length - 1].end_sec - startSec) < 0.1) {
        artifacts[artifacts.length - 1].end_sec = endSec;
      } else {
        artifacts.push({ start_sec: startSec, end_sec: endSec, label: "artifact" });
      }
    }
  }
  
  return artifacts;
}

/** Generate deterministic channel colors */
const CHANNEL_PALETTE = [
  "#60a5fa", "#4ade80", "#fbbf24", "#a78bfa", "#f87171",
  "#34d399", "#fb923c", "#818cf8", "#f472b6", "#22d3d8",
  "#a3e635", "#e879f9", "#fcd34d", "#6ee7b7", "#93c5fd",
  "#c084fc", "#fdba74", "#86efac", "#fca5a5", "#67e8f9",
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

  // Hard-locked study ID
  const studyId = STUDY_ID;

  // UI State
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const [isMarkerPanelOpen, setIsMarkerPanelOpen] = useState(false);

  // Playback State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [timeWindow, setTimeWindow] = useState(10);
  const [amplitudeScale, setAmplitudeScale] = useState(0.01);
  const [playbackSpeed, setPlaybackSpeed] = useState(2);
  const [montage, setMontage] = useState("referential");
  const [autoGain, setAutoGain] = useState(true);

  // Loading state
  const [isLoadingEEG, setIsLoadingEEG] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [loadError, setLoadError] = useState<{ message: string; url?: string; status?: number } | null>(null);

  // Meta + EEG data state
  const [meta, setMeta] = useState<CanonicalMeta | null>(null);
  const [durationSec, setDurationSec] = useState(0);
  const [loadedSeconds, setLoadedSeconds] = useState(0);
  
  // Streaming signals storage
  const signalsRef = useRef<number[][]>([]);
  const [signalsVersion, setSignalsVersion] = useState(0);
  
  const [channelLabels, setChannelLabels] = useState<string[]>([]);
  const [channelColors, setChannelColors] = useState<string[]>([]);
  const [unitMultipliers, setUnitMultipliers] = useState<number[]>([]);

  // Markers + Artifacts
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [artifactIntervals, setArtifactIntervals] = useState<ArtifactInterval[]>([]);
  const [newMarkerType, setNewMarkerType] = useState("event");
  const [newMarkerLabel, setNewMarkerLabel] = useState("");
  const [newMarkerNotes, setNewMarkerNotes] = useState("");

  // Channel Group Visibility
  const [visibleGroups, setVisibleGroups] = useState<Set<ChannelGroup>>(
    new Set(["frontal", "central", "temporal", "occipital", "other"]),
  );

  // Transformed data based on montage
  const eegData = useMemo(() => {
    if (!signalsRef.current.length || !channelLabels.length) return null;
    
    const signals = signalsRef.current;
    const sampleRate = meta?.sampling_rate_hz ?? 250;
    const duration = signals[0]?.length ? signals[0].length / sampleRate : 0;
    
    const transformed = applyMontage(signals, channelLabels, montage);
    return {
      signals: transformed.signals,
      channelLabels: transformed.labels,
      sampleRate,
      duration,
    };
  }, [channelLabels, montage, meta?.sampling_rate_hz, signalsVersion]);

  // Visible channels - fallback to ALL if standard filter returns empty
  const visibleChannels = useMemo(() => {
    if (!eegData) return new Set<number>();

    const standardIndices = filterStandardChannels(eegData.channelLabels);
    
    // FALLBACK: If no standard channels found, show ALL channels
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
    
    // FALLBACK: If group filtering returns empty, show ALL channels
    if (visible.size === 0) {
      return new Set(eegData.channelLabels.map((_, i) => i));
    }
    
    return visible;
  }, [eegData?.channelLabels, visibleGroups]);

  // Auto-gain computation
  useEffect(() => {
    if (!autoGain || !eegData || visibleChannels.size === 0) return;
    
    const startSample = Math.floor(currentTime * eegData.sampleRate);
    const endSample = Math.floor((currentTime + timeWindow) * eegData.sampleRate);
    
    const robustAmp = computeRobustAmplitude(eegData.signals, visibleChannels, startSample, endSample);
    if (robustAmp > 0) {
      // Target: amplitude fits nicely in channel height (~0.3 of channel height)
      const targetScale = 100 / robustAmp; // Scale to make 100uV reasonable
      setAmplitudeScale(Math.max(0.001, Math.min(1, targetScale * 0.01)));
    }
  }, [autoGain, eegData, visibleChannels, currentTime, timeWindow, signalsVersion]);

  /** Fetch meta */
  const fetchMeta = useCallback(async () => {
    const url = `${API_BASE}/studies/${encodeURIComponent(studyId)}/meta?root=.`;
    const res = await fetch(url, { headers: getHeaders() });
    const body = await res.text();
    if (!res.ok) {
      throw { message: `Meta fetch failed: HTTP ${res.status}`, url, status: res.status, body };
    }
    const json = JSON.parse(body);
    return (json.meta ?? json) as CanonicalMeta;
  }, [studyId]);

  /** Fetch chunk */
  const fetchChunk = useCallback(async (start: number, length: number) => {
    const url = `${API_BASE}/studies/${encodeURIComponent(studyId)}/chunk?root=.&start=${start}&length=${length}`;
    const res = await fetch(url, { headers: getHeaders() });
    const body = await res.text();
    if (!res.ok) {
      throw { message: `Chunk fetch failed: HTTP ${res.status}`, url, status: res.status, body };
    }
    return JSON.parse(body) as { n_channels: number; length: number; data_b64: string };
  }, [studyId]);

  /** Fetch artifact intervals */
  const fetchArtifacts = useCallback(async (): Promise<ArtifactInterval[]> => {
    try {
      const url = `${API_BASE}/studies/${encodeURIComponent(studyId)}/derivatives/artifact_intervals?root=.`;
      const res = await fetch(url, { headers: getHeaders() });
      if (res.ok) {
        const json = await res.json();
        return json.intervals ?? json ?? [];
      }
    } catch {
      // Fallback to local computation
    }
    return [];
  }, [studyId]);

  /** Load EEG with progressive streaming */
  const loadEEG = useCallback(async () => {
    setIsLoadingEEG(true);
    setIsStreaming(true);
    setLoadError(null);
    setMeta(null);
    signalsRef.current = [];
    setSignalsVersion(0);
    setChannelLabels([]);
    setMarkers([]);
    setArtifactIntervals([]);
    setCurrentTime(0);
    setIsPlaying(false);
    setLoadedSeconds(0);
    setDurationSec(0);

    try {
      // 1. Fetch meta
      toast.info("Loading meta...");
      const m = await fetchMeta();
      setMeta(m);

      const sampleRate = m.sampling_rate_hz ?? 250;
      const nSamplesTotal = m.n_samples ?? 0;
      const nChannels = m.n_channels ?? 0;

      if (!nSamplesTotal || !nChannels) {
        throw { message: "Meta missing n_samples or n_channels", url: `${API_BASE}/studies/${studyId}/meta` };
      }

      // Compute real duration
      const realDuration = nSamplesTotal / sampleRate;
      setDurationSec(realDuration);

      // Setup channel labels and units
      const labels = m.channel_map?.length
        ? m.channel_map.slice().sort((a, b) => a.index - b.index).map((c) => c.canonical_id)
        : Array.from({ length: nChannels }, (_, i) => `CH${i}`);
      
      const multipliers = m.channel_map?.length
        ? m.channel_map.slice().sort((a, b) => a.index - b.index).map((c) => getUnitMultiplier(c.unit))
        : Array.from({ length: nChannels }, () => 1);

      setChannelLabels(labels);
      setChannelColors(getChannelColors(nChannels));
      setUnitMultipliers(multipliers);

      // Pre-allocate signals
      signalsRef.current = Array.from({ length: nChannels }, () => []);

      toast.info(`Streaming ${Math.round(realDuration)}s of EEG...`);
      setIsLoadingEEG(false);

      // 2. Stream chunks
      const blockSamples = Math.floor(BLOCK_SECONDS * sampleRate);
      let lastUIUpdate = Date.now();

      for (let start = 0; start < nSamplesTotal; start += blockSamples) {
        const len = Math.min(blockSamples, nSamplesTotal - start);
        
        try {
          const chunk = await fetchChunk(start, len);
          const decoded = decodeFloat32B64(chunk.data_b64, chunk.n_channels, chunk.length);

          // Apply unit conversion and append to signals
          for (let ch = 0; ch < decoded.length && ch < signalsRef.current.length; ch++) {
            const mult = multipliers[ch] ?? 1;
            const converted = decoded[ch].map(v => v * mult);
            signalsRef.current[ch].push(...converted);
          }

          // Update UI periodically
          if (Date.now() - lastUIUpdate >= UI_UPDATE_INTERVAL_MS) {
            const loaded = signalsRef.current[0]?.length ?? 0;
            setLoadedSeconds(loaded / sampleRate);
            setSignalsVersion(v => v + 1);
            lastUIUpdate = Date.now();
          }
        } catch (e: any) {
          console.error("Chunk error:", e);
          // Continue loading other chunks
        }
      }

      // Final update
      const finalLoaded = signalsRef.current[0]?.length ?? 0;
      setLoadedSeconds(finalLoaded / sampleRate);
      setSignalsVersion(v => v + 1);

      // 3. Fetch or compute artifacts
      let artifacts = await fetchArtifacts();
      if (artifacts.length === 0) {
        artifacts = generateDeterministicArtifacts(signalsRef.current, sampleRate);
      }
      setArtifactIntervals(artifacts);

      // Add artifact start times as markers
      const artifactMarkers: Marker[] = artifacts.map((a, i) => ({
        id: `artifact-${i}`,
        timestamp_sec: a.start_sec,
        marker_type: "artifact",
        label: a.label || "Artifact",
        notes: `Duration: ${(a.end_sec - a.start_sec).toFixed(1)}s`,
      }));
      setMarkers(artifactMarkers);

      toast.success(`Loaded: ${labels.length}ch @ ${sampleRate}Hz (${Math.round(finalLoaded / sampleRate)}s)`);
    } catch (e: any) {
      console.error("Load error:", e);
      setLoadError({
        message: e?.message ?? "Failed to load EEG",
        url: e?.url,
        status: e?.status,
      });
      toast.error(e?.message ?? "Failed to load EEG");
    } finally {
      setIsLoadingEEG(false);
      setIsStreaming(false);
    }
  }, [fetchMeta, fetchChunk, fetchArtifacts, studyId]);

  /** Initial load */
  useEffect(() => {
    loadEEG();
  }, [loadEEG]);

  /** Playback loop - clamp to loadedSeconds */
  useEffect(() => {
    if (!isPlaying || !eegData) return;

    const maxSeekable = Math.max(0, loadedSeconds - timeWindow);

    const interval = setInterval(() => {
      setCurrentTime((prev) => {
        const next = prev + 0.1 * playbackSpeed;
        if (next >= maxSeekable) {
          setIsPlaying(false);
          return maxSeekable;
        }
        return next;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [isPlaying, eegData, timeWindow, playbackSpeed, loadedSeconds]);

  /** Controls */
  const handlePlayPause = () => setIsPlaying((prev) => !prev);

  const animateToTime = useCallback(
    (targetTime: number) => {
      if (!eegData) return;
      const maxSeekable = Math.max(0, loadedSeconds - timeWindow);
      const clamped = Math.max(0, Math.min(maxSeekable, targetTime));

      const startTime = currentTime;
      const startTs = performance.now();
      const dur = 300;

      const step = (ts: number) => {
        const p = Math.min((ts - startTs) / dur, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        setCurrentTime(startTime + (clamped - startTime) * eased);
        if (p < 1) requestAnimationFrame(step);
      };

      requestAnimationFrame(step);
    },
    [eegData, timeWindow, currentTime, loadedSeconds],
  );

  const handleSkipBackward = () => animateToTime(currentTime - 10);
  const handleSkipForward = () => animateToTime(currentTime + 10);

  const handleTimeClick = useCallback(
    (time: number) => {
      if (!eegData) return;
      const maxSeekable = Math.max(0, loadedSeconds - timeWindow);
      const clamped = Math.max(0, Math.min(maxSeekable, time - timeWindow / 2));
      setCurrentTime(clamped);
    },
    [eegData, timeWindow, loadedSeconds],
  );

  /** Marker ops (local) */
  const addMarker = () => {
    if (!eegData) return;
    const id = crypto.randomUUID();
    const m: Marker = {
      id,
      timestamp_sec: currentTime,
      marker_type: newMarkerType,
      label: newMarkerLabel || null,
      notes: newMarkerNotes || null,
    };
    setMarkers((prev) => [...prev, m].sort((a, b) => a.timestamp_sec - b.timestamp_sec));
    setNewMarkerLabel("");
    setNewMarkerNotes("");
    toast.success("Marker added");
  };

  const deleteMarker = (id: string) => {
    setMarkers((prev) => prev.filter((m) => m.id !== id));
    toast.success("Marker deleted");
  };

  const handleExport = useCallback(() => {
    const annotations = markers.map((m) => ({
      id: m.id,
      onset: m.timestamp_sec,
      duration: 1,
      type: m.marker_type,
      label: m.label,
      notes: m.notes,
    }));
    const blob = new Blob([JSON.stringify(annotations, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `eeg_annotations_${studyId}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Annotations exported as JSON");
  }, [markers, studyId]);

  /** Groups */
  const handleToggleGroup = (group: ChannelGroup) => {
    setVisibleGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };
  const handleSelectAllGroups = () => setVisibleGroups(new Set(["frontal", "central", "temporal", "occipital", "other"]));
  const handleDeselectAllGroups = () => setVisibleGroups(new Set());

  // Debug info
  const debugInfo = {
    duration: Math.round(durationSec),
    loaded: Math.round(loadedSeconds),
    channels: eegData?.channelLabels.length ?? 0,
    visible: visibleChannels.size,
    hasWarning: durationSec === 0 || loadedSeconds === 0 || (eegData?.channelLabels.length ?? 0) === 0,
  };

  const EEGViewerContent = ({ isModal = false }: { isModal?: boolean }) => (
    <div className={cn("relative w-full h-full", isModal ? "min-h-[60vh]" : "")}>
      {isLoadingEEG && !isStreaming ? (
        <div className="absolute inset-0 flex items-center justify-center bg-background">
          <div className="text-center space-y-3">
            <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
            <p className="text-sm text-muted-foreground">Loading meta...</p>
          </div>
        </div>
      ) : loadError ? (
        <div className="absolute inset-0 flex items-center justify-center bg-background p-4">
          <Card className="max-w-lg w-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5" />
                Failed to Load EEG
              </CardTitle>
              <CardDescription className="break-words">{loadError.message}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {loadError.url && (
                <div className="text-xs text-muted-foreground bg-muted p-2 rounded font-mono break-all">
                  URL: {loadError.url}
                </div>
              )}
              {loadError.status && (
                <Badge variant="destructive">HTTP {loadError.status}</Badge>
              )}
              <Button variant="outline" onClick={loadEEG} className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Retry
              </Button>
            </CardContent>
          </Card>
        </div>
      ) : eegData && eegData.signals.length > 0 ? (
        <WebGLEEGViewer
          signals={eegData.signals}
          channelLabels={eegData.channelLabels}
          sampleRate={eegData.sampleRate}
          currentTime={currentTime}
          timeWindow={timeWindow}
          amplitudeScale={amplitudeScale}
          visibleChannels={visibleChannels}
          theme={theme || "dark"}
          markers={markers}
          artifactIntervals={artifactIntervals}
          channelColors={channelColors}
          onTimeClick={handleTimeClick}
        />
      ) : isStreaming ? (
        <div className="absolute inset-0 flex items-center justify-center bg-background">
          <div className="text-center space-y-3">
            <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
            <p className="text-sm text-muted-foreground">
              Streaming: {Math.round(loadedSeconds)}s loaded...
            </p>
          </div>
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-muted-foreground">No EEG data available</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="h-[calc(100vh-4rem)] bg-background flex flex-col overflow-hidden">
      {/* Debug Banner */}
      <div className={cn(
        "px-3 py-1 text-xs font-mono flex items-center gap-4 border-b",
        debugInfo.hasWarning ? "bg-destructive/10 border-destructive/30 text-destructive" : "bg-muted/50 border-border/50 text-muted-foreground"
      )}>
        {debugInfo.hasWarning && <AlertTriangle className="h-3 w-3" />}
        <span>duration={debugInfo.duration}s</span>
        <span>loaded={debugInfo.loaded}s</span>
        <span>channels={debugInfo.channels}</span>
        <span>visible={debugInfo.visible}</span>
        <span className="ml-auto text-[10px] opacity-60">study={studyId}</span>
      </div>

      {/* Header */}
      <div className="border-b border-border/50 px-3 py-2 flex items-center gap-2 shrink-0">
        <Link to="/app">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>

        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-semibold truncate">EEG Viewer</h1>
          <p className="text-xs text-muted-foreground truncate">Study: {studyId}</p>
        </div>

        {eegData && (
          <div className="hidden sm:flex items-center gap-1">
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {eegData.channelLabels.length} Ch
            </Badge>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {eegData.sampleRate} Hz
            </Badge>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {Math.round(durationSec)}s
            </Badge>
            {isStreaming && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 animate-pulse">
                Streaming...
              </Badge>
            )}
          </div>
        )}

        {/* AutoGain Toggle */}
        <div className="hidden sm:flex items-center gap-2">
          <Label htmlFor="autogain" className="text-xs">AutoGain</Label>
          <Switch id="autogain" checked={autoGain} onCheckedChange={setAutoGain} />
        </div>

        {isMobile && (
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsMarkerPanelOpen(true)}>
            <Menu className="h-4 w-4" />
          </Button>
        )}

        {/* Channel Groups + Montage */}
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Layers className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>Channel groups & montage</TooltipContent>
          </Tooltip>

          <DropdownMenuContent align="end" className="w-56 p-2">
            <DropdownMenuLabel className="text-xs">Channel Groups</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {(["frontal", "central", "temporal", "occipital", "other"] as const).map((group) => (
              <DropdownMenuItem
                key={group}
                className="flex items-center justify-between cursor-pointer"
                onClick={(e) => {
                  e.preventDefault();
                  handleToggleGroup(group);
                }}
              >
                <span className="capitalize">{group}</span>
                <span className={cn("h-2 w-2 rounded-full", visibleGroups.has(group) ? "bg-primary" : "bg-muted")} />
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <div className="flex gap-2 px-2 py-1">
              <Button variant="ghost" size="sm" className="flex-1 text-xs" onClick={handleSelectAllGroups}>
                All
              </Button>
              <Button variant="ghost" size="sm" className="flex-1 text-xs" onClick={handleDeselectAllGroups}>
                None
              </Button>
            </div>

            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs">Montage</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {["referential", "bipolar_longitudinal", "bipolar_transverse"].map((m) => (
              <DropdownMenuItem
                key={m}
                className="cursor-pointer"
                onClick={() => setMontage(m)}
              >
                <span className={cn("mr-2", montage === m ? "text-primary" : "text-muted-foreground")}>
                  {montage === m ? "●" : "○"}
                </span>
                {m.replace(/_/g, " ")}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsFullscreenOpen(true)}>
              <Maximize2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Fullscreen</TooltipContent>
        </Tooltip>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Viewer */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 min-h-0">
            <EEGViewerContent />
          </div>

          {/* Controls */}
          {eegData && (
            <div className="shrink-0 p-3 border-t border-border/50">
              <EEGControls
                isPlaying={isPlaying}
                currentTime={currentTime}
                duration={Math.max(0, loadedSeconds - timeWindow)}
                timeWindow={timeWindow}
                amplitudeScale={amplitudeScale}
                playbackSpeed={playbackSpeed}
                onPlayPause={handlePlayPause}
                onTimeChange={setCurrentTime}
                onTimeWindowChange={setTimeWindow}
                onAmplitudeScaleChange={(s) => { setAutoGain(false); setAmplitudeScale(s); }}
                onPlaybackSpeedChange={setPlaybackSpeed}
                onSkipBackward={handleSkipBackward}
                onSkipForward={handleSkipForward}
                onExport={handleExport}
              />
            </div>
          )}
        </div>

        {/* Marker Panel (Desktop) */}
        {!isMobile && (
          <div className="w-72 border-l border-border/50 flex flex-col shrink-0">
            <div className="p-3 border-b border-border/50">
              <h3 className="text-sm font-medium">Markers & Events</h3>
              <p className="text-xs text-muted-foreground mt-1">
                {markers.length} markers • {artifactIntervals.length} artifacts
              </p>
            </div>

            <div className="flex-1 overflow-auto p-3 space-y-2">
              {markers.map((marker) => (
                <div
                  key={marker.id}
                  className={cn(
                    "p-2 rounded-md border cursor-pointer hover:bg-muted/50 transition-colors",
                    marker.marker_type === "artifact" ? "border-amber-500/50 bg-amber-500/5" : "border-border"
                  )}
                  onClick={() => handleTimeClick(marker.timestamp_sec)}
                >
                  <div className="flex items-center justify-between">
                    <Badge
                      variant={marker.marker_type === "seizure" ? "destructive" : marker.marker_type === "artifact" ? "secondary" : "outline"}
                      className="text-[10px]"
                    >
                      {marker.marker_type}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteMarker(marker.id);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  {marker.label && <p className="text-xs font-medium mt-1">{marker.label}</p>}
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {formatTime(marker.timestamp_sec)}
                  </p>
                </div>
              ))}
            </div>

            {/* Add Marker Form */}
            <div className="p-3 border-t border-border/50 space-y-2">
              <Select value={newMarkerType} onValueChange={setNewMarkerType}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="event">Event</SelectItem>
                  <SelectItem value="seizure">Seizure</SelectItem>
                  <SelectItem value="artifact">Artifact</SelectItem>
                  <SelectItem value="sleep">Sleep Stage</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder="Label (optional)"
                value={newMarkerLabel}
                onChange={(e) => setNewMarkerLabel(e.target.value)}
                className="h-8 text-xs"
              />
              <Textarea
                placeholder="Notes (optional)"
                value={newMarkerNotes}
                onChange={(e) => setNewMarkerNotes(e.target.value)}
                className="h-16 text-xs resize-none"
              />
              <Button size="sm" className="w-full" onClick={addMarker} disabled={!eegData}>
                Add Marker at {formatTime(currentTime)}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Fullscreen Dialog */}
      <Dialog open={isFullscreenOpen} onOpenChange={setIsFullscreenOpen}>
        <DialogContent className="max-w-[95vw] w-[95vw] h-[90vh] p-4">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>EEG Viewer - {studyId}</span>
              <Button variant="ghost" size="icon" onClick={() => setIsFullscreenOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0">
            <EEGViewerContent isModal />
          </div>
        </DialogContent>
      </Dialog>

      {/* Mobile Marker Panel */}
      <Dialog open={isMarkerPanelOpen} onOpenChange={setIsMarkerPanelOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Markers & Events</DialogTitle>
          </DialogHeader>
          <div className="max-h-[50vh] overflow-auto space-y-2">
            {markers.map((marker) => (
              <div
                key={marker.id}
                className="p-2 rounded-md border border-border cursor-pointer hover:bg-muted/50"
                onClick={() => {
                  handleTimeClick(marker.timestamp_sec);
                  setIsMarkerPanelOpen(false);
                }}
              >
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-[10px]">
                    {marker.marker_type}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">{formatTime(marker.timestamp_sec)}</span>
                </div>
                {marker.label && <p className="text-xs font-medium mt-1">{marker.label}</p>}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
