import { useEffect, useMemo, useRef, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { WebGLEEGViewer } from "@/components/eeg/WebGLEEGViewer";
import { EEGControls } from "@/components/eeg/EEGControls";
import { useTheme } from "next-themes";

const STUDY_ID = "TUH_CANON_001";
<<<<<<< HEAD
const API_BASE =
  (import.meta.env.VITE_ENCEPH_READ_API_BASE as string | undefined);

const API_KEY =
  (import.meta.env.VITE_ENCEPH_READ_API_KEY as string | undefined);

/* =======================
   TYPES
======================= */
=======
const API_BASE = import.meta.env.VITE_ENCEPH_READ_API_BASE as string | undefined;
const API_KEY = import.meta.env.VITE_ENCEPH_READ_API_KEY as string | undefined;

>>>>>>> d8a7d83 (fix(viewer): alias-free rendering + channel colors + readable grid)
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

function keyFor(start: number, length: number) {
  return `${start}:${length}`;
}

export default function EEGViewer() {
  const { theme } = useTheme();

  const [meta, setMeta] = useState<Meta | null>(null);
  const [signals, setSignals] = useState<number[][] | null>(null); // last good window
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);

  const [currentTime, setCurrentTime] = useState(0);
  const [windowSec, setWindowSec] = useState(10);
  const [playing, setPlaying] = useState(false);

  const [amplitude, setAmplitude] = useState(1.0);
  const [showArtifacts, setShowArtifacts] = useState(true);
  const [suppressArtifacts, setSuppressArtifacts] = useState(false);

  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingChunk, setLoadingChunk] = useState(true);
  const [fatalError, setFatalError] = useState<string | null>(null);

  const lastReqId = useRef(0);
  const hasPaintedOnce = useRef(false);

  // simple cache: window start/len -> signals
  const cacheRef = useRef<Map<string, number[][]>>(new Map());

  // quantize fetch start to reduce thrash (0.25s)
  const lastQuantRef = useRef<number | null>(null);

  useEffect(() => {
    if (!API_BASE || !API_KEY) {
      setFatalError(
        `Missing env vars. base=${String(API_BASE)} key=${API_KEY ? "present" : "missing"}.\n` +
          `Set VITE_ENCEPH_READ_API_BASE and VITE_ENCEPH_READ_API_KEY and redeploy.`,
      );
      setLoadingMeta(false);
      setLoadingChunk(false);
      return;
    }

    let alive = true;
    setLoadingMeta(true);
    setFatalError(null);

    fetchWithTimeout(`${API_BASE}/studies/${STUDY_ID}/meta?root=.`, { headers: authHeaders() }, 20000)
      .then((r) => {
        if (!r.ok) throw new Error(`meta ${r.status} ${r.statusText}`);
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

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!API_BASE || !API_KEY) return;
    fetchWithTimeout(`${API_BASE}/studies/${STUDY_ID}/artifacts?root=.`, { headers: authHeaders() }, 20000)
      .then((r) => (r.ok ? r.json() : { artifacts: [] }))
      .then((j) => setArtifacts(j.artifacts ?? []))
      .catch(() => setArtifacts([]));
  }, []);

  useEffect(() => {
    if (!API_BASE || !API_KEY) return;
    fetchWithTimeout(`${API_BASE}/studies/${STUDY_ID}/annotations?root=.`, { headers: authHeaders() }, 20000)
      .then((r) => (r.ok ? r.json() : { annotations: [] }))
      .then((j) => setAnnotations(j.annotations ?? []))
      .catch(() => setAnnotations([]));
  }, []);

  // fetch chunk.bin for current window
  useEffect(() => {
    if (!API_BASE || !API_KEY || !meta) return;

    const fs = meta.sampling_rate_hz;
    const duration = meta.n_samples / fs;
    const maxT = Math.max(0, duration - windowSec);

    const t0 = clamp(currentTime, 0, maxT);
    if (t0 !== currentTime) {
      setCurrentTime(t0);
      return;
    }

    // quantize fetch start
    const q = Math.floor(t0 * 4) / 4;
    if (lastQuantRef.current === q && hasPaintedOnce.current) return;
    lastQuantRef.current = q;

    const start = Math.max(0, Math.floor(q * fs));
    const length = Math.max(1, Math.floor(windowSec * fs));
    const k = keyFor(start, length);

    // cache hit
    const cached = cacheRef.current.get(k);
    if (cached) {
      setSignals(cached);
      setLoadingChunk(false);
      hasPaintedOnce.current = true;
      return;
    }

    // net fetch (do not blank signals)
    setLoadingChunk(true);
    const reqId = ++lastReqId.current;

    fetchWithTimeout(`${API_BASE}/studies/${STUDY_ID}/chunk.bin?root=.&start=${start}&length=${length}`, { headers: authHeaders() }, 20000)
      .then((r) => {
        if (!r.ok) throw new Error(`chunk.bin ${r.status} ${r.statusText}`);
        const nCh = Number(r.headers.get("x-eeg-nchannels"));
        const nSamp = Number(r.headers.get("x-eeg-length"));
        if (!Number.isFinite(nCh) || !Number.isFinite(nSamp)) {
          throw new Error("Missing x-eeg-* headers (CORS expose_headers or proxy stripping).");
        }
        return r.arrayBuffer().then((buf) => ({ buf, nCh, nSamp }));
      })
      .then(({ buf, nCh, nSamp }) => {
        if (reqId !== lastReqId.current) return;
        const f32 = new Float32Array(buf);
        if (f32.length !== nCh * nSamp) throw new Error(`Bad payload length: got ${f32.length}, expected ${nCh * nSamp}`);
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
  }, [meta, currentTime, windowSec]);

  // playback (smooth UI; fetch is quantized)
  useEffect(() => {
    if (!playing || !meta) return;

    const fs = meta.sampling_rate_hz;
    const maxT = Math.max(0, meta.n_samples / fs - windowSec);

    const id = setInterval(() => {
      setCurrentTime((t) => (t + 0.1 > maxT ? maxT : t + 0.1));
    }, 100);

    return () => clearInterval(id);
  }, [playing, meta, windowSec]);

  // display-only suppression (raw immutable)
  const viewSignals = useMemo(() => {
    if (!signals || !meta) return null;
    if (!suppressArtifacts) return signals;

    const fs = meta.sampling_rate_hz;
    return signals.map((ch, idx) =>
      ch.map((v, i) => {
        const t = currentTime + i / fs;
        const hit = artifacts.some((a) => (a.channel == null || a.channel === idx) && t >= a.start_sec && t <= a.end_sec);
        return hit ? v * 0.25 : v;
      }),
    );
  }, [signals, suppressArtifacts, artifacts, meta, currentTime]);

  if (fatalError) {
    return (
      <div className="h-full w-full p-4 space-y-2">
        <div className="text-sm font-semibold text-red-500">EEGViewer failed</div>
        <pre className="text-xs whitespace-pre-wrap break-words text-red-400">{fatalError}</pre>
      </div>
    );
  }

  if (loadingMeta || !meta || (!hasPaintedOnce.current && !signals)) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  const durationSec = meta.n_samples / meta.sampling_rate_hz;

  // WINDOW-LOCAL overlays
  const windowArtifacts =
    showArtifacts
      ? artifacts
          .filter((a) => a.end_sec > currentTime && a.start_sec < currentTime + windowSec)
          .map((a) => ({
            start_sec: a.start_sec - currentTime,
            end_sec: a.end_sec - currentTime,
            label: a.label,
            channel: a.channel,
          }))
      : [];

  const windowMarkers = annotations
    .filter((m) => m.start_sec >= currentTime && m.start_sec <= currentTime + windowSec)
    .map((m, idx) => ({
      id: `ann-${idx}`,
      timestamp_sec: m.start_sec - currentTime,
      marker_type: "event",
      label: m.label ?? "annotation",
    }));

  return (
    <div className="h-full flex flex-col">
      <div className="p-2 flex flex-wrap gap-3 items-center border-b">
        <Badge>{meta.n_channels} ch</Badge>
        <Badge>{meta.sampling_rate_hz} Hz</Badge>
        {loadingChunk ? <Badge variant="secondary">Loading…</Badge> : <Badge variant="secondary">OK</Badge>}

        <Switch checked={showArtifacts} onCheckedChange={setShowArtifacts} />
        <span>Artifacts</span>

        <Switch checked={suppressArtifacts} onCheckedChange={setSuppressArtifacts} />
        <span>Suppress</span>
      </div>

      <EEGControls
        isPlaying={playing}
        onPlayPause={() => setPlaying((p) => !p)}
        currentTime={currentTime}
        duration={durationSec}
        onTimeChange={(t) => {
          lastQuantRef.current = null;
          setCurrentTime(t);
        }}
        timeWindow={windowSec}
        onTimeWindowChange={(w) => {
          lastQuantRef.current = null;
          setWindowSec(w);
        }}
        amplitudeScale={amplitude}
        onAmplitudeScaleChange={setAmplitude}
        playbackSpeed={1}
        onPlaybackSpeedChange={() => {}}
        onSkipBackward={() => {
          lastQuantRef.current = null;
          setCurrentTime((t) => Math.max(0, t - windowSec));
        }}
        onSkipForward={() => {
          lastQuantRef.current = null;
          setCurrentTime((t) => Math.min(t + windowSec, durationSec));
        }}
        onExport={() => {}}
      />

      <div className="flex-1">
        <WebGLEEGViewer
          signals={viewSignals}
          channelLabels={meta.channel_map.map((c) => c.canonical_id)}
          sampleRate={meta.sampling_rate_hz}
          currentTime={0} // window-local rendering (renderer must not use global time)
          timeWindow={windowSec}
          amplitudeScale={amplitude}
          visibleChannels={new Set([...Array(meta.n_channels).keys()])}
          theme={theme ?? "dark"}
          markers={windowMarkers}
          artifactIntervals={windowArtifacts}
          showArtifactsAsRed={true}
        />
      </div>
    </div>
  );
}
