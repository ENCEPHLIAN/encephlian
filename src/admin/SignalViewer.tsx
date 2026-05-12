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
 * Decodes base64 float32 data (C-order) into per-channel Float32Array[].
 * IMPORTANT: server must send little-endian float32 bytes.
 */
export function decodeFloat32B64(b64: string, nChannels: number, nSamples: number): Float32Array[] {
  const binaryString = atob(b64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);

  // Ensure 4-byte alignment
  const aligned = bytes.byteOffset % 4 === 0 ? bytes : Uint8Array.from(bytes);
  const float32 = new Float32Array(aligned.buffer, aligned.byteOffset, Math.floor(aligned.byteLength / 4));

  const channels: Float32Array[] = [];
  for (let ch = 0; ch < nChannels; ch++) {
    const start = ch * nSamples;
    channels.push(float32.slice(start, start + nSamples));
  }
  return channels;
}

export function decodeUint8B64(b64: string): Uint8Array {
  const binaryString = atob(b64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}

// simple, deterministic per-channel color (no theme dependency)
function channelColor(ch: number, n: number): string {
  const hue = (ch * 360) / Math.max(1, n);
  return `hsl(${hue} 75% 60%)`;
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
    if (!canvas) return;
    if (!signals || signals.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;

    // IMPORTANT: use bounding box, not clientWidth during flex jitter
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(300, Math.floor(rect.width));
    const height = Math.max(260, Math.floor(rect.height));

    // Pin CSS size (prevents “shrinking” feelings in some layouts)
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);

    // ✅ CRITICAL: reset transform every draw (prevents compounding scale)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    // Background
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#000"; // stable for dark UI
    ctx.fillRect(0, 0, width, height);

    const nChannels = signals.length;
    const nSamples = signals[0]?.length ?? 0;
    if (nSamples <= 1) return;

    const leftMargin = 90;
    const rightMargin = 16;
    const topMargin = 16;
    const bottomMargin = 28;

    const plotWidth = Math.max(1, width - leftMargin - rightMargin);
    const plotHeight = Math.max(1, height - topMargin - bottomMargin);
    const channelHeight = plotHeight / nChannels;

    const ds = Math.max(1, Math.floor(downsampleFactor));
    const dsLen = Math.ceil(nSamples / ds);
    const xScale = plotWidth / Math.max(1, dsLen - 1);

    // Artifact overlay (vertical red bands)
    if (artifactMask && artifactMask.length > 0) {
      ctx.fillStyle = "rgba(239, 68, 68, 0.18)";
      const samplesPerPixel = nSamples / plotWidth;

      for (let px = 0; px < plotWidth; px++) {
        const s0 = Math.floor(px * samplesPerPixel);
        const s1 = Math.floor((px + 1) * samplesPerPixel);
        let has = false;
        for (let s = s0; s <= s1 && s < artifactMask.length; s++) {
          if (artifactMask[s] > 0) {
            has = true;
            break;
          }
        }
        if (has) ctx.fillRect(leftMargin + px, topMargin, 1, plotHeight);
      }
    }

    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= nChannels; i++) {
      const y = topMargin + i * channelHeight;
      ctx.beginPath();
      ctx.moveTo(leftMargin, y);
      ctx.lineTo(width - rightMargin, y);
      ctx.stroke();
    }

    // Labels
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";

    for (let ch = 0; ch < nChannels; ch++) {
      const y = topMargin + ch * channelHeight + channelHeight / 2;
      const label = channelNames?.[ch] ?? `Ch ${ch + 1}`;
      ctx.fillText(label, leftMargin - 10, y);
    }

    // Signals
    const yScale = channelHeight / Math.max(1, spacing * 2);

    for (let ch = 0; ch < nChannels; ch++) {
      const sig = signals[ch];
      if (!sig || sig.length < nSamples) continue;

      const yCenter = topMargin + ch * channelHeight + channelHeight / 2;

      ctx.strokeStyle = channelColor(ch, nChannels);
      ctx.lineWidth = 1;

      ctx.beginPath();
      for (let i = 0; i < dsLen; i++) {
        const idx = Math.min(nSamples - 1, i * ds);
        const x = leftMargin + i * xScale;
        const y = yCenter - (sig[idx] ?? 0) * yScale;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Time axis
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = "10px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    const duration = nSamples / Math.max(1, samplingRate);
    const numTicks = 6;
    for (let i = 0; i <= numTicks; i++) {
      const x = leftMargin + (i / numTicks) * plotWidth;
      const t = (i / numTicks) * duration;
      ctx.fillText(`${t.toFixed(1)}s`, x, height - bottomMargin + 6);
    }
  }, [signals, channelNames, samplingRate, artifactMask, spacing, downsampleFactor]);

  useEffect(() => {
    drawEEG();

    const onResize = () => drawEEG();
    window.addEventListener("resize", onResize);

    // Also redraw if the canvas size changes due to layout
    const canvas = canvasRef.current;
    let ro: ResizeObserver | null = null;
    if (canvas && "ResizeObserver" in window) {
      ro = new ResizeObserver(() => drawEEG());
      ro.observe(canvas);
    }

    return () => {
      window.removeEventListener("resize", onResize);
      ro?.disconnect();
    };
  }, [drawEEG]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-6 items-end">
        <div className="flex flex-col gap-2 w-56">
          <Label className="text-xs text-muted-foreground">Channel Spacing: {spacing} µV</Label>
          <Slider value={[spacing]} onValueChange={([v]) => onSpacingChange?.(v)} min={10} max={200} step={5} />
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
      </div>

      <canvas ref={canvasRef} className="w-full h-[520px] rounded-lg border border-border" />
    </div>
  );
}
