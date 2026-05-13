import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Speed / amplitude / filter option tables ──────────────────────────────────
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

export const HF_OPTIONS = [30, 35, 40, 50, 70, 100, 150, 200, 300, 500, 1000, 1500] as const;
export const LF_OPTIONS = [0, 0.01, 0.03, 0.05, 0.1, 0.3, 0.5, 1.0, 1.6, 5.0] as const;

const MONTAGE_OPTIONS = [
  { value: "referential",          label: "Referential"   },
  { value: "average-reference",    label: "Avg Ref"       },
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
export interface ViewerControlsProps {
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
  denoise?: boolean;
  onDenoiseChange?: (on: boolean) => void;
  /** Which signal layer is active — filters already applied at conversion are disabled */
  signalLayer?: "normalized" | "prenorm" | "raw";
  montage?: string;
  onMontageChange?: (m: string) => void;
  visibleChannelCount?: number;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Sep() {
  return <div className="h-4 w-px bg-border/40 shrink-0" aria-hidden />;
}

/** Step-selector: label · ‹ value › · unit — compact single line */
function StepCtrl({
  label,
  value,
  unit,
  sub,
  onDec,
  onInc,
  disableDec,
  disableInc,
  tooltip,
}: {
  label: string;
  value: string;
  unit: string;
  sub?: string;
  onDec: () => void;
  onInc: () => void;
  disableDec?: boolean;
  disableInc?: boolean;
  tooltip?: string;
}) {
  return (
    <div className="flex items-center gap-1 shrink-0" title={tooltip}>
      <span className="text-[10px] text-muted-foreground/60 font-medium select-none">{label}</span>
      <button
        className="h-5 w-4 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors rounded hover:bg-muted"
        onClick={onDec}
        disabled={disableDec}
        aria-label={`Decrease ${label}`}
      >
        <ChevronLeft className="h-3 w-3" />
      </button>
      <span className="flex flex-col items-center leading-none min-w-[28px] text-center">
        <span className="text-[12px] font-mono font-semibold text-foreground tabular-nums">{value}</span>
        {sub && <span className="text-[9px] font-mono text-muted-foreground/40 tabular-nums leading-none">{sub}</span>}
      </span>
      <button
        className="h-5 w-4 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors rounded hover:bg-muted"
        onClick={onInc}
        disabled={disableInc}
        aria-label={`Increase ${label}`}
      >
        <ChevronRight className="h-3 w-3" />
      </button>
      <span className="text-[10px] text-muted-foreground/50 select-none">{unit}</span>
    </div>
  );
}

function FilterCtrl<T extends number>({
  label,
  value,
  options,
  onChange,
  displayFn,
  tooltip,
  highlight,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
  displayFn?: (v: T) => string;
  tooltip?: string;
  highlight?: boolean;
}) {
  const fmt = displayFn ?? String;
  return (
    <div className="flex items-center gap-0.5 shrink-0" title={tooltip}>
      <span className="text-[10px] text-muted-foreground/60 font-medium select-none">{label}</span>
      <Select value={String(value)} onValueChange={v => onChange(Number(v) as T)}>
        <SelectTrigger className={cn(
          "h-6 min-w-[44px] text-[11px] font-mono border-0 shadow-none bg-transparent px-1 focus:ring-0 rounded hover:bg-muted transition-colors",
          highlight ? "text-amber-400 dark:text-amber-300" : "text-foreground",
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

// ── ViewerControls ───────────────────────────────────────────────────────────────
export function ViewerControls({
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
  denoise = false,
  onDenoiseChange,
  signalLayer = "raw",
  montage = "referential",
  onMontageChange,
  visibleChannelCount,
}: ViewerControlsProps) {

  // For ESF layers (prenorm + normalized), notch and LF are already applied at conversion.
  // Showing them as editable would imply double-application — disable and inform instead.
  const esfLayer = signalLayer === "normalized" || signalLayer === "prenorm";

  const mmSec    = windowSecToMmSec(timeWindow);
  const uvmm     = scaleToUVMM(amplitudeScale);
  const speedIdx = SPEED_OPTIONS.findIndex(o => o.mmSec === mmSec);
  const ampIdx   = AMP_OPTIONS.findIndex(o => o.uvmm === uvmm);

  const stepSpeed = (d: 1 | -1) => { const n = SPEED_OPTIONS[speedIdx + d]; if (n) onTimeWindowChange(n.windowSec); };
  const stepAmp   = (d: 1 | -1) => { const n = AMP_OPTIONS[ampIdx + d]; if (n) onAmplitudeScaleChange(10 / n.uvmm); };

  return (
    <div className="h-9 px-3 border-b bg-background flex items-center gap-3 flex-shrink-0 overflow-x-auto">

      {/* ── Transport ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          onClick={onSkipBackward}
          title="Previous page — step back one full window"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <button
          className={cn(
            "h-6 w-6 flex items-center justify-center rounded transition-colors",
            isPlaying ? "text-primary hover:bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted",
          )}
          onClick={onPlayPause}
          title={isPlaying ? "Pause — stop playback (Space)" : "Play — start continuous playback (Space)"}
        >
          {isPlaying ? <Pause className="h-3.5 w-3.5 fill-current" /> : <Play className="h-3.5 w-3.5 fill-current" />}
        </button>
        <button
          className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          onClick={onSkipForward}
          title="Next page — step forward one full window"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <Sep />

      {/* ── Time ────────────────────────────────────────────────────────── */}
      <span
        className="text-[11px] font-mono text-muted-foreground tabular-nums whitespace-nowrap shrink-0"
        title="Current position / total recording duration"
      >
        {fmtTime(currentTime)}
        <span className="text-muted-foreground/40"> / {fmtTime(duration)}</span>
      </span>

      <Sep />

      {/* ── Montage ─────────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-0.5 shrink-0"
        title="Montage — electrode reference scheme. Referential uses raw input; bipolar shows differences between adjacent electrodes."
      >
        <span className="text-[10px] text-muted-foreground/60 font-medium select-none">Mnt</span>
        <Select value={montage} onValueChange={onMontageChange ?? (() => {})}>
          <SelectTrigger className="h-6 w-[100px] text-[11px] border-0 shadow-none bg-transparent px-1 focus:ring-0 rounded hover:bg-muted transition-colors text-foreground">
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

      {/* ── Speed ───────────────────────────────────────────────────────── */}
      <StepCtrl
        label="Speed"
        value={String(mmSec)}
        unit="mm/s"
        sub={`${timeWindow}s/page`}
        onDec={() => stepSpeed(-1)}
        onInc={() => stepSpeed(1)}
        disableDec={speedIdx <= 0}
        disableInc={speedIdx >= SPEED_OPTIONS.length - 1}
        tooltip="Sweep speed — standard EEG paper speed in mm/s. Slower speeds show more context; faster speeds reveal high-frequency detail. 30 mm/s is the clinical default."
      />

      <Sep />

      {/* ── Amplitude ───────────────────────────────────────────────────── */}
      <StepCtrl
        label="Amp"
        value={String(uvmm)}
        unit="µV/mm"
        onDec={() => stepAmp(-1)}
        onInc={() => stepAmp(1)}
        disableDec={ampIdx <= 0}
        disableInc={ampIdx >= AMP_OPTIONS.length - 1}
        tooltip="Amplitude sensitivity — microvolts per millimetre. Lower values (e.g. 7 µV/mm) make small signals larger on screen. 10 µV/mm is the clinical default for adult EEG."
      />

      {/* ── Channels ────────────────────────────────────────────────────── */}
      {visibleChannelCount != null && (
        <>
          <Sep />
          <span
            className="text-[11px] font-mono text-muted-foreground tabular-nums shrink-0"
            title="Number of channels currently displayed"
          >
            {visibleChannelCount}<span className="text-muted-foreground/40 text-[10px]"> ch</span>
          </span>
        </>
      )}

      <Sep />

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <FilterCtrl
        label="HF"
        value={hfFilter as typeof HF_OPTIONS[number]}
        options={HF_OPTIONS}
        onChange={v => onHFFilterChange?.(v)}
        displayFn={v => `${v}`}
        tooltip={esfLayer
          ? "High-frequency filter — applied client-side on top of ESF signals (additional low-pass on already-processed data)"
          : "High-frequency filter (low-pass cutoff in Hz) — removes muscle and high-frequency noise above this frequency. 70 Hz is the clinical default for routine EEG."}
        highlight={hfFilter !== 70}
      />
      <FilterCtrl
        label="LF"
        value={lfFilter as typeof LF_OPTIONS[number]}
        options={LF_OPTIONS}
        onChange={v => onLFFilterChange?.(v)}
        displayFn={v => v === 0 ? "Off" : v < 0.1 ? v.toFixed(3) : String(v)}
        tooltip={esfLayer
          ? "Low-frequency filter — already applied at ESF conversion (common average reference removes slow drift). Changing this applies an additional filter client-side."
          : "Low-frequency filter (high-pass cutoff in Hz) — removes slow drift and DC offset below this frequency. 0.5 Hz is the clinical default."}
        highlight={lfFilter !== 0.5}
      />
      {esfLayer ? (
        <span
          className="text-[10px] text-muted-foreground/50 shrink-0 font-mono select-none"
          title="Notch filter applied at ESF conversion (50 or 60 Hz per recording line frequency). No second filter applied here."
        >
          Notch ✓
        </span>
      ) : (
        <FilterCtrl
          label="Notch"
          value={notchFilter}
          options={[0, 50, 60] as const}
          onChange={v => onNotchFilterChange?.(v as 0 | 50 | 60)}
          displayFn={v => v === 0 ? "Off" : `${v} Hz`}
          tooltip="Notch (band-reject) filter — removes powerline interference at 50 Hz (Europe/Asia) or 60 Hz (Americas). Disable if analysing signals near the powerline frequency."
          highlight={notchFilter !== 0}
        />
      )}

      <Sep />

      {/* ── Denoise preset — only meaningful on raw layer ───────────────── */}
      {!esfLayer && (
        <button
          onClick={() => onDenoiseChange?.(!denoise)}
          title={denoise
            ? "Denoise ON — LF 1 Hz · HF 35 Hz · Notch 50 Hz. Click to restore previous filters."
            : "Denoise — apply aggressive bandpass (1–35 Hz) + 50 Hz notch to suppress EMG, power-line, and electrode noise."}
          className={cn(
            "h-6 px-2 rounded text-[11px] font-semibold font-mono transition-all select-none shrink-0 border",
            denoise
              ? "bg-violet-600 text-white border-violet-500 shadow-sm shadow-violet-500/30"
              : "bg-transparent text-muted-foreground border-border hover:border-violet-400 hover:text-violet-400",
          )}
        >
          Denoise
        </button>
      )}

    </div>
  );
}
