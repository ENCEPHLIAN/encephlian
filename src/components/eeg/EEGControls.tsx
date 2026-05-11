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
  { uvmm: 2,    scale: 5.0    },
  { uvmm: 3,    scale: 3.333  },
  { uvmm: 5,    scale: 2.0    },
  { uvmm: 7,    scale: 1.429  },
  { uvmm: 10,   scale: 1.0    },
  { uvmm: 15,   scale: 0.667  },
  { uvmm: 20,   scale: 0.5    },
  { uvmm: 30,   scale: 0.333  },
  { uvmm: 70,   scale: 0.143  },
  { uvmm: 100,  scale: 0.1    },
  { uvmm: 200,  scale: 0.05   },
  { uvmm: 300,  scale: 0.033  },
  { uvmm: 1000, scale: 0.01   },
] as const;

// ── Filter options ────────────────────────────────────────────────────────────
export const HF_OPTIONS = [30, 35, 40, 50, 70, 100, 150, 200, 300, 500, 1000, 1500] as const;
export const LF_OPTIONS = [0, 0.01, 0.03, 0.05, 0.1, 0.3, 0.5, 1.0, 1.6, 5.0] as const;

// ── Montage options ───────────────────────────────────────────────────────────
const MONTAGE_OPTIONS = [
  { value: "referential",          label: "Referential"   },
  { value: "average-reference",    label: "Avg Reference" },
  { value: "bipolar-longitudinal", label: "Bipolar LL"    },
  { value: "bipolar-transverse",   label: "Bipolar TR"    },
  { value: "laplacian",            label: "Laplacian"     },
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

// ── Internal components ───────────────────────────────────────────────────────

function VSep() {
  return <div className="h-4 w-px bg-border/40 shrink-0" />;
}

function ToolLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[9px] font-medium text-muted-foreground/50 uppercase tracking-wide select-none whitespace-nowrap">
      {children}
    </span>
  );
}

function IconBtn({ onClick, title, active, children }: {
  onClick: () => void; title: string; active?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      className={cn(
        "flex items-center justify-center h-6 w-6 rounded transition-colors shrink-0",
        active
          ? "bg-primary/12 text-primary"
          : "hover:bg-muted text-muted-foreground hover:text-foreground",
      )}
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
  );
}

/** Up/down stepper for speed or amplitude */
function Stepper({
  topLabel,
  value,
  unit,
  onUp,
  onDown,
  disableUp,
  disableDown,
  dim,
}: {
  topLabel: string;
  value: string;
  unit: string;
  onUp: () => void;
  onDown: () => void;
  disableUp?: boolean;
  disableDown?: boolean;
  dim?: string; // optional secondary line
}) {
  return (
    <div className="flex flex-col items-center shrink-0 select-none">
      <ToolLabel>{topLabel}</ToolLabel>
      <div className="flex items-center gap-0">
        <button
          className="h-5 w-4 flex items-end justify-center pb-0.5 text-muted-foreground hover:text-foreground disabled:opacity-25 transition-colors"
          onClick={onDown}
          disabled={disableDown}
          title={`Decrease ${topLabel}`}
        >
          <ChevronDown className="h-3 w-3" />
        </button>
        <div className="flex flex-col items-center leading-none px-0.5">
          <span className="text-[12px] font-mono font-semibold text-foreground tabular-nums">
            {value}
          </span>
          {dim && (
            <span className="text-[9px] font-mono text-muted-foreground/50 tabular-nums -mt-px">
              {dim}
            </span>
          )}
        </div>
        <button
          className="h-5 w-4 flex items-start justify-center pt-0.5 text-muted-foreground hover:text-foreground disabled:opacity-25 transition-colors"
          onClick={onUp}
          disabled={disableUp}
          title={`Increase ${topLabel}`}
        >
          <ChevronUp className="h-3 w-3" />
        </button>
      </div>
      <span className="text-[9px] text-muted-foreground/40 leading-none">{unit}</span>
    </div>
  );
}

