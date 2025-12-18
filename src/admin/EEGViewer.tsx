import { useRef, useEffect, useCallback, useMemo, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Play, Pause, RotateCcw } from "lucide-react";

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
  const float32 = new Float32Array(bytes.buffer);
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

export default function EEGViewer({
  signals,
  channelNames,
  samplingRate,
  artifactMask,
  spacing = 40,
  downsampleFactor = 2,
  onSpacingChange,
  onDownsampleChange,
}: EEGViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);

  // Simple “player” state
  const [isPlaying, setIsPlaying] = useState(false);
  const [playheadSec, setPlayheadSec] = useState(0);

  // Auto-gain toggled by user
  const [autoGain, setAutoGain] = useState(true);

  const nChannels = signals.length;
  const nSamples = signals[0]?.length ?? 0;
  const durationSec = useMemo(() => (samplingRate > 0 ? nSamples / samplingRate : 0), [nSamples, samplingRate]);

  // Player loop
  useEffect(() => {
    if (!isPlaying) return;

    const start = performance.now();
    const startPlayhead = playheadSec;

    const tick = (t: number) => {
      const dt = (t - start) / 1000;
      let next = startPlayhead + dt;

      if (durationSec > 0) {
        if (next >= durationSec) next = durationSec;
      }

      setPlayheadSec(next);

      if (durationSec > 0 && next >= durationSec) {
        setIsPlaying(false);
        return;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, durationSec]);

  const drawEEG = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || nChannels === 0 || nSamples === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Robust sizing: clientWidth can be 0 briefly; fallback to parent width
    const parent = canvas.parentElement;
    const cssWidth = Math.max(320, Math.floor(canvas.clientWidth || parent?.clientWidth || 800));
    const cssHeight = Math.max(240, Math.floor(canvas.clientHeight || 500));

    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.floor(cssWidth * dpr);
    canvas.height = Math.floor(cssHeight * dpr);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;

    // ✅ CRITICAL FIX: reset transform every draw (prevents shrinking)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    // Clear
    ctx.fillStyle = "hsl(var(--background))";
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    const leftMargin = 90;
    const rightMargin = 16;
    const topMargin = 16;
    const bottomMargin = 34;

    const plotWidth = Math.max(10, cssWidth - leftMargin - rightMargin);
    const plotHeight = Math.max(10, cssHeight - topMargin - bottomMargin);
    const channelHeight = plotHeight / nChannels;

    // Choose draw sampling
    const ds = Math.max(1, Math.floor(downsampleFactor));
    const downLen = Math.max(2, Math.ceil(nSamples / ds));
    const xScale = plotWidth / (downLen - 1);

    // Auto-gain: compute global maxAbs across displayed channels (downsampled)
    let maxAbs = 0;
    if (autoGain) {
      for (let ch = 0; ch < nChannels; ch++) {
        const sig = signals[ch];
        for (let i = 0; i < nSamples; i += ds * 4) {
          const a = Math.abs(sig[i] ?? 0);
          if (a > maxAbs) maxAbs = a;
        }
      }
      if (maxAbs === 0) maxAbs = 1;
    }

    // Map uV spacing to amplitude; if autoGain we map maxAbs to ~40% of channel height
    const yScale = autoGain ? (channelHeight * 0.4) / maxAbs : channelHeight / (Math.max(1, spacing) * 2);

    // Artifact overlay (efficient): paint vertical bands using downsampled timeline
    if (artifactMask && artifactMask.length > 0) {
      // artifactMask is per-sample; convert to per-downsample index check
      ctx.fillStyle = "rgba(239, 68, 68, 0.12)";
      const samplesPerX = (nSamples - 1) / (plotWidth - 1);
      for (let px = 0; px < plotWidth; px++) {
        const s = Math.min(nSamples - 1, Math.max(0, Math.floor(px * samplesPerX)));
        if (s < artifactMask.length && artifactMask[s] > 0) {
          ctx.fillRect(leftMargin + px, topMargin, 1, plotHeight);
        }
      }
    }

    // Grid lines
    ctx.strokeStyle = "hsl(var(--border))";
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= nChannels; i++) {
      const y = topMargin + i * channelHeight;
      ctx.beginPath();
      ctx.moveTo(leftMargin, y);
      ctx.lineTo(cssWidth - rightMargin, y);
      ctx.stroke();
    }

    // Labels
    ctx.fillStyle = "hsl(var(--foreground))";
    ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let ch = 0; ch < nChannels; ch++) {
      const y = topMargin + ch * channelHeight + channelHeight / 2;
      const label = channelNames[ch] || `Ch ${ch + 1}`;
      ctx.fillText(label.slice(0, 10), leftMargin - 8, y);
    }

    // Signals
    ctx.strokeStyle = "hsl(var(--primary))";
    ctx.lineWidth = 1;

    for (let ch = 0; ch < nChannels; ch++) {
      const sig = signals[ch];
      const yCenter = topMargin + ch * channelHeight + channelHeight / 2;

      ctx.beginPath();
      let p = 0;
      for (let s = 0; s < nSamples; s += ds) {
        const x = leftMargin + p * xScale;
        const y = yCenter - (sig[s] ?? 0) * yScale;
        if (p === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        p++;
      }
      ctx.stroke();
    }

    // Playhead
    if (durationSec > 0) {
      const ph = Math.max(0, Math.min(durationSec, playheadSec));
      const phX = leftMargin + (ph / durationSec) * plotWidth;

      ctx.strokeStyle = "rgba(34, 197, 94, 0.9)"; // green-ish
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(phX, topMargin);
      ctx.lineTo(phX, topMargin + plotHeight);
      ctx.stroke();
    }

    // Time axis
    ctx.fillStyle = "hsl(var(--muted-foreground))";
    ctx.font = "10px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    const numTicks = 5;
    for (let i = 0; i <= numTicks; i++) {
      const x = leftMargin + (i / numTicks) * plotWidth;
      const time = (i / numTicks) * (durationSec || 0);
      ctx.fillText(`${time.toFixed(1)}s`, x, cssHeight - bottomMargin + 6);
    }

    // Debug badge (small)
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(autoGain ? `autogain: maxAbs=${maxAbs.toExponential(2)}` : `spacing: ${spacing}µV`, leftMargin, 2);
  }, [
    nChannels,
    nSamples,
    signals,
    channelNames,
    artifactMask,
    spacing,
    downsampleFactor,
    samplingRate,
    autoGain,
    playheadSec,
    durationSec,
  ]);

  useEffect(() => {
    drawEEG();
  }, [drawEEG]);

  useEffect(() => {
    const onResize = () => drawEEG();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [drawEEG]);

  const handleReset = () => {
    setIsPlaying(false);
    setPlayheadSec(0);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Controls */}
      <div className="flex flex-wrap gap-4 items-end">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setIsPlaying((v) => !v)} disabled={durationSec <= 0}>
            {isPlaying ? <Pause className="h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" />}
            {isPlaying ? "Pause" : "Play"}
          </Button>
          <Button size="sm" variant="outline" onClick={handleReset}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset
          </Button>
          <Button size="sm" variant={autoGain ? "default" : "outline"} onClick={() => setAutoGain((v) => !v)}>
            Autogain
          </Button>
        </div>

        <div className="flex flex-col gap-2 w-56">
          <Label className="text-xs text-muted-foreground">Channel Spacing: {spacing} µV</Label>
          <Slider
            value={[spacing]}
            onValueChange={([v]) => onSpacingChange?.(v)}
            min={10}
            max={200}
            step={5}
            disabled={autoGain}
          />
        </div>

        <div className="flex flex-col gap-2 w-56">
          <Label className="text-xs text-muted-foreground">Downsample: {downsampleFactor}x</Label>
          <Slider
            value={[downsampleFactor]}
            onValueChange={([v]) => onDownsampleChange?.(v)}
            min={1}
            max={12}
            step={1}
          />
        </div>

        <div className="flex flex-col gap-2 w-72">
          <Label className="text-xs text-muted-foreground">
            Playhead: {playheadSec.toFixed(2)}s / {durationSec.toFixed(2)}s
          </Label>
          <Slider
            value={[Math.min(durationSec || 0, playheadSec)]}
            onValueChange={([v]) => {
              setIsPlaying(false);
              setPlayheadSec(v);
            }}
            min={0}
            max={Math.max(0, durationSec || 0)}
            step={0.05}
            disabled={durationSec <= 0}
          />
        </div>
      </div>

      {/* Canvas */}
      <div className="w-full">
        <canvas ref={canvasRef} className="w-full h-[520px] rounded-lg border border-border bg-background" />
      </div>
    </div>
  );
}
