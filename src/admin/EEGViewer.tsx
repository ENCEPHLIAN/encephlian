import { useRef, useEffect, useCallback, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";

interface EEGViewerProps {
  signals: Float32Array[];
  channelNames: string[];
  samplingRate: number;
  artifactMask?: Uint8Array;
  spacing?: number; // interpreted as "µV" spacing if your signals are µV
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

  // NOTE: atob() returns bytes; buffer is aligned enough for Float32Array in modern browsers
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

// Canvas cannot use "hsl(var(--x))". Resolve the CSS var to "hsl(<numbers>)".
function cssHsl(varName: string, fallback: string) {
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    if (!raw) return fallback;
    return `hsl(${raw})`;
  } catch {
    return fallback;
  }
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
  const [autoGain, setAutoGain] = useState(true);

  const drawEEG = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || signals.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = Math.max(320, Math.floor(canvas.clientWidth || 0));
    const height = Math.max(200, Math.floor(canvas.clientHeight || 0));
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    // ✅ CRITICAL: reset transform each draw (prevents infinite scaling)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    // ✅ Resolve theme colors properly for canvas
    const BG = cssHsl("--background", "#000");
    const FG = cssHsl("--foreground", "#fff");
    const BORDER = cssHsl("--border", "#333");
    const PRIMARY = cssHsl("--primary", "#fff");
    const MUTED = cssHsl("--muted-foreground", "#aaa");

    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, width, height);

    const nChannels = signals.length;
    const nSamples = signals[0]?.length || 0;
    if (nSamples === 0) {
      ctx.fillStyle = FG;
      ctx.font = "14px monospace";
      ctx.fillText("No samples", 20, 30);
      return;
    }

    const leftMargin = 90;
    const rightMargin = 16;
    const topMargin = 16;
    const bottomMargin = 28;
    const plotWidth = Math.max(10, width - leftMargin - rightMargin);
    const plotHeight = Math.max(10, height - topMargin - bottomMargin);
    const channelHeight = plotHeight / nChannels;

    // Artifact overlay (fast-ish): samples per pixel scan
    if (artifactMask && artifactMask.length > 0) {
      ctx.fillStyle = "rgba(239, 68, 68, 0.12)";
      const samplesPerPixel = nSamples / plotWidth;

      for (let px = 0; px < plotWidth; px++) {
        const s0 = Math.floor(px * samplesPerPixel);
        const s1 = Math.min(artifactMask.length, Math.floor((px + 1) * samplesPerPixel));

        let has = false;
        for (let s = s0; s < s1; s++) {
          if (artifactMask[s] > 0) {
            has = true;
            break;
          }
        }
        if (has) ctx.fillRect(leftMargin + px, topMargin, 1, plotHeight);
      }
    }

    // Grid lines
    ctx.strokeStyle = BORDER;
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= nChannels; i++) {
      const y = topMargin + i * channelHeight;
      ctx.beginPath();
      ctx.moveTo(leftMargin, y);
      ctx.lineTo(width - rightMargin, y);
      ctx.stroke();
    }

    // Channel labels
    ctx.fillStyle = FG;
    ctx.font = "11px monospace";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let ch = 0; ch < nChannels; ch++) {
      const y = topMargin + ch * channelHeight + channelHeight / 2;
      const label = channelNames[ch] || `Ch ${ch + 1}`;
      ctx.fillText(label.slice(0, 12), leftMargin - 8, y);
    }

    // Signal traces
    ctx.strokeStyle = PRIMARY;
    ctx.lineWidth = 1;

    const ds = Math.max(1, Math.floor(downsampleFactor || 1));
    const downsampledLength = Math.max(2, Math.ceil(nSamples / ds));
    const xScale = plotWidth / (downsampledLength - 1);

    // If autoGain: compute per-window maxAbs across all channels (downsampled)
    let globalMaxAbs = 0;
    if (autoGain) {
      for (let ch = 0; ch < nChannels; ch++) {
        const sig = signals[ch];
        for (let i = 0; i < nSamples; i += ds) {
          const v = sig[i] ?? 0;
          const a = Math.abs(v);
          if (a > globalMaxAbs) globalMaxAbs = a;
        }
      }
      if (globalMaxAbs === 0) globalMaxAbs = 1;
    }

    for (let ch = 0; ch < nChannels; ch++) {
      const sig = signals[ch];
      const yCenter = topMargin + ch * channelHeight + channelHeight / 2;

      // yScale:
      // - autoGain: fit into 90% of channel band
      // - manual: treat spacing as µV scale if your values are µV
      const yScale = autoGain ? ((channelHeight / 2) * 0.9) / globalMaxAbs : channelHeight / (Math.max(1, spacing) * 2);

      ctx.beginPath();
      let p = 0;
      for (let i = 0; i < nSamples; i += ds) {
        const x = leftMargin + p * xScale;
        const y = yCenter - (sig[i] ?? 0) * yScale;
        if (p === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        p++;
      }
      ctx.stroke();
    }

    // Time axis
    const duration = nSamples / Math.max(1, samplingRate || 250);
    ctx.fillStyle = MUTED;
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    const numTicks = 5;
    for (let i = 0; i <= numTicks; i++) {
      const x = leftMargin + (i / numTicks) * plotWidth;
      const t = (i / numTicks) * duration;
      ctx.fillText(`${t.toFixed(1)}s`, x, height - bottomMargin + 6);
    }

    // Debug corner (remove later)
    ctx.fillStyle = MUTED;
    ctx.font = "10px monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(`draw ok | ch=${nChannels} samp=${nSamples} ds=${ds} autoGain=${autoGain ? "on" : "off"}`, 10, 6);
  }, [signals, channelNames, samplingRate, artifactMask, spacing, downsampleFactor, autoGain]);

  useEffect(() => {
    drawEEG();
    const onResize = () => drawEEG();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [drawEEG]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-6 items-end">
        <div className="flex flex-col gap-2 w-52">
          <Label className="text-xs text-muted-foreground">Channel Spacing: {spacing} µV (manual)</Label>
          <Slider value={[spacing]} onValueChange={([v]) => onSpacingChange?.(v)} min={10} max={200} step={5} />
        </div>

        <div className="flex flex-col gap-2 w-52">
          <Label className="text-xs text-muted-foreground">Downsample: {downsampleFactor}x</Label>
          <Slider
            value={[downsampleFactor]}
            onValueChange={([v]) => onDownsampleChange?.(v)}
            min={1}
            max={16}
            step={1}
          />
        </div>

        <button
          type="button"
          onClick={() => setAutoGain((v) => !v)}
          className="text-xs px-3 py-2 rounded-md border border-border bg-background hover:bg-muted"
          title="AutoGain fits the waveform to the channel band so you always see it"
        >
          AutoGain: {autoGain ? "ON" : "OFF"}
        </button>
      </div>

      <canvas ref={canvasRef} className="w-full h-[500px] rounded-lg border border-border bg-background" />
    </div>
  );
}
