import { useRef, useEffect, useCallback } from "react";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";

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
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const float32 = new Float32Array(bytes.buffer);
  const channels: Float32Array[] = [];

  // C-order: [n_channels, n_samples] - row-major
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
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
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

  const drawEEG = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || signals.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.fillStyle = "hsl(var(--background))";
    ctx.fillRect(0, 0, width, height);

    const nChannels = signals.length;
    const nSamples = signals[0]?.length || 0;
    if (nSamples === 0) return;

    const leftMargin = 80;
    const rightMargin = 20;
    const topMargin = 20;
    const bottomMargin = 30;
    const plotWidth = width - leftMargin - rightMargin;
    const plotHeight = height - topMargin - bottomMargin;
    const channelHeight = plotHeight / nChannels;

    // Draw artifact mask overlay if present
    if (artifactMask && artifactMask.length > 0) {
      ctx.fillStyle = "rgba(239, 68, 68, 0.15)"; // red-500 with low opacity
      const samplesPerPixel = nSamples / plotWidth;

      for (let px = 0; px < plotWidth; px++) {
        const sampleStart = Math.floor(px * samplesPerPixel);
        const sampleEnd = Math.floor((px + 1) * samplesPerPixel);

        // Check if any sample in this pixel range has artifact
        let hasArtifact = false;
        for (let s = sampleStart; s < sampleEnd && s < artifactMask.length; s++) {
          if (artifactMask[s] > 0) {
            hasArtifact = true;
            break;
          }
        }

        if (hasArtifact) {
          ctx.fillRect(leftMargin + px, topMargin, 1, plotHeight);
        }
      }
    }

    // Draw grid lines
    ctx.strokeStyle = "hsl(var(--border))";
    ctx.lineWidth = 0.5;

    for (let i = 0; i <= nChannels; i++) {
      const y = topMargin + i * channelHeight;
      ctx.beginPath();
      ctx.moveTo(leftMargin, y);
      ctx.lineTo(width - rightMargin, y);
      ctx.stroke();
    }

    // Draw channel labels
    ctx.fillStyle = "hsl(var(--foreground))";
    ctx.font = "11px monospace";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";

    for (let ch = 0; ch < nChannels; ch++) {
      const y = topMargin + ch * channelHeight + channelHeight / 2;
      const label = channelNames[ch] || `Ch ${ch + 1}`;
      ctx.fillText(label.slice(0, 8), leftMargin - 8, y);
    }

    // Draw signals
    ctx.strokeStyle = "hsl(var(--primary))";
    ctx.lineWidth = 1;

    const downsampledLength = Math.ceil(nSamples / downsampleFactor);
    const xScale = plotWidth / downsampledLength;
    const yScale = channelHeight / (spacing * 2); // spacing in µV, signals assumed in µV

    for (let ch = 0; ch < nChannels; ch++) {
      const signal = signals[ch];
      const yCenter = topMargin + ch * channelHeight + channelHeight / 2;

      ctx.beginPath();
      for (let i = 0; i < downsampledLength; i++) {
        const sampleIdx = i * downsampleFactor;
        const x = leftMargin + i * xScale;
        const y = yCenter - signal[sampleIdx] * yScale;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }

    // Draw time axis
    const duration = nSamples / samplingRate;
    ctx.fillStyle = "hsl(var(--muted-foreground))";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    const numTicks = 5;
    for (let i = 0; i <= numTicks; i++) {
      const x = leftMargin + (i / numTicks) * plotWidth;
      const time = (i / numTicks) * duration;
      ctx.fillText(`${time.toFixed(1)}s`, x, height - bottomMargin + 5);
    }
  }, [signals, channelNames, samplingRate, artifactMask, spacing, downsampleFactor]);

  useEffect(() => {
    drawEEG();

    const handleResize = () => drawEEG();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [drawEEG]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-6 items-end">
        <div className="flex flex-col gap-2 w-48">
          <Label className="text-xs text-muted-foreground">Channel Spacing: {spacing} µV</Label>
          <Slider value={[spacing]} onValueChange={([v]) => onSpacingChange?.(v)} min={10} max={200} step={5} />
        </div>
        <div className="flex flex-col gap-2 w-48">
          <Label className="text-xs text-muted-foreground">Downsample: {downsampleFactor}x</Label>
          <Slider
            value={[downsampleFactor]}
            onValueChange={([v]) => onDownsampleChange?.(v)}
            min={1}
            max={8}
            step={1}
          />
        </div>
      </div>

      <canvas ref={canvasRef} className="w-full h-[500px] rounded-lg border border-border bg-background" />
    </div>
  );
}
