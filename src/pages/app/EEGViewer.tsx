import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { WebGLEEGViewer } from "@/components/eeg/WebGLEEGViewer";
import { EEGControls } from "@/components/eeg/EEGControls";
import { useTheme } from "next-themes";

/* =======================
   CONFIG — MVP LOCK
======================= */
const STUDY_ID = "TUH_CANON_001";
const API_BASE = import.meta.env.VITE_ENCEPH_READ_API_BASE as string | undefined;
const API_KEY = import.meta.env.VITE_ENCEPH_READ_API_KEY as string | undefined;

/* =======================
   TYPES
======================= */
type Meta = {
  n_channels: number;
  sampling_rate_hz: number;
  n_samples: number;
  channel_map: { index: number; canonical_id: string; unit: string }[];
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

/* =======================
   HELPERS
======================= */
function authHeaders() {
  return { "X-API-KEY": API_KEY ?? "" };
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function reshapeF32ToChannels(f32: Float32Array, nCh: number, nSamp: number): number[][] {
  const out: number[][] = Array.from({ length: nCh }, () => new Array(nSamp));
  for (let ch = 0; ch < nCh; ch++) {
    const base = ch * nSamp;
    for (let i = 0; i < nSamp; i++) out[ch][i] = f32[base + i];
  }
  return out;
}

async function fetchWithTimeout(url: string, init: RequestInit, ms = 20000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

/* =======================
   CHANNEL ORDERING
   Standard 10-20: FP1, FP2, F7... then aux, then photic/ref last
======================= */
const EEG_PRIORITY: string[] = [
  "FP1", "FP2", "F7", "F3", "FZ", "F4", "F8",
  "T7", "T3", "C3", "CZ", "C4", "T4", "T8",
  "P7", "T5", "P3", "PZ", "P4", "T6", "P8",
  "O1", "O2",
];

function normLabel(s: string) {
  return s.trim().toUpperCase().replace(/\s+/g, "");
}

function channelRank(label: string): number {
  const L = normLabel(label);

  // Photic/stim/trigger go last
  if (L.includes("PHOTIC") || L.includes("STIM") || L.includes("TRIGGER")) return 9000;
  if (L === "REF" || L.includes("REFERENCE")) return 9500;

  // Aux channels after EEG
  if (L.includes("EKG") || L.includes("ECG")) return 8000;
  if (L.includes("EMG")) return 8100;
  if (L.includes("EOG")) return 8200;
  if (L.includes("RESP") || L.includes("AIRFLOW")) return 8300;

  // Standard 10-20 priority
  const base = EEG_PRIORITY.indexOf(L);
  if (base >= 0) return base;

  // Scalp-like labels
  if (/^(FP|AF|F|FC|C|CP|P|PO|O|T)\d{1,2}$/.test(L)) return 200 + L.charCodeAt(0);

  // Unknown but before aux
  return 5000;
}

function keyFor(start: number, length: number) {
  return `${start}:${length}`;
}

/* =======================
   MAIN COMPONENT
======================= */
export default function EEGViewer() {
  const { theme } = useTheme();

  // Data state
  const [meta, setMeta] = useState<Meta | null>(null);
  const [signals, setSignals] = useState<number[][] | null>(null);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);

  // Playback state
  const [playheadSec, setPlayheadSec] = useState(0);
  const [windowStartSec, setWindowStartSec] = useState(0);
  const [windowSec, setWindowSec] = useState(10);
  const [playing, setPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  // Display state
  const [amplitude, setAmplitude] = useState(1.0);
  const [showArtifacts, setShowArtifacts] = useState(true);
  const [suppressArtifacts, setSuppressArtifacts] = useState(false);

  // Loading state
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingChunk, setLoadingChunk] = useState(false);
  const [fatalError, setFatalError] = useState<string | null>(null);

  // Refs for non-reactive state
  const lastReqId = useRef(0);
  const hasPaintedOnce = useRef(false);
  const cacheRef = useRef<Map<string, number[][]>>(new Map());
  const playheadRef = useRef(playheadSec);
  playheadRef.current = playheadSec;

  /* ---------- FETCH META ---------- */
  useEffect(() => {
    let alive = true;

    if (!API_BASE || !API_KEY) {
      setFatalError(
        `Missing env vars. Set VITE_ENCEPH_READ_API_BASE and VITE_ENCEPH_READ_API_KEY.`
      );
      setLoadingMeta(false);
      return;
    }

    setLoadingMeta(true);
    setFatalError(null);

    fetchWithTimeout(`${API_BASE}/studies/${STUDY_ID}/meta?root=.`, { headers: authHeaders() })
      .then((r) => {
        if (!r.ok) throw new Error(`meta ${r.status}`);
        return r.json();
      })
      .then((j) => {
        if (!alive) return;
        setMeta(j.meta ?? j);
      })
      .catch((e) => {
        if (!alive) return;
        setFatalError(String(e));
      })
      .finally(() => {
        if (alive) setLoadingMeta(false);
      });

    return () => { alive = false; };
  }, []);

  /* ---------- FETCH ARTIFACTS ---------- */
  useEffect(() => {
    if (!API_BASE || !API_KEY) return;
    fetchWithTimeout(`${API_BASE}/studies/${STUDY_ID}/artifacts?root=.`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : { artifacts: [] }))
      .then((j) => setArtifacts(j.artifacts ?? []))
      .catch(() => setArtifacts([]));
  }, []);

  /* ---------- FETCH ANNOTATIONS ---------- */
  useEffect(() => {
    if (!API_BASE || !API_KEY) return;
    fetchWithTimeout(`${API_BASE}/studies/${STUDY_ID}/annotations?root=.`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : { annotations: [] }))
      .then((j) => setAnnotations(j.annotations ?? []))
      .catch(() => setAnnotations([]));
  }, []);

  /* ---------- DERIVED VALUES ---------- */
  const durationSec = useMemo(() => {
    if (!meta) return 0;
    return meta.n_samples / meta.sampling_rate_hz;
  }, [meta]);

  /* ---------- CHANNEL ORDERING ---------- */
  const orderedChannelIndices = useMemo(() => {
    if (!meta) return [];
    const entries = meta.channel_map.map((c) => ({ idx: c.index, label: c.canonical_id }));
    entries.sort((a, b) => channelRank(a.label) - channelRank(b.label));
    return entries.map((e) => e.idx);
  }, [meta]);

  const orderedChannelLabels = useMemo(() => {
    if (!meta) return [];
    const map = new Map<number, string>(meta.channel_map.map((c) => [c.index, c.canonical_id]));
    return orderedChannelIndices.map((i) => map.get(i) ?? `Ch${i + 1}`);
  }, [meta, orderedChannelIndices]);

  /* ---------- WINDOW ALIGNMENT ---------- */
  useEffect(() => {
    if (!meta) return;
    const maxStart = Math.max(0, durationSec - windowSec);
    const p = clamp(playheadSec, 0, durationSec);

    // Clamp playhead
    if (p !== playheadSec) {
      setPlayheadSec(p);
      return;
    }

    // Keep playhead within visible window with guard band
    const GUARD = Math.min(1.0, windowSec * 0.1);
    if (p < windowStartSec + GUARD) {
      setWindowStartSec(clamp(p - GUARD, 0, maxStart));
    } else if (p > windowStartSec + windowSec - GUARD) {
      setWindowStartSec(clamp(p - (windowSec - GUARD), 0, maxStart));
    }
  }, [meta, playheadSec, windowStartSec, windowSec, durationSec]);

  /* ---------- CHUNK FETCHING ---------- */
  useEffect(() => {
    if (!API_BASE || !API_KEY || !meta) return;

    const fs = meta.sampling_rate_hz;
    const maxStart = Math.max(0, durationSec - windowSec);
    const startSec = clamp(windowStartSec, 0, maxStart);

    if (startSec !== windowStartSec) {
      setWindowStartSec(startSec);
      return;
    }

    const start = Math.max(0, Math.floor(startSec * fs));
    const length = Math.max(1, Math.floor(windowSec * fs));
    const k = keyFor(start, length);

    // Use cache if available
    const cached = cacheRef.current.get(k);
    if (cached) {
      setSignals(cached);
      setLoadingChunk(false);
      hasPaintedOnce.current = true;
      return;
    }

    // Fetch chunk
    setLoadingChunk(true);
    const reqId = ++lastReqId.current;

    fetchWithTimeout(
      `${API_BASE}/studies/${STUDY_ID}/chunk.bin?root=.&start=${start}&length=${length}`,
      { headers: authHeaders() }
    )
      .then((r) => {
        if (!r.ok) throw new Error(`chunk.bin ${r.status}`);
        const nCh = Number(r.headers.get("x-eeg-nchannels"));
        const nSamp = Number(r.headers.get("x-eeg-length"));
        if (!Number.isFinite(nCh) || !Number.isFinite(nSamp)) {
          throw new Error("Missing x-eeg-* headers");
        }
        return r.arrayBuffer().then((buf) => ({ buf, nCh, nSamp }));
      })
      .then(({ buf, nCh, nSamp }) => {
        if (reqId !== lastReqId.current) return;
        const f32 = new Float32Array(buf);
        if (f32.length !== nCh * nSamp) {
          throw new Error(`Bad payload: got ${f32.length}, expected ${nCh * nSamp}`);
        }
        const reshaped = reshapeF32ToChannels(f32, nCh, nSamp);
        cacheRef.current.set(k, reshaped);
        setSignals(reshaped);
        hasPaintedOnce.current = true;
      })
      .catch((e) => {
        if (!hasPaintedOnce.current) setFatalError(String(e));
      })
      .finally(() => {
        if (reqId === lastReqId.current) setLoadingChunk(false);
      });

    // Prefetch next 2 windows
    for (let i = 1; i <= 2; i++) {
      const pStart = start + i * length;
      const pk = keyFor(pStart, length);
      if (cacheRef.current.has(pk)) continue;

      fetchWithTimeout(
        `${API_BASE}/studies/${STUDY_ID}/chunk.bin?root=.&start=${pStart}&length=${length}`,
        { headers: authHeaders() }
      )
        .then((r) => {
          if (!r.ok) return null;
          const nCh = Number(r.headers.get("x-eeg-nchannels"));
          const nSamp = Number(r.headers.get("x-eeg-length"));
          if (!Number.isFinite(nCh) || !Number.isFinite(nSamp)) return null;
          return r.arrayBuffer().then((buf) => ({ buf, nCh, nSamp }));
        })
        .then((x) => {
          if (!x) return;
          const f32 = new Float32Array(x.buf);
          if (f32.length !== x.nCh * x.nSamp) return;
          cacheRef.current.set(pk, reshapeF32ToChannels(f32, x.nCh, x.nSamp));
        })
        .catch(() => {});
    }
  }, [meta, windowStartSec, windowSec, durationSec]);

  /* ---------- SMOOTH PLAYBACK VIA RAF ---------- */
  useEffect(() => {
    if (!playing || !meta) return;

    let rafId: number;
    let lastTime = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - lastTime) / 1000) * playbackSpeed;
      lastTime = now;

      setPlayheadSec((prev) => {
        const next = prev + dt;
        if (next >= durationSec) {
          setPlaying(false);
          return durationSec;
        }
        return next;
      });

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [playing, meta, durationSec, playbackSpeed]);

  /* ---------- COMPUTED WINDOW DATA ---------- */
  const localCursorSec = playheadSec - windowStartSec;

  const windowArtifacts = useMemo(() => {
    if (!showArtifacts) return [];
    return artifacts
      .filter((a) => a.end_sec > windowStartSec && a.start_sec < windowStartSec + windowSec)
      .map((a) => ({
        start_sec: Math.max(0, a.start_sec - windowStartSec),
        end_sec: Math.min(windowSec, a.end_sec - windowStartSec),
        label: a.label,
        channel: a.channel,
      }));
  }, [artifacts, showArtifacts, windowStartSec, windowSec]);

  const windowMarkers = useMemo(() => {
    return annotations
      .filter((m) => m.start_sec >= windowStartSec && m.start_sec <= windowStartSec + windowSec)
      .map((m, idx) => ({
        id: `ann-${idx}`,
        timestamp_sec: m.start_sec - windowStartSec,
        marker_type: "event",
        label: m.label ?? "annotation",
      }));
  }, [annotations, windowStartSec, windowSec]);

  /* ---------- HANDLERS ---------- */
  const handleTimeClick = useCallback((localT: number) => {
    const globalT = windowStartSec + localT;
    setPlaying(false);
    setPlayheadSec(clamp(globalT, 0, durationSec));
  }, [windowStartSec, durationSec]);

  const handleSeek = useCallback((t: number) => {
    setPlaying(false);
    setPlayheadSec(t);
    const maxStart = Math.max(0, durationSec - windowSec);
    setWindowStartSec(clamp(t - windowSec * 0.25, 0, maxStart));
  }, [durationSec, windowSec]);

  const handleSkipBackward = useCallback(() => {
    const t = Math.max(0, playheadRef.current - windowSec);
    handleSeek(t);
  }, [windowSec, handleSeek]);

  const handleSkipForward = useCallback(() => {
    const t = Math.min(durationSec, playheadRef.current + windowSec);
    handleSeek(t);
  }, [durationSec, windowSec, handleSeek]);

  /* ---------- RENDER ---------- */
  if (fatalError) {
    return (
      <div className="h-full w-full p-4 space-y-2">
        <div className="text-sm font-semibold text-destructive">EEGViewer Error</div>
        <pre className="text-xs whitespace-pre-wrap break-words text-muted-foreground">{fatalError}</pre>
      </div>
    );
  }

  if (loadingMeta || !meta || (!hasPaintedOnce.current && !signals)) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="p-2 flex flex-wrap gap-3 items-center border-b border-border">
        <Badge variant="outline">{meta.n_channels} ch</Badge>
        <Badge variant="outline">{meta.sampling_rate_hz} Hz</Badge>
        <Badge variant={loadingChunk ? "secondary" : "outline"}>
          {loadingChunk ? "Loading…" : "Ready"}
        </Badge>
        <Badge variant="secondary" className="font-mono text-xs">
          {playheadSec.toFixed(1)}s / {durationSec.toFixed(1)}s
        </Badge>

        <div className="flex items-center gap-2 ml-auto">
          <Switch checked={showArtifacts} onCheckedChange={setShowArtifacts} />
          <span className="text-sm text-muted-foreground">Artifacts</span>

          <Switch checked={suppressArtifacts} onCheckedChange={setSuppressArtifacts} />
          <span className="text-sm text-muted-foreground">Suppress</span>
        </div>
      </div>

      {/* Controls */}
      <EEGControls
        isPlaying={playing}
        onPlayPause={() => setPlaying((p) => !p)}
        currentTime={playheadSec}
        duration={durationSec}
        onTimeChange={handleSeek}
        timeWindow={windowSec}
        onTimeWindowChange={(w) => {
          setWindowSec(w);
          const maxStart = Math.max(0, durationSec - w);
          setWindowStartSec((s) => clamp(s, 0, maxStart));
        }}
        amplitudeScale={amplitude}
        onAmplitudeScaleChange={setAmplitude}
        playbackSpeed={playbackSpeed}
        onPlaybackSpeedChange={setPlaybackSpeed}
        onSkipBackward={handleSkipBackward}
        onSkipForward={handleSkipForward}
        onExport={() => {}}
      />

      {/* EEG Canvas */}
      <div className="flex-1 min-h-0">
        <WebGLEEGViewer
          signals={signals}
          channelLabels={orderedChannelLabels}
          channelIndexOrder={orderedChannelIndices}
          sampleRate={meta.sampling_rate_hz}
          currentTime={localCursorSec}
          timeWindow={windowSec}
          amplitudeScale={amplitude}
          visibleChannels={new Set(orderedChannelIndices)}
          theme={theme ?? "dark"}
          markers={windowMarkers}
          artifactIntervals={windowArtifacts}
          showArtifactsAsRed={showArtifacts}
          onTimeClick={handleTimeClick}
        />
      </div>
    </div>
  );
}
