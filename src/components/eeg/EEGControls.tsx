import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";

// ── Clinical speed options ────────────────────────────────────────────────────
// Speed (mm/sec) ↔ time window (seconds) — based on standard EEG paper speeds
export const SPEED_OPTIONS = [
  { mmSec: 6,   windowSec: 60 },
  { mmSec: 8,   windowSec: 45 },
  { mmSec: 10,  windowSec: 30 },
  { mmSec: 15,  windowSec: 20 },
  { mmSec: 20,  windowSec: 15 },
  { mmSec: 30,  windowSec: 10 },
  { mmSec: 60,  windowSec: 5  },
  { mmSec: 120, windowSec: 2  },
  { mmSec: 240, windowSec: 1  },
] as const;

// ── Amplitude options ─────────────────────────────────────────────────────────
// μV/mm ↔ amplitude multiplier (10 μV/mm = 1.0x baseline)
export const AMP_OPTIONS = [
  { uvmm: 2,    label: "2.0",    scale: 5.0    },
  { uvmm: 3,    label: "3.0",    scale: 3.333  },
  { uvmm: 5,    label: "5.0",    scale: 2.0    },
  { uvmm: 7,    label: "7.0",    scale: 1.429  },
  { uvmm: 10,   label: "10.0",   scale: 1.0    },
  { uvmm: 15,   label: "15.0",   scale: 0.667  },
  { uvmm: 20,   label: "20.0",   scale: 0.5    },
  { uvmm: 30,   label: "30.0",   scale: 0.333  },
  { uvmm: 70,   label: "70.0",   scale: 0.143  },
  { uvmm: 100,  label: "100.0",  scale: 0.1    },
  { uvmm: 200,  label: "200.0",  scale: 0.05   },
  { uvmm: 300,  label: "300.0",  scale: 0.033  },
  { uvmm: 1000, label: "1000.0", scale: 0.01   },
] as const;

// ── Filter options ────────────────────────────────────────────────────────────
export const HF_OPTIONS = [30, 35, 40, 50, 70, 100, 150, 200, 300, 500, 1000, 1500] as const;
export const LF_OPTIONS = [0, 0.01, 0.03, 0.05, 0.1, 0.3, 0.5, 1.0, 1.6, 5.0] as const;

// ── Montage options ───────────────────────────────────────────────────────────
const MONTAGE_OPTIONS = [
  { value: "referential",        label: "Referential (input)" },
  { value: "average-reference",  label: "Average reference"   },
  { value: "bipolar-longitudinal", label: "Bipolar longitudinal" },
  { value: "bipolar-transverse", label: "Bipolar transverse"  },
  { value: "laplacian",          label: "Laplacian"           },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
export function windowSecToMmSec(windowSec: number): number {
  let best = SPEED_OPTIONS[5]; // 30 mm/s default
  let bestDiff = Math.abs(windowSec - best.windowSec);
  for (const o of SPEED_OPTIONS) {
    const d = Math.abs(windowSec - o.windowSec);
    if (d < bestDiff) { best = o; bestDiff = d; }
  }
  return best.mmSec;
}

export function mmSecToWindowSec(mmSec: number): number {
  return SPEED_OPTIONS.find(o => o.mmSec === mmSec)?.windowSec ?? 10;
}

export function scaleToUVMM(scale: number): number {
  const target = 10 / Math.max(0.001, scale);
  let best = AMP_OPTIONS[4]; // 10 μV/mm
  let bestDiff = Math.abs(target - best.uvmm);
  for (const o of AMP_OPTIONS) {
    const d = Math.abs(target - o.uvmm);
    if (d < bestDiff) { best = o; bestDiff = d; }
  }
  return best.uvmm;
}

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
}

// ── Interface ─────────────────────────────────────────────────────────────────
export interface EEGControlsProps {
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
  // Clinical filter controls
  hfFilter?: number;
  onHFFilterChange?: (hz: number) => void;
  lfFilter?: number;
  onLFFilterChange?: (hz: number) => void;
  notchFilter?: 0 | 50 | 60;
  onNotchFilterChange?: (hz: 0 | 50 | 60) => void;
  // Montage
  montage?: string;
  onMontageChange?: (m: string) => void;
  // Channel info
  visibleChannelCount?: number;
}

// ── Toolbar separator ─────────────────────────────────────────────────────────
function Sep() {
  return <div className="h-4 w-px bg-border/70 shrink-0 mx-0.5" />;
}

// ── Labeled toolbar control ───────────────────────────────────────────────────
function CtrlLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-medium text-muted-foreground/80 select-none whitespace-nowrap">
      {children}
    </span>
  );
}

