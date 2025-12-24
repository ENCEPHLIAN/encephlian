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

/* =======================
   HELPERS
======================= */
function authHeaders() {
  return { "X-API-KEY": API_KEY ?? "" };
}

function reshapeF32ToChannels(f32: Float32Array, nCh: number, nSamp: number): number[][] {
  const out: number[][] = Array.from({ length: nCh }, () => new Array(nSamp));
  for (let ch = 0; ch < nCh; ch++) {
    const base = ch * nSamp;
    for (let i = 0; i < nSamp; i++) out[ch][i] = f32[base + i];
  }
  return out;
}

async function fetchWithTimeout(url: string, init: RequestInit, ms = 45000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function keyFor(start: number, length: number) {
  return `${start}:${length}`;
}

/* =======================
   COMPONENT
======================= */
export default function EEGViewer() {
  const { theme } = useTheme();

  /* ---------- STATE ---------- */
  const [meta, setMeta] = useState<Meta | null>(null);

  // IMPORTANT: signals shown on screen (do NOT blank on every fetch)
  const [signals, setSignals] = useState<number[][] | null>(null);

  const [artifacts, setArtifacts] = useState<Artifact[]>([]);

  const [currentTime, setCurrentTime] = useState(0);
  const [windowSec, setWindowSec] = useState(10);
  const [playing, setPlaying] = useState(false);

  const [amplitude, setAmplitude] = useState(1.0);
  const [showArtifacts, setShowArtifacts] = useState(true);
  const [suppressArtifacts, setSuppressArtifacts] = useState(false);

  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingChunk, setLoadingChunk] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Cache + concurrency control
  const cacheRef = useRef<Map<string, number[][]>>(new Map());
  const lastReqId = useRef(0);

  // Throttle: only fetch when window start moves meaningfully (0.25s)
  const lastFetchStartSec = useRef<number | null>(null);

  // Track last fetch stats for debugging
  const lastLatencyMs = useRef<number | null>(null);
  const lastCacheHit = useRef<boolean>(false);
  const lastStartLen = useRef<{ start: number; length: number } | null>(null);

  // After first paint, never full-screen spinner again
  const hasPaintedOnce = useRef(false);

  /* ---------- CONFIG CHECK ---------- */
  useEffect(() => {
    if (!API_BASE || !API_KEY) {
      setError(
        `Missing env vars. base=${String(API_BASE)} key=${API_KEY ? "present" : "missing"}.\n` +
          `Set VITE_ENCEPH_READ_API_BASE and VITE_ENCEPH_READ_API_KEY and redeploy.`,
      );
      setLoadingMeta(false);
      setLoadingChunk(false);
    }
  }, []);

  /* ---------- LOAD META ---------- */
  useEffect(() => {
    if (!API_BASE || !API_KEY) return;

    let alive = true;
    setLoadingMeta(true);
    setError(null);

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
        setError(String(e));
      })
      .finally(() => {
        if (alive) setLoadingMeta(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  /* ---------- LOAD ARTIFACTS (NON-BLOCKING) ---------- */
  useEffect(() => {
    if (!API_BASE || !API_KEY) return;

    fetchWithTimeout(`${API_BASE}/studies/${STUDY_ID}/artifacts?root=.`, { headers: authHeaders() }, 20000)
      .then((r) => (r.ok ? r.json() : { artifacts: [] }))
      .then((j) => setArtifacts(j.artifacts ?? []))
      .catch(() => setArtifacts([]));
  }, []);

  /* ---------- FETCH CHUNK (BINARY + CACHE + THROTTLE) ---------- */
  useEffect(() => {
    if (!API_BASE || !API_KEY || !meta) return;

    const fs = meta.sampling_rate_hz;
    const maxT = Math.max(0, meta.n_samples / fs - windowSec);

    // Clamp time deterministically
    const t0 = clamp(currentTime, 0, maxT);
    if (t0 !== currentTime) {
      setCurrentTime(t0);
      return; // let next render run with clamped time
    }

    // Throttle: only fetch when window start changes by >= 0.25s
    const startSecQuant = Math.floor(t0 * 4) / 4;
    if (lastFetchStartSec.current === startSecQuant) {
      // no new window start; do not fetch (prevents churn)
      return;
    }
    lastFetchStartSec.current = startSecQuant;

    const start = Math.max(0, Math.floor(startSecQuant * fs));
    const length = Math.max(1, Math.floor(windowSec * fs));
    lastStartLen.current = { start, length };

    const k = keyFor(start, length);
    const cached = cacheRef.current.get(k);
    if (cached) {
      lastCacheHit.current = true;
      setSignals(cached);
      setLoadingChunk(false);
      hasPaintedOnce.current = true;
    } else {
      lastCacheHit.current = false;
      // Non-blocking: we keep old signals on screen; just show a badge
      setLoadingChunk(true);

      const reqId = ++lastReqId.current;
      const tStart = performance.now();

      fetchWithTimeout(
        `${API_BASE}/studies/${STUDY_ID}/chunk.bin?root=.&start=${start}&length=${length}`,
        { headers: authHeaders() },
        45000,
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

          cacheRef.current.set(k, reshaped);
          setSignals(reshaped);
          hasPaintedOnce.current = true;

          lastLatencyMs.current = Math.round(performance.now() - tStart);
        })
        .catch((e) => {
          if (reqId !== lastReqId.current) return;
          // Keep last signals; surface error (do not blank the UI)
          setError(String(e));
        })
        .finally(() => {
          if (reqId === lastReqId.current) setLoadingChunk(false);
        });
    }

    // Prefetch next chunk (only when playing, only if not in cache)
    if (playing) {
      const nextStart = start + length;
      const nextKey = keyFor(nextStart, length);
      if (!cacheRef.current.has(nextKey)) {
        // fire-and-forget; no UI state changes
        fetchWithTimeout(
          `${API_BASE}/studies/${STUDY_ID}/chunk.bin?root=.&start=${nextStart}&length=${length}`,
          { headers: authHeaders() },
          45000,
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
            cacheRef.current.set(nextKey, reshapeF32ToChannels(f32, x.nCh, x.nSamp));
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

    const id = setInterval(() => {
      setCurrentTime((t) => (t + 0.1 > maxT ? maxT : t + 0.1));
    }, 100);

    return () => clearInterval(id);
  }, [playing, meta, windowSec]);

  /* ---------- VIEW DATA (IMMUTABLE DISPLAY TRANSFORM ONLY) ---------- */
  const viewSignals = useMemo(() => {
    if (!signals || !meta) return null;
    if (!suppressArtifacts) return signals;

    const fs = meta.sampling_rate_hz;
    return signals.map((ch, idx) =>
      ch.map((v, i) => {
        const t = currentTime + i / fs;
        const hit = artifacts.some(
          (a) => (a.channel == null || a.channel === idx) && t >= a.start_sec && t <= a.end_sec,
        );
        return hit ? v * 0.25 : v;
      }),
    );
  }, [signals, suppressArtifacts, artifacts, meta, currentTime]);

  /* ---------- RENDER ---------- */
  if (error && !hasPaintedOnce.current) {
    return (
      <div className="h-full w-full p-4 space-y-2">
        <div className="text-sm font-semibold text-red-500">EEGViewer failed</div>
        <pre className="text-xs whitespace-pre-wrap break-words text-red-400">{error}</pre>
      </div>
    );
  }

  // Only block on FIRST paint. After that, never replace canvas with spinner.
  if (loadingMeta || !meta || (!hasPaintedOnce.current && !signals)) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  // If we have painted once, keep rendering even if a later fetch fails
  if (error && hasPaintedOnce.current) {
    // keep UI running; error is informational
    // (you can later render this as a toast)
    // eslint-disable-next-line no-console
    console.warn("EEGViewer warning:", error);
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-2 flex flex-wrap gap-3 items-center border-b">
        <Badge>{meta.n_channels} ch</Badge>
        <Badge>{meta.sampling_rate_hz} Hz</Badge>

        {loadingChunk && <Badge variant="secondary">Loading…</Badge>}
        {lastLatencyMs.current != null && <Badge variant="secondary">{lastLatencyMs.current}ms</Badge>}
        {lastStartLen.current && (
          <Badge variant="secondary">
            {lastCacheHit.current ? "cache" : "net"} {lastStartLen.current.start}:{lastStartLen.current.length}
          </Badge>
        )}

        <Switch checked={showArtifacts} onCheckedChange={setShowArtifacts} />
        <span>Artifacts</span>

        <Switch checked={suppressArtifacts} onCheckedChange={setSuppressArtifacts} />
        <span>Suppress</span>
      </div>

      <EEGControls
        isPlaying={playing}
        onPlayPause={() => setPlaying((p) => !p)}
        currentTime={currentTime}
        duration={meta.n_samples / meta.sampling_rate_hz}
        onTimeChange={(t) => {
          // Immediate visual response; fetch will be throttled via quantization
          setCurrentTime(t);
        }}
        timeWindow={windowSec}
        onTimeWindowChange={(w) => {
          // Changing window size invalidates throttle; reset so it fetches once
          lastFetchStartSec.current = null;
          setWindowSec(w);
        }}
        amplitudeScale={amplitude}
        onAmplitudeScaleChange={setAmplitude}
        playbackSpeed={1}
        onPlaybackSpeedChange={() => {}}
        onSkipBackward={() => {
          lastFetchStartSec.current = null;
          setCurrentTime((t) => Math.max(0, t - windowSec));
        }}
        onSkipForward={() => {
          lastFetchStartSec.current = null;
          setCurrentTime((t) => Math.min(t + windowSec, meta.n_samples / meta.sampling_rate_hz));
        }}
        onExport={() => {}}
      />

      <div className="flex-1">
        <WebGLEEGViewer
          signals={viewSignals}
          channelLabels={meta.channel_map.map((c) => c.canonical_id)}
          sampleRate={meta.sampling_rate_hz}
          currentTime={currentTime}
          timeWindow={windowSec}
          amplitudeScale={amplitude}
          visibleChannels={new Set([...Array(meta.n_channels).keys()])}
          theme={theme ?? "dark"}
          markers={[]}
          artifactIntervals={
            showArtifacts
              ? artifacts
                  .filter((a) => a.end_sec > currentTime && a.start_sec < currentTime + windowSec)
                  .map((a) => ({
                    start_sec: a.start_sec - currentTime,
                    end_sec: a.end_sec - currentTime,
                    label: a.label,
                  }))
              : []
          }
        />
      </div>
    </div>
  );
}
