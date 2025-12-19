import { useEffect, useMemo, useRef, useState, useCallback } from "react";
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
import { Loader2, ArrowLeft, Trash2, AlertCircle, Maximize2, Layers, X, Menu, Wand2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTheme } from "next-themes";
import { useIsMobile } from "@/hooks/use-mobile";

import { WebGLEEGViewer } from "@/components/eeg/WebGLEEGViewer";
import { EEGControls } from "@/components/eeg/EEGControls";
import { applyMontage } from "@/lib/eeg/montage-transforms";
import { ChannelGroup, groupChannels } from "@/lib/eeg/channel-groups";
import { filterStandardChannels } from "@/lib/eeg/standard-channels";
import { cn } from "@/lib/utils";

/**
 * ENV NOTE:
 * Lovable sometimes doesn't inject Vite envs unless configured in project settings.
 * So: read from Vite env first, then window.__ENCEPH__ (optional), then hard fallback.
 */
declare global {
  interface Window {
    __ENCEPH__?: { READ_API_BASE?: string; READ_API_KEY?: string };
  }
}

const API_BASE = (
  import.meta.env.VITE_ENCEPH_READ_API_BASE ||
  window.__ENCEPH__?.READ_API_BASE ||
  // 🔥 set this to your *current* trycloudflare URL
  "https://drops-patch-crucial-differential.trycloudflare.com"
)
  .trim()
  .replace(/\/+$/, "");

const API_KEY = import.meta.env.VITE_ENCEPH_READ_API_KEY || window.__ENCEPH__?.READ_API_KEY || ""; // can be empty if your Read-API doesn't require it

/** Deterministic viewer caps */
const MAX_SECONDS_TO_STREAM = 60 * 60; // 1 hour max streamed into memory (bump if needed)
const BLOCK_SECONDS = 10; // chunk fetch block size (smaller = more responsive UI)

type CanonicalMeta = {
  study_id: string;
  n_channels: number;
  sampling_rate_hz: number;
  n_samples: number;
  channel_map?: Array<{
    index: number;
    canonical_id: string;
    original_label: string;
    unit?: string;
  }>;
};