// ── Main toolbar ──────────────────────────────────────────────────────────────
export function EEGControls({
  isPlaying,
  currentTime,
  duration,
  timeWindow,
  amplitudeScale,
  onPlayPause,
  onTimeWindowChange,
  onAmplitudeScaleChange,
  onSkipBackward,
  onSkipForward,
  hfFilter = 70,
  onHFFilterChange,
  lfFilter = 0.5,
  onLFFilterChange,
  notchFilter = 0,
  onNotchFilterChange,
  montage = "referential",
  onMontageChange,
  visibleChannelCount,
}: EEGControlsProps) {

  const mmSec = windowSecToMmSec(timeWindow);
  const uvmm  = scaleToUVMM(amplitudeScale);

  return (
    <div className="flex items-center h-8 px-1 border-b bg-background flex-shrink-0 overflow-x-auto gap-px">

      {/* Navigation: prev page / play / next page */}
      <button
        className="flex items-center justify-center h-6 w-6 rounded hover:bg-accent transition-colors shrink-0"
        onClick={onSkipBackward}
        title="Previous page (←)"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>

      <button
        className="flex items-center justify-center h-6 w-6 rounded hover:bg-accent transition-colors shrink-0"
        onClick={onPlayPause}
        title={isPlaying ? "Pause (Space)" : "Play (Space)"}
      >
        {isPlaying
          ? <Pause className="h-3.5 w-3.5 fill-current" />
          : <Play  className="h-3.5 w-3.5 fill-current" />
        }
      </button>

      <button
        className="flex items-center justify-center h-6 w-6 rounded hover:bg-accent transition-colors shrink-0"
        onClick={onSkipForward}
        title="Next page (→)"
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </button>

      <Sep />

      {/* Time readout */}
      <span className="text-[11px] font-mono text-muted-foreground tabular-nums whitespace-nowrap px-1 shrink-0">
        {fmtTime(currentTime)}&thinsp;/&thinsp;{fmtTime(duration)}
      </span>

      <Sep />

      {/* Montage */}
      <div className="flex items-center gap-0.5 shrink-0">
        <CtrlLabel>Montage</CtrlLabel>
        <Select value={montage} onValueChange={onMontageChange ?? (() => {})}>
          <SelectTrigger className="h-6 w-[130px] text-[11px] border border-border/40 shadow-none bg-transparent px-1.5 focus:ring-0 rounded-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MONTAGE_OPTIONS.map(o => (
              <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Sep />

      {/* Speed */}
      <div className="flex items-center gap-0.5 shrink-0">
        <CtrlLabel>Speed</CtrlLabel>
        <Select value={String(mmSec)} onValueChange={v => onTimeWindowChange(mmSecToWindowSec(Number(v)))}>
          <SelectTrigger className="h-6 w-[52px] text-[11px] border border-border/40 shadow-none bg-transparent px-1.5 focus:ring-0 rounded-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SPEED_OPTIONS.map(o => (
              <SelectItem key={o.mmSec} value={String(o.mmSec)} className="text-xs">{o.mmSec}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <CtrlLabel>mm/s</CtrlLabel>
      </div>

      <Sep />

      {/* Channel count (read-only for now) */}
      {visibleChannelCount != null && (
        <>
          <div className="flex items-center gap-0.5 shrink-0">
            <CtrlLabel>Chs</CtrlLabel>
            <span className="text-[11px] font-medium px-2 tabular-nums">{visibleChannelCount}</span>
          </div>
          <Sep />
        </>
      )}

      {/* Amplitude */}
      <div className="flex items-center gap-0.5 shrink-0">
        <CtrlLabel>Amp</CtrlLabel>
        <Select value={String(uvmm)} onValueChange={v => onAmplitudeScaleChange(10 / Number(v))}>
          <SelectTrigger className="h-6 w-[60px] text-[11px] border border-border/40 shadow-none bg-transparent px-1.5 focus:ring-0 rounded-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AMP_OPTIONS.map(o => (
              <SelectItem key={o.uvmm} value={String(o.uvmm)} className="text-xs">{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <CtrlLabel>μV/mm</CtrlLabel>
      </div>

      <Sep />

      {/* High-frequency filter */}
      <div className="flex items-center gap-0.5 shrink-0">
        <CtrlLabel>HF</CtrlLabel>
        <Select value={String(hfFilter)} onValueChange={v => onHFFilterChange?.(Number(v))}>
          <SelectTrigger className="h-6 w-[56px] text-[11px] border border-border/40 shadow-none bg-transparent px-1.5 focus:ring-0 rounded-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {HF_OPTIONS.map(v => (
              <SelectItem key={v} value={String(v)} className="text-xs">{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <CtrlLabel>Hz</CtrlLabel>
      </div>

      <Sep />

      {/* Low-frequency filter */}
      <div className="flex items-center gap-0.5 shrink-0">
        <CtrlLabel>LF</CtrlLabel>
        <Select value={String(lfFilter)} onValueChange={v => onLFFilterChange?.(Number(v))}>
          <SelectTrigger className="h-6 w-[68px] text-[11px] border border-border/40 shadow-none bg-transparent px-1.5 focus:ring-0 rounded-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LF_OPTIONS.map(v => (
              <SelectItem key={v} value={String(v)} className="text-xs">
                {v === 0 ? "Off" : v < 0.1 ? v.toFixed(3) : v.toFixed(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <CtrlLabel>Hz</CtrlLabel>
      </div>

      <Sep />

      {/* Notch filter */}
      <div className="flex items-center gap-0.5 shrink-0">
        <CtrlLabel>Notch</CtrlLabel>
        <Select value={String(notchFilter)} onValueChange={v => onNotchFilterChange?.(Number(v) as 0 | 50 | 60)}>
          <SelectTrigger className="h-6 w-[48px] text-[11px] border border-border/40 shadow-none bg-transparent px-1.5 focus:ring-0 rounded-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0"   className="text-xs">Off</SelectItem>
            <SelectItem value="50"  className="text-xs">50</SelectItem>
            <SelectItem value="60"  className="text-xs">60</SelectItem>
          </SelectContent>
        </Select>
        <CtrlLabel>Hz</CtrlLabel>
      </div>

    </div>
  );
}
