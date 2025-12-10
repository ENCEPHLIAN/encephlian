import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  return (
    <div className="space-y-4 bg-card border border-border rounded-lg p-4">
      {/* Playback Controls */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={onSkipBackward}
          disabled={currentTime <= 0}
        >
          <SkipBack className="h-4 w-4" />
        </Button>
        
        <Button
          variant="default"
          size="icon"
          onClick={onPlayPause}
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        
        <Button
          variant="outline"
          size="icon"
          onClick={onSkipForward}
          disabled={currentTime >= duration - timeWindow}
        >
          <SkipForward className="h-4 w-4" />
        </Button>

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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
            <button
              className="h-8 w-8 rounded border border-border bg-background hover:bg-muted flex items-center justify-center transition-colors"
              onClick={() => onAmplitudeScaleChange(Math.max(0.001, amplitudeScale - 0.001))}
              onMouseDown={(e) => {
                let current = amplitudeScale;
                const interval = setInterval(() => {
                  current = Math.max(0.001, current - 0.001);
                  onAmplitudeScaleChange(current);
                }, 100);
                const cleanup = () => { clearInterval(interval); window.removeEventListener('mouseup', cleanup); };
                window.addEventListener('mouseup', cleanup);
              }}
              title="Decrease amplitude"
            >
              <ZoomOut className="h-3 w-3" />
            </button>
            <span className="text-xs font-mono flex-1 text-center">{amplitudeScale.toFixed(3)}x</span>
            <button
              className="h-8 w-8 rounded border border-border bg-background hover:bg-muted flex items-center justify-center transition-colors"
              onClick={() => onAmplitudeScaleChange(amplitudeScale + 0.001)}
              onMouseDown={(e) => {
                let current = amplitudeScale;
                const interval = setInterval(() => {
                  current = current + 0.001;
                  onAmplitudeScaleChange(current);
                }, 100);
                const cleanup = () => { clearInterval(interval); window.removeEventListener('mouseup', cleanup); };
                window.addEventListener('mouseup', cleanup);
              }}
              title="Increase amplitude"
            >
              <ZoomIn className="h-3 w-3" />
            </button>
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
          <Button variant="outline" onClick={onExport} className="w-full">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
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
