import { useRef, useEffect, useCallback, useState } from "react";
import { fetchBinary } from "@/shared/readApiClient";
import { Loader2 } from "lucide-react";

interface SegmentMiniWaveformProps {
  studyId: string;
  tStartS: number;
  tEndS: number;
  channelIndex?: number | null;
  samplingRate: number;
  label?: string;
}

function getCssHsl(varName: string, fallback: string) {
  try {
    const root = document.documentElement;
    const v = getComputedStyle(root).getPropertyValue(varName).trim();
    if (!v) return fallback;
    return `hsl(${v})`;
  } catch {
    return fallback;
  }
}

function getLabelColor(label: string): string {
  const lowerLabel = label.toLowerCase();
  if (lowerLabel.includes("seizure") || lowerLabel.includes("sz")) return "hsl(0 70% 50%)";
  if (lowerLabel.includes("spike") || lowerLabel.includes("sharp")) return "hsl(30 80% 50%)";
  if (lowerLabel.includes("artifact")) return "hsl(45 80% 50%)";
  if (lowerLabel.includes("slow")) return "hsl(200 60% 50%)";
  return getCssHsl("--primary", "hsl(220 70% 50%)");
}

export default function SegmentMiniWaveform({
  studyId,
  tStartS,
  tEndS,
  channelIndex,
  samplingRate,
  label = "",
}: SegmentMiniWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [waveData, setWaveData] = useState<Float32Array | null>(null);

  const width = 120;
  const height = 32;

  // Fetch segment waveform data
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const startSample = Math.floor(tStartS * samplingRate);
    const endSample = Math.floor(tEndS * samplingRate);
    const length = Math.max(1, endSample - startSample);

    // Fetch a small window of data
    fetchBinary(`/studies/${studyId}/window?start=${startSample}&length=${Math.min(length, 2000)}&root=/app/data`, {
      timeoutMs: 10000,
      requireKey: true,
    })
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setError("No data");
          setLoading(false);
          return;
        }
        const bytes = new Uint8Array(result.data);
        // Align to 4-byte boundary for Float32Array
        let float32: Float32Array;
        if (bytes.byteOffset % 4 !== 0) {
          const aligned = new Uint8Array(bytes.length);
          aligned.set(bytes);
          float32 = new Float32Array(aligned.buffer, 0, aligned.length / 4);
        } else {
          float32 = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
        }
        setWaveData(float32);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Fetch failed");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [studyId, tStartS, tEndS, samplingRate]);

  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !waveData || waveData.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    // Theme colors
    const bg = getCssHsl("--muted", "hsl(220 10% 95%)");
    const waveColor = getLabelColor(label);

    // Clear + background
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    // If channelIndex is specified, try to extract that channel
    // For now, we'll use simple heuristic: assume row-major layout
    // and pick the channel if we can estimate nCh from data length
    const durationSamples = Math.floor((tEndS - tStartS) * samplingRate);
    const possibleNCh = Math.floor(waveData.length / durationSamples);
    const nCh = possibleNCh > 0 ? possibleNCh : 1;
    const nSamp = Math.floor(waveData.length / nCh);

    const ch = channelIndex != null && channelIndex >= 0 && channelIndex < nCh
      ? channelIndex
      : 0;

    const offset = ch * nSamp;

    // Downsample to fit width
    const maxPoints = width;
    const step = nSamp > maxPoints ? Math.ceil(nSamp / maxPoints) : 1;

    // Compute max abs for normalization
    let maxAbs = 0;
    for (let i = 0; i < nSamp && (offset + i) < waveData.length; i += step) {
      const v = waveData[offset + i] ?? 0;
      const a = Math.abs(v);
      if (a > maxAbs) maxAbs = a;
    }
    if (maxAbs === 0) maxAbs = 1;

    const margin = 2;
    const plotWidth = width - margin * 2;
    const plotHeight = height - margin * 2;
    const midY = height / 2;

    // Draw waveform
    ctx.strokeStyle = waveColor;
    ctx.lineWidth = 1;
    ctx.beginPath();

    const nPts = Math.max(2, Math.ceil(nSamp / step));
    const xScale = plotWidth / (nPts - 1);
    const yScale = (plotHeight / 2 - 1) / maxAbs;

    let p = 0;
    for (let i = 0; i < nSamp && (offset + i) < waveData.length; i += step) {
      const x = margin + p * xScale;
      const y = midY - (waveData[offset + i] ?? 0) * yScale;
      if (p === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      p++;
    }
    ctx.stroke();
  }, [waveData, channelIndex, label, tStartS, tEndS, samplingRate]);

  useEffect(() => {
    drawWaveform();
  }, [drawWaveform]);

  if (loading) {
    return (
      <div className="w-[120px] h-[32px] bg-muted rounded flex items-center justify-center">
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !waveData) {
    return (
      <div className="w-[120px] h-[32px] bg-muted rounded flex items-center justify-center">
        <span className="text-[9px] text-muted-foreground">No preview</span>
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className="rounded border border-border"
      style={{ width: `${width}px`, height: `${height}px` }}
    />
  );
}
