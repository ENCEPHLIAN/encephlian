import { useRef, useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import type { CanonicalMeta } from '../readApi';

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
  // Ensure alignment - create aligned buffer if needed
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

  // Observe container width
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setCanvasWidth(entry.contentRect.width);
      }
    });
    observer.observe(container);
    setCanvasWidth(container.clientWidth || 800);
    return () => observer.disconnect();
  }, []);

  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !windowData) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { nCh, nSamp, data } = windowData;
    const ch = Math.min(selectedChannel, nCh - 1);

    const dpr = window.devicePixelRatio || 1;
    const width = canvasWidth;
    const height = 240;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    // Clear with background
    ctx.fillStyle = 'hsl(var(--background))';
    ctx.fillRect(0, 0, width, height);

    if (nSamp === 0) {
      ctx.fillStyle = 'hsl(var(--muted-foreground))';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No data', width / 2, height / 2);
      return;
    }

    // Extract channel data (row-major: ch * nSamp + i)
    const channelData: number[] = [];
    for (let i = 0; i < nSamp; i++) {
      const idx = ch * nSamp + i;
      channelData.push(data[idx] ?? 0);
    }

    // Downsample if needed
    const maxPoints = width * 2;
    const step = nSamp > maxPoints ? Math.ceil(nSamp / maxPoints) : 1;
    const downsampledData: number[] = [];
    for (let i = 0; i < nSamp; i += step) {
      downsampledData.push(channelData[i]);
    }

    // Autoscale: find max abs value
    let maxAbs = 0;
    for (const v of downsampledData) {
      const absV = Math.abs(v);
      if (absV > maxAbs) maxAbs = absV;
    }
    if (maxAbs === 0) maxAbs = 1;

    const margin = { top: 20, bottom: 30, left: 10, right: 10 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const midY = margin.top + plotHeight / 2;

    // Draw baseline
    ctx.strokeStyle = 'hsl(var(--border))';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(margin.left, midY);
    ctx.lineTo(width - margin.right, midY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw waveform
    ctx.strokeStyle = 'hsl(var(--primary))';
    ctx.lineWidth = 1;
    ctx.beginPath();

    const xScale = plotWidth / (downsampledData.length - 1 || 1);
    const yScale = (plotHeight / 2) * 0.9 / maxAbs;

    for (let i = 0; i < downsampledData.length; i++) {
      const x = margin.left + i * xScale;
      const y = midY - downsampledData[i] * yScale;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    // Draw amplitude scale
    ctx.fillStyle = 'hsl(var(--muted-foreground))';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`±${maxAbs.toExponential(2)}`, width - margin.right, margin.top + 12);

    // Draw time info at bottom
    const samplingRate = meta?.sampling_rate_hz ?? 250;
    const duration = nSamp / samplingRate;
    ctx.textAlign = 'center';
    ctx.fillText(`${duration.toFixed(2)}s (${nSamp} samples @ ${samplingRate}Hz)`, width / 2, height - 8);
  }, [windowData, selectedChannel, canvasWidth, meta]);

  useEffect(() => {
    drawWaveform();
  }, [drawWaveform]);

  if (!windowData) {
    return null;
  }

  const channelOptions = Array.from({ length: windowData.nCh }, (_, i) => {
    const channelName = meta?.channel_map?.[i]?.canonical_id ?? `Ch ${i}`;
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
        {/* Controls */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Channel:</Label>
            <Select
              value={String(selectedChannel)}
              onValueChange={(v) => setSelectedChannel(Number(v))}
            >
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

        {/* Canvas */}
        <div ref={containerRef} className="w-full">
          <canvas
            ref={canvasRef}
            className="w-full rounded border border-border bg-background"
          />
        </div>
      </CardContent>
    </Card>
  );
}