function FilterPill<T extends number>({
  label,
  value,
  options,
  onChange,
  displayFn,
  isNonDefault,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
  displayFn?: (v: T) => string;
  isNonDefault?: boolean;
}) {
  const fmt = displayFn ?? String;
  return (
    <div className="flex flex-col items-center shrink-0">
      <ToolLabel>{label}</ToolLabel>
      <Select value={String(value)} onValueChange={v => onChange(Number(v) as T)}>
        <SelectTrigger className={cn(
          "h-6 min-w-[40px] text-[11px] font-mono border-0 shadow-none bg-transparent px-1.5 focus:ring-0",
          "hover:bg-muted rounded transition-colors",
          isNonDefault ? "text-amber-500 dark:text-amber-400" : "text-foreground",
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

  const pct = duration > 0 ? Math.round((currentTime / duration) * 100) : 0;
  const isHfNonDefault = hfFilter !== 70;
  const isLfNonDefault = lfFilter !== 0.5;
  const isNotchActive  = notchFilter !== 0;

  return (
    <div className="h-10 px-3 border-b bg-background flex items-center flex-shrink-0 gap-0">

      {/* ── LEFT: Transport + time ─────────────────────────────────────────── */}
      <div className="flex items-center gap-1 shrink-0">
        <IconBtn onClick={onSkipBackward} title="Previous page (←)">
          <ChevronLeft className="h-3.5 w-3.5" />
        </IconBtn>

        <button
          className={cn(
            "flex items-center justify-center h-7 w-7 rounded-full transition-colors shrink-0",
            isPlaying
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted",
          )}
          onClick={onPlayPause}
          title={isPlaying ? "Pause (Space)" : "Play (Space)"}
        >
          {isPlaying
            ? <Pause className="h-3 w-3 fill-current" />
            : <Play  className="h-3.5 w-3.5 fill-current ml-0.5" />
          }
        </button>

        <IconBtn onClick={onSkipForward} title="Next page (→)">
          <ChevronRight className="h-3.5 w-3.5" />
        </IconBtn>

        <VSep />

        {/* Time display */}
        <div className="flex flex-col items-start leading-none pl-1">
          <span className="text-[12px] font-mono font-medium text-foreground tabular-nums whitespace-nowrap">
            {fmtTime(currentTime)}
            <span className="text-muted-foreground/40 font-normal"> / {fmtTime(duration)}</span>
          </span>
          <span className="text-[9px] font-mono text-muted-foreground/40 tabular-nums">{pct}%</span>
        </div>
      </div>

      {/* ── SPACER ────────────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-4" />

      {/* ── CENTER: Clinical settings ──────────────────────────────────────── */}
      <div className="flex items-center gap-3 shrink-0">

        {/* Montage */}
        <div className="flex flex-col items-center shrink-0">
          <ToolLabel>Montage</ToolLabel>
          <Select value={montage} onValueChange={onMontageChange ?? (() => {})}>
            <SelectTrigger className="h-6 w-[110px] text-[11px] border-0 shadow-none bg-transparent px-1 focus:ring-0 hover:bg-muted rounded transition-colors text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-[100]">
              {MONTAGE_OPTIONS.map(o => (
                <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <VSep />

        {/* Speed */}
        <Stepper
          topLabel="Speed"
          value={String(mmSec)}
          unit="mm/s"
          dim={`${timeWindow}s`}
          onUp={() => stepSpeed(1)}
          onDown={() => stepSpeed(-1)}
          disableUp={speedIdx >= SPEED_OPTIONS.length - 1}
          disableDown={speedIdx <= 0}
        />

        <VSep />

        {/* Amplitude */}
        <Stepper
          topLabel="Amplitude"
          value={String(uvmm)}
          unit="µV/mm"
          onUp={() => stepAmp(1)}
          onDown={() => stepAmp(-1)}
          disableUp={ampIdx >= AMP_OPTIONS.length - 1}
          disableDown={ampIdx <= 0}
        />

        {/* Channel count — shown inline next to amplitude when available */}
        {visibleChannelCount != null && (
          <>
            <VSep />
            <div className="flex flex-col items-center shrink-0">
              <ToolLabel>Channels</ToolLabel>
              <span className="text-[12px] font-mono font-semibold text-foreground tabular-nums">
                {visibleChannelCount}
              </span>
              <span className="text-[9px] text-muted-foreground/40 leading-none">ch</span>
            </div>
          </>
        )}
      </div>

      {/* ── SPACER ────────────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-4" />

      {/* ── RIGHT: Filters ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 shrink-0">
        <FilterPill
          label="HF"
          value={hfFilter as typeof HF_OPTIONS[number]}
          options={HF_OPTIONS}
          onChange={v => onHFFilterChange?.(v)}
          isNonDefault={isHfNonDefault}
        />
        <FilterPill
          label="LF"
          value={lfFilter as typeof LF_OPTIONS[number]}
          options={LF_OPTIONS}
          onChange={v => onLFFilterChange?.(v)}
          displayFn={v => v === 0 ? "Off" : v < 0.1 ? v.toFixed(3) : String(v)}
          isNonDefault={isLfNonDefault}
        />
        <FilterPill
          label="Notch"
          value={notchFilter}
          options={[0, 50, 60] as const}
          onChange={v => onNotchFilterChange?.(v as 0 | 50 | 60)}
          displayFn={v => v === 0 ? "Off" : `${v} Hz`}
          isNonDefault={isNotchActive}
        />
      </div>

    </div>
  );
}
