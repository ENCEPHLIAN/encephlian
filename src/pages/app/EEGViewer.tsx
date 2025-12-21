import { useEffect, useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
const API_BASE = import.meta.env.VITE_ENCEPH_READ_API_BASE ?? "http://localhost:8787";
const API_KEY = import.meta.env.VITE_ENCEPH_READ_API_KEY ?? "e3sg-bdNyNfP5LIaDP75Ko4d7JybGTJnMCCBNHgXMEM";

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
function headers() {
  return {
    "Content-Type": "application/json",
    "X-API-KEY": API_KEY,
  };
}

function decodeFloat32Hex(hex: string, nCh: number, nSamp: number) {
  const bytes = new Uint8Array(hex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));
  const f32 = new Float32Array(bytes.buffer);
  const out: number[][] = Array.from({ length: nCh }, () => []);
  for (let ch = 0; ch < nCh; ch++) {
    const start = ch * nSamp;
    for (let i = 0; i < nSamp; i++) {
      out[ch].push(f32[start + i]);
    }
  }
  return out;
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

  const [loading, setLoading] = useState(true);

  /* ---------- LOAD META ---------- */
  useEffect(() => {
    fetch(`${API_BASE}/studies/${STUDY_ID}/meta?root=.`, { headers: headers() })
      .then((r) => r.json())
      .then((j) => setMeta(j.meta ?? j))
      .catch(console.error);
  }, []);

  /* ---------- LOAD ARTIFACTS ---------- */
  useEffect(() => {
    fetch(`${API_BASE}/studies/${STUDY_ID}/artifacts?root=.`, { headers: headers() })
      .then((r) => (r.ok ? r.json() : { artifacts: [] }))
      .then((j) => setArtifacts(j.artifacts ?? []))
      .catch(() => setArtifacts([]));
  }, []);

  /* ---------- LOAD WINDOW CHUNK ---------- */
  useEffect(() => {
    if (!meta) return;
    setLoading(true);

    const fs = meta.sampling_rate_hz;
    const start = Math.floor(currentTime * fs);
    const length = Math.floor(windowSec * fs);

    fetch(`${API_BASE}/studies/${STUDY_ID}/chunk?root=.&start=${start}&length=${length}`, { headers: headers() })
      .then((r) => r.json())
      .then((j) => {
        const raw = decodeFloat32Hex(j.data_b64, j.n_channels, j.length);
        setSignals(raw);
        setLoading(false);
      })
      .catch(console.error);
  }, [meta, currentTime, windowSec]);

  /* ---------- PLAYBACK ---------- */
  useEffect(() => {
    if (!playing || !meta) return;

    const maxT = meta.n_samples / meta.sampling_rate_hz - windowSec;
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
