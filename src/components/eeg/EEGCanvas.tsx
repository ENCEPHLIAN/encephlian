import { useEffect, useRef } from "react";
import { getChannelColor } from "@/lib/eeg/channel-groups";

interface Marker {
  id: string;
  timestamp_sec: number;
  marker_type: string;
  label?: string;
}

interface EEGCanvasProps {
  signals: number[][];
  channelLabels: string[];
  sampleRate: number;
  currentTime: number;
  timeWindow: number;
  amplitudeScale: number;
  visibleChannels: Set<number>;
  theme: string;
  markers?: Marker[];
}

export function EEGCanvas({
  signals,
  channelLabels,
  sampleRate,
  currentTime,
  timeWindow,
  amplitudeScale,
  visibleChannels,
  theme,
  markers = [],
}: EEGCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !signals.length) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const width = rect.width;
    const height = rect.height;

    // Clear canvas
    ctx.fillStyle = theme === "dark" ? "#0a0a0a" : "#ffffff";
    ctx.fillRect(0, 0, width, height);

    // Calculate visible channels
    const visibleChannelIndices = Array.from(visibleChannels).sort((a, b) => a - b);
    const numVisibleChannels = visibleChannelIndices.length;
    if (numVisibleChannels === 0) return;

    const channelHeight = height / numVisibleChannels;
    const startSample = Math.floor(currentTime * sampleRate);
    const samplesToShow = Math.floor(timeWindow * sampleRate);

    // Draw grid
    ctx.strokeStyle = theme === "dark" ? "#1a1a1a" : "#f0f0f0";
    ctx.lineWidth = 1;

    // Vertical lines (time grid - every second)
    const secondsInWindow = timeWindow;
    for (let i = 0; i <= secondsInWindow; i++) {
      const x = (i / secondsInWindow) * width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    // Horizontal lines (channel separators)
    for (let i = 0; i <= numVisibleChannels; i++) {
      const y = i * channelHeight;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Draw channel labels and signals
    visibleChannelIndices.forEach((channelIndex, displayIndex) => {
      const signal = signals[channelIndex];
      if (!signal) return;

      const baselineY = (displayIndex + 0.5) * channelHeight;
      
      // Get channel color based on anatomical group
      const channelColor = getChannelColor(channelLabels[channelIndex]);

      // Draw channel label with color indicator
      ctx.fillStyle = channelColor.stroke;
      ctx.fillRect(2, baselineY - channelHeight / 2 + 5, 3, 12);
      
      ctx.fillStyle = theme === "dark" ? "#e0e0e0" : "#202020";
      ctx.font = "14px monospace";
      ctx.fillText(channelLabels[channelIndex] || `Ch${channelIndex + 1}`, 10, baselineY - channelHeight / 2 + 17);

      // Draw signal with channel color
      ctx.strokeStyle = channelColor.stroke;
      ctx.lineWidth = 1.2;
      ctx.beginPath();

      const endSample = Math.min(startSample + samplesToShow, signal.length);
      
      for (let i = startSample; i < endSample; i++) {
        const x = ((i - startSample) / samplesToShow) * width;
        const value = signal[i] || 0;
        const y = baselineY - (value * amplitudeScale);

        if (i === startSample) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.stroke();
    });
    
    // Draw markers on waveform
    const markerColors: Record<string, string> = {
      event: "#3b82f6",
      seizure: "#ef4444",
      artifact: "#f59e0b",
      sleep: "#8b5cf6"
    };
    
    markers.forEach(marker => {
      const markerTime = marker.timestamp_sec - currentTime;
      if (markerTime >= 0 && markerTime <= timeWindow) {
        const x = (markerTime / timeWindow) * width;
        
        // Draw dashed vertical line
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = markerColors[marker.marker_type] || "#888888";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Draw label at top
        ctx.fillStyle = markerColors[marker.marker_type] || "#888888";
        ctx.font = "bold 11px monospace";
        ctx.fillText(marker.label || marker.marker_type, x + 3, 15);
      }
    });

    // Draw time labels
    ctx.fillStyle = theme === "dark" ? "#a0a0a0" : "#404040";
    ctx.font = "10px monospace";
    for (let i = 0; i <= secondsInWindow; i++) {
      const x = (i / secondsInWindow) * width;
      const time = currentTime + i;
      const minutes = Math.floor(time / 60);
      const seconds = Math.floor(time % 60);
      ctx.fillText(`${minutes}:${seconds.toString().padStart(2, "0")}`, x + 2, height - 5);
    }

  }, [signals, channelLabels, sampleRate, currentTime, timeWindow, amplitudeScale, visibleChannels, theme, markers]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full"
      style={{ imageRendering: "crisp-edges" }}
    />
  );
}
