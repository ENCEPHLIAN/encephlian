import { resolveReadApiBase, getReadApiKey } from "@/shared/readApiConfig";
// src/pages/app/EEGViewer.tsx
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

/**
 * HARD RULE (updated):
 * - Determinism > everything.
 * - We do NOT rely on response headers for correctness (proxies can strip visibility).
 * - We still validate payload length strictly.
 */
const DIRECT_BASE = resolveReadApiBase();
const DIRECT_KEY = getReadApiKey();
const PROXY_BASE = String((import.meta as any).env?.VITE_SUPABASE_URL || "").replace(/\/+$/, "")
  ? `${String((import.meta as any).env?.VITE_SUPABASE_URL || "").replace(/\/+$/, "")}/functions/v1/read_api_proxy`
  : "";

const IS_LOCAL_BASE = DIRECT_BASE.includes("127.0.0.1") || DIRECT_BASE.includes("localhost");
const USING_PROXY = !DIRECT_KEY && !IS_LOCAL_BASE && !!PROXY_BASE;
const API_BASE = (DIRECT_KEY || IS_LOCAL_BASE) ? DIRECT_BASE : PROXY_BASE;
const API_KEY = DIRECT_KEY;

/* =======================
   TYPES
======================= */
type Meta = {
  n_channels: number;
  sampling_rate_hz: number;
  n_samples: number;
  channel_map: { index: number; canonical_id: string; unit: string }[];
  // Optional variants (if your backend ever changes shape)
  channel_names?: string[];
  channels?: { name: string }[];
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

function authHeaders(): HeadersInit {
  // Proxy mode: backend function gateway requires anon headers
  if (USING_PROXY) {
    const anon = String((import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY || "").trim();
    if (!anon) return {};
    return { apikey: anon, Authorization: `Bearer ${anon}` };
  }

  // Direct mode: Read API expects x-api-key (lowercase)
  if (API_KEY) return { "x-api-key": API_KEY };

  // Local / unauthenticated mode
  return {};
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

function keyFor(startSample: number, length: number) {
  return `${startSample}:${length}`;
}

/**
 * Binary layout ambiguity guard:
 * Some pipelines serve chunk.bin as:
 *  A) channel-major: [ch0...ch0][ch1...][chN...]
 *  B) sample-major:  [s0ch0,s0ch1..][s1ch0..]...
 *
 * We:
 * - Implement both reshape variants
 * - Auto-pick via a deterministic heuristic (no randomness)
 */
function reshapeChannelMajor(f32: Float32Array, nCh: number, nSamp: number): number[][] {
  const out: number[][] = Array.from({ length: nCh }, () => new Array(nSamp));
  for (let ch = 0; ch < nCh; ch++) {
    const base = ch * nSamp;
    for (let i = 0; i < nSamp; i++) out[ch][i] = f32[base + i];
  }
  return out;
}

function reshapeSampleMajor(f32: Float32Array, nCh: number, nSamp: number): number[][] {
  const out: number[][] = Array.from({ length: nCh }, () => new Array(nSamp));
  let p = 0;
  for (let i = 0; i < nSamp; i++) {
    for (let ch = 0; ch < nCh; ch++) {
      out[ch][i] = f32[p++];
    }
  }
  return out;
}

function scoreContinuity(channels: number[][], probeSamples = 2048) {
  // Lower score = smoother temporal continuity (what EEG should look like).
  const nCh = channels.length;
  if (nCh === 0) return Number.POSITIVE_INFINITY;
  const nSamp = channels[0]?.length ?? 0;
  const n = Math.min(nSamp, probeSamples);
  if (n < 8) return Number.POSITIVE_INFINITY;

  let acc = 0;
  let count = 0;

  // sample a few channels deterministically: first, middle, last
  const idxs = [0, Math.floor(nCh / 2), nCh - 1].filter((x, i, a) => x >= 0 && x < nCh && a.indexOf(x) === i);

  for (const ch of idxs) {
    const x = channels[ch];
    let s = 0;
    for (let i = 1; i < n; i++) {
      const d = x[i] - x[i - 1];
      s += Math.abs(d);
    }
    acc += s / (n - 1);
    count++;
  }
  return acc / Math.max(1, count);
}

function reshapeAuto(f32: Float32Array, nCh: number, nSamp: number) {
  const a = reshapeChannelMajor(f32, nCh, nSamp);
  const b = reshapeSampleMajor(f32, nCh, nSamp);

  const sa = scoreContinuity(a);
  const sb = scoreContinuity(b);

  // Deterministic tie-breaker: prefer channel-major if equal
  return sa <= sb
    ? { signals: a, layout: "channel-major" as const, score: sa }
    : { signals: b, layout: "sample-major" as const, score: sb };
}

// header helper: prefer multiple possible names (legacy + new)
function hdrNum(r: Response, names: string[]): number {
  for (const n of names) {
    const v = r.headers.get(n);
    if (v != null) {
      const x = Number(v);
      if (Number.isFinite(x)) return x;
    }
  }
  return Number.NaN;
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

  // Debug: what layout did we detect?
  const lastLayoutRef = useRef<string | null>(null);

  // Hard sanity
  useEffect(() => {
    const usingProxy = !DIRECT_KEY;

    if (usingProxy) {
      if (!PROXY_BASE) {
        setFatalError(
          "Read API proxy is unavailable (missing backend base URL).",
        );
        setLoadingMeta(false);
        setLoadingWindow(false);
      }
      return;
    }

    // Direct mode (not recommended): key must be available in the browser env
    if (!DIRECT_BASE || !API_KEY) {
      setFatalError(
        `Missing env vars.\n` +
          `VITE_ENCEPH_READ_API_KEY=${API_KEY ? "present" : "missing"}`,
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
        setMeta((j?.meta ?? j) as Meta);
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

  /* ---------- DERIVED (channel order is canonical, no sorting) ---------- */
  const channelLabels = useMemo(() => {
    if (!meta) return [];
    // Prefer explicit ordered map
    if (Array.isArray(meta.channel_map) && meta.channel_map.length > 0) {
      // Ensure stable order by channel_map.index
      return [...meta.channel_map].sort((a, b) => a.index - b.index).map((c) => c.canonical_id);
    }
    // Fallbacks (if backend shape changes)
    if (Array.isArray(meta.channel_names)) return meta.channel_names;
    if (Array.isArray(meta.channels)) return meta.channels.map((c) => c.name);
    return [];
  }, [meta]);

  const visibleChannels = useMemo(() => {
    // Stable Set instance (avoids rerender thrash in renderer)
    if (!meta) return new Set<number>();
    const s = new Set<number>();
    for (let i = 0; i < meta.n_channels; i++) s.add(i);
    return s;
  }, [meta]);

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

        // Headers may be invisible in browser depending on proxy/CORS behavior.
        // We treat them as *optional* and derive dimensions deterministically.
        const hdrNCh = hdrNum(r, ["x-eeg-nchannels", "x-eeg-channel-count"]);
        const hdrNSamp = hdrNum(r, ["x-eeg-length", "x-eeg-samples-per-channel"]);

        const nCh = Number.isFinite(hdrNCh) ? hdrNCh : meta.n_channels;
        const nSamp = Number.isFinite(hdrNSamp) ? hdrNSamp : length;

        // Optional consistency check (doesn't block rendering)
        if (Number.isFinite(hdrNCh) && hdrNCh !== meta.n_channels && import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn("[chunk.bin] header nCh != meta.n_channels:", hdrNCh, meta.n_channels);
        }

        return r.arrayBuffer().then((buf) => ({ buf, nCh, nSamp }));
      })
      .then(({ buf, nCh, nSamp }) => {
        if (reqId !== lastReqId.current) return;

        const f32 = new Float32Array(buf);
        const expected = nCh * nSamp;

        // Hard gate: payload must match computed dimensions
        if (f32.length !== expected) {
          throw new Error(
            `Bad payload length: got ${f32.length}, expected ${expected}. ` +
              `nCh=${nCh}, nSamp=${nSamp}, meta.n_channels=${meta.n_channels}, req.length=${length}`,
          );
        }

        if (import.meta.env.DEV) {
          const preview = Array.from(f32.slice(0, 24)).map((v) => Number(v.toFixed(3)));
          // eslint-disable-next-line no-console
          console.log("[chunk.bin] f32[0..24):", preview, "nCh=", nCh, "nSamp=", nSamp);
        }

        const reshaped = reshapeAuto(f32, nCh, nSamp);
        lastLayoutRef.current = `${reshaped.layout} (score=${reshaped.score.toFixed(3)})`;

        cacheRef.current.set(k, reshaped.signals);
        setSignals(reshaped.signals);

        lastFetchMs.current = Math.round(performance.now() - t0);
      })
      .catch((e) => {
        if (reqId !== lastReqId.current) return;
        if (!signals) setFatalError(String(e));
      })
      .finally(() => {
        if (reqId === lastReqId.current) setLoadingWindow(false);
      });

    // Prefetch next window (stride = windowSec/2) during playback
    if (playing) {
      const stride = windowSec / 2;
      const nextWs = clamp(ws + stride, 0, maxStart);
      const nextStartSample = Math.floor(nextWs * fs);
      const nk = keyFor(nextStartSample, length);

      if (!cacheRef.current.has(nk)) {
        fetchWithTimeout(
          `${API_BASE}/studies/${STUDY_ID}/chunk.bin?root=.&start=${nextStartSample}&length=${length}`,
          { headers: authHeaders() },
          30000,
        )
          .then((r) => {
            if (!r.ok) return null;

            const hdrNCh = hdrNum(r, ["x-eeg-nchannels", "x-eeg-channel-count"]);
            const hdrNSamp = hdrNum(r, ["x-eeg-length", "x-eeg-samples-per-channel"]);

            const nCh = Number.isFinite(hdrNCh) ? hdrNCh : meta.n_channels;
            const nSamp = Number.isFinite(hdrNSamp) ? hdrNSamp : length;

            return r.arrayBuffer().then((buf) => ({ buf, nCh, nSamp }));
          })
          .then((x) => {
            if (!x) return;
            const f32 = new Float32Array(x.buf);
            const expected = x.nCh * x.nSamp;
            if (f32.length !== expected) return;
            const reshaped = reshapeAuto(f32, x.nCh, x.nSamp);
            cacheRef.current.set(nk, reshaped.signals);
          })
          .catch(() => {});
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, windowStartSec, windowSec, playing]);

  /* ---------- PLAYBACK (smooth + deterministic) ---------- */
  useEffect(() => {
    if (!playing || !meta) return;

    const fs = meta.sampling_rate_hz;
    const durationSec = meta.n_samples / fs;
    const maxStart = Math.max(0, durationSec - windowSec);
    const stride = windowSec / 2;

    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;

      setCursorSec((c) => {
        let nc = c + dt;

        // Keep cursor moving locally; shift window in coarse strides
        if (nc < windowSec * 0.75) return nc;

        setWindowStartSec((ws) => clamp(ws + stride, 0, maxStart));
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

  /* ---------- WINDOW-LOCAL OVERLAYS (C-plane only) ---------- */
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
        {lastLayoutRef.current && <Badge variant="secondary">{lastLayoutRef.current}</Badge>}

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
          const stride = windowSec / 2;
          const ws = Math.floor(tt / stride) * stride;
          setWindowStartSec(clamp(ws, 0, Math.max(0, durationSec - windowSec)));
          setCursorSec(clamp(tt - ws, 0, windowSec));
        }}
        timeWindow={windowSec}
        onTimeWindowChange={(w) => {
          setPlaying(false);
          setWindowSec(w);
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
          channelLabels={channelLabels}
          sampleRate={meta.sampling_rate_hz}
          // IMPORTANT: currentTime is LOCAL cursor within window
          currentTime={cursorSec}
          timeWindow={windowSec}
          amplitudeScale={amplitude}
          visibleChannels={visibleChannels}
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
