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
  "https://enceph-readapi--envfix102934.happywater-07f1abab.centralindia.azurecontainerapps.io"\;

const API_KEY =
  (import.meta.env.VITE_ENCEPH_READ_API_KEY as string | undefined) ??
  "dev-secret";

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

/* =======================
   CHANNEL ORDERING (deterministic)
   EEG first, then aux, then ref/photic last
======================= */
const EEG_PRIORITY: string[] = [
  "FP1","FP2","F7","F3","FZ","F4","F8",
  "T7","T3","C3","CZ","C4","T4","T8",
  "P7","T5","P3","PZ","P4","T6","P8",
  "O1","O2",
];

function normLabel(s: string) {
  return s.trim().toUpperCase().replace(/\s+/g, "");
}

function channelRank(label: string): number {
  const L = normLabel(label);

  // Put obvious junk last
  const LAST = 10_000;

  if (L.includes("PHOTIC") || L.includes("STIM") || L.includes("TRIGGER")) return 9000;
  if (L === "REF" || L.includes("REFERENCE")) return 9500;

  // Common aux channels
  if (L.includes("EKG") || L.includes("ECG")) return 8000;
  if (L.includes("EMG")) return 8100;
  if (L.includes("EOG")) return 8200;
  if (L.includes("RESP") || L.includes("AIRFLOW")) return 8300;

  // EEG canonical priority
  const base = EEG_PRIORITY.indexOf(L);
  if (base >= 0) return base;

  // Heuristic: scalp-like labels first
  if (/^(FP|AF|F|FC|C|CP|P|PO|O|T)\d{1,2}$/.test(L)) return 200 + L.charCodeAt(0);

  // Unknown but keep before ref/photic
  return 5000;
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

  // IMPORTANT: playhead is smooth; windowStart drives fetching
  const [playheadSec, setPlayheadSec] = useState(0);
  const [windowStartSec, setWindowStartSec] = useState(0);
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
  const cacheRef = useRef<Map<string, number[][]>>(new Map());

  // Prefetch budget
  const PREFETCH_WINDOWS = 2;

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

  /* ---------- KEEP WINDOW START ALIGNED (smooth) ---------- */
  useEffect(() => {
    if (!meta) return;
    const duration = meta.n_samples / meta.sampling_rate_hz;
    const maxPlay = Math.max(0, duration);
    const p = clamp(playheadSec, 0, maxPlay);
    if (p !== playheadSec) {
      setPlayheadSec(p);
      return;
    }

    // Maintain a 1s guard band before we refetch (prevents “every click reload” feel)
    const GUARD = Math.min(1.0, windowSec * 0.15);

    if (p < windowStartSec + GUARD) {
      setWindowStartSec(clamp(p - GUARD, 0, Math.max(0, duration - windowSec)));
    } else if (p > windowStartSec + windowSec - GUARD) {
      setWindowStartSec(clamp(p - (windowSec - GUARD), 0, Math.max(0, duration - windowSec)));
    }
  }, [meta, playheadSec, windowStartSec, windowSec]);

  /* ---------- CHUNK FETCH (windowStartSec drives fetch) ---------- */
  useEffect(() => {
    if (!API_BASE || !API_KEY || !meta) return;

    const fs = meta.sampling_rate_hz;
    const duration = meta.n_samples / fs;
    const maxStart = Math.max(0, duration - windowSec);

    const startSec = clamp(windowStartSec, 0, maxStart);
    if (startSec !== windowStartSec) {
      setWindowStartSec(startSec);
      return;
    }

    const start = Math.max(0, Math.floor(startSec * fs));
    const length = Math.max(1, Math.floor(windowSec * fs));
    const k = keyFor(start, length);

    const cached = cacheRef.current.get(k);
    if (cached) {
      setSignals(cached);
      setLoadingChunk(false);
      hasPaintedOnce.current = true;
      return;
    }

    setLoadingChunk(true);
    const reqId = ++lastReqId.current;

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

    // Prefetch next windows (to avoid stall at edges)
    for (let i = 1; i <= PREFETCH_WINDOWS; i++) {
      const pStart = start + i * length;
      const pk = keyFor(pStart, length);
      if (cacheRef.current.has(pk)) continue;

      fetchWithTimeout(
        `${API_BASE}/studies/${STUDY_ID}/chunk.bin?root=.&start=${pStart}&length=${length}`,
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
          cacheRef.current.set(pk, reshapeF32ToChannels(f32, x.nCh, x.nSamp));
        })
        .catch(() => {});
    }
  }, [meta, windowStartSec, windowSec]);

  /* ---------- PLAYBACK (smooth) ---------- */
  useEffect(() => {
    if (!playing || !meta) return;

    const fs = meta.sampling_rate_hz;
    const duration = meta.n_samples / fs;

    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      setPlayheadSec((t) => clamp(t + dt, 0, duration));
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, meta]);

  /* ---------- CHANNEL ORDER + LABELS ---------- */
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

  /* ---------- ARTIFACTS/MARKERS RELATIVE TO WINDOW ---------- */
  const localCursorSec = playheadSec - windowStartSec;

  const windowArtifacts =
    showArtifacts
      ? artifacts
          .filter((a) => a.end_sec > windowStartSec && a.start_sec < windowStartSec + windowSec)
          .map((a) => ({
            start_sec: a.start_sec - windowStartSec,
            end_sec: a.end_sec - windowStartSec,
            label: a.label,
            channel: a.channel,
          }))
      : [];

  const windowMarkers = annotations
    .filter((m) => m.start_sec >= windowStartSec && m.start_sec <= windowStartSec + windowSec)
    .map((m, idx) => ({
      id: `ann-${idx}`,
      timestamp_sec: m.start_sec - windowStartSec,
      marker_type: "event",
      label: m.label ?? "annotation",
    }));

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
        {loadingChunk ? <Badge variant="secondary">Loading…</Badge> : <Badge variant="secondary">OK</Badge>}
        <Badge variant="secondary">
          t={playheadSec.toFixed(2)}s (win {windowStartSec.toFixed(2)}–{(windowStartSec + windowSec).toFixed(2)})
        </Badge>

        <Switch checked={showArtifacts} onCheckedChange={setShowArtifacts} />
        <span>Artifacts</span>

        <Switch checked={suppressArtifacts} onCheckedChange={setSuppressArtifacts} />
        <span>Suppress</span>
      </div>

      <EEGControls
        isPlaying={playing}
        onPlayPause={() => setPlaying((p) => !p)}
        currentTime={playheadSec}
        duration={durationSec}
        onTimeChange={(t) => {
          setPlaying(false);
          setPlayheadSec(t);
          // recenter window around seek
          setWindowStartSec(clamp(t - windowSec * 0.25, 0, Math.max(0, durationSec - windowSec)));
        }}
        timeWindow={windowSec}
        onTimeWindowChange={(w) => {
          setWindowSec(w);
          setWindowStartSec((s) => clamp(s, 0, Math.max(0, durationSec - w)));
        }}
        amplitudeScale={amplitude}
        onAmplitudeScaleChange={setAmplitude}
        playbackSpeed={1}
        onPlaybackSpeedChange={() => {}}
        onSkipBackward={() => {
          const t = Math.max(0, playheadSec - windowSec);
          setPlaying(false);
          setPlayheadSec(t);
          setWindowStartSec(clamp(t - windowSec * 0.25, 0, Math.max(0, durationSec - windowSec)));
        }}
        onSkipForward={() => {
          const t = Math.min(durationSec, playheadSec + windowSec);
          setPlaying(false);
          setPlayheadSec(t);
          setWindowStartSec(clamp(t - windowSec * 0.25, 0, Math.max(0, durationSec - windowSec)));
        }}
        onExport={() => {}}
      />

      <div className="flex-1">
        <WebGLEEGViewer
          signals={signals}
          channelLabels={orderedChannelLabels}
          channelIndexOrder={orderedChannelIndices}
          sampleRate={meta.sampling_rate_hz}
          currentTime={localCursorSec} // smooth cursor inside window
          timeWindow={windowSec}
          amplitudeScale={amplitude}
          visibleChannels={new Set(orderedChannelIndices)}
          theme={theme ?? "dark"}
          markers={windowMarkers as any}
          artifactIntervals={windowArtifacts as any}
          showArtifactsAsRed={true}
        />
      </div>
    </div>
  );
}
