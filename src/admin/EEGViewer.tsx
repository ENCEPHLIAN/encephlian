import { useRef, useEffect, useCallback, useMemo, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface EEGViewerProps {
  signals: Float32Array[];
  channelNames: string[];
  samplingRate: number;
  artifactMask?: Uint8Array;

  spacing?: number;
  downsampleFactor?: number;
  onSpacingChange?: (spacing: number) => void;
  onDownsampleChange?: (factor: number) => void;
}

/**
 * Decodes base64 float32 data (C-order) into a 2D array of channels
 */
export function decodeFloat32B64(b64: string, nChannels: number, nSamples: number): Float32Array[] {
  const binaryString = atob(b64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);

  // important: Float32Array over the bytes buffer
  const float32 = new Float32Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 4));

  const channels: Float32Array[] = [];
  for (let ch = 0; ch < nChannels; ch++) {
    const start = ch * nSamples;
    channels.push(float32.slice(start, start + nSamples));
  }
  return channels;
}

/**
 * Decodes base64 uint8 artifact mask
 */
export function decodeUint8B64(b64: string): Uint8Array {
  const binaryString = atob(b64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}

function colorForIndex(i: number): string {
  const hues = [210, 0, 120, 30, 270, 160, 50, 300, 190, 340, 90, 240];
  const h = hues[i % hues.length];
  return `hsl(${h} 70% 45%)`;
}

export default function EEGViewer({
  signals,
  channelNames,
  samplingRate,
  artifactMask,
  spacing = 40,
  downsampleFactor = 4,
  onSpacingChange,
  onDownsampleChange,
}: EEGViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0); // in samples

  const nChannels = signals.length;
  const nSamples = signals[0]?.length ?? 0;

  const durationSec = useMemo(() => (nSamples && samplingRate ? nSamples / samplingRate : 0), [nSamples, samplingRate]);

  // keep playhead moving (optional)
  useEffect(() => {
    if (!playing || nSamples === 0) return;
    let raf = 0;
    let last = performance.now();
    const tick = (t: number) => {
      const dt = (t - last) / 1000;
      last = t;
      setPlayhead((p) => {
        const next = p + Math.floor(dt * samplingRate);
        return next >= nSamples ? 0 : next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, nSamples, samplingRate]);

  // ResizeObserver -> redraw when container size changes
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver(() => {
      drawEEG();
    });
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signals, spacing, downsampleFactor, artifactMask, channelNames, samplingRate, playhead]);

  const drawEEG = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    if (!signals || signals.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = container.getBoundingClientRect();
    const cssW = Math.max(1, Math.floor(rect.width));
    const cssH = Math.max(300, Math.floor(rect.height)); // enforce sane height

    const dpr = Math.max(1, window.devicePixelRatio || 1);

    // Set canvas backing store
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);

    // CRITICAL: reset transform each draw (prevents “shrinking / scaling drift”)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Background (not black)
    ctx.fillStyle = "hsl(var(--background))";
    ctx.fillRect(0, 0, cssW, cssH);

    const leftMargin = 90;
    const rightMargin = 16;
    const topMargin = 14;
    const bottomMargin = 24;

    const plotW = Math.max(1, cssW - leftMargin - rightMargin);
    const plotH = Math.max(1, cssH - topMargin - bottomMargin);

    const nCh = signals.length;
    const nSamp = signals[0]?.length ?? 0;
    if (nSamp === 0) return;

    const laneH = plotH / Math.max(1, nCh);

    // Grid
    ctx.strokeStyle = "hsl(var(--border))";
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.35;

    for (let i = 0; i <= 8; i++) {
      const x = leftMargin + (plotW * i) / 8;
      ctx.beginPath();
      ctx.moveTo(x, topMargin);
      ctx.lineTo(x, topMargin + plotH);
      ctx.stroke();
    }
    for (let i = 0; i <= nCh; i++) {
      const y = topMargin + i * laneH;
      ctx.beginPath();
      ctx.moveTo(leftMargin, y);
      ctx.lineTo(leftMargin + plotW, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Artifact overlay (vertical bands)
    if (artifactMask && artifactMask.length > 0) {
      ctx.fillStyle = "rgba(255, 80, 80, 0.10)";
      const ds = Math.max(1, downsampleFactor);
      for (let i = 0; i < Math.min(artifactMask.length, nSamp); i += ds) {
        if (artifactMask[i] === 0) continue;
        const x = leftMargin + (i / (nSamp - 1)) * plotW;
        ctx.fillRect(x, topMargin, Math.max(1, (plotW / nSamp) * ds), plotH);
      }
    }

    // Labels
    ctx.fillStyle = "hsl(var(--foreground))";
    ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";

    for (let ch = 0; ch < nCh; ch++) {
      const y = topMargin + laneH * (ch + 0.5);
      const label = channelNames[ch] ?? `Ch ${ch + 1}`;
      ctx.fillText(label, leftMargin - 10, y);
    }

    // Scaling: spacing slider is “bigger spacing => smaller waveform”
    // This maps roughly to “microvolt scale feel” even if raw units differ.
    const ampPx = Math.max(2, (laneH * 0.42 * 40) / Math.max(1, spacing));

    // Draw traces
    const ds = Math.max(1, downsampleFactor);
    const nPts = Math.max(2, Math.ceil(nSamp / ds));
    const xScale = plotW / (nPts - 1);

    for (let ch = 0; ch < nCh; ch++) {
      const sig = signals[ch];
      const y0 = topMargin + laneH * (ch + 0.5);

      ctx.strokeStyle = colorForIndex(ch);
      ctx.lineWidth = 1.1;
      ctx.beginPath();

      let p = 0;
      for (let i = 0; i < nSamp; i += ds) {
        const x = leftMargin + p * xScale;
        const v = sig[i] ?? 0;
        const y = y0 - v * ampPx;
        if (p === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        p++;
      }
      ctx.stroke();
    }

    // Playhead line
    if (nSamp > 1) {
      const ph = Math.max(0, Math.min(playhead, nSamp - 1));
      const x = leftMargin + (ph / (nSamp - 1)) * plotW;
      ctx.strokeStyle = "rgba(0, 200, 120, 0.65)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, topMargin);
      ctx.lineTo(x, topMargin + plotH);
      ctx.stroke();
    }

    // Time axis
    ctx.fillStyle = "hsl(var(--muted-foreground))";
    ctx.font = "11px system-ui, -apple-system";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const dur = nSamp / samplingRate;
    for (let i = 0; i <= 5; i++) {
      const x = leftMargin + (plotW * i) / 5;
      const t = (dur * i) / 5;
      ctx.fillText(`${t.toFixed(1)}s`, x, topMargin + plotH + 4);
    }
  }, [signals, channelNames, samplingRate, artifactMask, spacing, downsampleFactor, playhead]);

  useEffect(() => {
    drawEEG();
  }, [drawEEG]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-4 items-center">
        <Button variant="outline" size="sm" onClick={() => setPlaying((p) => !p)}>
          {playing ? "Pause" : "Play"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setPlayhead(0);
            setPlaying(false);
          }}
        >
          Reset
        </Button>

        <div className="flex flex-col gap-1 w-56">
          <Label className="text-xs text-muted-foreground">Channel Spacing: {spacing} µV</Label>
          <Slider value={[spacing]} onValueChange={([v]) => onSpacingChange?.(v)} min={10} max={200} step={5} />
        </div>

        <div className="flex flex-col gap-1 w-56">
          <Label className="text-xs text-muted-foreground">Downsample: {downsampleFactor}×</Label>
          <Slider
            value={[downsampleFactor]}
            onValueChange={([v]) => onDownsampleChange?.(v)}
            min={1}
            max={16}
            step={1}
          />
        </div>

        <div className="text-xs text-muted-foreground ml-auto">
          {durationSec ? `Window: ${durationSec.toFixed(1)}s` : null}
        </div>
      </div>

      <div
        ref={containerRef}
        className="w-full h-[520px] rounded-lg border border-border bg-background overflow-hidden"
      >
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}