type Marker = {
  id: string;
  timestamp_sec: number;
  marker_type: string; // event|spike|seizure|artifact|...
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

  // Ensure aligned Float32 view
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

/** Unit -> microvolt scaling (for TUH vs other sources) */
function unitToMicroVoltFactor(unit?: string) {
  const u = (unit || "").trim().toLowerCase();
  if (!u) return 1;
  if (u === "uv" || u === "µv" || u.includes("microvolt")) return 1;
  if (u === "mv" || u.includes("millivolt")) return 1e3;
  if (u === "v" || u.includes("volt")) return 1e6;
  if (u.includes("uv") || u.includes("µv")) return 1;
  return 1;
}

function applyUnitScalePerChannel(decoded: number[][], channelUnits: (string | undefined)[]) {
  for (let ch = 0; ch < decoded.length; ch++) {
    const f = unitToMicroVoltFactor(channelUnits[ch]);
    if (f !== 1) {
      const arr = decoded[ch];
      for (let i = 0; i < arr.length; i++) arr[i] = arr[i] * f;
    }
  }
}

/** Deterministic UUID fallback */
function uid() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

/** robust percentile helper (small arrays only) */
function percentile(sorted: number[], p: number) {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/** simple deterministic artifact heuristic: mark window as artifact if huge abs or strong HF energy */
function computeArtifactIntervalsHeuristic(
  signals: number[][],
  sampleRate: number,
  secondsPerBlock = 1,
): ArtifactInterval[] {
  if (!signals.length || !signals[0]?.length) return [];
  const n = signals[0].length;
  const block = Math.max(1, Math.floor(secondsPerBlock * sampleRate));

  // Thresholds in microvolts
  const ABS_UV = 800; // eye-blink / movement / electrode pop can exceed this
  const HF_RMS_UV = 80; // rough; adjust later

  const intervals: ArtifactInterval[] = [];
  let inBad = false;
  let badStart = 0;

  for (let start = 0; start < n; start += block) {
    const end = Math.min(n, start + block);

    let maxAbs = 0;
    let hfRmsAccum = 0;
    let hfCount = 0;

    // compute over a small subset of channels for speed (first 8 or all if <8)
    const chCount = Math.min(8, signals.length);
    for (let ch = 0; ch < chCount; ch++) {
      const x = signals[ch];

      // abs
      for (let i = start; i < end; i++) {
        const v = Math.abs(x[i] || 0);
        if (v > maxAbs) maxAbs = v;
      }

      // HF proxy: first-diff energy
      let s = 0;
      for (let i = start + 1; i < end; i++) {
        const d = (x[i] || 0) - (x[i - 1] || 0);
        s += d * d;
      }
      const rms = Math.sqrt(s / Math.max(1, end - start));
      hfRmsAccum += rms;
      hfCount += 1;
    }

    const hfRms = hfCount ? hfRmsAccum / hfCount : 0;
    const bad = maxAbs >= ABS_UV || hfRms >= HF_RMS_UV;

    if (bad && !inBad) {
      inBad = true;
      badStart = start;
    } else if (!bad && inBad) {
      inBad = false;
      intervals.push({
        start_sec: badStart / sampleRate,
        end_sec: end / sampleRate,
        label: "artifact",
      });
    }
  }

  if (inBad) {
    intervals.push({
      start_sec: badStart / sampleRate,
      end_sec: n / sampleRate,
      label: "artifact",
    });
  }

  // merge overlaps
  const merged: ArtifactInterval[] = [];
  for (const it of intervals) {
    const last = merged[merged.length - 1];
    if (!last || it.start_sec > last.end_sec + 0.25) merged.push({ ...it });
    else last.end_sec = Math.max(last.end_sec, it.end_sec);
  }
  return merged;
}

/** Convert artifact intervals to "marker" events (for now) */
function intervalsToMarkers(intervals: ArtifactInterval[]): Marker[] {
  return intervals.map((it) => ({
    id: uid(),
    timestamp_sec: it.start_sec,
    marker_type: "artifact",
    label: it.label || "artifact",
    notes: `${it.start_sec.toFixed(1)}s → ${it.end_sec.toFixed(1)}s`,
  }));
}

export default function EEGViewer() {
  const [searchParams] = useSearchParams();
  const isMobile = useIsMobile();
  const { theme } = useTheme();

  // ✅ TUH only — still allow query param override, but default is TUH_CANON_001.
  const studyId = (searchParams.get("studyId") || "TUH_CANON_001").trim();

  // UI State
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const [isMarkerPanelOpen, setIsMarkerPanelOpen] = useState(false);

  // Playback State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [timeWindow, setTimeWindow] = useState(20); // default smaller window = more readable
  const [amplitudeScale, setAmplitudeScale] = useState(0.2);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [montage, setMontage] = useState("referential");

  // Toggles
  const [autoGain, setAutoGain] = useState(true);
  const [artifactSuppression, setArtifactSuppression] = useState(false);

  // Loading state
  const [isLoadingEEG, setIsLoadingEEG] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Meta + EEG data state
  const [meta, setMeta] = useState<CanonicalMeta | null>(null);
  const [rawEegData, setRawEegData] = useState<{
    signals: number[][];
    channelLabels: string[];
    sampleRate: number;
    duration: number;
    loadedSeconds: number; // progressive loading indicator
  } | null>(null);

  // Markers (local)
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [newMarkerType, setNewMarkerType] = useState("event");
  const [newMarkerLabel, setNewMarkerLabel] = useState("");
  const [newMarkerNotes, setNewMarkerNotes] = useState("");

  // Artifact intervals (from API or heuristic)
  const [artifactIntervals, setArtifactIntervals] = useState<ArtifactInterval[]>([]);

  // Channel Group Visibility
  const [visibleGroups, setVisibleGroups] = useState<Set<ChannelGroup>>(
    new Set(["frontal", "central", "temporal", "occipital"]),
  );

  // Pointer interval for +/- buttons
  const ampIntervalRef = useRef<number | null>(null);
  const clearAmpInterval = useCallback(() => {
    if (ampIntervalRef.current) {
      window.clearInterval(ampIntervalRef.current);
      ampIntervalRef.current = null;
    }
  }, []);

  // ===== Read API fetchers =====
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

  // Optional: artifact intervals endpoint (if your Read-API implements it)
  const fetchArtifactIntervals = useCallback(async (sid: string) => {
    try {
      const url = `${API_BASE}/studies/${encodeURIComponent(sid)}/derivatives/artifact_intervals?root=.`;
      const res = await fetch(url, { headers: getHeaders() });
      if (!res.ok) return null;
      const json = await res.json();
      // expect either {intervals:[...]} or [...]
      const intervals = (json.intervals ?? json) as ArtifactInterval[];
      if (!Array.isArray(intervals)) return null;
      return intervals
        .filter((x) => typeof x.start_sec === "number" && typeof x.end_sec === "number")
        .map((x) => ({ start_sec: x.start_sec, end_sec: x.end_sec, label: x.label || "artifact" }));
    } catch {
      return null;
    }
  }, []);

  // ===== Load EEG (progressive streaming) =====
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoadingEEG(true);
      setLoadError(null);
      setMeta(null);
      setRawEegData(null);
      setMarkers([]);
      setArtifactIntervals([]);
      setCurrentTime(0);
      setIsPlaying(false);

      try {
        toast.info("Loading TUH meta…");

        const m = await fetchMeta(studyId);
        if (cancelled) return;
        setMeta(m);

        const sampleRate = m.sampling_rate_hz ?? 250;
        const nSamplesTotal = m.n_samples ?? 0;

        if (!m.n_channels || !nSamplesTotal) {
          throw new Error("Meta missing n_channels / n_samples");
        }

        const channelLabels = m.channel_map?.length
          ? m.channel_map
              .slice()
              .sort((a, b) => a.index - b.index)
              .map((c) => c.canonical_id)
          : Array.from({ length: m.n_channels }, (_, i) => `CH${i + 1}`);

        const channelUnits = m.channel_map?.length
          ? m.channel_map
              .slice()
              .sort((a, b) => a.index - b.index)
              .map((c) => c.unit)
          : Array.from({ length: m.n_channels }, () => "uV");

        const durationFull = nSamplesTotal / sampleRate;
        const maxSamples = Math.min(nSamplesTotal, Math.floor(MAX_SECONDS_TO_STREAM * sampleRate));
        const blockSamples = Math.max(1, Math.floor(BLOCK_SECONDS * sampleRate));

        // Pre-allocate progressively-growing arrays
        const signals: number[][] = Array.from({ length: m.n_channels }, () => []);
        const durationTarget = maxSamples / sampleRate;

        setRawEegData({
          signals,
          channelLabels,
          sampleRate,
          duration: durationFull, // ✅ show real duration in UI
          loadedSeconds: 0,
        });

        // Try artifact intervals from API (optional)
        const apiIntervals = await fetchArtifactIntervals(studyId);
        if (!cancelled && apiIntervals && apiIntervals.length) {
          setArtifactIntervals(apiIntervals);
          setMarkers((prev) => {
            // keep user markers + add artifact markers
            const artMarkers = intervalsToMarkers(apiIntervals);
            const merged = [...prev, ...artMarkers].sort((a, b) => a.timestamp_sec - b.timestamp_sec);
            return merged;
          });
        }

        toast.success(`Meta OK: ${m.n_channels}ch @ ${sampleRate}Hz • ${Math.round(durationFull)}s`);

        // Stream chunks progressively
        toast.info(`Streaming signals… (showing immediately; loading up to ${Math.round(durationTarget)}s)`);

        let lastUiUpdate = 0;

        for (let start = 0; start < maxSamples; start += blockSamples) {
          if (cancelled) return;

          const len = Math.min(blockSamples, maxSamples - start);
          const chunk = await fetchChunk(studyId, start, len);

          const decoded = decodeFloat32B64(chunk.data_b64, chunk.n_channels, chunk.length);
          applyUnitScalePerChannel(decoded, channelUnits);

          // Optional artifact suppression: if enabled + we have intervals, we can suppress within this chunk
          if (artifactSuppression && artifactIntervals.length) {
            const chunkStartSec = start / sampleRate;
            const chunkEndSec = (start + len) / sampleRate;

            // Find intervals overlapping chunk
            const overlaps = artifactIntervals.filter((it) => it.start_sec < chunkEndSec && it.end_sec > chunkStartSec);

            if (overlaps.length) {
              for (const it of overlaps) {
                const s = Math.max(0, Math.floor((it.start_sec - chunkStartSec) * sampleRate));
                const e = Math.min(len, Math.ceil((it.end_sec - chunkStartSec) * sampleRate));
                for (let ch = 0; ch < decoded.length; ch++) {
                  for (let i = s; i < e; i++) decoded[ch][i] = 0;
                }
              }
            }
          }

          // Append into signals
          for (let ch = 0; ch < decoded.length; ch++) {
            signals[ch].push(...decoded[ch]);
          }

          const loadedSec = signals[0].length / sampleRate;

          // UI refresh throttling
          const now = performance.now();
          if (now - lastUiUpdate > 250 || loadedSec - lastUiUpdate > 2) {
            lastUiUpdate = now;
            if (cancelled) return;

            setRawEegData((prev) => {
              if (!prev) return prev;
              // keep reference to same signals array (already mutated) but update loadedSeconds
              return {
                ...prev,
                signals,
                loadedSeconds: loadedSec,
              };
            });

            // If we didn't get artifact intervals from API, compute heuristic progressively after first 30s loaded
            if (!apiIntervals && loadedSec >= 30 && artifactIntervals.length === 0) {
              const heuristic = computeArtifactIntervalsHeuristic(signals, sampleRate, 1);
              setArtifactIntervals(heuristic);
              setMarkers((prev) => {
                const artMarkers = intervalsToMarkers(heuristic);
                const merged = [...prev.filter((m) => m.marker_type !== "artifact"), ...artMarkers].sort(
                  (a, b) => a.timestamp_sec - b.timestamp_sec,
                );
                return merged;
              });
            }
          }
        }

        if (cancelled) return;

        // Final heuristic if needed
        if (!apiIntervals && artifactIntervals.length === 0) {
          const heuristic = computeArtifactIntervalsHeuristic(signals, sampleRate, 1);
          setArtifactIntervals(heuristic);
          setMarkers((prev) => {
            const artMarkers = intervalsToMarkers(heuristic);
            const merged = [...prev.filter((m) => m.marker_type !== "artifact"), ...artMarkers].sort(
              (a, b) => a.timestamp_sec - b.timestamp_sec,
            );
            return merged;
          });
        }

        toast.success("Streaming complete.");
      } catch (e: any) {
        if (cancelled) return;
        console.error(e);
        setLoadError(e?.message ?? "Failed to load TUH_CANON_001");
        toast.error(e?.message ?? "Failed to load TUH_CANON_001");
      } finally {
        if (!cancelled) setIsLoadingEEG(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [studyId, fetchMeta, fetchChunk, fetchArtifactIntervals, artifactSuppression, artifactIntervals.length]);

  // Transformed data based on montage
  const eegData = useMemo(() => {
    if (!rawEegData) return null;
    const transformed = applyMontage(rawEegData.signals, rawEegData.channelLabels, montage);
    return {
      ...rawEegData,
      signals: transformed.signals,
      channelLabels: transformed.labels,
    };
  }, [rawEegData, montage]);

  // Visible channels (IMPORTANT: TUH may not match your standard list → fallback to show all)
  const visibleChannels = useMemo(() => {
    if (!eegData) return new Set<number>();

    const standardIndices = filterStandardChannels(eegData.channelLabels);
    if (!standardIndices || standardIndices.length === 0) {
      // ✅ TUH-safe fallback
      return new Set<number>(Array.from({ length: eegData.channelLabels.length }, (_, i) => i));
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
      return new Set<number>(Array.from({ length: eegData.channelLabels.length }, (_, i) => i));
    }

    return visible;
  }, [eegData?.channelLabels, visibleGroups, eegData]);

  // AutoGain: compute robust scale from current visible window
  useEffect(() => {
    if (!autoGain || !eegData) return;
    const sr = eegData.sampleRate;
    const start = Math.max(0, Math.floor(currentTime * sr));
    const end = Math.min(eegData.signals[0].length, Math.floor((currentTime + timeWindow) * sr));
    if (end - start < sr) return;

    const vis = Array.from(visibleChannels);
    const takeCh = vis.slice(0, Math.min(vis.length, 8));
    const vals: number[] = [];

    for (const ch of takeCh) {
      const x = eegData.signals[ch];
      // sample sparsely for speed
      const step = Math.max(1, Math.floor((end - start) / 500));
      for (let i = start; i < end; i += step) vals.push(Math.abs(x[i] || 0));
    }

    vals.sort((a, b) => a - b);
    const p95 = percentile(vals, 0.95); // microvolts
    if (!isFinite(p95) || p95 <= 0) return;

    // map p95 to a nice visual height → viewer uses "amplitudeScale" as multiplier
    // this is empirical; tweak later if needed.
    const target = 120; // want p95 to roughly occupy ~120uV visually
    const newScale = Math.max(0.01, Math.min(5, target / p95)) * 0.2;

    // avoid jitter
    setAmplitudeScale((prev) => (Math.abs(prev - newScale) > 0.02 ? newScale : prev));
  }, [autoGain, eegData, currentTime, timeWindow, visibleChannels]);

  // Playback loop (do not play past loaded region)
  useEffect(() => {
    if (!isPlaying || !eegData) return;

    const interval = setInterval(() => {
      setCurrentTime((prev) => {
        const next = prev + 0.1 * playbackSpeed;
        const loadedLimit = rawEegData?.loadedSeconds ?? 0;
        const hardEnd = Math.max(0, Math.min(eegData.duration - timeWindow, loadedLimit - timeWindow));

        if (next >= hardEnd) {
          setIsPlaying(false);
          return Math.max(0, hardEnd);
        }
        return next;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [isPlaying, eegData, timeWindow, playbackSpeed, rawEegData?.loadedSeconds]);

  const handlePlayPause = () => setIsPlaying((p) => !p);

  const animateToTime = useCallback(
    (targetTime: number) => {
      if (!eegData) return;

      const loadedLimit = rawEegData?.loadedSeconds ?? 0;
      const maxSeek = Math.max(0, Math.min(eegData.duration - timeWindow, loadedLimit - timeWindow));
      const clamped = Math.max(0, Math.min(maxSeek, targetTime));

      const startTime = currentTime;
      const startTs = performance.now();
      const dur = 250;

      const step = (ts: number) => {
        const p = Math.min((ts - startTs) / dur, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        setCurrentTime(startTime + (clamped - startTime) * eased);
        if (p < 1) requestAnimationFrame(step);
      };

      requestAnimationFrame(step);
    },
    [eegData, timeWindow, currentTime, rawEegData?.loadedSeconds],
  );

  const handleSkipBackward = () => animateToTime(currentTime - 10);
  const handleSkipForward = () => animateToTime(currentTime + 10);

  const handleTimeClick = useCallback(
    (time: number) => {
      if (!eegData) return;
      const loadedLimit = rawEegData?.loadedSeconds ?? 0;
      const maxSeek = Math.max(0, Math.min(eegData.duration - timeWindow, loadedLimit - timeWindow));
      const clamped = Math.max(0, Math.min(maxSeek, time - timeWindow / 2));
      setCurrentTime(clamped);
    },
    [eegData, timeWindow, rawEegData?.loadedSeconds],
  );

  const addMarker = () => {
    if (!eegData) return;
    const m: Marker = {
      id: uid(),
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
    a.download = `annotations_${studyId}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Annotations exported");
  }, [markers, studyId]);

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
            <p className="text-sm text-muted-foreground">Streaming TUH_CANON_001…</p>
            {rawEegData && meta && (
              <p className="text-xs text-muted-foreground">
                Loaded {Math.round(rawEegData.loadedSeconds)}s / {Math.round(meta.n_samples / meta.sampling_rate_hz)}s
              </p>
            )}
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
              <div className="text-xs text-muted-foreground">
                Read-API must be running locally and the tunnel URL must be current.
              </div>
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
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 hidden md:inline-flex">
              {Math.round(eegData.duration)}s
            </Badge>
            {rawEegData && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                loaded {Math.round(rawEegData.loadedSeconds)}s
              </Badge>
            )}
          </div>
        )}

        {isMobile && (
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsMarkerPanelOpen(true)}>
            <Menu className="h-4 w-4" />
          </Button>
        )}

        {/* Channel groups + montage */}
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Layers className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>Groups, montage, toggles</TooltipContent>
          </Tooltip>

          <DropdownMenuContent align="end" className="w-64 p-2">
            <DropdownMenuLabel className="text-xs">Toggles</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="flex items-center justify-between cursor-pointer"
              onClick={() => setAutoGain((p) => !p)}
            >
              <span className="text-xs flex items-center gap-2">
                <Wand2 className="h-3.5 w-3.5" /> AutoGain
              </span>
              <div
                className={cn(
                  "h-3 w-3 rounded-full border",
                  autoGain ? "bg-primary border-primary" : "border-muted-foreground/50",
                )}
              />
            </DropdownMenuItem>

            <DropdownMenuItem
              className="flex items-center justify-between cursor-pointer"
              onClick={() => setArtifactSuppression((p) => !p)}
            >
              <span className="text-xs">Artifact suppression</span>
              <div
                className={cn(
                  "h-3 w-3 rounded-full border",
                  artifactSuppression ? "bg-primary border-primary" : "border-muted-foreground/50",
                )}
              />
            </DropdownMenuItem>

            <DropdownMenuSeparator />
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
        {/* EEG canvas */}
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
              onAmplitudeScaleChange={(v) => {
                setAutoGain(false);
                setAmplitudeScale(v);
              }}
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
                placeholder="Label…"
                value={newMarkerLabel}
                onChange={(e) => setNewMarkerLabel(e.target.value)}
                className="h-8 text-xs"
              />
              <Textarea
                placeholder="Notes…"
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
              placeholder="Label…"
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
          <div
            className="flex flex-col h-full"
            onPointerUp={clearAmpInterval}
            onPointerCancel={clearAmpInterval}
            onPointerLeave={clearAmpInterval}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/20 bg-background/50">
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-medium truncate">{studyId}</h2>
                <p className="text-xs text-muted-foreground">
                  {eegData ? `${eegData.channelLabels.length} channels • ${eegData.sampleRate}Hz` : ""}
                </p>
              </div>

              {/* Smooth amplitude buttons (no glitch) */}
              <div className="flex items-center gap-1.5 mr-3">
                <button
                  className="h-6 w-6 rounded border border-border/30 bg-background/50 hover:bg-muted/50 flex items-center justify-center transition-all duration-150 text-muted-foreground hover:text-foreground active:scale-95"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    setAutoGain(false);
                    setAmplitudeScale((p) => Math.max(0.01, p - 0.02));
                    clearAmpInterval();
                    ampIntervalRef.current = window.setInterval(() => {
                      setAmplitudeScale((p) => Math.max(0.01, p - 0.02));
                    }, 60);
                  }}
                  title="Decrease amplitude"
                >
                  <span className="text-xs">−</span>
                </button>

                <span className="text-[10px] font-mono text-muted-foreground min-w-[58px] text-center">
                  {amplitudeScale.toFixed(3)}x
                </span>

                <button
                  className="h-6 w-6 rounded border border-border/30 bg-background/50 hover:bg-muted/50 flex items-center justify-center transition-all duration-150 text-muted-foreground hover:text-foreground active:scale-95"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    setAutoGain(false);
                    setAmplitudeScale((p) => Math.min(10, p + 0.02));
                    clearAmpInterval();
                    ampIntervalRef.current = window.setInterval(() => {
                      setAmplitudeScale((p) => Math.min(10, p + 0.02));
                    }, 60);
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
