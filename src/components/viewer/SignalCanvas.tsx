import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { getChannelColor, ChannelGroup } from "@/lib/signal/channel-groups";

interface Marker {
  id?: string;
  timestamp_sec: number; // absolute or window-relative; we treat as window-relative if <= timeWindow
  marker_type: string;
  label?: string;
}

interface ArtifactInterval {
  start_sec: number; // window-relative seconds
  end_sec: number; // window-relative seconds
  label?: string;
  channel?: number; // if null/undefined => apply to all channels
}

interface Selection {
  startTime: number;
  endTime: number;
}

interface SegmentInterval {
  start_sec: number;
  end_sec: number;
  label: string;
  color?: string;      // fill rgba
  borderColor?: string; // border rgba
}

export interface SignalCanvasProps {
  signals: number[][] | null; // IMPORTANT: expected to be WINDOWED already (length ≈ timeWindow*fs)
  channelLabels: string[];
  sampleRate: number;
  currentTime: number; // cursor time within window [0..timeWindow]
  timeWindow: number;
  amplitudeScale: number; // display-only multiplier
  visibleChannels: Set<number>;
  theme: string;
  markers?: Marker[];
  artifactIntervals?: ArtifactInterval[];
  segmentIntervals?: SegmentInterval[];
  channelColors?: string[];
  labelColumnWidth?: number; // px width for channel label panel (0 = overlay labels, >0 = dedicated column)
  hfFilter?: number;         // high-frequency cutoff Hz (lowpass) — 0 = off
  lfFilter?: number;         // low-frequency cutoff Hz (highpass) — 0 = off
  notchFilter?: 0 | 50 | 60; // powerline notch — 0 = off
  uvPerMm?: number;           // amplitude calibration for ruler (µV per screen-mm)
  signalUnit?: "uV" | "zscore"; // "uV" = fixed gain tied to uvPerMm; "zscore" = auto-gain
  onTimeClick?: (time: number) => void;
  onSelectionChange?: (selection: Selection | null) => void;
}

const THEME_COLORS = {
  dark: {
    background: 0x0c0c0e,
    grid: 0x1c1c20,
    gridStrong: 0x2a2a30,
    zeroLine: 0x303038,
    text: "#e5e5e5",
    textMuted: "#737373",
    cursor: "#22d3ee",
    labelBg: "rgba(12,12,14,0.92)",
    labelPanelBg: "rgba(16,16,20,1)",
    labelPanelBorder: "rgba(42,42,48,1)",
    artifactBgRed: "rgba(239, 68, 68, 0.18)",
    artifactBorderRed: "rgba(239, 68, 68, 0.55)",
    highlightBg: "rgba(59, 130, 246, 0.15)",
    highlightBorder: "rgba(59, 130, 246, 0.6)",
  },
  light: {
    background: 0xfafafa,
    grid: 0xe2e4e8,
    gridStrong: 0xc8ccd4,
    zeroLine: 0xd8dce4,
    text: "#1a1a1a",
    textMuted: "#6b7280",
    cursor: "#4f46e5",
    labelBg: "rgba(248,248,250,1)",
    labelPanelBg: "rgba(244,245,248,1)",
    labelPanelBorder: "rgba(200,204,212,1)",
    artifactBgRed: "rgba(220, 38, 38, 0.12)",
    artifactBorderRed: "rgba(220, 38, 38, 0.45)",
    highlightBg: "rgba(37, 99, 235, 0.10)",
    highlightBorder: "rgba(37, 99, 235, 0.55)",
  },
};

const DEFAULT_CHANNEL_PALETTE = [
  0x60a5fa, 0x4ade80, 0xfbbf24, 0xa78bfa, 0xf87171, 0x34d399, 0xfb923c, 0x818cf8, 0xf472b6, 0x22d3d8, 0xa3e635,
  0xe879f9, 0xfcd34d, 0x6ee7b7, 0x93c5fd, 0xc084fc, 0xfdba74, 0x86efac, 0xfca5a5, 0x67e8f9,
];

const CHANNEL_THEME_COLORS: Record<ChannelGroup, { dark: number; light: number }> = {
  frontal:  { dark: 0x7eb8f7, light: 0x2563c8 },
  central:  { dark: 0x5ec994, light: 0x15803d },
  temporal: { dark: 0xd4a44a, light: 0xb45309 },
  occipital:{ dark: 0xb09de0, light: 0x6d28d9 },
  other:    { dark: 0x8b9cb3, light: 0x4b5563 },
};

function parseColorToHex(color: string): number {
  if (color.startsWith("#")) return parseInt(color.slice(1), 16);
  return 0x808080;
}

