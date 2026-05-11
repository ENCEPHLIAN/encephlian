import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Pause, Play, ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Clinical speed options ────────────────────────────────────────────────────
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
export const AMP_OPTIONS = [
  { uvmm: 2,    label: "2",    scale: 5.0    },
  { uvmm: 3,    label: "3",    scale: 3.333  },
  { uvmm: 5,    label: "5",    scale: 2.0    },
  { uvmm: 7,    label: "7",    scale: 1.429  },
  { uvmm: 10,   label: "10",   scale: 1.0    },
  { uvmm: 15,   label: "15",   scale: 0.667  },
  { uvmm: 20,   label: "20",   scale: 0.5    },
  { uvmm: 30,   label: "30",   scale: 0.333  },
  { uvmm: 70,   label: "70",   scale: 0.143  },
  { uvmm: 100,  label: "100",  scale: 0.1    },
  { uvmm: 200,  label: "200",  scale: 0.05   },
  { uvmm: 300,  label: "300",  scale: 0.033  },
  { uvmm: 1000, label: "1000", scale: 0.01   },
] as const;

// ── Filter options ────────────────────────────────────────────────────────────
export const HF_OPTIONS = [30, 35, 40, 50, 70, 100, 150, 200, 300, 500, 1000, 1500] as const;
export const LF_OPTIONS = [0, 0.01, 0.03, 0.05, 0.1, 0.3, 0.5, 1.0, 1.6, 5.0] as const;

