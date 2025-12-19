import { useEffect, useState, useCallback, useMemo } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { Loader2, ArrowLeft, Trash2, AlertCircle, Maximize2, Layers, X, Menu } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTheme } from "next-themes";
import { useIsMobile } from "@/hooks/use-mobile";

import { WebGLEEGViewer } from "@/components/eeg/WebGLEEGViewer";
import { EEGControls } from "@/components/eeg/EEGControls";
import { applyMontage } from "@/lib/eeg/montage-transforms";
import { ChannelGroup, groupChannels } from "@/lib/eeg/channel-groups";
import { filterStandardChannels } from "@/lib/eeg/standard-channels";
import { cn } from "@/lib/utils";

// Lovable sometimes doesn't inject Vite envs unless configured in project settings.
// So: read from Vite env first, then from window.__ENCEPH__ (optional), then hard fallback.
declare global {
  interface Window {
    __ENCEPH__?: { READ_API_BASE?: string; READ_API_KEY?: string };
  }
}

const API_BASE = (
  import.meta.env.VITE_ENCEPH_READ_API_BASE ||
  window.__ENCEPH__?.READ_API_BASE ||
  "https://graphic-occupation-shine-grades.trycloudflare.com"
)
  .trim()
  .replace(/\/+$/, "");

const API_KEY = import.meta.env.VITE_ENCEPH_READ_API_KEY || "e3sg-bdNyNfP5LIaDP75Ko4d7JybGTJnMCCBNHgXMEM";

/** Safety: keep viewer fast + deterministic UX */
const MAX_SECONDS_TO_LOAD = 600; // 10 minutes in-memory cap
const BLOCK_SECONDS = 30; // chunk fetch block size

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

  // Ensure aligned Float32 view
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const float32 = new Float32Array(buf);

  const out: number[][] = new Array(nChannels);
  for (let ch = 0; ch < nChannels; ch++) {
    const start = ch * nSamples;
    const seg = float32.subarray(start, start + nSamples);
    // convert to number[] for WebGLEEGViewer expectations
    out[ch] = Array.from(seg);
  }
  return out;
}