function normalizeChanLabel(s: string) {
  return s
    .replace(/^EEG\s+/i, "")
    .replace(/-(LE|REF|AVG|A1|A2)$/i, "")
    .trim();
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

// ── Biquad DSP ────────────────────────────────────────────────────────────────

/** 2nd-order Butterworth lowpass coefficients [b0,b1,b2,a1,a2]. Returns null if fc out of range. */
function biquadLP(fc: number, fs: number): [number,number,number,number,number] | null {
  if (fc <= 0 || fc >= fs / 2) return null;
  const w0 = (2 * Math.PI * fc) / fs;
  const cosw = Math.cos(w0), sinw = Math.sin(w0);
  const alpha = sinw / (2 * 0.7071); // Q = 1/√2 = Butterworth
  const a0 = 1 + alpha;
  return [
    ((1 - cosw) / 2) / a0,
     (1 - cosw)       / a0,
    ((1 - cosw) / 2) / a0,
    (-2 * cosw)      / a0,
     (1 - alpha)     / a0,
  ];
}

/** 2nd-order Butterworth highpass coefficients [b0,b1,b2,a1,a2]. Returns null if fc out of range. */
function biquadHP(fc: number, fs: number): [number,number,number,number,number] | null {
  if (fc <= 0 || fc >= fs / 2) return null;
  const w0 = (2 * Math.PI * fc) / fs;
  const cosw = Math.cos(w0), sinw = Math.sin(w0);
  const alpha = sinw / (2 * 0.7071);
  const a0 = 1 + alpha;
  return [
     ((1 + cosw) / 2) / a0,
    -(1 + cosw)       / a0,
     ((1 + cosw) / 2) / a0,
    (-2 * cosw)       / a0,
     (1 - alpha)      / a0,
  ];
}

/** 2nd-order IIR band-reject (notch) coefficients [b0,b1,b2,a1,a2]. Bandwidth fixed at 3 Hz. */
function biquadNotch(fc: number, fs: number): [number,number,number,number,number] | null {
  if (fc <= 0 || fc >= fs / 2) return null;
  const w0 = (2 * Math.PI * fc) / fs;
  const bw = (2 * Math.PI * 3) / fs; // 3 Hz bandwidth
  const cosw = Math.cos(w0);
  const alpha = Math.sin(w0) * Math.sinh(Math.log(2) / 2 * bw / Math.sin(w0));
  const a0 = 1 + alpha;
  return [
     1      / a0,
    (-2 * cosw) / a0,
     1      / a0,
    (-2 * cosw) / a0,
    ((1 - alpha) / a0),
  ];
}

/** Direct Form II Transposed biquad — numerically stable, O(n). */
function applyBiquad(sig: number[], b0: number, b1: number, b2: number, a1: number, a2: number): number[] {
  const out = new Array(sig.length);
  let w1 = 0, w2 = 0;
  for (let i = 0; i < sig.length; i++) {
    const x = sig[i];
    const y = b0 * x + w1;
    w1 = b1 * x - a1 * y + w2;
    w2 = b2 * x - a2 * y;
    out[i] = y;
  }
  return out;
}

/**
 * Connected polyline — one averaged sample per pixel column.
 * Returns flat xyz array for Line2/LineGeometry.setPositions().
 */
function buildPolylinePositions(
  sig: number[],
  signalAreaWidth: number,
  laneMidY: number,
  laneHalfHeight: number,
  gain: number,
  xOffset: number = 0,
): Float32Array {
  const pxCount = Math.max(2, Math.min(Math.round(signalAreaWidth), 2400));
  const out = new Float32Array(pxCount * 3); // one vertex per column, xyz
  const n = sig.length;
  const spp = n / pxCount;

  for (let px = 0; px < pxCount; px++) {
    const s0 = Math.floor(px * spp);
    const s1 = Math.min(n, Math.ceil((px + 1) * spp));

    // Average samples in this pixel column for smooth, anti-aliased waveform
    let sum = 0, count = 0;
    for (let i = s0; i < s1; i++) { sum += sig[i]; count++; }
    const v = count > 0 ? sum / count : 0;

    const x = xOffset + (px / (pxCount - 1)) * signalAreaWidth;
    const y = laneMidY - clamp(v * gain, -laneHalfHeight, laneHalfHeight);

    out[px * 3]     = x;
    out[px * 3 + 1] = y;
    out[px * 3 + 2] = 0;
  }
  return out;
}

function SignalCanvasComponent(props: SignalCanvasProps) {
  const {
    signals,
    channelLabels,
    sampleRate,
    currentTime,
    timeWindow,
    amplitudeScale,
    visibleChannels,
    theme,
    markers = [],
    artifactIntervals = [],
    segmentIntervals = [],
    channelColors = [],
    labelColumnWidth = 80,
    hfFilter = 0,
    lfFilter = 0,
    notchFilter = 0,
    uvPerMm = 10,
    signalUnit = "zscore",
    onTimeClick,
  } = props;

  const colors = useMemo(() => (theme === "dark" ? THEME_COLORS.dark : THEME_COLORS.light), [theme]);

  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);

  const labelsRef = useRef<HTMLDivElement | null>(null);
  const artifactRef = useRef<HTMLDivElement | null>(null);

  const gridRef = useRef<THREE.Line[]>([]);
  const cursorLineRef = useRef<THREE.Line | null>(null);

  // Dimensions snapshot — written by draw, read by updateCursor
  const dimsRef = useRef({ w: 0, h: 0, labelW: 80, signalW: 0, signalH: 0 });

  // Time axis
  const TIME_AXIS_H = 20;
  const timeAxisRef = useRef<HTMLDivElement | null>(null);

  // Stable ref to current draw — allows calling from resize observer
  const drawRef = useRef<(() => void) | null>(null);

  // per-channel drawable state (Line2 = connected polyline with real pixel-width via triangle strips)
  const lineStateRef = useRef<Map<number, { line: Line2; geom: LineGeometry; pos: Float32Array }>>(
    new Map(),
  );

  // ── Ruler state (null = hidden) ──────────────────────────────────────────────
  // pos: {x, y} fractions of signal area [0,1] × [0,1]. anchor = bottom-left of L.
  const [rulerPos, setRulerPos] = useState<{ x: number; y: number } | null>(null);
  const rulerDragRef = useRef<{ active: boolean; startCX: number; startCY: number; startX: number; startY: number } | null>(null);

  const onRulerHandlePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    rulerDragRef.current = { active: true, startCX: e.clientX, startCY: e.clientY, startX: rulerPos?.x ?? 0.3, startY: rulerPos?.y ?? 0.6 };
  }, [rulerPos]);

  const onRulerHandlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!rulerDragRef.current?.active || !containerRef.current) return;
    const lw = Math.max(0, labelColumnWidth);
    const c = containerRef.current;
    const signalW = Math.max(1, c.clientWidth - lw);
    const signalH = Math.max(1, c.clientHeight - 20); // 20 = TIME_AXIS_H
    const dx = e.clientX - rulerDragRef.current.startCX;
    const dy = e.clientY - rulerDragRef.current.startCY;
    setRulerPos({
      x: Math.max(0, Math.min(1, rulerDragRef.current.startX + dx / signalW)),
      y: Math.max(0, Math.min(1, rulerDragRef.current.startY + dy / signalH)),
    });
  }, [labelColumnWidth]);

  const onRulerHandlePointerUp = useCallback((e: React.PointerEvent) => {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    if (rulerDragRef.current) rulerDragRef.current.active = false;
  }, []);

  // click-to-seek (existing behavior)
  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const lw = Math.max(0, labelColumnWidth);
      if (x < lw) return; // click on label panel — ignore
      const signalFraction = (x - lw) / Math.max(1, rect.width - lw);
      onTimeClick?.(signalFraction * timeWindow);
    },
    [onTimeClick, timeWindow, labelColumnWidth],
  );

  // init scene once
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const w = container.clientWidth;
    const h = container.clientHeight;

    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;";
    container.appendChild(canvas);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 3));
    renderer.setSize(w, h);
    renderer.setClearColor(colors.background);

    const scene = new THREE.Scene();
    const cam = new THREE.OrthographicCamera(0, w, 0, h, 0.1, 10);
    cam.position.z = 5;

    rendererRef.current = renderer;
    sceneRef.current = scene;
    cameraRef.current = cam;

    // overlays
    const art = document.createElement("div");
    art.style.cssText =
      "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:2;overflow:hidden;";
    container.appendChild(art);
    artifactRef.current = art;

    const labels = document.createElement("div");
    labels.style.cssText =
      "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:5;overflow:hidden;";
    container.appendChild(labels);
    labelsRef.current = labels;

    const timeAxis = document.createElement("div");
    timeAxis.style.cssText = [
      "position:absolute",
      "bottom:0",
      "left:0",
      "right:0",
      `height:${TIME_AXIS_H}px`,
      "pointer-events:none",
      "z-index:3",
      "overflow:visible",
    ].join(";");
    container.appendChild(timeAxis);
    timeAxisRef.current = timeAxis;

    const rebuildOnResize = () => {
      const c = containerRef.current;
      const r = rendererRef.current;
      const cam2 = cameraRef.current;
      if (!c || !r || !cam2) return;
      const ww = c.clientWidth;
      const hh = c.clientHeight;
      r.setSize(ww, hh);
      cam2.right = ww;
      cam2.top = 0;
      cam2.bottom = hh;
      cam2.updateProjectionMatrix();
      requestAnimationFrame(() => drawRef.current?.());
    };

    const ro = new ResizeObserver(rebuildOnResize);
    ro.observe(container);
    window.addEventListener("resize", rebuildOnResize);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", rebuildOnResize);
      renderer.dispose();
      container.removeChild(canvas);
      if (artifactRef.current) container.removeChild(artifactRef.current);
      if (labelsRef.current) container.removeChild(labelsRef.current);
      if (timeAxisRef.current) { container.removeChild(timeAxisRef.current); timeAxisRef.current = null; }
      artifactRef.current = null;
      labelsRef.current = null;

      // dispose three objects
      gridRef.current.forEach((l) => {
        scene.remove(l);
        l.geometry.dispose();
        (l.material as THREE.Material).dispose();
      });
      gridRef.current = [];
      cursorLineRef.current && scene.remove(cursorLineRef.current);
      cursorLineRef.current = null;

      lineStateRef.current.forEach(({ line, geom }) => {
        scene.remove(line);
        geom.dispose();
        (line.material as THREE.Material).dispose();
      });
      lineStateRef.current.clear();
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
    };
  }, []);

  // theme background
  useEffect(() => {
    if (rendererRef.current) rendererRef.current.setClearColor(colors.background);
  }, [colors.background]);

  const draw = useCallback(() => {
    const container = containerRef.current;
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const cam = cameraRef.current;
    if (!container || !renderer || !scene || !cam) return;
    if (!signals || signals.length === 0) return;

    const w = container.clientWidth;
    const h = container.clientHeight;

    // Keep camera in sync with actual container size (not just on resize)
    if (cam.right !== w || cam.bottom !== h) {
      cam.right = w;
      cam.bottom = h;
      renderer.setSize(w, h);
      cam.updateProjectionMatrix();
    }

    // channels to render (stable order)
    const visibleIdx = Array.from(visibleChannels).sort((a, b) => a - b);
    const channels = visibleIdx.length ? visibleIdx : signals.map((_, i) => i);
    const nCh = channels.length;
    if (nCh === 0) return;

    // Drop Line2 state for channels no longer present (e.g. Raw → ESF fewer ch)
    // so old traces are not left in the scene overlapping the new layout.
    const keep = new Set(channels);
    for (const [chIdx, state] of [...lineStateRef.current.entries()]) {
      if (!keep.has(chIdx)) {
        scene.remove(state.line);
        state.geom.dispose();
        (state.line.material as THREE.Material).dispose();
        lineStateRef.current.delete(chIdx);
      }
    }

    // clear DOM overlays each draw (cheap; small lists)
    if (labelsRef.current) labelsRef.current.innerHTML = "";
    if (artifactRef.current) artifactRef.current.innerHTML = "";

    const PAD = 6;

    // Label column / signal area geometry
    const labelW = Math.max(0, labelColumnWidth);
    const signalW = Math.max(1, w - labelW);
    const signalH = h - TIME_AXIS_H;

    const laneH = (signalH - PAD * 2) / nCh;
    // Raw/prenorm (µV): use full half-lane so signals can extend to lane boundary
    const laneHalf = Math.max(4, signalUnit === "uV" ? laneH * 0.48 : laneH * 0.4);

    // For raw/prenorm: compute a single global p95 across all channels so relative
    // amplitudes are preserved — a flat channel looks flat, high-amp looks large.
    // This matches how a clinical EEG machine displays at fixed sensitivity.
    let globalP95: number | null = null;
    if (signalUnit === "uV" && signals && signals.length > 0) {
      const allAbs: number[] = [];
      for (const chIdx of channels) {
        const sig = signals[chIdx];
        if (!sig) continue;
        for (let i = 0; i < sig.length; i++) allAbs.push(Math.abs(sig[i]));
      }
      if (allAbs.length > 0) {
        allAbs.sort((a, b) => a - b);
        globalP95 = allAbs[Math.min(allAbs.length - 1, Math.floor(allAbs.length * 0.95))] || 1e-6;
      }
    }

    // ── Overlay helpers ──────────────────────────────────────────────────────────
    // Reduce rgba opacity to `alpha` (handles both spaced and unspaced rgba)
    const faintFill = (css: string, alpha: number) =>
      css.replace(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*[\d.]+\s*\)/,
        (_, r, g, b) => `rgba(${r},${g},${b},${alpha})`);

    const LABEL_ABBREV: Record<string, string> = {
      eye_movement: "Eye", muscle: "Muscle", electrode: "Electrode", electrode_noise: "Noise",
      artifact: "Artifact", normal: "Normal", seizure: "Seizure", spike: "Spike",
      sleep_spindle: "Spindle", k_complex: "K-Cplx", slow_wave: "Slow Wave",
      alpha: "Alpha", beta: "Beta", theta: "Theta", delta: "Delta", noisy_channel: "Noisy",
    };
    const abbrev = (lbl: string) =>
      LABEL_ABBREV[lbl.toLowerCase()] ?? lbl.charAt(0).toUpperCase() + lbl.slice(1).replace(/_/g, " ");

    const makeChip = (text: string, borderColor: string) => {
      const chip = document.createElement("span");
      chip.textContent = text;
      chip.style.cssText = [
        "position:absolute", "top:4px", "left:4px",
        `background:${colors.labelBg}`,
        `border:1px solid ${borderColor}`,
        `color:${colors.text}`,
        "font-size:9px", "font-family:ui-monospace,monospace", "font-weight:700",
        "letter-spacing:0.04em", "text-transform:uppercase",
        "padding:1px 5px", "border-radius:3px",
        "pointer-events:none", "white-space:nowrap", "line-height:14px", "z-index:3",
      ].join(";");
      return chip;
    };

    // ── Artifact overlays ────────────────────────────────────────────────────────
    // Adaptive fill: high coverage → lighter fill so waveforms stay readable.
    const globalArtCoverage = artifactIntervals
      .filter(a => a.channel == null)
      .reduce((acc, a) => acc + Math.max(0, Math.min(a.end_sec, timeWindow) - Math.max(a.start_sec, 0)), 0) / Math.max(timeWindow, 1);
    const artFillAlpha = globalArtCoverage > 0.7 ? 0.06 : globalArtCoverage > 0.4 ? 0.09 : 0.12;

    for (const a of artifactIntervals) {
      const s0 = clamp(a.start_sec, 0, timeWindow);
      const s1 = clamp(a.end_sec, 0, timeWindow);
      if (s1 <= 0 || s0 >= timeWindow || s1 <= s0) continue;

      const x1 = labelW + (s0 / timeWindow) * signalW;
      const x2 = labelW + (s1 / timeWindow) * signalW;
      const bw = Math.max(2, x2 - x1);
      const bg = (a as any).color ?? colors.artifactBgRed;
      const br = (a as any).borderColor ?? colors.artifactBorderRed;
      const lbl = (a as any).label ?? "Artifact";

      const el = document.createElement("div");
      if (a.channel == null) {
        // Global artifact — full signal height band with visible left accent
        el.style.cssText = [
          "position:absolute", `left:${x1}px`, `top:${PAD}px`,
          `width:${bw}px`, `height:${signalH - PAD * 2}px`,
          `border-left:2px solid ${br}`,
          `border-top:1px solid ${faintFill(br, 0.4)}`,
          `background:${faintFill(bg, artFillAlpha)}`,
          "pointer-events:none", "box-sizing:border-box", "overflow:visible",
        ].join(";");
        if (bw >= 20) el.appendChild(makeChip(abbrev(lbl), br));
      } else {
        // Per-channel artifact — render in the correct visual lane
        // channels[] maps visual-lane-index → original-channel-index
        const laneIdx = channels.indexOf(a.channel);
        if (laneIdx < 0) continue; // channel not currently visible
        const yTop = PAD + laneIdx * laneH;
        el.style.cssText = [
          "position:absolute", `left:${x1}px`, `top:${yTop + 1}px`,
          `width:${bw}px`, `height:${Math.max(3, laneH - 2)}px`,
          `border-left:2px solid ${br}`,
          `background:${faintFill(bg, artFillAlpha * 1.4)}`,
          "pointer-events:none", "box-sizing:border-box",
        ].join(";");
      }
      artifactRef.current?.appendChild(el);
    }

    // ── Segment overlays ─────────────────────────────────────────────────────
    // Clinical events (seizures, spikes, sleep events) — full-height bordered box
    for (const seg of segmentIntervals) {
      const s0 = clamp(seg.start_sec, 0, timeWindow);
      const s1 = clamp(seg.end_sec,   0, timeWindow);
      if (s1 <= 0 || s0 >= timeWindow || s1 <= s0) continue;

      const x1 = labelW + (s0 / timeWindow) * signalW;
      const x2 = labelW + (s1 / timeWindow) * signalW;
      const bw = Math.max(3, x2 - x1);

      const bg = seg.color        ?? "rgba(99,102,241,0.10)";
      const br = seg.borderColor  ?? "rgba(99,102,241,0.55)";

      const el = document.createElement("div");
      el.style.cssText = [
        "position:absolute",
        `left:${x1}px`, `top:${PAD}px`,
        `width:${bw}px`, `height:${signalH - PAD * 2}px`,
        `border:1px solid ${faintFill(br, 0.45)}`,
        `border-radius:2px`,
        `background:${faintFill(bg, 0.08)}`,
        "pointer-events:none", "box-sizing:border-box", "overflow:visible",
      ].join(";");
      if (bw >= 16) el.appendChild(makeChip(abbrev(seg.label), br));
      artifactRef.current?.appendChild(el);
    }

    gridRef.current.forEach((l) => {
      scene.remove(l);
      l.geometry.dispose();
      (l.material as THREE.Material).dispose();
    });
    gridRef.current = [];

    const gridMat = new THREE.LineBasicMaterial({ color: colors.grid, transparent: true, opacity: 0.6 });
    const gridStrongMat = new THREE.LineBasicMaterial({ color: colors.gridStrong, transparent: true, opacity: 0.85 });
    const zeroLineMat = new THREE.LineBasicMaterial({ color: (colors as any).zeroLine ?? colors.gridStrong, transparent: true, opacity: 0.45 });

    const interval = timeWindow <= 10 ? 1 : timeWindow <= 30 ? 5 : 10;
    for (let i = 0; i <= timeWindow; i += interval) {
      const x = labelW + (i / timeWindow) * signalW;
      const geom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, 0, 0), new THREE.Vector3(x, signalH, 0)]);
      const line = new THREE.Line(geom, i % (interval * 2) === 0 ? gridStrongMat : gridMat);
      scene.add(line);
      gridRef.current.push(line);
    }
    for (let i = 0; i <= nCh; i++) {
      const y = PAD + i * laneH;
      const geom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(labelW, y, 0), new THREE.Vector3(w, y, 0)]);
      const line = new THREE.Line(geom, gridMat);
      scene.add(line);
      gridRef.current.push(line);
    }
    // Per-channel zero-lines (baseline guide — subtle, helps readers track amplitude)
    for (let i = 0; i < nCh; i++) {
      const midY = PAD + i * laneH + laneH / 2;
      const geom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(labelW, midY, 0), new THREE.Vector3(w, midY, 0)]);
      const line = new THREE.Line(geom, zeroLineMat);
      scene.add(line);
      gridRef.current.push(line);
    }

    // Cursor line — use DynamicDrawUsage so updateCursor can update in-place
    if (cursorLineRef.current) {
      scene.remove(cursorLineRef.current);
      cursorLineRef.current.geometry.dispose();
      (cursorLineRef.current.material as THREE.Material).dispose();
      cursorLineRef.current = null;
    }
    {
      const initX = labelW; // will be corrected by updateCursor immediately after
      const cursorPos = new THREE.Float32BufferAttribute([initX, 0, 0, initX, signalH, 0], 3);
      cursorPos.setUsage(THREE.DynamicDrawUsage);
      const geom = new THREE.BufferGeometry();
      geom.setAttribute("position", cursorPos);
      const mat = new THREE.LineBasicMaterial({ color: parseColorToHex(colors.cursor) });
      const line = new THREE.Line(geom, mat);
      scene.add(line);
      cursorLineRef.current = line;
    }

    // Snapshot dims so updateCursor can work without re-running draw
    dimsRef.current = { w, h, labelW, signalW, signalH };

    // Time axis tick labels
    if (timeAxisRef.current) {
      timeAxisRef.current.innerHTML = "";
      timeAxisRef.current.style.left = `${labelW}px`;
      timeAxisRef.current.style.right = "0";
      timeAxisRef.current.style.borderTop = `1px solid ${theme !== "dark" ? "#d1d5db" : "#2a2a2a"}`;
      timeAxisRef.current.style.background = theme !== "dark" ? "rgba(250,250,250,0.95)" : "rgba(10,10,10,0.95)";

      for (let i = 0; i <= timeWindow; i += interval) {
        const x = (i / timeWindow) * signalW;
        const span = document.createElement("span");
        span.textContent = i === timeWindow ? `${i}s` : String(i);
        span.style.cssText = [
          "position:absolute",
          `left:${x}px`,
          "transform:translateX(-50%)",
          "top:3px",
          "font-size:9px",
          "font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace",
          `color:${colors.textMuted}`,
          "pointer-events:none",
          "user-select:none",
          "white-space:nowrap",
        ].join(";");
        timeAxisRef.current.appendChild(span);
      }
    }

    // markers (treat as window-relative if within [0,timeWindow], else convert absolute -> window-relative by subtracting window start upstream)
    for (const m of markers) {
      const t = m.timestamp_sec;
      if (t < 0 || t > timeWindow) continue;
      const x = labelW + (t / timeWindow) * signalW;
      const mat = new THREE.LineBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.85 });
      const geom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, 0, 0), new THREE.Vector3(x, signalH, 0)]);
      const line = new THREE.Line(geom, mat);
      scene.add(line);
      gridRef.current.push(line);
    }

    // Label panel background (rendered before channel labels)
    if (labelsRef.current && labelW > 0) {
      const panel = document.createElement("div");
      panel.style.cssText = [
        "position:absolute",
        "left:0", "top:0",
        `width:${labelW}px`, "height:100%",
        `background:${colors.labelPanelBg}`,
        `border-right:1px solid ${colors.labelPanelBorder}`,
        "pointer-events:none",
        "z-index:3",
      ].join(";");
      labelsRef.current.appendChild(panel);
    }

    // render channels
    channels.forEach((chIdx, di) => {
      const sig = signals[chIdx];
      if (!sig || sig.length < 2) return;

      // lane: di=0 is TOP
      const laneTop = PAD + di * laneH;
      const laneMid = laneTop + laneH / 2;

      // choose color — light mode: alternating red/blue (clinical Natus style)
      const rawLabel = channelLabels[chIdx] || `Ch${chIdx + 1}`;
      const label = normalizeChanLabel(rawLabel);

      let colorHex: number;
      if (channelColors[chIdx]) {
        colorHex = parseColorToHex(channelColors[chIdx]);
      } else {
        const colorInfo = getChannelColor(label);
        const groupKey = colorInfo.label.toLowerCase() as ChannelGroup;
        const palette = CHANNEL_THEME_COLORS[groupKey];
        if (palette) {
          colorHex = theme !== "dark" ? palette.light : palette.dark;
        } else {
          colorHex = DEFAULT_CHANNEL_PALETTE[di % DEFAULT_CHANNEL_PALETTE.length];
        }
      }

      // display gain: p95-based robust estimate (computed on raw signal pre-filter)
      let p95 = 1e-6;
      {
        const abs = new Array(sig.length);
        for (let i = 0; i < sig.length; i++) abs[i] = Math.abs(sig[i]);
        abs.sort((a, b) => a - b);
        const idx = Math.min(abs.length - 1, Math.floor(abs.length * 0.95));
        p95 = abs[idx] || 1e-6;
      }

      // Channel quality classification (in µV)
      const quality: "flat" | "noisy" | "ok" =
        p95 < 1.0 ? "flat" : p95 > 300 ? "noisy" : "ok";

      // Apply DSP filters: highpass → notch → lowpass
      let filteredSig: number[] = sig;
      if (lfFilter > 0) {
        const hp = biquadHP(lfFilter, sampleRate);
        if (hp) filteredSig = applyBiquad(filteredSig, hp[0], hp[1], hp[2], hp[3], hp[4]);
      }
      if (notchFilter > 0) {
        const nt = biquadNotch(notchFilter, sampleRate);
        if (nt) filteredSig = applyBiquad(filteredSig, nt[0], nt[1], nt[2], nt[3], nt[4]);
      }
      if (hfFilter > 0 && hfFilter < sampleRate / 2) {
        const lp = biquadLP(hfFilter, sampleRate);
        if (lp) filteredSig = applyBiquad(filteredSig, lp[0], lp[1], lp[2], lp[3], lp[4]);
      }

      // Raw/prenorm: global gain so all channels share the same scale — flat channels
      // look flat, high-amplitude channels extend toward lane boundaries, just like
      // a clinical EEG machine at fixed sensitivity.
      // ESF/z-scored: per-channel auto-gain so every trace fills its lane.
      const effectiveP95 = globalP95 !== null ? globalP95 : p95;
      const auto = (laneHalf / Math.max(effectiveP95, 1e-6)) * 0.9;
      const gain = auto * Math.max(1e-6, amplitudeScale);

      const pos = buildPolylinePositions(filteredSig, signalW, laneMid, laneHalf, gain, labelW);

      // create or update line — Line2 renders connected polyline at real pixel width
      const existing = lineStateRef.current.get(chIdx);
      if (existing) {
        existing.pos = pos;
        existing.geom.setPositions(pos);
        (existing.line.material as LineMaterial).color.setHex(colorHex);
        (existing.line.material as LineMaterial).resolution.set(w, h);
      } else {
        const geom = new LineGeometry();
        geom.setPositions(pos);
        const mat = new LineMaterial({
          color: colorHex,
          linewidth: 1.4,
          worldUnits: false,
          resolution: new THREE.Vector2(w, h),
        });
        const line = new Line2(geom, mat);
        line.frustumCulled = false;
        scene.add(line);
        lineStateRef.current.set(chIdx, { line, geom, pos });
      }

      // label — inside the dedicated label panel column
      if (labelsRef.current && labelW > 0) {
        const qualityColor = quality === "flat" ? "#ef4444" : quality === "noisy" ? "#f59e0b" : colors.text;
        const accentHex = `#${colorHex.toString(16).padStart(6, "0")}`;

        const el = document.createElement("div");
        el.style.cssText = [
          "position:absolute", "left:0", `width:${labelW - 1}px`,
          `top:${laneTop}px`, `height:${laneH}px`,
          "display:flex", "flex-direction:column", "align-items:flex-end",
          "justify-content:center",
          "font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace",
          `padding-right:6px`,
          `border-right:2px solid ${accentHex}`,
          "pointer-events:none", "box-sizing:border-box", "z-index:4",
        ].join(";");

        // Channel name row
        const nameRow = document.createElement("div");
        nameRow.style.cssText = [
          "display:flex", "align-items:center", "gap:3px",
          "font-size:10.5px", "font-weight:500", `color:${qualityColor}`,
          "white-space:nowrap", "overflow:hidden",
        ].join(";");
        nameRow.innerHTML = `<span style="display:inline-block;width:4px;height:4px;border-radius:50%;background:${
          quality === "flat" ? "#ef4444" : quality === "noisy" ? "#f59e0b" : accentHex
        };flex-shrink:0;"></span>${label}`;
        el.appendChild(nameRow);

        // µV scale bar (first channel only, or if lane is tall enough)
        if (di === 0 && laneH >= 28) {
          const scaleUv = 100; // target reference amplitude in µV
          const scalePx = Math.min(laneHalf * 0.6, scaleUv * 1e-6 * gain);
          if (scalePx >= 4) {
            const scaleEl = document.createElement("div");
            scaleEl.style.cssText = [
              "display:flex", "align-items:center", "gap:2px",
              "margin-top:2px",
            ].join(";");
            scaleEl.innerHTML = [
              `<span style="display:inline-block;width:1px;height:${Math.round(scalePx)}px;background:${colors.textMuted};flex-shrink:0;"></span>`,
              `<span style="font-size:8px;color:${colors.textMuted};white-space:nowrap;">100µV</span>`,
            ].join("");
            el.appendChild(scaleEl);
          }
        }

        labelsRef.current.appendChild(el);
      }
    });

    renderer.render(scene, cam);
  }, [
    signals,
    channelLabels,
    sampleRate,
    // currentTime intentionally omitted — cursor updated by updateCursor below
    timeWindow,
    amplitudeScale,
    visibleChannels,
    theme,
    markers,
    artifactIntervals,
    segmentIntervals,
    channelColors,
    colors,
    labelColumnWidth,
    hfFilter,
    lfFilter,
    notchFilter,
    uvPerMm,
    signalUnit,
  ]);

  // Keep drawRef in sync so resize observer can call it
  useEffect(() => { drawRef.current = draw; }, [draw]);

  // Fast cursor update — only moves 2 vertices and re-renders; does NOT rebuild scene
  const updateCursor = useCallback(() => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const cam = cameraRef.current;
    if (!renderer || !scene || !cam) return;
    const { labelW, signalW, signalH, h } = dimsRef.current;
    if (!signalW) return;
    const cursorX = labelW + clamp(currentTime / Math.max(timeWindow, 1e-6), 0, 1) * signalW;
    const line = cursorLineRef.current;
    if (line) {
      const pos = line.geometry.attributes.position as THREE.BufferAttribute;
      pos.setXYZ(0, cursorX, 0, 0);
      pos.setXYZ(1, cursorX, signalH || h, 0);
      pos.needsUpdate = true;
    }
    renderer.render(scene, cam);
  }, [currentTime, timeWindow]);

  // Full scene rebuild on data changes (one-shot RAF)
  useEffect(() => {
    let raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [draw]);

  // Cursor-only update on time changes (one-shot RAF)
  useEffect(() => {
    let raf = requestAnimationFrame(updateCursor);
    return () => cancelAnimationFrame(raf);
  }, [updateCursor]);

  // ── L-ruler dimensions ───────────────────────────────────────────────────────
  // Vertical arm = reference µV, horizontal arm = 1 second.
  const PX_PER_MM = 96 / 25.4; // 3.779 px/mm at 96 DPI
  const refUv = uvPerMm <= 15 ? 100 : uvPerMm <= 50 ? 200 : 500;
  const armYPx = Math.max(20, Math.round((refUv / Math.max(uvPerMm, 0.1)) * PX_PER_MM));
  // Horizontal arm = 1 second in pixels (signal area width / timeWindow)
  const containerW = containerRef.current?.clientWidth ?? 800;
  const sigW = Math.max(1, containerW - Math.max(0, labelColumnWidth));
  const armXPx = Math.max(40, Math.round(sigW / timeWindow));

  const isDark = theme === "dark";
  const rulerStroke = isDark ? "rgba(180,185,200,0.75)" : "rgba(80,85,100,0.70)";
  const rulerLabel  = isDark ? "rgba(180,185,200,0.9)"  : "rgba(60,65,80,0.9)";
  const rulerHandle = isDark ? "rgba(200,205,220,0.85)" : "rgba(60,65,80,0.80)";

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative cursor-crosshair"
      style={{ borderRadius: 6, overflow: "hidden", background: isDark ? "#0a0a0a" : "#fafafa" }}
      onMouseDown={onMouseDown}
    >
      {/* ── L-shaped ruler ───────────────────────────────────────────────────────
          The wrapper div spans the full signal area (left=labelColumnWidth, right=0,
          top=0, bottom=TIME_AXIS_H). The anchor point sits at (rx%, ry%) inside it.
          Vertical arm goes UP by armYPx; horizontal arm uses CSS calc for 1 second.
      ──────────────────────────────────────────────────────────────────────────── */}
      {rulerPos != null && (
        <div
          style={{
            position: "absolute",
            left: labelColumnWidth,
            right: 0,
            top: 0,
            bottom: 20,
            pointerEvents: "none",
            zIndex: 15,
            overflow: "hidden",
          }}
        >
          {/* Anchor point — corner of the L, positioned at (rx%, ry%) */}
          <div style={{
            position: "absolute",
            left: `${(rulerPos.x * 100).toFixed(4)}%`,
            top: `${(rulerPos.y * 100).toFixed(4)}%`,
            width: 0,
            height: 0,
            overflow: "visible",
          }}>
            {/* Vertical arm (upward, armYPx tall = refUv µV) */}
            <div style={{ position:"absolute", left:0, top:-armYPx, width:1, height:armYPx, background:rulerStroke }} />
            {/* Horizontal arm (LEFTWARD — mirrored L, armXPx wide = 1 second) */}
            <div style={{ position:"absolute", left:-armXPx, top:-1, width:armXPx, height:1, background:rulerStroke }} />

            {/* Y-arm: tip tick (top) */}
            <div style={{ position:"absolute", left:-3, top:-armYPx, width:7, height:1, background:rulerStroke }} />
            {/* Y-arm: mid tick (refUv/2) */}
            <div style={{ position:"absolute", left:-3, top:-Math.round(armYPx/2), width:5, height:1, background:rulerStroke }} />

            {/* X-arm: tip tick (1s — leftmost end) */}
            <div style={{ position:"absolute", left:-armXPx, top:-4, width:1, height:7, background:rulerStroke }} />
            {/* X-arm: mid tick (0.5s) */}
            <div style={{ position:"absolute", left:-Math.round(armXPx/2), top:-3, width:1, height:5, background:rulerStroke }} />

            {/* Y label: top — refUv (right of vertical arm) */}
            <div style={{ position:"absolute", left:5, top:-armYPx-1, fontSize:9, fontFamily:"ui-monospace,monospace", fontWeight:600, color:rulerLabel, whiteSpace:"nowrap", lineHeight:"11px", userSelect:"none" }}>
              {refUv}µV
            </div>
            {/* Y label: mid — refUv/2 */}
            <div style={{ position:"absolute", left:5, top:-Math.round(armYPx/2)-5, fontSize:8, fontFamily:"ui-monospace,monospace", color:rulerLabel, whiteSpace:"nowrap", lineHeight:"10px", userSelect:"none", opacity:0.7 }}>
              {Math.round(refUv/2)}µV
            </div>

            {/* X label: tip — 1s (right-aligned at left tip) */}
            <div style={{ position:"absolute", left:-armXPx, top:-11, transform:"translateX(-100%)", paddingRight:3, fontSize:9, fontFamily:"ui-monospace,monospace", fontWeight:600, color:rulerLabel, whiteSpace:"nowrap", lineHeight:"11px", userSelect:"none" }}>
              1s
            </div>
            {/* X label: mid — 0.5s (centered over mid tick) */}
            <div style={{ position:"absolute", left:-Math.round(armXPx/2), top:-11, transform:"translateX(-50%)", fontSize:8, fontFamily:"ui-monospace,monospace", color:rulerLabel, whiteSpace:"nowrap", lineHeight:"10px", userSelect:"none", opacity:0.7 }}>
              0.5s
            </div>

            {/* Corner handle — draggable grip */}
            <div
              style={{ position:"absolute", left:-5, top:-5, width:10, height:10, borderRadius:2, background:rulerHandle, cursor:"move", pointerEvents:"auto", zIndex:16 }}
              onPointerDown={onRulerHandlePointerDown}
              onPointerMove={onRulerHandlePointerMove}
              onPointerUp={onRulerHandlePointerUp}
            />
          </div>
        </div>
      )}

      {/* ── Ruler toggle button ───────────────────────────────────────────────── */}
      <button
        title={rulerPos != null ? "Remove ruler" : "Place ruler (drag to position)"}
        onClick={() => setRulerPos(rulerPos != null ? null : { x: 0.3, y: 0.55 })}
        style={{
          position: "absolute",
          top: 6,
          right: 8,
          zIndex: 20,
          background: rulerPos != null ? rulerHandle : (isDark ? "rgba(14,14,18,0.85)" : "rgba(248,248,250,0.90)"),
          border: `1px solid ${isDark ? "rgba(60,60,70,0.8)" : "rgba(180,185,195,0.9)"}`,
          color: rulerLabel,
          borderRadius: 3,
          fontSize: 9,
          fontFamily: "ui-monospace, monospace",
          fontWeight: 700,
          padding: "2px 6px",
          cursor: "pointer",
          lineHeight: "13px",
          letterSpacing: "0.05em",
          pointerEvents: "auto",
        }}
      >
        ⊢ RULER
      </button>
    </div>
  );
}

export const SignalCanvas = memo(SignalCanvasComponent);