// ── Montage options ───────────────────────────────────────────────────────────
const MONTAGE_OPTIONS = [
  { value: "referential",          label: "Ref (input)" },
  { value: "average-reference",    label: "Avg ref"     },
  { value: "bipolar-longitudinal", label: "Bipolar lon" },
  { value: "bipolar-transverse",   label: "Bipolar tr"  },
  { value: "laplacian",            label: "Laplacian"   },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
export function windowSecToMmSec(windowSec: number): number {
  let best = SPEED_OPTIONS[5];
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
  let best = AMP_OPTIONS[4];
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
  hfFilter?: number;
  onHFFilterChange?: (hz: number) => void;
  lfFilter?: number;
  onLFFilterChange?: (hz: number) => void;
  notchFilter?: 0 | 50 | 60;
  onNotchFilterChange?: (hz: 0 | 50 | 60) => void;
  montage?: string;
  onMontageChange?: (m: string) => void;
  visibleChannelCount?: number;
}

// ── Internal sub-components ───────────────────────────────────────────────────

function Sep() {
  return <div className="h-3.5 w-px bg-border/50 shrink-0 mx-1" />;
}

function CtrlGroup({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-px shrink-0">{children}</div>;
}

function IconBtn({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      className="flex items-center justify-center h-6 w-6 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shrink-0"
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
  );
}

/** Stepper: label + current value + ▲▼ buttons. Clicking value cycles through options. */
function Stepper<T extends { label?: string; mmSec?: number; uvmm?: number }>({
  label,
  unit,
  options,
  currentIndex,
  onStep,
  valueDisplay,
}: {
  label: string;
  unit: string;
  options: readonly T[];
  currentIndex: number;
  onStep: (delta: 1 | -1) => void;
  valueDisplay: string;
}) {
  return (
    <div className="flex items-center gap-px shrink-0">
      <span className="text-[10px] text-muted-foreground/60 pr-0.5 select-none">{label}</span>
      <button
        className="h-6 w-3.5 flex items-center justify-center rounded-l hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
        onClick={() => onStep(-1)}
        disabled={currentIndex <= 0}
        title={`Decrease ${label}`}
      >
        <ChevronDown className="h-2.5 w-2.5" />
      </button>
      <span className="text-[11px] font-mono font-medium text-foreground px-1 min-w-[28px] text-center tabular-nums select-none">
        {valueDisplay}
      </span>
      <button
        className="h-6 w-3.5 flex items-center justify-center rounded-r hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
        onClick={() => onStep(1)}
        disabled={currentIndex >= options.length - 1}
        title={`Increase ${label}`}
      >
        <ChevronUp className="h-2.5 w-2.5" />
      </button>
      <span className="text-[10px] text-muted-foreground/60 pl-0.5 select-none">{unit}</span>
    </div>
  );
}

function FilterSelect<T extends number>({
  label,
  unit,
  value,
  options,
  onChange,
  displayFn,
}: {
  label: string;
  unit: string;
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
  displayFn?: (v: T) => string;
}) {
  const fmt = displayFn ?? String;
  return (
    <div className="flex items-center gap-0.5 shrink-0">
      <span className="text-[10px] text-muted-foreground/60 select-none">{label}</span>
      <Select value={String(value)} onValueChange={v => onChange(Number(v) as T)}>
        <SelectTrigger className={cn(
          "h-6 text-[11px] font-mono border-0 shadow-none bg-transparent px-1 focus:ring-0 rounded-sm",
          "hover:bg-muted transition-colors text-foreground",
          label === "HF" || label === "LF" ? "w-[44px]" : "w-[36px]",
        )}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="z-[100]">
          {options.map(o => (
            <SelectItem key={o} value={String(o)} className="text-xs font-mono">
              {fmt(o)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-[10px] text-muted-foreground/60 select-none">{unit}</span>
    </div>
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

  const speedIdx = SPEED_OPTIONS.findIndex(o => o.mmSec === mmSec);
  const ampIdx   = AMP_OPTIONS.findIndex(o => o.uvmm === uvmm);

  const stepSpeed = (delta: 1 | -1) => {
    const next = SPEED_OPTIONS[speedIdx + delta];
    if (next) onTimeWindowChange(next.windowSec);
  };

  const stepAmp = (delta: 1 | -1) => {
    const next = AMP_OPTIONS[ampIdx + delta];
    if (next) onAmplitudeScaleChange(10 / next.uvmm);
  };

  return (
    <div className="flex items-center h-8 px-1.5 border-b bg-background/95 flex-shrink-0 overflow-x-auto gap-0.5">

      {/* Transport */}
      <CtrlGroup>
        <IconBtn onClick={onSkipBackward} title="Previous page (←)">
          <ChevronLeft className="h-3.5 w-3.5" />
        </IconBtn>
        <button
          className={cn(
            "flex items-center justify-center h-6 w-6 rounded transition-colors shrink-0",
            isPlaying
              ? "bg-primary/10 text-primary hover:bg-primary/20"
              : "hover:bg-muted text-muted-foreground hover:text-foreground"
          )}
          onClick={onPlayPause}
          title={isPlaying ? "Pause (Space)" : "Play (Space)"}
        >
          {isPlaying
            ? <Pause className="h-3.5 w-3.5 fill-current" />
            : <Play  className="h-3.5 w-3.5 fill-current" />
          }
        </button>
        <IconBtn onClick={onSkipForward} title="Next page (→)">
          <ChevronRight className="h-3.5 w-3.5" />
        </IconBtn>
      </CtrlGroup>

      {/* Time */}
      <span className="text-[11px] font-mono text-muted-foreground tabular-nums whitespace-nowrap px-1.5 shrink-0">
        {fmtTime(currentTime)}&thinsp;<span className="text-muted-foreground/40">/</span>&thinsp;{fmtTime(duration)}
      </span>

      <Sep />

      {/* Montage */}
      <div className="flex items-center gap-0.5 shrink-0">
        <span className="text-[10px] text-muted-foreground/60 select-none">Mnt</span>
        <Select value={montage} onValueChange={onMontageChange ?? (() => {})}>
          <SelectTrigger className="h-6 w-[84px] text-[11px] border-0 shadow-none bg-transparent px-1 focus:ring-0 rounded-sm hover:bg-muted transition-colors">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="z-[100]">
            {MONTAGE_OPTIONS.map(o => (
              <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Sep />

      {/* Speed stepper */}
      <Stepper
        label="Spd"
        unit="mm/s"
        options={SPEED_OPTIONS}
        currentIndex={speedIdx}
        onStep={stepSpeed}
        valueDisplay={String(mmSec)}
      />

      <Sep />

      {/* Channel count (info only) */}
      {visibleChannelCount != null && (
        <>
          <span className="text-[10px] text-muted-foreground/60 select-none">
            {visibleChannelCount}<span className="text-muted-foreground/40">ch</span>
          </span>
          <Sep />
        </>
      )}

      {/* Amplitude stepper */}
      <Stepper
        label="Amp"
        unit="µV/mm"
        options={AMP_OPTIONS}
        currentIndex={ampIdx}
        onStep={stepAmp}
        valueDisplay={String(uvmm)}
      />

      <Sep />

      {/* Filters */}
      <CtrlGroup>
        <FilterSelect
          label="HF"
          unit="Hz"
          value={hfFilter as typeof HF_OPTIONS[number]}
          options={HF_OPTIONS}
          onChange={v => onHFFilterChange?.(v)}
        />
        <FilterSelect
          label="LF"
          unit="Hz"
          value={lfFilter as typeof LF_OPTIONS[number]}
          options={LF_OPTIONS}
          onChange={v => onLFFilterChange?.(v)}
          displayFn={v => v === 0 ? "Off" : v < 0.1 ? v.toFixed(3) : String(v)}
        />
        <FilterSelect
          label="N"
          unit="Hz"
          value={notchFilter}
          options={[0, 50, 60] as const}
          onChange={v => onNotchFilterChange?.(v as 0 | 50 | 60)}
          displayFn={v => v === 0 ? "—" : String(v)}
        />
      </CtrlGroup>

    </div>
  );
}
