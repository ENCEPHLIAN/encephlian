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
  (import.meta.env.VITE_ENCEPH_READ_API_BASE as string | undefined) ??
  "https://enceph-readapi--envfix102934.happywater-07f1abab.centralindia.azurecontainerapps.io";

const API_KEY =
  (import.meta.env.VITE_ENCEPH_READ_API_KEY as string | undefined) ?? "e3sg_bdNyNfP5LIaDP75Ko4d7JybGTJnMCCBNHgXMEM";

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

  /* ---------- STATE ---------- */
  const [meta, setMeta] = useState<Meta | null>(null);

  // Most recent successfully rendered window (never null after first paint)
  const [signals, setSignals] = useState<number[][] | null>(null);

  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);

  const [currentTime, setCurrentTime] = useState(0);
  const [windowSec, setWindowSec] = useState(10);
  const [playing, setPlaying] = useState(false);

  const [amplitude, setAmplitude] = useState(1.0); // RAW default
  const [showArtifacts, setShowArtifacts] = useState(true);

  // NOTE: suppression should NOT mutate signals. If you want suppression, do it as an overlay/visual effect later.
  const [suppressArtifacts, setSuppressArtifacts] = useState(false);

  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingChunk, setLoadingChunk] = useState(true);
  const [fatalError, setFatalError] = useState<string | null>(null);

  // Concurrency + caching
  const lastReqId = useRef(0);
  const hasPaintedOnce = useRef(false);

  // Simple bounded cache (avoid unbounded RAM blow-up)
  const cacheRef = useRef<Map<string, number[][]>>(new Map());
  const cacheKeysRef = useRef<string[]>([]);
  const CACHE_MAX = 24; // ~24 windows

  // Quantize fetch start to reduce thrash (0.25s steps)
  const lastQuantStart = useRef<number | null>(null);

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

  /* ---------- ARTIFACTS ---------- */
  useEffect(() => {
    if (!API_BASE || !API_KEY) return;

    fetchWithTimeout(`${API_BASE}/studies/${STUDY_ID}/artifacts?root=.`, { headers: authHeaders() }, 20000)
      .then((r) => (r.ok ? r.json() : { artifacts: [] }))
      .then((j) => setArtifacts(j.artifacts ?? []))
      .catch(() => setArtifacts([]));
  }, []);

  /* ---------- ANNOTATIONS ---------- */
  useEffect(() => {
    if (!API_BASE || !API_KEY) return;

    fetchWithTimeout(`${API_BASE}/studies/${STUDY_ID}/annotations?root=.`, { headers: authHeaders() }, 20000)
      .then((r) => (r.ok ? r.json() : { annotations: [] }))
      .then((j) => setAnnotations(j.annotations ?? []))
      .catch(() => setAnnotations([]));
  }, []);

  /* ---------- CHUNK FETCH (binary + cache + quantized) ---------- */
  useEffect(() => {
    if (!API_BASE || !API_KEY || !meta) return;

    const fs = meta.sampling_rate_hz;
    const duration = meta.n_samples / fs;
    const maxT = Math.max(0, duration - windowSec);

    // Clamp time deterministically
    const t0 = clamp(currentTime, 0, maxT);
    if (t0 !== currentTime) {
      setCurrentTime(t0);
      return;
    }

    // Quantize to reduce fetch thrash
    const q = Math.floor(t0 * 4) / 4; // 0.25s steps
    if (hasPaintedOnce.current && lastQuantStart.current === q) return;
    lastQuantStart.current = q;

    const start = Math.max(0, Math.floor(q * fs));
    const length = Math.max(1, Math.floor(windowSec * fs));
    const k = keyFor(start, length);

    const cached = cacheRef.current.get(k);
    if (cached) {
      lastFetchMode.current = "cache";
      setSignals(cached);
      setLoadingChunk(false);
      hasPaintedOnce.current = true;
      return;
    }

    // Network fetch: do NOT blank last frame
    setLoadingChunk(true);
    lastFetchMode.current = "net";

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
          throw new Error("Missing x-eeg headers (CORS expose_headers or proxy stripping).");
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

        // Cache insert (bounded)
        cacheRef.current.set(k, reshaped);
        cacheKeysRef.current.push(k);
        while (cacheKeysRef.current.length > CACHE_MAX) {
          const old = cacheKeysRef.current.shift();
          if (old) cacheRef.current.delete(old);
        }

        setSignals(reshaped);
        hasPaintedOnce.current = true;
        lastFetchMs.current = Math.round(performance.now() - tStart);
      })
      .catch((e) => {
        // Fatal only before first paint
        if (!hasPaintedOnce.current) setFatalError(String(e));
      })
      .finally(() => {
        if (reqId === lastReqId.current) setLoadingChunk(false);
      });

    // Prefetch next window during playback
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

            cacheRef.current.set(nextKey, reshaped);
            cacheKeysRef.current.push(nextKey);
            while (cacheKeysRef.current.length > CACHE_MAX) {
              const old = cacheKeysRef.current.shift();
              if (old) cacheRef.current.delete(old);
            }
          })
          .catch(() => {});
      }
    }
  }, [meta, currentTime, windowSec, playing]);

  /* ---------- PLAYBACK (smooth UI, fetch is quantized) ---------- */
  useEffect(() => {
    if (!playing || !meta) return;

    const fs = meta.sampling_rate_hz;
    const maxT = Math.max(0, meta.n_samples / fs - windowSec);

    // 60fps UI time progression (fetch stays quantized)
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;

      setCurrentTime((t) => {
        const next = t + dt;
        return next > maxT ? maxT : next;
      });

      raf = requestAnimationFrame(tick);
    };

    let raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, meta, windowSec]);

  /* ---------- WINDOW RELATIVE ARTIFACTS ---------- */
  const windowArtifacts = useMemo(() => {
    if (!showArtifacts) return [];
    const t0 = currentTime;
    const t1 = currentTime + windowSec;

    return artifacts
      .filter((a) => a.end_sec > t0 && a.start_sec < t1)
      .map((a) => ({
        start_sec: a.start_sec - t0, // window-relative
        end_sec: a.end_sec - t0, // window-relative
        label: a.label,
        channel: a.channel,
      }));
  }, [artifacts, currentTime, windowSec, showArtifacts]);

  /* ---------- MARKERS FROM ANNOTATIONS (if any) ---------- */
  const markers = useMemo(() => {
    if (!annotations || annotations.length === 0) return [];
    // render as absolute markers
    return annotations.map((a, idx) => ({
      id: `ann-${idx}`,
      timestamp_sec: a.start_sec,
      marker_type: "event",
      label: a.label ?? "annotation",
    }));
  }, [annotations]);

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
        {lastFetchMs.current != null && <Badge variant="secondary">{lastFetchMs.current}ms</Badge>}
        {lastFetchMode.current && <Badge variant="secondary">{lastFetchMode.current}</Badge>}

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
          lastQuantStart.current = null;
          setCurrentTime(t);
        }}
        timeWindow={windowSec}
        onTimeWindowChange={(w) => {
          lastQuantStart.current = null;
          setWindowSec(w);
        }}
        amplitudeScale={amplitude}
        onAmplitudeScaleChange={setAmplitude}
        playbackSpeed={1}
        onPlaybackSpeedChange={() => {}}
        onSkipBackward={() => {
          lastQuantStart.current = null;
          setCurrentTime((t) => Math.max(0, t - windowSec));
        }}
        onSkipForward={() => {
          lastQuantStart.current = null;
          setCurrentTime((t) => Math.min(t + windowSec, durationSec));
        }}
        onExport={() => {}}
      />

      <div className="flex-1">
        <WebGLEEGViewer
          signals={signals}
          channelLabels={meta.channel_map.map((c) => c.canonical_id)}
          sampleRate={meta.sampling_rate_hz}
          currentTime={currentTime}
          timeWindow={windowSec}
          amplitudeScale={amplitude}
          visibleChannels={new Set([...Array(meta.n_channels).keys()])}
          theme={theme ?? "dark"}
          markers={markers as any}
          artifactIntervals={windowArtifacts as any}
          showArtifactsAsRed={true}
          onTimeClick={(tAbs) => {
            lastQuantStart.current = null;
            setCurrentTime(tAbs);
          }}
        />
      </div>
    </div>
  );
}
