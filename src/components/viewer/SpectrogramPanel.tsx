/**
 * SpectrogramPanel — Persyst-style time-frequency view, per-channel strips.
 *
 * One strip per channel. Each strip is a 2-D canvas:
 *   - X = time (synchronized with the main signal canvas window)
 *   - Y = frequency (0.5 – 30 Hz, clinical band)
 *   - Color = log-power (dB), viridis-style with semantic anchors
 *     (dark gray = low / quiet background, blue = mid, amber = high power)
 *
 * Self-contained: takes signals, sampleRate, channelLabels, windowStart,
 * windowSec — no SignalViewer or SignalCanvas imports. Owns its own
 * channel-selection state (default 5 clinically informative; toggle to 19).
 *
 * Integration in SignalViewer will:
 *   1. mount this when its layer toggle is on,
 *   2. pass the same windowStart / windowSec / signals as the main canvas,
 *   3. pass the same channelLabels.
 *
 * The component does NOT need to drive playback / scrubbing — the parent
 * `currentTime` flows in as an optional cursor overlay.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, ChevronDown, ChevronUp, Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSpectrogramCache } from "@/hooks/useSpectrogramCache";
import { filterStandardChannels } from "@/lib/signal/standard-channels";

// ── Defaults ──────────────────────────────────────────────────────────────
// Five strips for the routine adult outpatient first-look: posterior alpha
// rhythm (O1 / O2), frontal asymmetry / FIRDA (Fp1), and midline (Fz, Pz).
// Clinicians scan these first; the full 19 is one click away.
const DEFAULT_5_CHANNELS = ["FP1", "O1", "O2", "FZ", "PZ"] as const;

const DEFAULT_FFT_SIZE = 256;   // ~1 Hz bin @ 250 Hz, ~0.5 s frames @ 50 % overlap
const DEFAULT_OVERLAP = 0.5;
const FMIN_HZ = 0.5;
const FMAX_HZ = 30;

// Clinical EEG band boundaries (Hz). Used for axis tick markers + tooltip.
const BANDS: { name: "delta" | "theta" | "alpha" | "beta"; lo: number; hi: number; rgb: [number, number, number]; label: string }[] = [
  { name: "delta", lo: 0.5,  hi: 4,  rgb: [148, 163, 184], label: "δ" }, // slate
  { name: "theta", lo: 4,    hi: 8,  rgb: [59,  130, 246], label: "θ" }, // blue
  { name: "alpha", lo: 8,    hi: 13, rgb: [16,  185, 129], label: "α" }, // emerald
  { name: "beta",  lo: 13,   hi: 30, rgb: [245, 158, 11],  label: "β" }, // amber
];

function bandFor(hz: number): typeof BANDS[number] | null {
  for (const b of BANDS) {
    if (hz >= b.lo && hz < b.hi) return b;
  }
  return null;
}

// Strip height per channel. Compact by default (Persyst is ~28-36 px / strip).
const STRIP_H = 32;
const STRIP_GAP = 1;       // px gutter between strips
const LABEL_W = 44;        // left gutter for channel labels
const TIME_AXIS_H = 16;    // bottom time axis
const PALETTE_W = 8;       // right colorbar swatch width

// ── Colormap ──────────────────────────────────────────────────────────────
// Semantic 4-stop palette. Low power = neutral background gray (so quiet
// channels read as quiet, not "interesting purple"); rising power passes
// through cool slate-blue (theta/alpha territory) into warm amber (beta-band
// burst, EMG, or post-spike rebound). Bright = high power.
const PALETTE_STOPS: Array<{ t: number; rgb: [number, number, number] }> = [
  { t: 0.00, rgb: [16,  16,  20]  },  // floor — near-black neutral
  { t: 0.25, rgb: [38,  52,  78]  },  // muted blue-gray
  { t: 0.55, rgb: [56,  120, 184] },  // mid blue (clinical info color)
  { t: 0.80, rgb: [217, 161, 64]  },  // amber
  { t: 1.00, rgb: [253, 224, 145] },  // bright amber (peak)
];

function paletteSample(t: number): [number, number, number] {
  const tc = Math.max(0, Math.min(1, t));
  for (let i = 1; i < PALETTE_STOPS.length; i++) {
    const a = PALETTE_STOPS[i - 1];
    const b = PALETTE_STOPS[i];
    if (tc <= b.t) {
      const u = (tc - a.t) / (b.t - a.t || 1);
      return [
        Math.round(a.rgb[0] + (b.rgb[0] - a.rgb[0]) * u),
        Math.round(a.rgb[1] + (b.rgb[1] - a.rgb[1]) * u),
        Math.round(a.rgb[2] + (b.rgb[2] - a.rgb[2]) * u),
      ];
    }
  }
  return PALETTE_STOPS[PALETTE_STOPS.length - 1].rgb;
}

// ── Props ─────────────────────────────────────────────────────────────────
export interface SpectrogramPanelProps {
  /** Windowed signals (already sliced to [windowStart, windowStart+windowSec]).
   *  Same shape as SignalCanvas.signals: [channelIdx][sampleIdx]. */
  signals: number[][] | null;
  channelLabels: string[];
  sampleRate: number;
  /** Window start (sec). Used for the time axis only; data is already windowed. */
  windowStart: number;
  /** Window length (sec). Same as ViewerControls.timeWindow. */
  windowSec: number;
  /** Optional cursor position in seconds (within the window) — vertical line overlay. */
  currentTime?: number;
  /** Study id — used as cache key partition; pass `null` for live data. */
  studyId?: string | null;
  /** If false, panel renders nothing (parent owns visibility). */
  visible?: boolean;
  /** Header collapse toggle handler (parent can also unmount instead). */
  onClose?: () => void;
  className?: string;
}

