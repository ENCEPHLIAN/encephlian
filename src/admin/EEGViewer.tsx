import React, { useEffect, useMemo, useRef, useState } from "react";

type Meta = {
  study_id: string;
  sampling_rate_hz: number; // 250
  n_channels: number;
  n_samples: number;
  channels?: string[];
};

type ChunkResp = {
  study_id?: string;
  start: number;
  length: number;
  dtype: string;
  shape: [number, number]; // [nCh, nSamp]
  order: "C";
  data_b64: string;
};

type MaskResp = {
  study_id?: string;
  start: number;
  length: number;
  dtype: string; // uint8
  shape: [number]; // [nSamp]
  data_b64: string;
};

function b64ToUint8(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64ToFloat32(b64: string): Float32Array {
  const bytes = b64ToUint8(b64);
  // assumes little-endian float32
  return new Float32Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 4));
}

function colorForIndex(i: number): string {
  // Good-enough distinct palette without external libs
  const hues = [210, 0, 120, 30, 270, 160, 50, 300, 190, 340, 90, 240];
  const h = hues[i % hues.length];
  const s = 70;
  const l = 40;
  return `hsl(${h} ${s}% ${l}%)`;
}

function useCanvasSize(containerRef: React.RefObject<HTMLDivElement>) {
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: Math.max(1, Math.floor(r.width)), h: Math.max(1, Math.floor(r.height)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef]);

  return size;
}

