import { useEffect, useRef } from "react";
import { TimelineMarker } from "@/lib/ai/mockAnomalyData";
import { CHANNEL_COLORS } from "@/lib/eeg/channel-groups";

interface AnomalyTimelineProps {
  markers: TimelineMarker[];
  duration: number; // in seconds
  className?: string;
}

const MARKER_COLORS: Record<string, string> = {
  spike: CHANNEL_COLORS.frontal.stroke,
  seizure: "hsl(38, 92%, 50%)",
  artifact: "hsl(48, 96%, 53%)",
  background: CHANNEL_COLORS.central.stroke,
  asymmetry: CHANNEL_COLORS.occipital.stroke
};

export function AnomalyTimeline({ markers, duration, className }: AnomalyTimelineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    
    const width = rect.width;
    const height = rect.height;
    
    // Clear canvas
    ctx.fillStyle = "hsl(var(--muted))";
    ctx.fillRect(0, 0, width, height);
    
    // Draw markers
    markers.forEach(marker => {
      const x = (marker.timestamp / duration) * width;
      const barHeight = height * marker.intensity;
      
      ctx.fillStyle = MARKER_COLORS[marker.type] || "hsl(215, 16%, 47%)";
      ctx.globalAlpha = 0.7;
      ctx.fillRect(x - 1, height - barHeight, 3, barHeight);
    });
    
    ctx.globalAlpha = 1;
    
    // Draw time labels
    ctx.fillStyle = "hsl(var(--muted-foreground))";
    ctx.font = "10px monospace";
    const intervals = 4;
    for (let i = 0; i <= intervals; i++) {
      const x = (i / intervals) * width;
      const minutes = Math.floor((duration * i / intervals) / 60);
      const seconds = Math.floor((duration * i / intervals) % 60);
      ctx.fillText(`${minutes}:${seconds.toString().padStart(2, "0")}`, x, height - 2);
    }
    
  }, [markers, duration]);
  
  return (
    <canvas 
      ref={canvasRef} 
      className={className}
      style={{ width: "100%", height: "100%" }}
    />
  );
}