export default function EEGViewer() {
  const [searchParams] = useSearchParams();
  const isMobile = useIsMobile();
  const { theme } = useTheme();

  /** Study ID comes from query param. This is the canonical study id (e.g., NATUS_001, TUH_CANON_001) */
  const studyId = searchParams.get("studyId") || "NATUS_001";

  // UI State
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const [isMarkerPanelOpen, setIsMarkerPanelOpen] = useState(false);

  // Playback State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [timeWindow, setTimeWindow] = useState(60);
  const [amplitudeScale, setAmplitudeScale] = useState(0.1);
  const [playbackSpeed, setPlaybackSpeed] = useState(2);
  const [montage, setMontage] = useState("referential");

  // Loading state
  const [isLoadingEEG, setIsLoadingEEG] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Meta + EEG data state (canonical)
  const [meta, setMeta] = useState<CanonicalMeta | null>(null);
  const [rawEegData, setRawEegData] = useState<{
    signals: number[][];
    channelLabels: string[];
    sampleRate: number;
    duration: number;
  } | null>(null);

  // Local markers (no Supabase dependency here)
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [newMarkerType, setNewMarkerType] = useState("event");
  const [newMarkerLabel, setNewMarkerLabel] = useState("");
  const [newMarkerNotes, setNewMarkerNotes] = useState("");

  // Channel Group Visibility
  const [visibleGroups, setVisibleGroups] = useState<Set<ChannelGroup>>(
    new Set(["frontal", "central", "temporal", "occipital"]),
  );

  // Transformed data based on montage
  const eegData = rawEegData
    ? (() => {
        const transformed = applyMontage(rawEegData.signals, rawEegData.channelLabels, montage);
        return { ...rawEegData, signals: transformed.signals, channelLabels: transformed.labels };
      })()
    : null;

  // Visible channels (memoized)
  const visibleChannels = useMemo(() => {
    if (!eegData) return new Set<number>();

    const standardIndices = filterStandardChannels(eegData.channelLabels);
    const standardLabels = standardIndices.map((i) => eegData.channelLabels[i]);
    const groups = groupChannels(standardLabels);

    const visible = new Set<number>();
    groups.forEach((localIndices, group) => {
      if (visibleGroups.has(group)) {
        localIndices.forEach((localIdx) => visible.add(standardIndices[localIdx]));
      }
    });
    return visible;
  }, [eegData?.channelLabels, visibleGroups]);

  /** === Read API fetchers === */
  const fetchMeta = useCallback(async (sid: string) => {
    if (!API_BASE) throw new Error("VITE_ENCEPH_READ_API_BASE is not set");
    const url = `${API_BASE}/studies/${encodeURIComponent(sid)}/meta?root=.`;
    const res = await fetch(url, { headers: getHeaders() });
    const body = await res.text();
    if (!res.ok) throw new Error(`Meta HTTP ${res.status}: ${body}`);
    const json = JSON.parse(body);
    return (json.meta ?? json) as CanonicalMeta;
  }, []);

  const fetchChunk = useCallback(async (sid: string, start: number, length: number) => {
    if (!API_BASE) throw new Error("VITE_ENCEPH_READ_API_BASE is not set");
    const url = `${API_BASE}/studies/${encodeURIComponent(sid)}/chunk?root=.&start=${start}&length=${length}`;
    const res = await fetch(url, { headers: getHeaders() });
    const body = await res.text();
    if (!res.ok) throw new Error(`Chunk HTTP ${res.status}: ${body}`);
    return JSON.parse(body) as { n_channels: number; length: number; data_b64: string };
  }, []);

  /** === Load EEG from Read API (canonical) === */
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoadingEEG(true);
      setLoadError(null);
      setMeta(null);
      setRawEegData(null);
      setMarkers([]);
      setCurrentTime(0);
      setIsPlaying(false);

      try {
        toast.info("Loading canonical meta...");
        const m = await fetchMeta(studyId);
        if (cancelled) return;

        setMeta(m);

        const sampleRate = m.sampling_rate_hz ?? 250;
        const nSamplesTotal = m.n_samples ?? 0;

        const channelLabels = m.channel_map?.length
          ? m.channel_map
              .slice()
              .sort((a, b) => a.index - b.index)
              .map((c) => c.canonical_id)
          : Array.from({ length: m.n_channels ?? 0 }, (_, i) => `CH${i}`);

        const maxSamples = Math.min(nSamplesTotal, Math.floor(MAX_SECONDS_TO_LOAD * sampleRate));
        const blockSamples = Math.max(1, Math.floor(BLOCK_SECONDS * sampleRate));

        if (!nSamplesTotal || !m.n_channels) {
          throw new Error("Meta missing n_samples / n_channels");
        }

        toast.info(`Loading canonical signal (up to ${Math.round(maxSamples / sampleRate)}s)...`);

        // Pre-allocate numeric arrays by channel (number[]), append blocks
        const signals: number[][] = Array.from({ length: m.n_channels }, () => []);

        for (let start = 0; start < maxSamples; start += blockSamples) {
          if (cancelled) return;

          const len = Math.min(blockSamples, maxSamples - start);
          const chunk = await fetchChunk(studyId, start, len);

          // Decode: returns [n_channels][len] number[][]
          const decoded = decodeFloat32B64(chunk.data_b64, chunk.n_channels, chunk.length);

          // Append into signals
          for (let ch = 0; ch < decoded.length; ch++) {
            signals[ch].push(...decoded[ch]);
          }
        }

        if (cancelled) return;

        const duration = signals[0]?.length ? signals[0].length / sampleRate : 0;

        setRawEegData({
          signals,
          channelLabels,
          sampleRate,
          duration,
        });

        toast.success(`Loaded: ${channelLabels.length}ch @ ${sampleRate}Hz (${Math.round(duration)}s)`);
      } catch (e: any) {
        if (cancelled) return;
        console.error(e);
        setLoadError(e?.message ?? "Failed to load canonical EEG");
        toast.error(e?.message ?? "Failed to load canonical EEG");
      } finally {
        if (!cancelled) setIsLoadingEEG(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [studyId, fetchMeta, fetchChunk]);

  /** Playback loop */
  useEffect(() => {
    if (!isPlaying || !eegData) return;

    const interval = setInterval(() => {
      setCurrentTime((prev) => {
        const next = prev + 0.1 * playbackSpeed;
        if (next >= eegData.duration - timeWindow) {
          setIsPlaying(false);
          return Math.max(0, eegData.duration - timeWindow);
        }
        return next;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [isPlaying, eegData, timeWindow, playbackSpeed]);

  /** Controls */
  const handlePlayPause = () => setIsPlaying((prev) => !prev);

  const animateToTime = useCallback(
    (targetTime: number) => {
      if (!eegData) return;
      const clamped = Math.max(0, Math.min(eegData.duration - timeWindow, targetTime));

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
    [eegData, timeWindow, currentTime],
  );

  const handleSkipBackward = () => animateToTime(currentTime - 10);
  const handleSkipForward = () => animateToTime(currentTime + 10);

  const handleTimeClick = useCallback(
    (time: number) => {
      if (!eegData) return;
      const clamped = Math.max(0, Math.min(eegData.duration - timeWindow, time - timeWindow / 2));
      setCurrentTime(clamped);
    },
    [eegData, timeWindow],
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
  const handleSelectAllGroups = () => setVisibleGroups(new Set(["frontal", "central", "temporal", "occipital"]));
  const handleDeselectAllGroups = () => setVisibleGroups(new Set());

  const EEGViewerContent = ({ isModal = false }: { isModal?: boolean }) => (
    <div className={cn("relative w-full h-full", isModal ? "min-h-[60vh]" : "")}>
      {isLoadingEEG ? (
        <div className="absolute inset-0 flex items-center justify-center bg-background">
          <div className="text-center space-y-3">
            <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
            <p className="text-sm text-muted-foreground">Loading canonical EEG...</p>
          </div>
        </div>
      ) : loadError ? (
        <div className="absolute inset-0 flex items-center justify-center bg-background p-4">
          <Card className="max-w-md w-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5" />
                Failed to Load EEG
              </CardTitle>
              <CardDescription className="break-words">{loadError}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="text-xs text-muted-foreground">Ensure Read API is reachable and env vars are set.</div>
              <Button variant="outline" onClick={() => window.location.reload()}>
                Retry
              </Button>
            </CardContent>
          </Card>
        </div>
      ) : eegData ? (
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
          onTimeClick={handleTimeClick}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-muted-foreground">No EEG data available</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="h-[calc(100vh-4rem)] bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-border/50 px-3 py-2 flex items-center gap-2 shrink-0">
        <Link to="/app">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>

        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-semibold truncate">EEG Viewer</h1>
          <p className="text-xs text-muted-foreground truncate">Canonical study: {studyId}</p>
        </div>

        {eegData && (
          <div className="hidden sm:flex items-center gap-1">
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {eegData.channelLabels.length} Ch
            </Badge>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {eegData.sampleRate} Hz
            </Badge>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 hidden md:inline-flex">
              {Math.round(eegData.duration)}s
            </Badge>
          </div>
        )}

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
            {(["frontal", "central", "temporal", "occipital"] as const).map((group) => (
              <DropdownMenuItem
                key={group}
                className="flex items-center justify-between cursor-pointer"
                onClick={(e) => {
                  e.preventDefault();
                  handleToggleGroup(group);
                }}
              >
                <span className="capitalize">{group}</span>
                <div
                  className={cn(
                    "h-3 w-3 rounded-full border",
                    visibleGroups.has(group)
                      ? "bg-primary border-primary"
                      : "bg-transparent border-muted-foreground/50",
                  )}
                />
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSelectAllGroups} className="text-xs">
              Show All
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleDeselectAllGroups} className="text-xs">
              Hide All
            </DropdownMenuItem>

            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs">Montage</DropdownMenuLabel>
            {["referential", "bipolar-longitudinal", "bipolar-transverse"].map((m) => (
              <DropdownMenuItem
                key={m}
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setMontage(m)}
              >
                <span className="text-xs capitalize">{m.replace(/-/g, " ")}</span>
                {montage === m && <div className="h-2 w-2 rounded-full bg-primary" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Main */}
      <div className="flex-1 flex overflow-hidden">
        {/* EEG Canvas */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="border-b border-border/50 p-2 shrink-0 overflow-x-auto">
            <EEGControls
              isPlaying={isPlaying}
              currentTime={currentTime}
              duration={eegData?.duration || 0}
              timeWindow={timeWindow}
              amplitudeScale={amplitudeScale}
              playbackSpeed={playbackSpeed}
              onPlayPause={handlePlayPause}
              onSkipBackward={handleSkipBackward}
              onSkipForward={handleSkipForward}
              onTimeWindowChange={setTimeWindow}
              onAmplitudeScaleChange={setAmplitudeScale}
              onPlaybackSpeedChange={setPlaybackSpeed}
              onTimeChange={setCurrentTime}
              onExport={handleExport}
            />
          </div>

          <div className="flex-1 relative">
            <EEGViewerContent />
            <button
              onClick={() => setIsFullscreenOpen(true)}
              className={cn(
                "absolute z-30 h-10 w-10 rounded-xl flex items-center justify-center",
                "bg-background/30 backdrop-blur-md",
                "border border-white/10 dark:border-white/5",
                "shadow-lg shadow-black/10 dark:shadow-black/20",
                "hover:bg-background/50 hover:scale-105",
                "transition-all duration-300 ease-out",
                isMobile ? "bottom-2 right-2" : "bottom-3 right-3",
              )}
            >
              <Maximize2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Right sidebar markers (desktop) */}
        {!isMobile && (
          <div className="w-56 lg:w-64 border-l border-border/50 p-3 overflow-y-auto shrink-0">
            <h3 className="font-semibold text-sm mb-3">Markers</h3>

            <div className="space-y-2 mb-4 p-3 bg-muted/30 rounded-lg">
              <Select value={newMarkerType} onValueChange={setNewMarkerType}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="event">Event</SelectItem>
                  <SelectItem value="spike">Spike</SelectItem>
                  <SelectItem value="seizure">Seizure</SelectItem>
                  <SelectItem value="artifact">Artifact</SelectItem>
                </SelectContent>
              </Select>

              <Input
                placeholder="Label..."
                value={newMarkerLabel}
                onChange={(e) => setNewMarkerLabel(e.target.value)}
                className="h-8 text-xs"
              />
              <Textarea
                placeholder="Notes..."
                value={newMarkerNotes}
                onChange={(e) => setNewMarkerNotes(e.target.value)}
                className="text-xs min-h-[50px]"
              />

              <Button size="sm" className="w-full h-8 text-xs" onClick={addMarker}>
                Add at {currentTime.toFixed(1)}s
              </Button>
            </div>

            <div className="space-y-2">
              {markers.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No markers</p>
              ) : (
                markers.map((m) => (
                  <div
                    key={m.id}
                    className="p-2 bg-muted/30 rounded cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => handleTimeClick(m.timestamp_sec)}
                  >
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="text-[10px]">
                        {m.marker_type}
                      </Badge>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-muted-foreground">{m.timestamp_sec.toFixed(1)}s</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteMarker(m.id);
                          }}
                        >
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    {m.label && <p className="text-xs font-medium mt-1">{m.label}</p>}
                    {m.notes && <p className="text-[10px] text-muted-foreground mt-0.5">{m.notes}</p>}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Mobile markers modal */}
      <Dialog open={isMarkerPanelOpen} onOpenChange={setIsMarkerPanelOpen}>
        <DialogContent className="max-w-sm max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Markers</DialogTitle>
          </DialogHeader>

          <div className="space-y-2 mb-4 p-3 bg-muted/30 rounded-lg">
            <Select value={newMarkerType} onValueChange={setNewMarkerType}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="event">Event</SelectItem>
                <SelectItem value="spike">Spike</SelectItem>
                <SelectItem value="seizure">Seizure</SelectItem>
                <SelectItem value="artifact">Artifact</SelectItem>
              </SelectContent>
            </Select>

            <Input
              placeholder="Label..."
              value={newMarkerLabel}
              onChange={(e) => setNewMarkerLabel(e.target.value)}
              className="h-8 text-xs"
            />

            <Button size="sm" className="w-full h-8 text-xs" onClick={addMarker}>
              Add at {currentTime.toFixed(1)}s
            </Button>
          </div>

          <div className="space-y-2">
            {markers.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No markers</p>
            ) : (
              markers.map((m) => (
                <div
                  key={m.id}
                  className="p-2 bg-muted/30 rounded cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => {
                    handleTimeClick(m.timestamp_sec);
                    setIsMarkerPanelOpen(false);
                  }}
                >
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-[10px]">
                      {m.marker_type}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">{m.timestamp_sec.toFixed(1)}s</span>
                  </div>
                  {m.label && <p className="text-xs font-medium mt-1">{m.label}</p>}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Fullscreen modal */}
      <Dialog open={isFullscreenOpen} onOpenChange={setIsFullscreenOpen}>
        <DialogContent
          className={cn(
            "p-0 rounded-2xl overflow-hidden",
            "bg-background/95 backdrop-blur-2xl",
            "border border-border/20",
            "shadow-2xl shadow-black/30",
            isMobile ? "max-w-[98vw] max-h-[95vh] w-[98vw] h-[92vh]" : "max-w-[94vw] max-h-[90vh] w-[94vw] h-[88vh]",
            "[&>button]:hidden",
          )}
        >
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/20 bg-background/50">
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-medium truncate">Canonical {studyId}</h2>
                <p className="text-xs text-muted-foreground">
                  {eegData ? `${eegData.channelLabels.length} channels • ${eegData.sampleRate}Hz` : ""}
                </p>
              </div>

              <div className="flex items-center gap-1.5 mr-3">
                <button
                  className="h-6 w-6 rounded border border-border/30 bg-background/50 hover:bg-muted/50 flex items-center justify-center transition-all duration-150"
                  onMouseDown={() => {
                    setAmplitudeScale(Math.max(0.001, amplitudeScale - 0.001));
                    const interval = setInterval(() => setAmplitudeScale((p) => Math.max(0.001, p - 0.001)), 80);
                    const cleanup = () => {
                      clearInterval(interval);
                      window.removeEventListener("mouseup", cleanup);
                    };
                    window.addEventListener("mouseup", cleanup);
                  }}
                  title="Decrease amplitude"
                >
                  <span className="text-xs">−</span>
                </button>

                <span className="text-[10px] font-mono text-muted-foreground min-w-[48px] text-center">
                  {amplitudeScale.toFixed(3)}x
                </span>

                <button
                  className="h-6 w-6 rounded border border-border/30 bg-background/50 hover:bg-muted/50 flex items-center justify-center transition-all duration-150"
                  onMouseDown={() => {
                    setAmplitudeScale(amplitudeScale + 0.001);
                    const interval = setInterval(() => setAmplitudeScale((p) => p + 0.001), 80);
                    const cleanup = () => {
                      clearInterval(interval);
                      window.removeEventListener("mouseup", cleanup);
                    };
                    window.addEventListener("mouseup", cleanup);
                  }}
                  title="Increase amplitude"
                >
                  <span className="text-xs">+</span>
                </button>
              </div>

              <button
                onClick={() => setIsFullscreenOpen(false)}
                className="h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 transition-colors"
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 relative bg-background/80 backdrop-blur-sm">
              <EEGViewerContent isModal />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
