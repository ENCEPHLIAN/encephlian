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

type ChunkData = number[][];

/* =======================
   HELPERS
======================= */
function authHeaders() {
  return { "X-API-KEY": API_KEY };
}

function reshapeF32ToChannels(f32: Float32Array, nCh: number, nSamp: number): ChunkData {
  const out: ChunkData = Array.from({ length: nCh }, () => new Array(nSamp));
  for (let ch = 0; ch < nCh; ch++) {
    const base = ch * nSamp;
    for (let i = 0; i < nSamp; i++) out[ch][i] = f32[base + i];
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

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function isProbablyPlaceholderEnv(v?: string) {
  if (!v) return true;
  return v.includes("YOUR_") || v.includes("REPLACE_ME") || v.includes("undefined");
}

/* =======================
   CHUNK CACHE
======================= */
const chunkCache = new Map<string, ChunkData>();

function cacheKey(start: number, length: number) {
  return `${start}:${length}`;
}

function getCached(start: number, length: number): ChunkData | null {
  return chunkCache.get(cacheKey(start, length)) || null;
}

function setCached(start: number, length: number, data: ChunkData) {
  chunkCache.set(cacheKey(start, length), data);
}

/* =======================
   COMPONENT
======================= */
export default function EEGViewer() {
  const { theme } = useTheme();

  /* ---------- STATE ---------- */
  const [meta, setMeta] = useState<Meta | null>(null);
  const [signals, setSignals] = useState<ChunkData | null>(null);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);

  const [currentTime, setCurrentTime] = useState(0);
  const [windowSec, setWindowSec] = useState(10);
  const [playing, setPlaying] = useState(false);

  const [amplitude, setAmplitude] = useState(1.0);
  const [showArtifacts, setShowArtifacts] = useState(true);
  const [suppressArtifacts, setSuppressArtifacts] = useState(false);

  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingChunk, setLoadingChunk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debug state
  const [debugInfo, setDebugInfo] = useState({
    lastFetchMs: 0,
    cacheHit: false,
    lastStart: 0,
    lastLength: 0,
  });

  // Refs for throttling
  const lastFetchedStart = useRef<number | null>(null);
  const fetchInProgress = useRef(false);
  const pendingPrefetch = useRef<number | null>(null);

  /* ---------- EARLY CONFIG SANITY ---------- */
  useEffect(() => {
    if (isProbablyPlaceholderEnv(API_BASE) || isProbablyPlaceholderEnv(API_KEY)) {
      setError(
        `Bad config. API_BASE/API_KEY look missing or placeholder.\n` +
          `API_BASE=${String(API_BASE)}\nAPI_KEY=${API_KEY ? "present" : "missing"}\n` +
          `Set VITE_ENCEPH_READ_API_BASE + VITE_ENCEPH_READ_API_KEY and redeploy.`,
      );
      setLoadingMeta(false);
    }
  }, []);

  /* ---------- LOAD META ---------- */
  useEffect(() => {
    let alive = true;

    setLoadingMeta(true);
    setError(null);

    fetchWithTimeout(`${API_BASE}/studies/${STUDY_ID}/meta?root=.`, { headers: authHeaders() }, 15000)
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
    fetchWithTimeout(`${API_BASE}/studies/${STUDY_ID}/artifacts?root=.`, { headers: authHeaders() }, 15000)
      .then((r) => (r.ok ? r.json() : { artifacts: [] }))
      .then((j) => setArtifacts(j.artifacts ?? []))
      .catch(() => setArtifacts([]));
  }, []);

  /* ---------- FETCH CHUNK (with caching) ---------- */
  const fetchChunk = useCallback(
    async (start: number, length: number, isPrefetch = false): Promise<ChunkData | null> => {
      // Check cache first
      const cached = getCached(start, length);
      if (cached) {
        if (!isPrefetch) {
          setDebugInfo((d) => ({ ...d, cacheHit: true, lastStart: start, lastLength: length }));
        }
        return cached;
      }

      const t0 = performance.now();

      try {
        const r = await fetchWithTimeout(
          `${API_BASE}/studies/${STUDY_ID}/chunk.bin?root=.&start=${start}&length=${length}`,
          { headers: authHeaders() },
          15000,
        );

        if (!r.ok) throw new Error(`chunk.bin ${r.status} ${r.statusText}`);

        const nCh = Number(r.headers.get("x-eeg-nchannels"));
        const nSamp = Number(r.headers.get("x-eeg-length"));
        const dtype = r.headers.get("x-eeg-dtype");

        if (!Number.isFinite(nCh) || !Number.isFinite(nSamp)) {
          throw new Error("Missing x-eeg-* headers in browser.");
        }
        if (dtype && dtype !== "float32") throw new Error(`Unexpected dtype: ${dtype}`);

        const buf = await r.arrayBuffer();
        const f32 = new Float32Array(buf);

        if (f32.length !== nCh * nSamp) {
          throw new Error(`Bad payload length: got ${f32.length}, expected ${nCh * nSamp}`);
        }

        const data = reshapeF32ToChannels(f32, nCh, nSamp);
        setCached(start, length, data);

        if (!isPrefetch) {
          setDebugInfo({
            lastFetchMs: Math.round(performance.now() - t0),
            cacheHit: false,
            lastStart: start,
            lastLength: length,
          });
        }

        return data;
      } catch (e) {
        if (!isPrefetch) {
          console.error("Chunk fetch error:", e);
        }
        return null;
      }
    },
    [],
  );

  /* ---------- LOAD WINDOW CHUNK (THROTTLED, NON-BLOCKING) ---------- */
  useEffect(() => {
    if (!meta) return;

    const fs = meta.sampling_rate_hz;
    const maxT = Math.max(0, meta.n_samples / fs - windowSec);
    const t0 = clamp(currentTime, 0, maxT);

    if (t0 !== currentTime) {
      setCurrentTime(t0);
      return;
    }

    const start = Math.max(0, Math.floor(t0 * fs));
    const length = Math.max(1, Math.floor(windowSec * fs));

    // Throttle: only fetch if start changed by >= 0.25s worth of samples
    const minDelta = Math.floor(0.25 * fs);
    if (lastFetchedStart.current !== null && Math.abs(start - lastFetchedStart.current) < minDelta) {
      // Check if we already have cached data for this window
      const cached = getCached(start, length);
      if (cached && signals !== cached) {
        setSignals(cached);
        setDebugInfo((d) => ({ ...d, cacheHit: true, lastStart: start, lastLength: length }));
      }
      return;
    }

    // Check cache first (instant render)
    const cached = getCached(start, length);
    if (cached) {
      setSignals(cached);
      setDebugInfo((d) => ({ ...d, cacheHit: true, lastStart: start, lastLength: length }));
      lastFetchedStart.current = start;

      // Prefetch next chunk if playing
      if (playing) {
        const nextStart = start + length;
        if (nextStart < meta.n_samples) {
          fetchChunk(nextStart, length, true);
        }
      }
      return;
    }

    // Fetch in background (non-blocking)
    if (fetchInProgress.current) return;

    fetchInProgress.current = true;
    setLoadingChunk(true);

    fetchChunk(start, length)
      .then((data) => {
        if (data) {
          setSignals(data);
          lastFetchedStart.current = start;

          // Prefetch next chunk
          if (playing) {
            const nextStart = start + length;
            if (nextStart < meta.n_samples) {
              pendingPrefetch.current = nextStart;
            }
          }
        }
      })
      .catch((e) => {
        setError(String(e));
      })
      .finally(() => {
        setLoadingChunk(false);
        fetchInProgress.current = false;

        // Execute pending prefetch
        if (pendingPrefetch.current !== null && meta) {
          const nextStart = pendingPrefetch.current;
          pendingPrefetch.current = null;
          fetchChunk(nextStart, Math.floor(windowSec * meta.sampling_rate_hz), true);
        }
      });
  }, [meta, currentTime, windowSec, fetchChunk, playing, signals]);

  /* ---------- PLAYBACK ---------- */
  useEffect(() => {
    if (!playing || !meta) return;

    const fs = meta.sampling_rate_hz;
    const maxT = Math.max(0, meta.n_samples / fs - windowSec);

    const id = setInterval(() => {
      setCurrentTime((t) => {
        const next = t + 0.1;
        if (next > maxT) {
          setPlaying(false);
          return maxT;
        }
        return next;
      });
    }, 100);

    return () => clearInterval(id);
  }, [playing, meta, windowSec]);

  /* ---------- VIEW DATA (IMMUTABLE) ---------- */
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
        return hit ? v * 0.2 : v;
      }),
    );
  }, [signals, suppressArtifacts, artifacts, meta, currentTime]);

  /* ---------- DERIVED VALUES ---------- */
  const duration = meta ? meta.n_samples / meta.sampling_rate_hz : 0;
  const channelLabels = meta?.channel_map?.map((c) => c.canonical_id) ?? [];
  const visibleChannels = useMemo(
    () => new Set(meta ? [...Array(meta.n_channels).keys()] : []),
    [meta],
  );

  /* ---------- RENDER ---------- */
  if (error) {
    return (
      <div className="h-full w-full p-4 space-y-2">
        <div className="text-sm font-semibold text-destructive">EEGViewer failed</div>
        <pre className="text-xs whitespace-pre-wrap break-words text-destructive/80">{error}</pre>
        <div className="text-xs text-muted-foreground">
          If this says missing x-eeg headers: confirm CORS expose_headers in Read API and redeploy.
        </div>
      </div>
    );
  }

  if (loadingMeta || !meta) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header with toggles and loading indicator */}
      <div className="p-2 flex gap-4 items-center border-b flex-wrap">
        <Badge variant="outline">{meta.n_channels} ch</Badge>
        <Badge variant="outline">{meta.sampling_rate_hz} Hz</Badge>

        {loadingChunk && (
          <Badge variant="secondary" className="animate-pulse">
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            Loading…
          </Badge>
        )}

        <div className="flex items-center gap-2">
          <Switch checked={showArtifacts} onCheckedChange={setShowArtifacts} id="show-artifacts" />
          <label htmlFor="show-artifacts" className="text-sm cursor-pointer">Artifacts</label>
        </div>

        <div className="flex items-center gap-2">
          <Switch checked={suppressArtifacts} onCheckedChange={setSuppressArtifacts} id="suppress-artifacts" />
          <label htmlFor="suppress-artifacts" className="text-sm cursor-pointer">Suppress</label>
        </div>

        {/* Debug panel */}
        <div className="ml-auto text-[10px] font-mono text-muted-foreground flex gap-3">
          <span>API: {API_BASE.slice(0, 30)}…</span>
          <span>{debugInfo.cacheHit ? "HIT" : "MISS"}</span>
          <span>{debugInfo.lastFetchMs}ms</span>
          <span>
            [{debugInfo.lastStart}:{debugInfo.lastLength}]
          </span>
        </div>
      </div>

      <EEGControls
        isPlaying={playing}
        onPlayPause={() => setPlaying((p) => !p)}
        currentTime={currentTime}
        duration={duration}
        onTimeChange={(t) => {
          lastFetchedStart.current = null; // Force fetch on explicit seek
          setCurrentTime(t);
        }}
        timeWindow={windowSec}
        onTimeWindowChange={setWindowSec}
        amplitudeScale={amplitude}
        onAmplitudeScaleChange={setAmplitude}
        playbackSpeed={1}
        onPlaybackSpeedChange={() => {}}
        onSkipBackward={() => {
          lastFetchedStart.current = null;
          setCurrentTime((t) => Math.max(0, t - windowSec));
        }}
        onSkipForward={() => {
          lastFetchedStart.current = null;
          setCurrentTime((t) => Math.min(t + windowSec, duration - windowSec));
        }}
        onExport={() => {}}
      />

      <div className="flex-1">
        {viewSignals ? (
          <WebGLEEGViewer
            signals={viewSignals}
            channelLabels={channelLabels}
            sampleRate={meta.sampling_rate_hz}
            currentTime={currentTime}
            timeWindow={windowSec}
            amplitudeScale={amplitude}
            visibleChannels={visibleChannels}
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
        ) : (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <Loader2 className="animate-spin mr-2" />
            Loading EEG data…
          </div>
        )}
      </div>
    </div>
  );
}
