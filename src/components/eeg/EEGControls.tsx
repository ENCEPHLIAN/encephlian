import { useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  ZoomIn, 
  ZoomOut,
  Download
} from "lucide-react";

interface EEGControlsProps {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  timeWindow: number;
  amplitudeScale: number;
  playbackSpeed: number;
  onPlayPause: () => void;
  onTimeChange: (time: number) => void;
  onTimeWindowChange: (window: number) => void;
  onAmplitudeScaleChange: (scale: number) => void;
  onPlaybackSpeedChange: (speed: number) => void;
  onSkipBackward: () => void;
  onSkipForward: () => void;
  onExport: () => void;
}

export function EEGControls({
  isPlaying,
  currentTime,
  duration,
  timeWindow,
  amplitudeScale,
  playbackSpeed,
  onPlayPause,
  onTimeChange,
  onTimeWindowChange,
  onAmplitudeScaleChange,
  onPlaybackSpeedChange,
  onSkipBackward,
  onSkipForward,
  onExport,
}: EEGControlsProps) {
  const skipBackwardIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const skipForwardIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdStartTimeRef = useRef<number>(0);

  // Click and hold for skip buttons with speed acceleration
  const handleSkipBackwardMouseDown = useCallback(() => {
    holdStartTimeRef.current = Date.now();
    onSkipBackward();
    
    skipBackwardIntervalRef.current = setInterval(() => {
      const holdDuration = (Date.now() - holdStartTimeRef.current) / 1000;
      const speed = holdDuration > 3 ? 3 : holdDuration > 1 ? 2 : 1;
      for (let i = 0; i < speed; i++) {
        onSkipBackward();
      }
    }, 150);
  }, [onSkipBackward]);

  const handleSkipForwardMouseDown = useCallback(() => {
    holdStartTimeRef.current = Date.now();
    onSkipForward();
    
    skipForwardIntervalRef.current = setInterval(() => {
      const holdDuration = (Date.now() - holdStartTimeRef.current) / 1000;
      const speed = holdDuration > 3 ? 3 : holdDuration > 1 ? 2 : 1;
      for (let i = 0; i < speed; i++) {
        onSkipForward();
      }
    }, 150);
  }, [onSkipForward]);

  const handleMouseUp = useCallback(() => {
    if (skipBackwardIntervalRef.current) {
      clearInterval(skipBackwardIntervalRef.current);
      skipBackwardIntervalRef.current = null;
    }
    if (skipForwardIntervalRef.current) {
      clearInterval(skipForwardIntervalRef.current);
      skipForwardIntervalRef.current = null;
    }
  }, []);

  // Amplitude controls with click and hold
  const amplitudeDecreaseRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const amplitudeIncreaseRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentAmplitudeRef = useRef(amplitudeScale);
  currentAmplitudeRef.current = amplitudeScale;

  const handleAmplitudeDecreaseDown = useCallback(() => {
    onAmplitudeScaleChange(Math.max(0.001, currentAmplitudeRef.current - 0.001));
    amplitudeDecreaseRef.current = setInterval(() => {
      currentAmplitudeRef.current = Math.max(0.001, currentAmplitudeRef.current - 0.001);
      onAmplitudeScaleChange(currentAmplitudeRef.current);
    }, 80);
  }, [onAmplitudeScaleChange]);

  const handleAmplitudeIncreaseDown = useCallback(() => {
    onAmplitudeScaleChange(currentAmplitudeRef.current + 0.001);
    amplitudeIncreaseRef.current = setInterval(() => {
      currentAmplitudeRef.current = currentAmplitudeRef.current + 0.001;
      onAmplitudeScaleChange(currentAmplitudeRef.current);
    }, 80);
  }, [onAmplitudeScaleChange]);

  const handleAmplitudeMouseUp = useCallback(() => {
    if (amplitudeDecreaseRef.current) {
      clearInterval(amplitudeDecreaseRef.current);
      amplitudeDecreaseRef.current = null;
    }
    if (amplitudeIncreaseRef.current) {
      clearInterval(amplitudeIncreaseRef.current);
      amplitudeIncreaseRef.current = null;
    }
  }, []);

  return (
    <div className="space-y-1.5 border-b px-3 py-2 bg-background flex-shrink-0">
      {/* Playback Controls */}
      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              onMouseDown={handleSkipBackwardMouseDown}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              disabled={currentTime <= 0}
              className="transition-all duration-150 hover:scale-105 active:scale-95"
            >
              <SkipBack className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Skip backward (hold for fast)</TooltipContent>
        </Tooltip>
        
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="default"
              size="icon"
              onClick={onPlayPause}
              className="transition-all duration-150 hover:scale-105 active:scale-95"
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{isPlaying ? "Pause" : "Play"}</TooltipContent>
        </Tooltip>
        
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              onMouseDown={handleSkipForwardMouseDown}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              disabled={currentTime >= duration - timeWindow}
              className="transition-all duration-150 hover:scale-105 active:scale-95"
            >
              <SkipForward className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Skip forward (hold for fast)</TooltipContent>
        </Tooltip>

        <div className="flex-1 px-4">
          <Slider
            value={[currentTime]}
            min={0}
            max={Math.max(0, duration - timeWindow)}
            step={0.1}
            onValueChange={([value]) => onTimeChange(value)}
            className="w-full"
          />
        </div>

        <span className="text-sm font-mono text-foreground min-w-[100px] text-right">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>

      {/* Control Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {/* Time Window */}
        <div className="space-y-2">
          <Label className="text-xs">Time Window</Label>
          <Select value={timeWindow.toString()} onValueChange={(v) => onTimeWindowChange(Number(v))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10 seconds</SelectItem>
              <SelectItem value="30">30 seconds</SelectItem>
              <SelectItem value="60">60 seconds</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Amplitude Scale */}
        <div className="space-y-2">
          <Label className="text-xs">Amplitude Scale</Label>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="h-8 w-8 rounded border border-border bg-background hover:bg-muted flex items-center justify-center transition-all duration-150 hover:scale-105 active:scale-95"
                  onMouseDown={handleAmplitudeDecreaseDown}
                  onMouseUp={handleAmplitudeMouseUp}
                  onMouseLeave={handleAmplitudeMouseUp}
                >
                  <ZoomOut className="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Decrease amplitude (hold for continuous)</TooltipContent>
            </Tooltip>
            <span className="text-xs font-mono flex-1 text-center">{amplitudeScale.toFixed(3)}x</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="h-8 w-8 rounded border border-border bg-background hover:bg-muted flex items-center justify-center transition-all duration-150 hover:scale-105 active:scale-95"
                  onMouseDown={handleAmplitudeIncreaseDown}
                  onMouseUp={handleAmplitudeMouseUp}
                  onMouseLeave={handleAmplitudeMouseUp}
                >
                  <ZoomIn className="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Increase amplitude (hold for continuous)</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Playback Speed */}
        <div className="space-y-2">
          <Label className="text-xs">Playback Speed</Label>
          <Select value={playbackSpeed.toString()} onValueChange={(v) => onPlaybackSpeedChange(Number(v))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0.5">0.5x</SelectItem>
              <SelectItem value="1">1x</SelectItem>
              <SelectItem value="2">2x</SelectItem>
              <SelectItem value="4">4x</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Export */}
        <div className="space-y-2">
          <Label className="text-xs">Actions</Label>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" onClick={onExport} className="w-full transition-all duration-150 hover:scale-[1.02] active:scale-[0.98]">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </TooltipTrigger>
            <TooltipContent>Export annotations as JSON</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
