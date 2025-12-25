import { useEffect, useMemo, useRef, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { WebGLEEGViewer } from "@/components/eeg/WebGLEEGViewer";
import { EEGControls } from "@/components/eeg/EEGControls";
import { useTheme } from "next-themes";

/* =======================
   MVP LOCK
======================= */
const STUDY_ID = "TUH_CANON_001";

// Prefer env. Keep your fallback only if you insist.
// If you want zero surprises: remove fallbacks and force env.
const API_BASE =
  (import.meta.env.VITE_ENCEPH_READ_API_BASE as string | undefined) ??
  "https://enceph-readapi--envfix102934.happywater-07f1abab.centralindia.azurecontainerapps.io";

const API_KEY = (import.meta.env.VITE_ENCEPH_READ_API_KEY as string | undefined) ?? "REPLACE_WITH_ENV_ONLY";

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

type Marker = {
  id: string;
  timestamp_sec: number; // LOCAL within window [0..timeWindow]
  marker_type: string;
  label?: string;
};

function authHeaders() {
  return { "X-API-KEY": API_KEY ?? "" };
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
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

function reshapeF32ToChannels(f32: Float32Array, nCh: number, nSamp: number): number[][] {
  const out: number[][] = Array.from({ length: nCh }, () => new Array(nSamp));
  for (let ch = 0; ch < nCh; ch++) {
    const base = ch * nSamp;
    for (let i = 0; i < nSamp; i++) out[ch][i] = f32[base + i];
  }
  return out;
}

function keyFor(startSample: number, length: number) {
  return `${startSample}:${length}`;
}

export default function EEGViewer() {
  const { theme } = useTheme();

  const [meta, setMeta] = useState<Meta | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);

  // Window scheduler (global time = windowStartSec + cursorSec)
  const [windowSec, setWindowSec] = useState(10);
  const [windowStartSec, setWindowStartSec] = useState(0); // global start of rendered buffer
  const [cursorSec, setCursorSec] = useState(0); // local time within window [0..windowSec]
  const [playing, setPlaying] = useState(false);

  // Viewer controls
  const [amplitude, setAmplitude] = useState(1.0);
  const [showArtifacts, setShowArtifacts] = useState(true);
  const [suppressArtifacts, setSuppressArtifacts] = useState(false);

  // Canonical overlays
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);

  // Data buffer for current window (this is what WebGLEEGViewer renders)
  const [signals, setSignals] = useState<number[][] | null>(null);

  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingWindow, setLoadingWindow] = useState(true);

  // Perf + cache
  const cacheRef = useRef<Map<string, number[][]>>(new Map());
  const lastReqId = useRef(0);
  const lastFetchMs = useRef<number | null>(null);
  const lastFetchMode = useRef<"cache" | "net" | null>(null);

  // Hard sanity: env must exist
  useEffect(() => {
    if (!API_BASE || !API_KEY) {
      setFatalError(
        `Missing env vars. base=${String(API_BASE)} key=${API_KEY ? "present" : "missing"}.\n` +
          `Set VITE_ENCEPH_READ_API_BASE and VITE_ENCEPH_READ_API_KEY and redeploy.`,
      );
      setLoadingMeta(false);
      setLoadingWindow(false);
    }
  }, []);

  /* ---------- META ---------- */
  useEffect(() => {
    if (!API_BASE || !API_KEY) return;
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

  /* ---------- ARTIFACTS + ANNOTATIONS ---------- */
  useEffect(() => {
    if (!API_BASE || !API_KEY) return;

    fetchWithTimeout(`${API_BASE}/studies/${STUDY_ID}/artifacts?root=.`, { headers: authHeaders() }, 20000)
      .then((r) => (r.ok ? r.json() : { artifacts: [] }))
      .then((j) => setArtifacts(j.artifacts ?? []))
      .catch(() => setArtifacts([]));

    fetchWithTimeout(`${API_BASE}/studies/${STUDY_ID}/annotations?root=.`, { headers: authHeaders() }, 20000)
      .then((r) => (r.ok ? r.json() : { annotations: [] }))
      .then((j) => setAnnotations(j.annotations ?? []))
      .catch(() => setAnnotations([]));
  }, []);

  /* ---------- WINDOW FETCH (ONLY when windowStartSec/windowSec changes) ---------- */
  useEffect(() => {
    if (!API_BASE || !API_KEY || !meta) return;

    const fs = meta.sampling_rate_hz;
    const durationSec = meta.n_samples / fs;

    // Clamp windowStart within file
    const maxStart = Math.max(0, durationSec - windowSec);
    const ws = clamp(windowStartSec, 0, maxStart);
    if (ws !== windowStartSec) {
      setWindowStartSec(ws);
      return;
    }

    // Clamp cursor inside window
    const c = clamp(cursorSec, 0, windowSec);
    if (c !== cursorSec) {
      setCursorSec(c);
      return;
    }

    const startSample = Math.floor(ws * fs);
    const length = Math.max(1, Math.floor(windowSec * fs));
    const k = keyFor(startSample, length);

    // Cache hit
    const cached = cacheRef.current.get(k);
    if (cached) {
      lastFetchMode.current = "cache";
      setSignals(cached);
      setLoadingWindow(false);
      return;
    }

    // Network
    setLoadingWindow(true);
    lastFetchMode.current = "net";
    const reqId = ++lastReqId.current;
    const t0 = performance.now();

    fetchWithTimeout(
      `${API_BASE}/studies/${STUDY_ID}/chunk.bin?root=.&start=${startSample}&length=${length}`,
      { headers: authHeaders() },
      30000,
    )
      .then((r) => {
        if (!r.ok) throw new Error(`chunk.bin ${r.status} ${r.statusText}`);

        const nCh = Number(r.headers.get("x-eeg-nchannels"));
        const nSamp = Number(r.headers.get("x-eeg-length"));
        if (!Number.isFinite(nCh) || !Number.isFinite(nSamp)) {
          throw new Error("Missing x-eeg-* headers in browser. Fix CORS expose_headers / proxy stripping.");
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

        lastFetchMs.current = Math.round(performance.now() - t0);
      })
      .catch((e) => {
        if (reqId !== lastReqId.current) return;
        // keep last signals if any; only fatal if nothing rendered yet
        if (!signals) setFatalError(String(e));
      })
      .finally(() => {
        if (reqId === lastReqId.current) setLoadingWindow(false);
      });

    // Prefetch next window (stride = windowSec/2) during playback
    if (playing) {
      const stride = windowSec / 2;
      const nextWs = clamp(ws + stride, 0, maxStart);
      const nextStart = Math.floor(nextWs * fs);
      const nk = keyFor(nextStart, length);
      if (!cacheRef.current.has(nk)) {
        fetchWithTimeout(
          `${API_BASE}/studies/${STUDY_ID}/chunk.bin?root=.&start=${nextStart}&length=${length}`,
          { headers: authHeaders() },
          30000,
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
            cacheRef.current.set(nk, reshapeF32ToChannels(f32, x.nCh, x.nSamp));
          })
          .catch(() => {});
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, windowStartSec, windowSec, playing]);

  /* ---------- PLAYBACK (smooth: move cursor locally, shift window with stride) ---------- */
  useEffect(() => {
    if (!playing || !meta) return;

    const fs = meta.sampling_rate_hz;
    const durationSec = meta.n_samples / fs;
    const maxStart = Math.max(0, durationSec - windowSec);
    const stride = windowSec / 2;

    // 60fps-ish cursor motion; zero fetch thrash because window fetch is decoupled
    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;

      setCursorSec((c) => {
        let nc = c + dt;
        if (nc < windowSec * 0.75) return nc;

        // shift window forward by stride; keep cursor stable relative to newly shifted window
        setWindowStartSec((ws) => {
          const nws = clamp(ws + stride, 0, maxStart);
          return nws;
        });

        return nc - stride;
      });

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, meta, windowSec]);

  /* ---------- DERIVED TIMES ---------- */
  const globalTime = windowStartSec + cursorSec;

  const durationSec = useMemo(() => {
    if (!meta) return 0;
    return meta.n_samples / meta.sampling_rate_hz;
  }, [meta]);

  /* ---------- WINDOW-LOCAL OVERLAYS ---------- */
  const windowArtifacts = useMemo(() => {
    if (!showArtifacts) return [];
    const ws = windowStartSec;
    const we = windowStartSec + windowSec;

    return artifacts
      .filter((a) => a.end_sec > ws && a.start_sec < we)
      .map((a) => ({
        start_sec: a.start_sec - ws,
        end_sec: a.end_sec - ws,
        label: a.label,
        channel: a.channel,
      }));
  }, [artifacts, showArtifacts, windowStartSec, windowSec]);

  const windowMarkers: Marker[] = useMemo(() => {
    const ws = windowStartSec;
    const we = windowStartSec + windowSec;

    return annotations
      .filter((m) => m.start_sec >= ws && m.start_sec <= we)
      .map((m, idx) => ({
        id: `${m.label ?? "ann"}-${idx}-${m.start_sec}`,
        timestamp_sec: m.start_sec - ws,
        marker_type: "event",
        label: m.label ?? "annotation",
      }));
  }, [annotations, windowStartSec, windowSec]);

  /* ---------- RAW IMMUTABLE DISPLAY MODE ---------- */
  // NOTE: suppressArtifacts is a display-only transform in the renderer.
  // We pass the raw window buffer and let WebGLEEGViewer apply display-only suppression.
  const renderSignals = signals;

  if (fatalError) {
    return (
      <div className="h-full w-full p-4 space-y-2">
        <div className="text-sm font-semibold text-red-500">EEGViewer failed</div>
        <pre className="text-xs whitespace-pre-wrap break-words text-red-400">{fatalError}</pre>
      </div>
    );
  }

  if (loadingMeta || !meta || !renderSignals) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-2 flex flex-wrap gap-3 items-center border-b">
        <Badge>{meta.n_channels} ch</Badge>
        <Badge>{meta.sampling_rate_hz} Hz</Badge>
        {loadingWindow && <Badge variant="secondary">Loading…</Badge>}
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
        currentTime={globalTime}
        duration={durationSec}
        onTimeChange={(t) => {
          setPlaying(false);
          const tt = clamp(t, 0, Math.max(0, durationSec - 1e-6));
          // snap windowStart so seek doesn't stutter
          const stride = windowSec / 2;
          const ws = Math.floor(tt / stride) * stride;
          setWindowStartSec(clamp(ws, 0, Math.max(0, durationSec - windowSec)));
          setCursorSec(clamp(tt - ws, 0, windowSec));
        }}
        timeWindow={windowSec}
        onTimeWindowChange={(w) => {
          setPlaying(false);
          setWindowSec(w);
          // keep global time stable
          const tt = globalTime;
          const stride = w / 2;
          const ws = Math.floor(tt / stride) * stride;
          setWindowStartSec(clamp(ws, 0, Math.max(0, durationSec - w)));
          setCursorSec(clamp(tt - ws, 0, w));
        }}
        amplitudeScale={amplitude}
        onAmplitudeScaleChange={setAmplitude}
        playbackSpeed={1}
        onPlaybackSpeedChange={() => {}}
        onSkipBackward={() => {
          setPlaying(false);
          const tt = clamp(globalTime - windowSec, 0, durationSec);
          const stride = windowSec / 2;
          const ws = Math.floor(tt / stride) * stride;
          setWindowStartSec(clamp(ws, 0, Math.max(0, durationSec - windowSec)));
          setCursorSec(clamp(tt - ws, 0, windowSec));
        }}
        onSkipForward={() => {
          setPlaying(false);
          const tt = clamp(globalTime + windowSec, 0, durationSec);
          const stride = windowSec / 2;
          const ws = Math.floor(tt / stride) * stride;
          setWindowStartSec(clamp(ws, 0, Math.max(0, durationSec - windowSec)));
          setCursorSec(clamp(tt - ws, 0, windowSec));
        }}
        onExport={() => {}}
      />

      <div className="flex-1">
        <WebGLEEGViewer
          signals={renderSignals}
          channelLabels={meta.channel_map.map((c) => c.canonical_id)}
          sampleRate={meta.sampling_rate_hz}
          // IMPORTANT: currentTime is LOCAL cursor within window
          currentTime={cursorSec}
          timeWindow={windowSec}
          amplitudeScale={amplitude}
          visibleChannels={new Set([...Array(meta.n_channels).keys()])}
          theme={theme ?? "dark"}
          markers={windowMarkers}
          artifactIntervals={windowArtifacts}
          showArtifactsAsRed={true}
          suppressArtifacts={suppressArtifacts}
        />
      </div>
    </div>
  );
}