export default function EEGViewer({
  apiBase,
  apiKey,
  root = ".",
  studyId,
  meta,
  secondsPerWindow = 10,
}: {
  apiBase: string; // e.g. https://your-read-api...
  apiKey: string;
  root?: string;
  studyId: string;
  meta: Meta;
  secondsPerWindow?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const { w: cssW, h: cssH } = useCanvasSize(containerRef);

  const sfreq = meta.sampling_rate_hz ?? 250;
  const nCh = meta.n_channels ?? meta.channels?.length ?? 0;

  const [playing, setPlaying] = useState(true);
  const [playheadSec, setPlayheadSec] = useState(0);
  const [channelSpacingUv, setChannelSpacingUv] = useState(40); // UI units (not true uV unless calibrated)
  const [downsample, setDownsample] = useState(4);

  const windowLenSamp = useMemo(() => Math.max(250, Math.floor(secondsPerWindow * sfreq)), [secondsPerWindow, sfreq]);

  // Keep canvas DPI-correct + deterministic (prevents shrinking)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.max(1, window.devicePixelRatio || 1);

    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // critical: reset transform then set once (prevents accumulating scale)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }, [cssW, cssH]);

  // Playback clock
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();

    const tick = (t: number) => {
      const dt = (t - last) / 1000;
      last = t;
      setPlayheadSec((s) => {
        const durSec = meta.n_samples / sfreq;
        const next = s + dt;
        return next >= durSec ? 0 : next;
      });
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, meta.n_samples, sfreq]);

  // Fetch a window around playhead
  const [chunk, setChunk] = useState<{ start: number; data: Float32Array; shape: [number, number] } | null>(null);
  const [mask, setMask] = useState<{ start: number; data: Uint8Array; length: number } | null>(null);

  useEffect(() => {
    const abort = new AbortController();

    (async () => {
      const center = Math.floor(playheadSec * sfreq);
      const start = Math.max(0, center - Math.floor(windowLenSamp / 2));
      const length = Math.min(windowLenSamp, meta.n_samples - start);

      const hdrs: Record<string, string> = { "X-API-KEY": apiKey };

      const [cRes, mRes] = await Promise.all([
        fetch(`${apiBase}/studies/${studyId}/chunk?root=${encodeURIComponent(root)}&start=${start}&length=${length}`, {
          headers: hdrs,
          signal: abort.signal,
        }),
        fetch(
          `${apiBase}/studies/${studyId}/artifact?root=${encodeURIComponent(root)}&start=${start}&length=${length}`,
          {
            headers: hdrs,
            signal: abort.signal,
          },
        ),
      ]);

      if (!cRes.ok) return;
      if (!mRes.ok) return;

      const cJson = (await cRes.json()) as ChunkResp;
      const mJson = (await mRes.json()) as MaskResp;

      const c = b64ToFloat32(cJson.data_b64);
      const m = b64ToUint8(mJson.data_b64);

      setChunk({ start, data: c, shape: cJson.shape });
      setMask({ start, data: m, length: mJson.length });
    })().catch(() => {});

    return () => abort.abort();
  }, [playheadSec, sfreq, windowLenSamp, apiBase, apiKey, root, studyId, meta.n_samples]);

  // Draw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear
    ctx.clearRect(0, 0, cssW, cssH);

    // Background (not black)
    ctx.fillStyle = "#f7f7fb";
    ctx.fillRect(0, 0, cssW, cssH);

    // Panel padding
    const padL = 56;
    const padR = 16;
    const padT = 16;
    const padB = 20;
    const plotW = Math.max(1, cssW - padL - padR);
    const plotH = Math.max(1, cssH - padT - padB);

    // Grid
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "rgba(0,0,0,0.08)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 8; i++) {
      const x = padL + (plotW * i) / 8;
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + plotH);
      ctx.stroke();
    }
    for (let i = 0; i <= 6; i++) {
      const y = padT + (plotH * i) / 6;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();
    }

    if (!chunk || !mask) return;

    const [chCount, sampCount] = chunk.shape;
    const stride = sampCount; // row-major: channel blocks contiguous
    const ds = Math.max(1, downsample);

    // Artifact overlay shading (vertical bands)
    // mask.data is uint8 per sample (0/1)
    ctx.fillStyle = "rgba(255, 80, 80, 0.12)";
    const m = mask.data;
    for (let i = 0; i < m.length; i += ds) {
      if (m[i] === 0) continue;
      const x = padL + (i / (sampCount - 1)) * plotW;
      // small band
      ctx.fillRect(x, padT, Math.max(1, (plotW / sampCount) * ds), plotH);
    }

    // Plot traces
    const centerYForCh = (ch: number) => {
      const laneH = plotH / Math.max(1, chCount);
      return padT + laneH * (ch + 0.5);
    };

    // scale factor: user slider maps to pixels/lane
    const laneH = plotH / Math.max(1, chCount);
    const ampPx = Math.max(2, (laneH * 0.42 * 40) / Math.max(1, channelSpacingUv)); // heuristic

    for (let ch = 0; ch < chCount; ch++) {
      const y0 = centerYForCh(ch);

      // faint baseline
      ctx.strokeStyle = "rgba(0,0,0,0.15)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padL, y0);
      ctx.lineTo(padL + plotW, y0);
      ctx.stroke();

      ctx.strokeStyle = colorForIndex(ch);
      ctx.lineWidth = 1.25;
      ctx.beginPath();

      for (let i = 0; i < sampCount; i += ds) {
        const x = padL + (i / (sampCount - 1)) * plotW;
        const v = chunk.data[ch * stride + i]; // float32
        const y = y0 - v * ampPx; // assumes v is roughly in “scaled uV-like” units
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }

      ctx.stroke();

      // channel label
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.font = "12px system-ui, -apple-system";
      const label = meta.channels?.[ch] ?? `Ch ${ch + 1}`;
      ctx.fillText(label, 8, y0 + 4);
    }

    // Playhead (center of window)
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 2;
    const px = padL + plotW * 0.5;
    ctx.beginPath();
    ctx.moveTo(px, padT);
    ctx.lineTo(px, padT + plotH);
    ctx.stroke();
  }, [chunk, mask, cssW, cssH, downsample, channelSpacingUv, meta.channels]);

  return (
    <div style={{ width: "100%", height: "100%" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 10 }}>
        <button onClick={() => setPlaying((p) => !p)}>{playing ? "Pause" : "Play"}</button>
        <button onClick={() => setPlayheadSec(0)}>Reset</button>

        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          Channel Spacing
          <input
            type="range"
            min={10}
            max={120}
            value={channelSpacingUv}
            onChange={(e) => setChannelSpacingUv(Number(e.target.value))}
          />
          <span>{channelSpacingUv}</span>
        </label>

        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          Downsample
          <input
            type="range"
            min={1}
            max={16}
            value={downsample}
            onChange={(e) => setDownsample(Number(e.target.value))}
          />
          <span>{downsample}×</span>
        </label>

        <div style={{ marginLeft: "auto", opacity: 0.7 }}>
          Playhead: {playheadSec.toFixed(2)}s / {(meta.n_samples / sfreq).toFixed(2)}s
        </div>
      </div>

      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "520px",
          borderRadius: 12,
          overflow: "hidden",
          border: "1px solid rgba(0,0,0,0.08)",
          background: "#ffffff",
        }}
      >
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}
