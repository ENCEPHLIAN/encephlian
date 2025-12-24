import { useEffect, useState, useMemo, useRef } from "react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { WebGLEEGViewer } from "@/components/eeg/WebGLEEGViewer";
import { EEGControls } from "@/components/eeg/EEGControls";
import { useTheme } from "next-themes";

/* =======================
   CONFIG — DO NOT TOUCH
======================= */
const STUDY_ID = "TUH_CANON_001";
const API_BASE = import.meta.env.VITE_ENCEPH_READ_API_BASE;
const API_KEY = import.meta.env.VITE_ENCEPH_READ_API_KEY;

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
  return {
    "X-API-KEY": API_KEY,
  };
}

/**
 * Your API returns Float32Array of length n_channels * n_samp.
 * We reshape to number[][] for the existing WebGLEEGViewer.
 *
 * IMPORTANT: This does not mutate the raw float buffer; it copies into JS numbers.
 * Later optimization: update WebGLEEGViewer to accept Float32Array directly.
 */
function reshapeF32ToChannels(f32: Float32Array, nCh: number, nSamp: number): number[][] {
  const out: number[][] = Array.from({ length: nCh }, () => new Array(nSamp));
  for (let ch = 0; ch < nCh; ch++) {
    const base = ch * nSamp;
    for (let i = 0; i < nSamp; i++) out[ch][i] = f32[base + i];
  }
  return out;
}

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

  const [loading, setLoading] = useState(true);
  const lastReqId = useRef(0);

  /* ---------- LOAD META ---------- */
  useEffect(() => {
    let alive = true;
    setLoading(true);

    fetch(`${API_BASE}/studies/${STUDY_ID}/meta?root=.`, { headers: authHeaders() })
      .then((r) => {
        if (!r.ok) throw new Error(`meta ${r.status}`);
        return r.json();
      })
      .then((j) => {
        if (!alive) return;
        setMeta(j.meta ?? j);
      })
      .catch((e) => {
        console.error(e);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  /* ---------- LOAD ARTIFACTS ---------- */
  useEffect(() => {
    fetch(`${API_BASE}/studies/${STUDY_ID}/artifacts?root=.`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : { artifacts: [] }))
      .then((j) => setArtifacts(j.artifacts ?? []))
      .catch(() => setArtifacts([]));
  }, []);

  /* ---------- LOAD WINDOW CHUNK (BINARY) ---------- */
  useEffect(() => {
    if (!meta) return;

    const fs = meta.sampling_rate_hz;
    const start = Math.max(0, Math.floor(currentTime * fs));
    const length = Math.max(1, Math.floor(windowSec * fs));

    const reqId = ++lastReqId.current;
    const controller = new AbortController();

    setLoading(true);

    fetch(`${API_BASE}/studies/${STUDY_ID}/chunk.bin?root=.&start=${start}&length=${length}`, {
      headers: authHeaders(),
      signal: controller.signal,
    })
      .then((r) => {
        if (!r.ok) throw new Error(`chunk.bin ${r.status}`);

        // Contract headers (authoritative)
        const nCh = Number(r.headers.get("x-eeg-nchannels"));
        const nSamp = Number(r.headers.get("x-eeg-length"));
        const dtype = r.headers.get("x-eeg-dtype");

        if (!Number.isFinite(nCh) || !Number.isFinite(nSamp)) {
          throw new Error("missing x-eeg-* headers");
        }
        if (dtype && dtype !== "float32") {
          throw new Error(`unexpected dtype: ${dtype}`);
        }

        return r.arrayBuffer().then((buf) => ({ buf, nCh, nSamp }));
      })
      .then(({ buf, nCh, nSamp }) => {
        // stale response guard
        if (reqId !== lastReqId.current) return;

        const f32 = new Float32Array(buf);
        // validate size
        if (f32.length !== nCh * nSamp) {
          throw new Error(`bad payload: f32=${f32.length} expected=${nCh * nSamp}`);
        }

        const reshaped = reshapeF32ToChannels(f32, nCh, nSamp);
        setSignals(reshaped);
      })
      .catch((e) => {
        if (e?.name === "AbortError") return;
        console.error(e);
      })
      .finally(() => {
        // only clear loading if this is the latest request
        if (reqId === lastReqId.current) setLoading(false);
      });

    return () => controller.abort();
  }, [meta, currentTime, windowSec]);

  /* ---------- PLAYBACK ---------- */
  useEffect(() => {
    if (!playing || !meta) return;

    const maxT = Math.max(0, meta.n_samples / meta.sampling_rate_hz - windowSec);
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
        return hit ? v * 0.25 : v;
      }),
    );
  }, [signals, suppressArtifacts, artifacts, meta, currentTime]);

  /* ---------- RENDER ---------- */
  if (!meta || !signals || loading) {
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
        onSkipForward={() => setCurrentTime((t) => t + windowSec)}
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