// ── Component ─────────────────────────────────────────────────────────────
export function SpectrogramPanel({
  signals,
  channelLabels,
  sampleRate,
  windowStart,
  windowSec,
  currentTime,
  studyId,
  visible = true,
  onClose,
  className,
}: SpectrogramPanelProps) {
  const [showAll, setShowAll] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Normalize label lookup (case-insensitive prefix).
  const normalize = (s: string) => s.trim().toUpperCase().replace(/\./g, "");

  // Build channel selection — the canonical IDs we *want* to show, mapped to
  // the actual index in `channelLabels` (or skipped if absent).
  const visibleChannelIndices = useMemo(() => {
    if (!channelLabels?.length) return [] as Array<{ id: string; idx: number; displayLabel: string }>;
    if (showAll) {
      const idxList = filterStandardChannels(channelLabels);
      return idxList.map(i => ({
        id: normalize(channelLabels[i]),
        idx: i,
        displayLabel: channelLabels[i],
      }));
    }
    // Default 5 — preserve clinical priority order even if labels are jumbled.
    const out: Array<{ id: string; idx: number; displayLabel: string }> = [];
    for (const want of DEFAULT_5_CHANNELS) {
      const idx = channelLabels.findIndex(l => normalize(l) === want || normalize(l).startsWith(want));
      if (idx >= 0) out.push({ id: want, idx, displayLabel: channelLabels[idx] });
    }
    return out;
  }, [channelLabels, showAll]);

  // Pull a windowed Float32Array per channel id for the worker.
  const getChannelSignal = useCallback((channelId: string): Float32Array | null => {
    if (!signals) return null;
    const entry = visibleChannelIndices.find(e => e.id === channelId);
    if (!entry) return null;
    const row = signals[entry.idx];
    if (!row || row.length === 0) return null;
    // Skip rows that are all NaN (ESF reserves NaN rows for vendor-missing channels).
    let hasFinite = false;
    for (let i = 0; i < row.length; i++) {
      if (Number.isFinite(row[i])) { hasFinite = true; break; }
    }
    if (!hasFinite) return null;
    // Convert + replace NaN with 0 (mean) so FFT doesn't blow up on partial gaps.
    const out = new Float32Array(row.length);
    for (let i = 0; i < row.length; i++) {
      const v = row[i];
      out[i] = Number.isFinite(v) ? v : 0;
    }
    return out;
  }, [signals, visibleChannelIndices]);

  const channelIds = useMemo(
    () => visibleChannelIndices.map(e => e.id),
    [visibleChannelIndices],
  );

  const { spectrograms, loading, meta } = useSpectrogramCache({
    studyId: studyId ?? null,
    windowStart,
    windowSec,
    channels: channelIds,
    sampleRate,
    getChannelSignal,
    fftSize: DEFAULT_FFT_SIZE,
    overlap: DEFAULT_OVERLAP,
    paused: !visible || collapsed,
  });

  if (!visible) return null;

  return (
    <Card
      className={cn(
        "border-border/60 bg-background/95 flex flex-col overflow-hidden",
        className,
      )}
    >
      <SpecHeader
        showAll={showAll}
        onToggleAll={() => setShowAll(s => !s)}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed(c => !c)}
        onClose={onClose}
        channelCount={visibleChannelIndices.length}
        meta={meta}
        windowSec={windowSec}
      />

      {!collapsed && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          {visibleChannelIndices.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="px-3 pt-2 pb-1">
              {visibleChannelIndices.map(({ id, displayLabel }) => (
                <SpectrogramStrip
                  key={id}
                  channelId={id}
                  displayLabel={displayLabel}
                  spectrogram={spectrograms[id]}
                  loading={loading.has(id)}
                  windowSec={windowSec}
                  windowStart={windowStart}
                  currentTime={currentTime}
                />
              ))}
              <TimeAxis windowStart={windowStart} windowSec={windowSec} />
              <BandLegend />
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ── Header ────────────────────────────────────────────────────────────────
function SpecHeader({
  showAll,
  onToggleAll,
  collapsed,
  onToggleCollapsed,
  onClose,
  channelCount,
  meta,
  windowSec,
}: {
  showAll: boolean;
  onToggleAll: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onClose?: () => void;
  channelCount: number;
  meta: ReturnType<typeof useSpectrogramCache>["meta"];
  windowSec: number;
}) {
  return (
    <div className="h-9 px-3 border-b border-border/60 flex items-center justify-between gap-3 shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <BarChart3 className="h-3.5 w-3.5 text-blue-500 shrink-0" />
        <span className="text-[12px] font-semibold tracking-wider uppercase text-foreground select-none">
          Spectrogram
        </span>
        <span className="text-[10px] text-muted-foreground/70 font-mono tabular-nums">
          {FMIN_HZ.toFixed(1)}–{FMAX_HZ} Hz
        </span>
        {meta && (
          <span
            className="text-[10px] text-muted-foreground/50 font-mono tabular-nums"
            title={`STFT — Hann window, ${meta.fftSize}-pt FFT, ${Math.round(meta.overlap * 100)}% overlap. ${meta.binHz.toFixed(2)} Hz bin · ${(meta.frameSec * 1000).toFixed(0)} ms frame.`}
          >
            · {meta.binHz.toFixed(1)} Hz · {(meta.frameSec * 1000).toFixed(0)} ms
          </span>
        )}
      </div>
      <div className="flex items-center gap-0.5">
        <span className="text-[10px] text-muted-foreground tabular-nums font-mono mr-1 select-none">
          {channelCount} ch · {windowSec}s
        </span>
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                onClick={onToggleAll}
                aria-label={showAll ? "Show 5 channels" : "Show all 19 channels"}
              >
                {showAll ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-[11px]">
              {showAll ? "Collapse to 5 clinical channels" : "Expand to all 10-20 channels"}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                onClick={onToggleCollapsed}
                aria-label={collapsed ? "Expand panel" : "Collapse panel"}
              >
                {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-[11px]">
              {collapsed ? "Expand spectrogram" : "Collapse spectrogram (pauses computation)"}
            </TooltipContent>
          </Tooltip>
          {onClose && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                  onClick={onClose}
                  aria-label="Close spectrogram panel"
                >
                  <span className="text-[14px] leading-none">×</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-[11px]">Close panel</TooltipContent>
            </Tooltip>
          )}
        </TooltipProvider>
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-12 gap-2">
      <BarChart3 className="h-5 w-5 text-muted-foreground/40" />
      <p className="text-[11px] text-muted-foreground/70 leading-snug max-w-[260px]">
        No standard 10-20 channels found in this recording.<br />
        Spectrogram requires referential montage with at least one of FP1, O1, O2, FZ, PZ.
      </p>
    </div>
  );
}

// ── Per-channel strip ─────────────────────────────────────────────────────
interface SpectrogramStripProps {
  channelId: string;
  displayLabel: string;
  spectrogram: ReturnType<typeof useSpectrogramCache>["spectrograms"][string];
  loading: boolean;
  windowSec: number;
  windowStart: number;
  currentTime?: number;
}

function SpectrogramStrip({
  channelId,
  displayLabel,
  spectrogram,
  loading,
  windowSec,
  windowStart,
  currentTime,
}: SpectrogramStripProps) {
  void channelId; // accepted for symmetry / future per-channel overlays
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number; tSec: number; hz: number; db: number | null } | null>(null);
  const [containerW, setContainerW] = useState(0);

  // Observe width — strip is full-width minus label gutter.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        setContainerW(Math.floor(e.contentRect.width));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Paint when data or width changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !spectrogram || containerW <= LABEL_W + PALETTE_W + 4) return;

    const stripW = containerW - LABEL_W - PALETTE_W - 4;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.floor(stripW * dpr);
    canvas.height = Math.floor(STRIP_H * dpr);
    canvas.style.width = `${stripW}px`;
    canvas.style.height = `${STRIP_H}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const { spectrogram: data, nFrames, nBins, binHz, dbMin, dbMax } = spectrogram;
    const range = Math.max(1, dbMax - dbMin);

    // Pre-rasterize the time-frequency image into an ImageData backbuffer at
    // the *strip* resolution (one column per output pixel, one row per output
    // pixel). For each output px, look up the nearest frame + bin.
    const img = ctx.createImageData(Math.floor(stripW), STRIP_H);
    const buf = img.data;

    const kLo = Math.max(1, Math.floor(FMIN_HZ / binHz));
    const kHi = Math.min(nBins - 1, Math.ceil(FMAX_HZ / binHz));

    for (let x = 0; x < stripW; x++) {
      const fIdx = nFrames <= 1 ? 0 : Math.min(nFrames - 1, Math.floor((x / stripW) * nFrames));
      for (let y = 0; y < STRIP_H; y++) {
        // Y inverted: top = high freq, bottom = low freq.
        const yFrac = 1 - y / STRIP_H;
        const k = Math.round(kLo + yFrac * (kHi - kLo));
        const db = data[fIdx * nBins + k];
        const t = (db - dbMin) / range;
        const [r, g, b] = paletteSample(t);
        const o = (y * Math.floor(stripW) + x) * 4;
        buf[o] = r;
        buf[o + 1] = g;
        buf[o + 2] = b;
        buf[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    // Faint band-boundary horizontal hairlines (4, 8, 13 Hz).
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 1;
    for (const b of BANDS) {
      const hz = b.hi;
      if (hz <= FMIN_HZ || hz >= FMAX_HZ) continue;
      const yFrac = (hz - FMIN_HZ) / (FMAX_HZ - FMIN_HZ);
      const y = Math.round((1 - yFrac) * STRIP_H) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(stripW, y);
      ctx.stroke();
    }
    ctx.restore();
  }, [spectrogram, containerW]);

  const stripW = Math.max(0, containerW - LABEL_W - PALETTE_W - 4);
  const cursorPct = (currentTime != null && windowSec > 0)
    ? Math.max(0, Math.min(1, currentTime / windowSec))
    : null;

  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!spectrogram) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (x < 0 || x > stripW || y < 0 || y > STRIP_H) return;
    const tSec = windowStart + (x / stripW) * windowSec;
    const yFrac = 1 - y / STRIP_H;
    const hz = FMIN_HZ + yFrac * (FMAX_HZ - FMIN_HZ);
    const { spectrogram: data, nFrames, nBins, binHz } = spectrogram;
    const fIdx = nFrames <= 1 ? 0 : Math.min(nFrames - 1, Math.floor((x / stripW) * nFrames));
    const k = Math.max(0, Math.min(nBins - 1, Math.round(hz / binHz)));
    const db = data[fIdx * nBins + k];
    setHover({ x, y, tSec, hz, db: Number.isFinite(db) ? db : null });
  };
  const onMouseLeave = () => setHover(null);

  const hoverBand = hover ? bandFor(hover.hz) : null;

  return (
    <div
      ref={containerRef}
      className="flex items-stretch w-full select-none"
      style={{ height: STRIP_H, marginBottom: STRIP_GAP }}
    >
      {/* Channel label gutter */}
      <div
        className="flex items-center justify-end pr-2 text-[10px] font-mono text-muted-foreground tabular-nums shrink-0"
        style={{ width: LABEL_W }}
        title={`Channel ${displayLabel}`}
      >
        {displayLabel}
      </div>

      {/* Canvas + hover overlay */}
      <div
        className="relative bg-muted/20"
        style={{ width: stripW }}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
      >
        {loading && !spectrogram && (
          <Skeleton className="absolute inset-0 rounded-none" />
        )}
        {!loading && !spectrogram && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[9px] text-muted-foreground/40 font-mono">no signal</span>
          </div>
        )}
        <canvas ref={canvasRef} className="block" />

        {/* Sync cursor — same as main signal canvas */}
        {cursorPct != null && stripW > 0 && (
          <div
            className="absolute top-0 bottom-0 w-px bg-cyan-400/80 pointer-events-none"
            style={{ left: cursorPct * stripW }}
          />
        )}

        {/* Hover overlay (vertical line + readout) */}
        {hover && (
          <>
            <div
              className="absolute top-0 bottom-0 w-px bg-foreground/40 pointer-events-none"
              style={{ left: hover.x }}
            />
            <div
              className="absolute -top-0.5 z-10 pointer-events-none translate-y-[-100%]"
              style={{ left: Math.min(hover.x + 6, stripW - 130) }}
            >
              <div className="rounded-sm bg-background/95 border border-border/60 px-1.5 py-0.5 shadow text-[9px] font-mono tabular-nums whitespace-nowrap leading-tight">
                <span className="text-foreground">{hover.hz.toFixed(1)} Hz</span>
                {hoverBand && (
                  <span
                    className="ml-1.5"
                    style={{ color: `rgb(${hoverBand.rgb.join(",")})` }}
                  >
                    {hoverBand.label}
                  </span>
                )}
                <span className="text-muted-foreground/60 mx-1">·</span>
                <span className="text-foreground">
                  {hover.db != null ? `${hover.db.toFixed(1)} dB` : "—"}
                </span>
                <span className="text-muted-foreground/60 mx-1">·</span>
                <span className="text-muted-foreground">{hover.tSec.toFixed(2)}s</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Mini colorbar at the right edge — power gradient legend */}
      <PowerColorbar />
    </div>
  );
}

// ── Right-edge colorbar (one per strip, tiny — keeps each strip self-contained). ──
function PowerColorbar() {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    c.width = Math.floor(PALETTE_W * dpr);
    c.height = Math.floor(STRIP_H * dpr);
    c.style.width = `${PALETTE_W}px`;
    c.style.height = `${STRIP_H}px`;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const img = ctx.createImageData(PALETTE_W, STRIP_H);
    for (let y = 0; y < STRIP_H; y++) {
      const t = 1 - y / STRIP_H;
      const [r, g, b] = paletteSample(t);
      for (let x = 0; x < PALETTE_W; x++) {
        const o = (y * PALETTE_W + x) * 4;
        img.data[o] = r;
        img.data[o + 1] = g;
        img.data[o + 2] = b;
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, []);
  return (
    <canvas
      ref={ref}
      className="ml-1 shrink-0 rounded-sm"
      title="Power scale — bottom = low (dB), top = high (dB). Auto-scaled per channel to the 0.5–30 Hz band."
    />
  );
}

// ── Time axis under the strip stack ───────────────────────────────────────
function TimeAxis({ windowStart, windowSec }: { windowStart: number; windowSec: number }) {
  // 5-6 ticks across the window.
  const nTicks = 6;
  const ticks = useMemo(() => {
    const arr: number[] = [];
    for (let i = 0; i <= nTicks; i++) arr.push(windowStart + (i / nTicks) * windowSec);
    return arr;
  }, [windowStart, windowSec]);
  return (
    <div
      className="flex items-start mt-1 pl-[44px] pr-[12px]"
      style={{ height: TIME_AXIS_H }}
    >
      <div className="relative flex-1 h-full">
        {ticks.map((t, i) => (
          <span
            key={i}
            className="absolute top-0 text-[9px] font-mono text-muted-foreground/70 tabular-nums -translate-x-1/2 whitespace-nowrap"
            style={{ left: `${(i / nTicks) * 100}%` }}
          >
            {t.toFixed(t < 60 ? 1 : 0)}s
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Band legend ───────────────────────────────────────────────────────────
function BandLegend() {
  return (
    <div className="px-[44px] pt-1.5 pb-2 flex items-center gap-3 text-[9px] font-mono text-muted-foreground/70 select-none border-t border-border/30 mt-1">
      <span className="uppercase tracking-wider text-[8.5px] text-muted-foreground/50">Bands</span>
      {BANDS.map(b => (
        <span key={b.name} className="flex items-center gap-1" title={`${b.name} ${b.lo}–${b.hi} Hz`}>
          <span
            className="inline-block h-1.5 w-2.5 rounded-sm"
            style={{ background: `rgb(${b.rgb.join(",")})` }}
          />
          <span style={{ color: `rgb(${b.rgb.join(",")})` }}>{b.label}</span>
          <span className="text-muted-foreground/60 tabular-nums">{b.lo}–{b.hi}</span>
        </span>
      ))}
      <span className="ml-auto text-muted-foreground/40 italic">power · dB, log scale</span>
    </div>
  );
}
