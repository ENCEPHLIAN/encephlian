import { useEffect, useRef } from "react";

interface EEGCanvasProps {
  signals: number[][];
  channelLabels: string[];
  sampleRate: number;
  currentTime: number;
  timeWindow: number;
  amplitudeScale: number;
  visibleChannels: Set<number>;
  theme: string;
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

      // Draw channel label
      ctx.fillStyle = theme === "dark" ? "#a0a0a0" : "#404040";
      ctx.font = "12px monospace";
      ctx.fillText(channelLabels[channelIndex] || `Ch${channelIndex + 1}`, 5, baselineY - channelHeight / 2 + 15);

      // Draw signal
      ctx.strokeStyle = theme === "dark" ? "#00ff00" : "#000000";
      ctx.lineWidth = 1;
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

  }, [signals, channelLabels, sampleRate, currentTime, timeWindow, amplitudeScale, visibleChannels, theme]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full"
      style={{ imageRendering: "crisp-edges" }}
    />
  );
}
