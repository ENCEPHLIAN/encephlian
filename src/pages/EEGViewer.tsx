import { useEffect, useMemo, useRef, useState } from "react";
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
const API_BASE =
  (import.meta.env.VITE_ENCEPH_READ_API_BASE as string | undefined);

const API_KEY =
  (import.meta.env.VITE_ENCEPH_READ_API_KEY as string | undefined);

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

/**
 * Canonical reorder.
 * We enforce: viewer lane i corresponds to meta.channel_map[i] (canonical order).
 * If channel_map is missing or invalid, we FAIL FAST.
 */
function reorderByChannelMap(signals: number[][], channel_map: Meta["channel_map"]): number[][] {
  if (!channel_map || channel_map.length !== signals.length) {
    throw new Error(`channel_map mismatch: map=${channel_map?.length ?? 0} signals=${signals.length}`);
  }
  const out: number[][] = new Array(channel_map.length);
  for (let i = 0; i < channel_map.length; i++) {
    const src = channel_map[i].index;
    if (!Number.isInteger(src) || src < 0 || src >= signals.length) {
      throw new Error(`Invalid channel_map[${i}].index=${src}`);
    }
    out[i] = signals[src];
  }
  return out;
}

async function fetchWithTimeout(url: string, init: RequestInit, ms = 15000) {
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
  const [signals, setSignals] = useState<number[][] | null>(null);

  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);

  const [currentTime, setCurrentTime] = useState(0);
  const [windowSec, setWindowSec] = useState(10);
  const [playing, setPlaying] = useState(false);

  // Raw must be viewable by default. No hidden gain tricks.
  const [amplitude, setAmplitude] = useState(1.0);
  const [showArtifacts, setShowArtifacts] = useState(true);
  const [suppressArtifacts, setSuppressArtifacts] = useState(false);

  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingChunk, setLoadingChunk] = useState(true);
  const [fatalError, setFatalError] = useState<string | null>(null);

  // Concurrency + caching
  const lastReqId = useRef(0);
  const hasPaintedOnce = useRef(false);
  const cacheRef = useRef<Map<string, number[][]>>(new Map());

  // Fetch window quantization to reduce thrash (0.5s is enough; faster == more network)
  const lastWindowStartQuant = useRef<number | null>(null);

  // Telemetry
  const lastFetchMs = useRef<number | null>(null);
  const lastFetchMode = useRef<"cache" | "net" | null>(null);

  /* ---------- META ---------- */
  useEffect(() => {
    let alive = true;

    if (!API_BASE || !API_KEY) {
      setFatalError(
        `Missing env vars. base=${String(API_BASE)} key=${API_KEY ? "present" : "missing"}.\n` +
          `Set VITE_ENCEPH_READ_API_BASE and VITE_ENCEPH_READ_API_KEY and redeploy.`,
      );
      setLoadingMeta(false);
      setLoadingChunk(false);
      return;
    }

    setLoadingMeta(true);
    setFatalError(null);

    fetchWithTimeout(`${API_BASE}/studies/${STUDY_ID}/meta?root=.`, { headers: authHeaders() }, 15000)
      .then((r) => {
        if (!r.ok) throw new Error(`meta ${r.status} ${r.statusText}`);
        return r.json();
      })
      .then((j) => {
        if (!alive) return;
        const m: Meta = j.meta ?? j;

        // FAIL FAST if map looks wrong (prevents “mixed channels” silently)
        if (!m.channel_map || m.channel_map.length !== m.n_channels) {
          throw new Error(`Bad meta.channel_map: length=${m.channel_map?.length ?? 0} n_channels=${m.n_channels}`);
        }
        setMeta(m);
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

  /* ---------- ARTIFACTS ---------- */
  useEffect(() => {
    if (!API_BASE || !API_KEY) return;
    fetchWithTimeout(`${API_BASE}/studies/${STUDY_ID}/artifacts?root=.`, { headers: authHeaders() }, 15000)
      .then((r) => (r.ok ? r.json() : { artifacts: [] }))
      .then((j) => setArtifacts(j.artifacts ?? []))
      .catch(() => setArtifacts([]));
  }, []);

  /* ---------- ANNOTATIONS ---------- */
  useEffect(() => {
    if (!API_BASE || !API_KEY) return;
    fetchWithTimeout(`${API_BASE}/studies/${STUDY_ID}/annotations?root=.`, { headers: authHeaders() }, 15000)
      .then((r) => (r.ok ? r.json() : { annotations: [] }))
      .then((j) => setAnnotations(j.annotations ?? []))
      .catch(() => setAnnotations([]));
  }, []);

  /* ---------- CHUNK FETCH (binary + cache + stable) ---------- */
  useEffect(() => {
    if (!API_BASE || !API_KEY || !meta) return;

    const fs = meta.sampling_rate_hz;
    const duration = meta.n_samples / fs;
    const maxT = Math.max(0, duration - windowSec);

    // clamp time deterministically
    const t0 = clamp(currentTime, 0, maxT);
    if (t0 !== currentTime) {
      setCurrentTime(t0);
      return;
    }

    // Quantize window start to reduce network churn
    const q = 0.5; // seconds
    const startSecQuant = Math.floor(t0 / q) * q;
    if (lastWindowStartQuant.current === startSecQuant && hasPaintedOnce.current) return;
    lastWindowStartQuant.current = startSecQuant;

    const start = Math.max(0, Math.floor(startSecQuant * fs));
    const length = Math.max(1, Math.floor(windowSec * fs));
    const k = keyFor(start, length);

    // cache hit: no flicker
    const cached = cacheRef.current.get(k);
    if (cached) {
      lastFetchMode.current = "cache";
      setSignals(cached);
      setLoadingChunk(false);
      hasPaintedOnce.current = true;
      return;
    }

    setLoadingChunk(true);
    lastFetchMode.current = "net";
    setFatalError(null);

    const reqId = ++lastReqId.current;
    const tStart = performance.now();

    fetchWithTimeout(
      `${API_BASE}/studies/${STUDY_ID}/chunk.bin?root=.&start=${start}&length=${length}`,
      { headers: authHeaders() },
      20000,
    )
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
        if (f32.length !== nCh * nSamp) {
          throw new Error(`Bad payload length: got ${f32.length}, expected ${nCh * nSamp}`);
        }

        const reshaped = reshapeF32ToChannels(f32, nCh, nSamp);
        const canonical = reorderByChannelMap(reshaped, meta.channel_map);

        cacheRef.current.set(k, canonical);
        setSignals(canonical);
        hasPaintedOnce.current = true;
        lastFetchMs.current = Math.round(performance.now() - tStart);
      })
      .catch((e) => {
        // fatal only if nothing ever painted
        if (!hasPaintedOnce.current) setFatalError(String(e));
      })
      .finally(() => {
        if (reqId === lastReqId.current) setLoadingChunk(false);
      });

    // Prefetch next window while playing
    if (playing) {
      const nextStart = start + length;
      const nextKey = keyFor(nextStart, length);
      if (!cacheRef.current.has(nextKey)) {
        fetchWithTimeout(
          `${API_BASE}/studies/${STUDY_ID}/chunk.bin?root=.&start=${nextStart}&length=${length}`,
          { headers: authHeaders() },
          20000,
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
            const reshaped = reshapeF32ToChannels(f32, x.nCh, x.nSamp);
            const canonical = reorderByChannelMap(reshaped, meta.channel_map);
            cacheRef.current.set(nextKey, canonical);
          })
          .catch(() => {});
      }
    }
  }, [meta, currentTime, windowSec, playing]);

  /* ---------- PLAYBACK ---------- */
  useEffect(() => {
    if (!playing || !meta) return;
    const fs = meta.sampling_rate_hz;
    const maxT = Math.max(0, meta.n_samples / fs - windowSec);

    // 10 Hz tick is smooth enough; fetching is quantized above.
    const id = setInterval(() => {
      setCurrentTime((t) => (t + 0.1 > maxT ? maxT : t + 0.1));
    }, 100);

    return () => clearInterval(id);
  }, [playing, meta, windowSec]);

  /* ---------- OVERLAYS (window-local) ---------- */
  const windowArtifacts = useMemo(() => {
    if (!showArtifacts) return [];
    return artifacts
      .filter((a) => a.end_sec > currentTime && a.start_sec < currentTime + windowSec)
      .map((a) => ({
        start_sec: a.start_sec - currentTime,
        end_sec: a.end_sec - currentTime,
        label: a.label,
        channel: a.channel,
      }));
  }, [artifacts, showArtifacts, currentTime, windowSec]);

  const windowMarkers = useMemo(() => {
    return annotations
      .filter((m) => m.start_sec >= currentTime && m.start_sec <= currentTime + windowSec)
      .map((m, idx) => ({
        id: `ann-${idx}`,
        timestamp_sec: m.start_sec - currentTime,
        marker_type: "event",
        label: m.label ?? "annotation",
      }));
  }, [annotations, currentTime, windowSec]);

  /* ---------- RENDER ---------- */
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

  return (
    <div className="h-full flex flex-col">
      <div className="p-2 flex flex-wrap gap-3 items-center border-b">
        <Badge>{meta.n_channels} ch</Badge>
        <Badge>{meta.sampling_rate_hz} Hz</Badge>
        {loadingChunk && <Badge variant="secondary">Loading…</Badge>}
        {lastFetchMode.current && <Badge variant="secondary">{lastFetchMode.current}</Badge>}
        {lastFetchMs.current != null && <Badge variant="secondary">{lastFetchMs.current}ms</Badge>}

        <Switch checked={showArtifacts} onCheckedChange={setShowArtifacts} />
        <span>Artifacts</span>

        <Switch checked={suppressArtifacts} onCheckedChange={setSuppressArtifacts} />
        <span>Suppress (visual)</span>
      </div>

      <EEGControls
        isPlaying={playing}
        onPlayPause={() => setPlaying((p) => !p)}
        currentTime={currentTime}
        duration={durationSec}
        onTimeChange={(t) => {
          lastWindowStartQuant.current = null; // force immediate fetch
          setCurrentTime(t);
        }}
        timeWindow={windowSec}
        onTimeWindowChange={(w) => {
          lastWindowStartQuant.current = null; // force immediate fetch
          setWindowSec(w);
        }}
        amplitudeScale={amplitude}
        onAmplitudeScaleChange={setAmplitude}
        playbackSpeed={1}
        onPlaybackSpeedChange={() => {}}
        onSkipBackward={() => {
          lastWindowStartQuant.current = null;
          setCurrentTime((t) => Math.max(0, t - windowSec));
        }}
        onSkipForward={() => {
          lastWindowStartQuant.current = null;
          setCurrentTime((t) => Math.min(t + windowSec, durationSec));
        }}
        onExport={() => {}}
      />

      <div className="flex-1">
        <WebGLEEGViewer
          signals={signals}
          channelLabels={meta.channel_map.map((c) => c.canonical_id)}
          sampleRate={meta.sampling_rate_hz}
          // IMPORTANT: window-local rendering
          currentTime={0}
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
