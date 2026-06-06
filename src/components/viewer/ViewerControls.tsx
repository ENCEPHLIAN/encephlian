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
  { value: "referential",          label: "Referential"          },
  { value: "average-reference",    label: "Average Reference"    },
  { value: "bipolar-longitudinal", label: "Bipolar Longitudinal" },
  { value: "bipolar-transverse",   label: "Bipolar Transverse"   },
  { value: "laplacian",            label: "Laplacian"            },
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
  return <div className="h-5 w-px bg-border/50 shrink-0" aria-hidden />;
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
    <div className="flex items-center gap-1.5 shrink-0" title={tooltip}>
      <span className="text-[10px] text-muted-foreground/70 font-medium select-none whitespace-nowrap">{label}</span>
      <button
        className="h-6 w-5 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors rounded hover:bg-muted"
        onClick={onDec}
        disabled={disableDec}
        aria-label={`Decrease ${label}`}
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>
      <span className="flex flex-col items-center leading-none min-w-[32px] text-center">
        <span className="text-[12px] font-mono font-semibold text-foreground tabular-nums">{value}</span>
        {sub && <span className="text-[9px] font-mono text-muted-foreground/50 tabular-nums leading-none mt-0.5">{sub}</span>}
      </span>
      <button
        className="h-6 w-5 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors rounded hover:bg-muted"
        onClick={onInc}
        disabled={disableInc}
        aria-label={`Increase ${label}`}
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
      <span className="text-[10px] text-muted-foreground/60 select-none whitespace-nowrap">{unit}</span>
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
  disabled,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
  displayFn?: (v: T) => string;
  tooltip?: string;
  highlight?: boolean;
  disabled?: boolean;
}) {
  const fmt = displayFn ?? String;
  return (
    <div
      className={cn("flex items-center gap-1 shrink-0", disabled && "opacity-40")}
      title={tooltip}
    >
      <span className="text-[10px] text-muted-foreground/70 font-medium select-none whitespace-nowrap">{label}</span>
      <Select value={String(value)} onValueChange={v => onChange(Number(v) as T)} disabled={disabled}>
        <SelectTrigger className={cn(
          "h-7 min-w-[52px] text-[11px] font-mono border-0 shadow-none bg-transparent px-1.5 focus:ring-0 rounded transition-colors",
          disabled ? "cursor-not-allowed" : "hover:bg-muted",
          highlight && !disabled ? "text-amber-500 dark:text-amber-300 font-semibold" : "text-foreground",
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
  signalLayer = "prenorm",
  montage = "referential",
  onMontageChange,
  visibleChannelCount,
}: ViewerControlsProps) {

  // Per-layer behavior is more nuanced than a binary `esfLayer`:
  //   - raw       : vendor-native signal. No client-side filtering offered — claiming
  //                 to filter would conflict with "raw" semantics. Amplitude shown in
  //                 µV/mm (assumed; most vendors store µV) with a caveat tooltip.
  //   - prenorm   : ESF µV-preserved (250 Hz, notch + CAR applied at conversion, no
  //                 z-score). Additional client-side HF/LF is LEGITIMATE here — it
  //                 narrows the already-clean band further. Amplitude in µV/mm.
  //   - normalized: ESF z-scored (model input). Client-side filtering on z values is
  //                 mathematically defined but clinically meaningless — disabled.
  //                 Amplitude in σ/mm (z-units, dimensionless). Visibly tagged
  //                 "model view" to discourage clinical reading.
  const isRaw    = signalLayer === "raw";
  const isPreNorm = signalLayer === "prenorm";
  const isNorm   = signalLayer === "normalized";
  const filtersEditable = isPreNorm;  // only on µV layer
  const ampUnit = isNorm ? "σ/mm" : "µV/mm";
  const ampUnitTitle = isNorm
    ? "Amplitude in z-score units (σ/mm). Normalized layer has no µV scale — values are robust z-scored per channel."
    : isRaw
      ? "Amplitude in µV/mm assuming vendor stored µV. EDF/BDF typically µV; some vendors (Nihon Kohden, etc.) use vendor units that may need scaling — verify against original recording."
      : "Amplitude in µV/mm (clinical default). µV layer preserves absolute amplitude post-notch + CAR.";
  const layerSubtitle = isRaw ? "vendor signal" : isPreNorm ? "clinical reading" : "model view";
  const layerBadgeCls = isRaw
    ? "border-amber-500/40 text-amber-700 dark:text-amber-300 bg-amber-500/8"
    : isPreNorm
      ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300 bg-emerald-500/8"
      : "border-violet-500/40 text-violet-700 dark:text-violet-300 bg-violet-500/8";

  const mmSec    = windowSecToMmSec(timeWindow);
  const uvmm     = scaleToUVMM(amplitudeScale);
  const speedIdx = SPEED_OPTIONS.findIndex(o => o.mmSec === mmSec);
  const ampIdx   = AMP_OPTIONS.findIndex(o => o.uvmm === uvmm);

  const stepSpeed = (d: 1 | -1) => { const n = SPEED_OPTIONS[speedIdx + d]; if (n) onTimeWindowChange(n.windowSec); };
  const stepAmp   = (d: 1 | -1) => { const n = AMP_OPTIONS[ampIdx + d]; if (n) onAmplitudeScaleChange(10 / n.uvmm); };

  // Display label = full word, not the toggle abbreviation. Medical-grade readability.
  const layerDisplayName = isRaw ? "Raw Signal" : isPreNorm ? "Microvolts (µV)" : "Normalized (z-score)";

  return (
    <div className="h-11 px-4 border-b bg-background flex items-center gap-4 flex-shrink-0 overflow-x-auto">

      {/* ── Layer badge — persistent honest indicator of current signal layer ── */}
      <div
        className={cn(
          "flex items-baseline gap-1.5 px-2.5 h-7 rounded border shrink-0 select-none",
          layerBadgeCls,
        )}
        title={
          isRaw
            ? "Raw Signal — original recorded waveform as stored by the vendor. No filtering, no resampling, no reference. Montage locked to referential."
            : isPreNorm
              ? "Microvolts (µV) — clinical reading layer. ESF v1: 19 channels, 250 Hz, 50/60 Hz notch + common-average reference applied. Absolute microvolts preserved (no z-score)."
              : "Normalized (z-score) — what the inference model sees. Robust z-scored per channel. Dimensionless. NOT for clinical reading — use Microvolts instead."
        }
      >
        <span className="text-[12px] font-semibold leading-none">{layerDisplayName}</span>
        <span className="text-[10px] opacity-70 leading-none">{layerSubtitle}</span>
      </div>

      <Sep />

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
        className="flex items-center gap-1 shrink-0"
        title="Montage — electrode reference scheme. Referential shows each channel against a common reference; bipolar montages show voltage differences between adjacent electrodes."
      >
        <span className="text-[10px] text-muted-foreground/70 font-medium select-none">Montage</span>
        <Select
          value={signalLayer === "raw" ? "referential" : montage}
          onValueChange={signalLayer === "raw" ? undefined : (onMontageChange ?? (() => {}))}
          disabled={signalLayer === "raw"}
        >
          <SelectTrigger
            className="h-7 w-[156px] text-[11px] border-0 shadow-none bg-transparent px-1.5 focus:ring-0 rounded hover:bg-muted transition-colors text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
            title={signalLayer === "raw" ? "Montage locked to Referential on Raw Signal layer — vendor channels shown as-is, no derivation applied" : undefined}
          >
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

      {/* ── Paper Speed ─────────────────────────────────────────────────── */}
      <StepCtrl
        label="Paper Speed"
        value={String(mmSec)}
        unit="mm/s"
        sub={`${timeWindow}s/page`}
        onDec={() => stepSpeed(-1)}
        onInc={() => stepSpeed(1)}
        disableDec={speedIdx <= 0}
        disableInc={speedIdx >= SPEED_OPTIONS.length - 1}
        tooltip="Paper sweep speed — standard clinical EEG units (millimetres per second). Slower speeds show more context; faster speeds reveal high-frequency detail. 30 mm/s is the clinical default."
      />

      <Sep />

      {/* ── Sensitivity (unit + tooltip adapt to layer) ─────────────────── */}
      <StepCtrl
        label="Sensitivity"
        value={String(uvmm)}
        unit={ampUnit}
        onDec={() => stepAmp(-1)}
        onInc={() => stepAmp(1)}
        disableDec={ampIdx <= 0}
        disableInc={ampIdx >= AMP_OPTIONS.length - 1}
        tooltip={ampUnitTitle}
      />

      {/* ── Channels (full word — medical-grade readability) ────────────── */}
      {visibleChannelCount != null && (
        <>
          <Sep />
          <span
            className="text-[11px] text-muted-foreground tabular-nums shrink-0"
            title="Number of channels currently displayed"
          >
            <span className="font-mono font-semibold">{visibleChannelCount}</span>
            <span className="text-muted-foreground/60 ml-1">channels</span>
          </span>
        </>
      )}

      <Sep />

      {/* ── Filters ─ adapt per layer:
          µV (prenorm) : HF + LF + Notch all editable client-side (additional filter on top of pre-cleaned ESF)
          Raw          : HF + LF disabled (raw means raw — filtering would contradict the layer label).
                         Notch still offered for the common case of obvious powerline interference.
          Normalized   : HF + LF + Notch all disabled. Z-scored data has no clinically-interpretable
                         frequency response left to filter — disable to prevent confusion. ───────── */}
      <FilterCtrl
        label="Low-Pass"
        value={hfFilter as typeof HF_OPTIONS[number]}
        options={HF_OPTIONS}
        onChange={v => filtersEditable && onHFFilterChange?.(v)}
        displayFn={v => `${v}`}
        tooltip={
          isPreNorm
            ? "Low-pass filter (high-frequency cutoff in Hz) — additional client-side filter on top of microvolt ESF signals. 70 Hz is the clinical default for routine EEG."
            : isRaw
              ? "Disabled on Raw Signal layer — raw means no filtering. Switch to Microvolts (µV) to apply a client-side low-pass filter."
              : "Disabled on Normalized layer — z-scored data has no clinically-meaningful frequency response to filter. Switch to Microvolts (µV) for filtering."
        }
        highlight={filtersEditable && hfFilter !== 70}
        disabled={!filtersEditable}
      />
      <FilterCtrl
        label="High-Pass"
        value={lfFilter as typeof LF_OPTIONS[number]}
        options={LF_OPTIONS}
        onChange={v => filtersEditable && onLFFilterChange?.(v)}
        displayFn={v => v === 0 ? "Off" : v < 0.1 ? v.toFixed(3) : String(v)}
        tooltip={
          isPreNorm
            ? "High-pass filter (low-frequency cutoff in Hz) — additional client-side filter on top of microvolt ESF signals. ESF already removes slow drift via common-average reference. 0.5 Hz is the clinical default."
            : isRaw
              ? "Disabled on Raw Signal layer — raw means no filtering. Switch to Microvolts (µV) to apply a client-side high-pass filter."
              : "Disabled on Normalized layer — z-scored data has no clinically-meaningful frequency response to filter. Switch to Microvolts (µV) for filtering."
        }
        highlight={filtersEditable && lfFilter !== 0.5}
        disabled={!filtersEditable}
      />
      {(isPreNorm || isNorm) ? (
        <span
          className="text-[10px] text-muted-foreground/60 shrink-0 select-none flex items-center gap-1"
          title="Notch filter (50 or 60 Hz per recording line frequency) applied at ESF conversion. Not editable on ESF layers — re-applying would double-attenuate."
        >
          <span className="font-medium">Notch</span>
          <span className="text-emerald-600 dark:text-emerald-400 font-mono">✓ applied</span>
        </span>
      ) : (
        <FilterCtrl
          label="Notch"
          value={notchFilter}
          options={[0, 50, 60] as const}
          onChange={v => onNotchFilterChange?.(v as 0 | 50 | 60)}
          displayFn={v => v === 0 ? "Off" : `${v} Hz`}
          tooltip="Notch (band-reject) filter — removes powerline interference at 50 Hz (Europe / Asia) or 60 Hz (Americas). Disable if analysing signals near the powerline frequency."
          highlight={notchFilter !== 0}
        />
      )}

      <Sep />

      {/* ── Denoise preset — only meaningful on µV layer (filters editable) ─ */}
      {filtersEditable && (
        <button
          onClick={() => onDenoiseChange?.(!denoise)}
          title={denoise
            ? "Denoise ON — LF 1 Hz · HF 35 Hz · Notch 50 Hz. Client-side bandpass on µV ESF. Click to restore previous filters."
            : "Denoise — apply aggressive client-side bandpass (1–35 Hz) + 50 Hz notch to suppress residual EMG, power-line, and electrode noise."}
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
