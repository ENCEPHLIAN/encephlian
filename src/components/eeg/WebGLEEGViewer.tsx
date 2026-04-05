import React, { memo, useCallback, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { getChannelColor, ChannelGroup } from "@/lib/eeg/channel-groups";

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

interface HighlightInterval {
  start_sec: number; // window-relative seconds
  end_sec: number;   // window-relative seconds
  label?: string;
  color?: string;    // CSS color for the overlay
}

interface SegmentOverlay {
  start_sec: number; // window-relative seconds
  end_sec: number;   // window-relative seconds
  label: string;
  color: string;     // CSS background color
  borderColor: string; // CSS border color
  isFocused?: boolean;
  channel?: number;  // specific channel index, or undefined for all
}

export interface WebGLEEGViewerProps {
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
  highlightInterval?: HighlightInterval | null; // focused segment highlight (deprecated, use segmentOverlays)
  segmentOverlays?: SegmentOverlay[]; // colored segment overlays
  channelColors?: string[];
  showArtifactsAsRed?: boolean;
  suppressArtifacts?: boolean; // display-only (dims segments)
  onTimeClick?: (time: number) => void;
  onSelectionChange?: (selection: Selection | null) => void;
}

const THEME_COLORS = {
  dark: {
    background: 0x0a0a0a,
    grid: 0x1a1a1a,
    gridStrong: 0x262626,
    text: "#e5e5e5",
    textMuted: "#737373",
    cursor: "#e5e5e5",
    artifactBgRed: "rgba(239, 68, 68, 0.18)",
    artifactBorderRed: "rgba(239, 68, 68, 0.55)",
    highlightBg: "rgba(59, 130, 246, 0.15)",
    highlightBorder: "rgba(59, 130, 246, 0.6)",
  },
  light: {
    background: 0xfafafa,
    grid: 0xf0f0f0,
    gridStrong: 0xe0e0e0,
    text: "#171717",
    textMuted: "#525252",
    cursor: "#171717",
    artifactBgRed: "rgba(239, 68, 68, 0.18)",
    artifactBorderRed: "rgba(239, 68, 68, 0.55)",
    highlightBg: "rgba(59, 130, 246, 0.15)",
    highlightBorder: "rgba(59, 130, 246, 0.6)",
  },
};

const DEFAULT_CHANNEL_PALETTE = [
  0x60a5fa, 0x4ade80, 0xfbbf24, 0xa78bfa, 0xf87171, 0x34d399, 0xfb923c, 0x818cf8, 0xf472b6, 0x22d3d8, 0xa3e635,
  0xe879f9, 0xfcd34d, 0x6ee7b7, 0x93c5fd, 0xc084fc, 0xfdba74, 0x86efac, 0xfca5a5, 0x67e8f9,
];

const CHANNEL_THEME_COLORS: Record<ChannelGroup, { dark: number; light: number }> = {
  frontal: { dark: 0x60a5fa, light: 0x2563eb },
  central: { dark: 0x4ade80, light: 0x16a34a },
  temporal: { dark: 0xfbbf24, light: 0xd97706 },
  occipital: { dark: 0xa78bfa, light: 0x7c3aed },
  other: { dark: 0x94a3b8, light: 0x64748b },
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

/**
 * Min/max envelope per pixel column (fast + avoids aliasing).
 * Returns positions array sized (2*pxCount) points: (x,y) pairs per vertex.
 */
function buildEnvelopePositions(
  sig: number[],
  widthPx: number,
  heightPx: number,
  laneMidY: number,
  laneHalfHeight: number,
  gain: number,
  suppressMask: Uint8Array | null,
): Float32Array {
  const pxCount = Math.max(2, Math.min(widthPx, 2400));
  const out = new Float32Array(pxCount * 2 * 3); // two vertices per column, xyz
  const n = sig.length;
  const spp = n / pxCount;

  let o = 0;
  for (let px = 0; px < pxCount; px++) {
    const s0 = Math.floor(px * spp);
    const s1 = Math.min(n, Math.ceil((px + 1) * spp));
    let minV = Infinity,
      maxV = -Infinity;

    for (let i = s0; i < s1; i++) {
      const raw = sig[i];
      const v = raw; // RAW ONLY (no filter, no baseline)
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }

    if (minV === Infinity) {
      minV = 0;
      maxV = 0;
    }

    // apply suppress (display-only): if any sample in this column is suppressed, dim amplitude
    let sup = 1.0;
    if (suppressMask) {
      for (let i = s0; i < s1; i++) {
        if (suppressMask[i] === 1) {
          sup = 0.25;
          break;
        }
      }
    }

    const x = (px / (pxCount - 1)) * widthPx;

    const yMax = laneMidY - clamp(maxV * gain * sup, -laneHalfHeight, laneHalfHeight);
    const yMin = laneMidY - clamp(minV * gain * sup, -laneHalfHeight, laneHalfHeight);

    // vertical segment: (x, yMax) then (x, yMin)
    out[o++] = x;
    out[o++] = yMax;
    out[o++] = 0;
    out[o++] = x;
    out[o++] = yMin;
    out[o++] = 0;
  }
  return out;
}

function WebGLEEGViewerComponent(props: WebGLEEGViewerProps) {
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
    highlightInterval = null,
    segmentOverlays = [],
    channelColors = [],
    showArtifactsAsRed = true,
    suppressArtifacts = false,
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

  // per-channel drawable state
  const lineStateRef = useRef<Map<number, { line: THREE.Line; geom: THREE.BufferGeometry; pos: Float32Array }>>(
    new Map(),
  );

  // simple selection not needed for MVP now; we keep click-to-seek
  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const t = (x / rect.width) * timeWindow;
      onTimeClick?.(t);
    },
    [onTimeClick, timeWindow],
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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
    };

    const ro = new ResizeObserver(rebuildOnResize);
    ro.observe(container);

    return () => {
      ro.disconnect();
      renderer.dispose();
      container.removeChild(canvas);
      if (artifactRef.current) container.removeChild(artifactRef.current);
      if (labelsRef.current) container.removeChild(labelsRef.current);
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

    // channels to render (stable order)
    const visibleIdx = Array.from(visibleChannels).sort((a, b) => a - b);
    const channels = visibleIdx.length ? visibleIdx : signals.map((_, i) => i);
    const nCh = channels.length;
    if (nCh === 0) return;

    // clear DOM overlays each draw (cheap; small lists)
    if (labelsRef.current) labelsRef.current.innerHTML = "";
    if (artifactRef.current) artifactRef.current.innerHTML = "";

    const PAD = 6;
    const laneH = (h - PAD * 2) / nCh;
    const laneHalf = Math.max(4, laneH * 0.4);

    // build a suppress mask from artifactIntervals if requested
    // mask is per-sample per-channel, but we keep it cheap: only build if suppressArtifacts is on and artifacts exist
    const buildMaskForChannel = (chIdx: number): Uint8Array | null => {
      if (!suppressArtifacts || artifactIntervals.length === 0) return null;
      const n = signals[chIdx]?.length ?? 0;
      if (!n) return null;
      const mask = new Uint8Array(n);
      for (const a of artifactIntervals) {
        if (a.channel != null && a.channel !== chIdx) continue;
        const s0 = Math.floor(clamp(a.start_sec, 0, timeWindow) * sampleRate);
        const s1 = Math.floor(clamp(a.end_sec, 0, timeWindow) * sampleRate);
        for (let i = Math.max(0, s0); i < Math.min(n, s1); i++) mask[i] = 1;
      }
      return mask;
    };

    // artifact overlays (red)
    for (const a of artifactIntervals) {
      const s0 = clamp(a.start_sec, 0, timeWindow);
      const s1 = clamp(a.end_sec, 0, timeWindow);
      if (s1 <= 0 || s0 >= timeWindow) continue;

      const x1 = (s0 / timeWindow) * w;
      const x2 = (s1 / timeWindow) * w;
      const bg = (a as any).color ?? (showArtifactsAsRed ? colors.artifactBgRed : colors.artifactBgRed);
      const br = (a as any).borderColor ?? (showArtifactsAsRed ? colors.artifactBorderRed : colors.artifactBorderRed);

      const affected = a.channel != null ? [a.channel] : channels;
      for (const chIdx of affected) {
        const di = channels.indexOf(chIdx);
        if (di < 0) continue;
        const top = PAD + di * laneH;

        const el = document.createElement("div");
        el.style.cssText = [
          "position:absolute",
          `left:${x1}px`,
          `top:${top}px`,
          `width:${Math.max(1, x2 - x1)}px`,
          `height:${laneH}px`,
          `background:${bg}`,
          `border-left:1px solid ${br}`,
          `border-right:1px solid ${br}`,
          "pointer-events:none",
          "box-sizing:border-box",
        ].join(";");
        if ((a as any).label) el.title = (a as any).label;
        artifactRef.current?.appendChild(el);
      }
    }

    // Segment overlays (colored by label type) - thin border box on specific channel
    for (const seg of segmentOverlays) {
      const s0 = clamp(seg.start_sec, 0, timeWindow);
      const s1 = clamp(seg.end_sec, 0, timeWindow);
      if (s1 <= 0 || s0 >= timeWindow || s1 <= s0) continue;
      
      const x1 = (s0 / timeWindow) * w;
      const x2 = (s1 / timeWindow) * w;
      
      // If segment has a specific channel, render only on that channel lane
      if (seg.channel != null) {
        const di = channels.indexOf(seg.channel);
        if (di < 0) continue; // channel not visible
        
        const top = PAD + di * laneH;
        const el = document.createElement("div");
        el.style.cssText = [
          "position:absolute",
          `left:${x1}px`,
          `top:${top}px`,
          `width:${Math.max(2, x2 - x1)}px`,
          `height:${laneH}px`,
          "background:transparent",
          `border:2px solid ${seg.borderColor}`,
          "border-radius:3px",
          "pointer-events:none",
          "box-sizing:border-box",
          seg.isFocused ? "z-index:10;box-shadow:0 0 8px " + seg.borderColor : "z-index:1",
        ].join(";");
        artifactRef.current?.appendChild(el);
      } else {
        // No specific channel - render thin vertical lines at segment boundaries
        for (const xPos of [x1, x2]) {
          const el = document.createElement("div");
          el.style.cssText = [
            "position:absolute",
            `left:${xPos - 1}px`,
            `top:0`,
            `width:2px`,
            `height:100%`,
            `background:${seg.borderColor}`,
            "pointer-events:none",
            seg.isFocused ? "z-index:10" : "z-index:1",
          ].join(";");
          artifactRef.current?.appendChild(el);
        }
      }
    }

    // Legacy focused segment highlight overlay (blue) - for backwards compatibility
    if (highlightInterval && segmentOverlays.length === 0) {
      const s0 = clamp(highlightInterval.start_sec, 0, timeWindow);
      const s1 = clamp(highlightInterval.end_sec, 0, timeWindow);
      if (s1 > 0 && s0 < timeWindow && s1 > s0) {
        const x1 = (s0 / timeWindow) * w;
        const x2 = (s1 / timeWindow) * w;
        
        const el = document.createElement("div");
        el.style.cssText = [
          "position:absolute",
          `left:${x1}px`,
          `top:0`,
          `width:${Math.max(2, x2 - x1)}px`,
          `height:100%`,
          `background:${colors.highlightBg}`,
          `border-left:2px solid ${colors.highlightBorder}`,
          `border-right:2px solid ${colors.highlightBorder}`,
          "pointer-events:none",
          "box-sizing:border-box",
        ].join(";");
        artifactRef.current?.appendChild(el);
      }
    }
    gridRef.current.forEach((l) => {
      scene.remove(l);
      l.geometry.dispose();
      (l.material as THREE.Material).dispose();
    });
    gridRef.current = [];

    const gridMat = new THREE.LineBasicMaterial({ color: colors.grid, transparent: true, opacity: 0.55 });
    const gridStrongMat = new THREE.LineBasicMaterial({ color: colors.gridStrong, transparent: true, opacity: 0.8 });

    const interval = timeWindow <= 10 ? 1 : timeWindow <= 30 ? 5 : 10;
    for (let i = 0; i <= timeWindow; i += interval) {
      const x = (i / timeWindow) * w;
      const geom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, 0, 0), new THREE.Vector3(x, h, 0)]);
      const line = new THREE.Line(geom, i % (interval * 2) === 0 ? gridStrongMat : gridMat);
      scene.add(line);
      gridRef.current.push(line);
    }
    for (let i = 0; i <= nCh; i++) {
      const y = PAD + i * laneH;
      const geom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, y, 0), new THREE.Vector3(w, y, 0)]);
      const line = new THREE.Line(geom, gridMat);
      scene.add(line);
      gridRef.current.push(line);
    }

    // cursor line (local)
    const cursorX = (clamp(currentTime, 0, timeWindow) / timeWindow) * w;
    if (cursorLineRef.current) {
      scene.remove(cursorLineRef.current);
      cursorLineRef.current.geometry.dispose();
      (cursorLineRef.current.material as THREE.Material).dispose();
      cursorLineRef.current = null;
    }
    {
      const mat = new THREE.LineBasicMaterial({ color: parseColorToHex(colors.cursor) });
      const geom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(cursorX, 0, 0),
        new THREE.Vector3(cursorX, h, 0),
      ]);
      const line = new THREE.Line(geom, mat);
      scene.add(line);
      cursorLineRef.current = line;
    }

    // markers (treat as window-relative if within [0,timeWindow], else convert absolute -> window-relative by subtracting window start upstream)
    for (const m of markers) {
      const t = m.timestamp_sec;
      if (t < 0 || t > timeWindow) continue;
      const x = (t / timeWindow) * w;
      const mat = new THREE.LineBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.85 });
      const geom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, 0, 0), new THREE.Vector3(x, h, 0)]);
      const line = new THREE.Line(geom, mat);
      scene.add(line);
      gridRef.current.push(line);
    }

    // render channels
    channels.forEach((chIdx, di) => {
      const sig = signals[chIdx];
      if (!sig || sig.length < 2) return;

      // lane: di=0 is TOP
      const laneTop = PAD + di * laneH;
      const laneMid = laneTop + laneH / 2;

      // choose color
      const rawLabel = channelLabels[chIdx] || `Ch${chIdx + 1}`;
      const label = normalizeChanLabel(rawLabel);

      let colorHex: number;
      if (channelColors[chIdx]) {
        colorHex = parseColorToHex(channelColors[chIdx]);
      } else {
        const colorInfo = getChannelColor(label);
        const groupKey = colorInfo.label.toLowerCase() as ChannelGroup;
        colorHex =
          CHANNEL_THEME_COLORS[groupKey]?.[theme === "dark" ? "dark" : "light"] ??
          DEFAULT_CHANNEL_PALETTE[di % DEFAULT_CHANNEL_PALETTE.length];
      }

      // display gain: keep it boring and deterministic
      // map typical EEG microvolt ranges by using a robust per-window scale estimate WITHOUT filtering
      // p95 of |sig|
      let p95 = 1e-6;
      {
        const abs = new Array(sig.length);
        for (let i = 0; i < sig.length; i++) abs[i] = Math.abs(sig[i]);
        abs.sort((a, b) => a - b);
        const idx = Math.min(abs.length - 1, Math.floor(abs.length * 0.95));
        p95 = abs[idx] || 1e-6;
      }
      const auto = (laneHalf / Math.max(p95, 1e-6)) * 0.9;
      const gain = auto * Math.max(1e-6, amplitudeScale);

      const mask = buildMaskForChannel(chIdx);
      const pos = buildEnvelopePositions(sig, w, h, laneMid, laneHalf, gain, mask);

      // create or update line
      const existing = lineStateRef.current.get(chIdx);
      if (existing) {
        existing.pos = pos;
        existing.geom.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        existing.geom.computeBoundingSphere();
      } else {
        const geom = new THREE.BufferGeometry();
        geom.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        const mat = new THREE.LineBasicMaterial({ color: colorHex, transparent: true, opacity: 0.95 });
        const line = new THREE.LineSegments(geom, mat);
        scene.add(line);
        lineStateRef.current.set(chIdx, { line, geom, pos });
      }

      // label
      if (labelsRef.current) {
        const el = document.createElement("div");
        el.textContent = label;
        el.style.cssText = [
          "position:absolute",
          `left:8px`,
          `top:${laneTop + 2}px`,
          "font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          "font-size:10px",
          "font-weight:600",
          `color:${colors.text}`,
          `background:${theme === "dark" ? "rgba(10,10,10,0.75)" : "rgba(250,250,250,0.85)"}`,
          "padding:2px 6px",
          "border-radius:3px",
          `border-left:3px solid #${colorHex.toString(16).padStart(6, "0")}`,
          "pointer-events:none",
        ].join(";");
        labelsRef.current.appendChild(el);
      }
    });

    renderer.render(scene, cam);
  }, [
    signals,
    channelLabels,
    sampleRate,
    currentTime,
    timeWindow,
    amplitudeScale,
    visibleChannels,
    theme,
    markers,
    artifactIntervals,
    highlightInterval,
    segmentOverlays,
    channelColors,
    showArtifactsAsRed,
    suppressArtifacts,
    colors,
  ]);

  // draw on raf to avoid thrash
  useEffect(() => {
    let raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [draw]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative cursor-crosshair"
      style={{ borderRadius: 6, overflow: "hidden", background: theme === "dark" ? "#0a0a0a" : "#fafafa" }}
      onMouseDown={onMouseDown}
    />
  );
}

export const WebGLEEGViewer = memo(WebGLEEGViewerComponent);
