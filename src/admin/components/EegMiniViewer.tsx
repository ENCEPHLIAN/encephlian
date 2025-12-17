cat > (src / admin / components / EegMiniViewer.tsx) << "EOF";
import { useRef, useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import type { CanonicalMeta } from "../readApi";

// Helper: decode base64 to Uint8Array
export function base64ToBytes(b64: string): Uint8Array {
  const binaryString = atob(b64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Helper: convert Uint8Array to Float32Array (little-endian, browser native)
export function bytesToFloat32(bytes: Uint8Array): Float32Array {
  if (bytes.byteOffset % 4 !== 0) {
    const aligned = new Uint8Array(bytes.length);
    aligned.set(bytes);
    return new Float32Array(aligned.buffer, 0, aligned.length / 4);
  }
  return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
}

export interface WindowDataForViewer {
  nCh: number;
  nSamp: number;
  data: Float32Array;
  start: number;
  length: number;
}

interface EegMiniViewerProps {
  meta?: CanonicalMeta | null;
  windowData: WindowDataForViewer | null;
}

export default function EegMiniViewer({ meta, windowData }: EegMiniViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedChannel, setSelectedChannel] = useState(0);
  const [canvasWidth, setCanvasWidth] = useState(800);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(320, Math.floor(entry.contentRect.width || 0));
        setCanvasWidth(w);
      }
    });

    observer.observe(container);
    const initial = Math.max(320, Math.floor(container.clientWidth || 800));
    setCanvasWidth(initial);

    return () => observer.disconnect();
  }, []);

  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !windowData) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { nCh, nSamp, data } = windowData;
    if (!nCh || !nSamp || !data || data.length === 0) return;

    const ch = Math.min(Math.max(0, selectedChannel), nCh - 1);

    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(320, Math.floor(canvasWidth || 0));
    const height = 240;

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    // ✅ CRITICAL: reset transform every draw (prevents infinite scaling)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    // Clear
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "hsl(var(--background))";
    ctx.fillRect(0, 0, width, height);

    // Extract channel data (row-major)
    const offset = ch * nSamp;

    // Downsample to fit screen
    const maxPoints = width * 2;
    const step = nSamp > maxPoints ? Math.ceil(nSamp / maxPoints) : 1;

    // Compute max abs
    let maxAbs = 0;
    for (let i = 0; i < nSamp; i += step) {
      const v = data[offset + i] ?? 0;
      const a = Math.abs(v);
      if (a > maxAbs) maxAbs = a;
    }
    if (maxAbs === 0) maxAbs = 1;

    const margin = { top: 20, bottom: 30, left: 10, right: 10 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const midY = margin.top + plotHeight / 2;

    // baseline
    ctx.strokeStyle = "hsl(var(--border))";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(margin.left, midY);
    ctx.lineTo(width - margin.right, midY);
    ctx.stroke();
    ctx.setLineDash([]);

    // waveform
    ctx.strokeStyle = "hsl(var(--primary))";
    ctx.lineWidth = 1;
    ctx.beginPath();

    const nPts = Math.max(2, Math.ceil(nSamp / step));
    const xScale = plotWidth / (nPts - 1);
    const yScale = ((plotHeight / 2) * 0.9) / maxAbs;

    let p = 0;
    for (let i = 0; i < nSamp; i += step) {
      const x = margin.left + p * xScale;
      const y = midY - (data[offset + i] ?? 0) * yScale;
      if (p === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      p++;
    }
    ctx.stroke();

    // labels
    ctx.fillStyle = "hsl(var(--muted-foreground))";
    ctx.font = "10px monospace";
    ctx.textAlign = "right";
    ctx.fillText(`±${maxAbs.toExponential(2)}`, width - margin.right, margin.top + 12);

    const samplingRate = meta?.sampling_rate_hz ?? 250;
    const duration = nSamp / samplingRate;
    ctx.textAlign = "center";
    ctx.fillText(`${duration.toFixed(2)}s (${nSamp} samples @ ${samplingRate}Hz)`, width / 2, height - 8);
  }, [windowData, selectedChannel, canvasWidth, meta]);

  useEffect(() => {
    drawWaveform();
  }, [drawWaveform]);

  if (!windowData) return null;

  const channelOptions = Array.from({ length: windowData.nCh }, (_, i) => {
    const channelName = meta?.channel_map?.find((c) => c.index === i)?.canonical_id ?? `Ch ${i}`;
    return { value: i, label: channelName };
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-3">
          EEG Mini Viewer
          <Badge variant="outline" className="font-mono text-xs">
            {windowData.nCh}ch × {windowData.nSamp} samples
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Channel:</Label>
            <Select value={String(selectedChannel)} onValueChange={(v) => setSelectedChannel(Number(v))}>
              <SelectTrigger className="w-40 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {channelOptions.map((opt) => (
                  <SelectItem key={opt.value} value={String(opt.value)}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="text-xs text-muted-foreground">
            Start: {windowData.start.toLocaleString()} | Length: {windowData.length.toLocaleString()}
          </div>
        </div>

        <div ref={containerRef} className="w-full">
          <canvas ref={canvasRef} className="w-full rounded border border-border bg-background" />
        </div>
      </CardContent>
    </Card>
  );
}
EOF;
