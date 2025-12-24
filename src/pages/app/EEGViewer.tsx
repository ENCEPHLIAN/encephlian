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

/**
 * Prefer env vars (correct for production).
 * Fallback to hardcoded values ONLY to unblock MVP if Lovable env injection is failing.
 * Remove hardcoded fallback after env is confirmed.
 */
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

/* =======================
   HELPERS
======================= */
function authHeaders() {
  return { "X-API-KEY": API_KEY };
}

function reshapeF32ToChannels(f32: Float32Array, nCh: number, nSamp: number): number[][] {
  const out: number[][] = Array.from({ length: nCh }, () => new Array(nSamp));
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
   COMPONENT
======================= */
export default function EEGViewer() {
  const { theme } = useTheme();

  /* ---------- STATE ---------- */
  const [meta, setMeta] = useState<Meta | null>(null);
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

  const lastReqId = useRef(0);

  /* ---------- EARLY CONFIG SANITY ---------- */
  useEffect(() => {
    // If someone left placeholder values in env, fail loudly.
    if (isProbablyPlaceholderEnv(API_BASE) || isProbablyPlaceholderEnv(API_KEY)) {
      setError(
        `Bad config. API_BASE/API_KEY look missing or placeholder.\n` +
          `API_BASE=${String(API_BASE)}\nAPI_KEY=${API_KEY ? "present" : "missing"}\n` +
          `Set VITE_ENCEPH_READ_API_BASE + VITE_ENCEPH_READ_API_KEY and redeploy.`,
      );
      setLoadingMeta(false);
      setLoadingChunk(false);
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

  /* ---------- LOAD WINDOW CHUNK (BINARY) ---------- */
  useEffect(() => {
    if (!meta) return;

    const fs = meta.sampling_rate_hz;
    const maxT = Math.max(0, meta.n_samples / fs - windowSec);

    const t0 = clamp(currentTime, 0, maxT);
    if (t0 !== currentTime) setCurrentTime(t0);

    const start = Math.max(0, Math.floor(t0 * fs));
    const length = Math.max(1, Math.floor(windowSec * fs));

    const reqId = ++lastReqId.current;
    setLoadingChunk(true);
    setError(null);

    fetchWithTimeout(
      `${API_BASE}/studies/${STUDY_ID}/chunk.bin?root=.&start=${start}&length=${length}`,
      { headers: authHeaders() },
      15000,
    )
      .then((r) => {
        if (!r.ok) throw new Error(`chunk.bin ${r.status} ${r.statusText}`);

        // These headers must be exposed by CORS for browser access.
        const nCh = Number(r.headers.get("x-eeg-nchannels"));
        const nSamp = Number(r.headers.get("x-eeg-length"));
        const dtype = r.headers.get("x-eeg-dtype");

        if (!Number.isFinite(nCh) || !Number.isFinite(nSamp)) {
          throw new Error(
            "Missing x-eeg-* headers in browser. This usually means CORS expose_headers is missing or a proxy is stripping headers.",
          );
        }
        if (dtype && dtype !== "float32") throw new Error(`Unexpected dtype: ${dtype}`);

        return r.arrayBuffer().then((buf) => ({ buf, nCh, nSamp }));
      })
      .then(({ buf, nCh, nSamp }) => {
        if (reqId !== lastReqId.current) return;

        const f32 = new Float32Array(buf);
        if (f32.length !== nCh * nSamp) {
          throw new Error(`Bad payload length: got ${f32.length}, expected ${nCh * nSamp}`);
        }

        // RAW is immutable; this is a render-time reshape only.
        setSignals(reshapeF32ToChannels(f32, nCh, nSamp));
      })
      .catch((e) => {
        if (reqId !== lastReqId.current) return;
        setSignals(null);
        setError(String(e));
      })
      .finally(() => {
        if (reqId === lastReqId.current) setLoadingChunk(false);
      });
  }, [meta, currentTime, windowSec]);

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
        // Suppression is display-only (does not mutate raw).
        return hit ? v * 0.25 : v;
      }),
    );
  }, [signals, suppressArtifacts, artifacts, meta, currentTime]);

  /* ---------- RENDER ---------- */
  if (error) {
    return (
      <div className="h-full w-full p-4 space-y-2">
        <div className="text-sm font-semibold text-red-500">EEGViewer failed</div>
        <pre className="text-xs whitespace-pre-wrap break-words text-red-400">{error}</pre>
        <div className="text-xs opacity-70">
          If this says missing x-eeg headers: confirm CORS expose_headers in Read API and redeploy. If this says
          timeouts: use the revision FQDN as API_BASE.
        </div>
      </div>
    );
  }

  if (!meta || !signals || loadingMeta || loadingChunk) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-2 flex gap-4 items-center border-b">
        <Badge>{meta.n_channels} ch</Badge>
        <Badge>{meta.sampling_rate_hz} Hz</Badge>

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
        onTimeChange={setCurrentTime}
        timeWindow={windowSec}
        onTimeWindowChange={setWindowSec}
        amplitudeScale={amplitude}
        onAmplitudeScaleChange={setAmplitude}
        playbackSpeed={1}
        onPlaybackSpeedChange={() => {}}
        onSkipBackward={() => setCurrentTime((t) => Math.max(0, t - windowSec))}
        onSkipForward={() => setCurrentTime((t) => Math.min(t + windowSec, meta.n_samples / meta.sampling_rate_hz))}
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
