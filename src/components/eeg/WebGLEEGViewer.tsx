import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { getChannelColor, ChannelGroup } from "@/lib/eeg/channel-groups";

/**
 * CONTRACT (MVP LOCK):
 * - `signals` is ALREADY a windowed chunk for the CURRENT VIEW WINDOW.
 * - WebGLEEGViewer MUST NOT slice signals again using currentTime.
 * - X axis is 0..timeWindow within this buffer, not absolute file time.
 *
 * In other words:
 *   signals[ch][i] corresponds to time = currentTime + i/sampleRate
 * but this component renders the local window [0..timeWindow] only.
 */

interface Marker {
  id?: string;
  timestamp_sec: number; // absolute timestamp in file seconds OR window-relative if you choose
  marker_type: string;
  label?: string;
  // optional: if already window-relative, set marker_type = "window"
}

interface ArtifactInterval {
  start_sec: number; // window-relative seconds (0..timeWindow)
  end_sec: number; // window-relative seconds
  label?: string;
  channel?: number; // if omitted => all channels
}

interface Selection {
  startTime: number; // absolute time (file sec)
  endTime: number; // absolute time (file sec)
}

export interface WebGLEEGViewerProps {
  signals: number[][] | null;
  channelLabels: string[];
  sampleRate: number;
  currentTime: number; // absolute file time (used for click/selection -> absolute mapping)
  timeWindow: number;
  amplitudeScale: number;
  visibleChannels: Set<number>;
  theme: string;

  markers?: Marker[]; // assumed absolute timestamps unless marker_type === "window"
  artifactIntervals?: ArtifactInterval[]; // window-relative
  channelColors?: string[]; // optional hex strings

  showArtifactsAsRed?: boolean;

  onTimeClick?: (timeAbsSec: number) => void;
  onSelectionChange?: (selection: Selection | null) => void;
}

const THEME_COLORS = {
  dark: {
    background: 0x0a0a0a,
    grid: 0x1a1a1a,
    gridStrong: 0x262626,
    text: "#e5e5e5",
    textMuted: "#737373",
    selection: "rgba(59, 130, 246, 0.18)",
    selectionBorder: "rgba(59, 130, 246, 0.55)",
    artifactBg: "rgba(251, 191, 36, 0.10)",
    artifactBgRed: "rgba(239, 68, 68, 0.18)",
    artifactBorder: "rgba(251, 191, 36, 0.35)",
    artifactBorderRed: "rgba(239, 68, 68, 0.50)",
  },
  light: {
    background: 0xfafafa,
    grid: 0xf0f0f0,
    gridStrong: 0xe0e0e0,
    text: "#171717",
    textMuted: "#525252",
    selection: "rgba(59, 130, 246, 0.12)",
    selectionBorder: "rgba(59, 130, 246, 0.45)",
    artifactBg: "rgba(251, 191, 36, 0.12)",
    artifactBgRed: "rgba(239, 68, 68, 0.20)",
    artifactBorder: "rgba(251, 191, 36, 0.45)",
    artifactBorderRed: "rgba(239, 68, 68, 0.60)",
  },
} as const;

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
  if (!color) return 0x9ca3af;
  if (color.startsWith("#")) return parseInt(color.slice(1), 16);
  return 0x9ca3af;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * For each pixel column, compute min/max of samples to avoid aliasing.
 * Returns a Float32Array of XYZ positions representing a polyline-like envelope.
 * Output length = 2*pxCount points.
 */
function buildEnvelopePositions(
  samples: number[],
  widthPx: number,
  baselineY: number,
  laneHalfHeight: number,
  gain: number,
): Float32Array {
  const pxCount = Math.max(64, Math.min(widthPx, 2000));
  const n = samples.length;
  const spp = n / pxCount;

  const out = new Float32Array(pxCount * 2 * 3);
  let w = 0;

  for (let px = 0; px < pxCount; px++) {
    const s0 = Math.floor(px * spp);
    const s1 = Math.min(n, Math.ceil((px + 1) * spp));

    let mn = Infinity;
    let mx = -Infinity;
    for (let i = s0; i < s1; i++) {
      const v = samples[i];
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    if (!Number.isFinite(mn) || !Number.isFinite(mx)) {
      mn = 0;
      mx = 0;
    }

    // Scale and clamp to lane
    const yMin = baselineY - clamp(mn * gain, -laneHalfHeight, laneHalfHeight);
    const yMax = baselineY - clamp(mx * gain, -laneHalfHeight, laneHalfHeight);
    const x = (px / (pxCount - 1)) * widthPx;

    // Two vertices per pixel (min/max segment)
    out[w++] = x;
    out[w++] = yMax;
    out[w++] = 0;
    out[w++] = x;
    out[w++] = yMin;
    out[w++] = 0;
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
    channelColors = [],
    showArtifactsAsRed = true,
    onTimeClick,
    onSelectionChange,
  } = props;

  const colors = useMemo(() => (theme === "light" ? THEME_COLORS.light : THEME_COLORS.dark), [theme]);

  const containerRef = useRef<HTMLDivElement>(null);

  // Three.js refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);

  // Grid objects
  const gridGroupRef = useRef<THREE.Group | null>(null);

  // Lines per channel (reused, not recreated per frame)
  const lineGroupRef = useRef<THREE.Group | null>(null);
  const channelLineRef = useRef<Map<number, THREE.Line>>(new Map());
  const channelGeomRef = useRef<Map<number, THREE.BufferGeometry>>(new Map());

  // HTML overlays
  const labelsRef = useRef<HTMLDivElement | null>(null);
  const artifactsRef = useRef<HTMLDivElement | null>(null);
  const selectionRef = useRef<HTMLDivElement | null>(null);

  // Interaction state
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; tAbs: number } | null>(null);
  const selectionAbsRef = useRef<Selection | null>(null);

  // Render scheduling
  const rafRef = useRef<number | null>(null);
  const needsRenderRef = useRef<boolean>(false);

  const requestRender = useCallback(() => {
    needsRenderRef.current = true;
    if (rafRef.current != null) return;

    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      if (!needsRenderRef.current) return;
      needsRenderRef.current = false;

      const r = rendererRef.current;
      const s = sceneRef.current;
      const c = cameraRef.current;
      if (!r || !s || !c) return;
      r.render(s, c);
    });
  }, []);

  // Init scene once
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Canvas
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute; inset:0; width:100%; height:100%;";
    container.appendChild(canvas);
    canvasRef.current = canvas;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    rendererRef.current = renderer;

    // Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Camera
    const w = container.clientWidth;
    const h = container.clientHeight;
    const camera = new THREE.OrthographicCamera(0, w, h, 0, -100, 100);
    camera.position.z = 10;
    cameraRef.current = camera;

    // Groups
    const gridGroup = new THREE.Group();
    gridGroupRef.current = gridGroup;
    scene.add(gridGroup);

    const lineGroup = new THREE.Group();
    lineGroupRef.current = lineGroup;
    scene.add(lineGroup);

    // Overlays: artifacts
    const artifactsDiv = document.createElement("div");
    artifactsDiv.style.cssText = `
      position:absolute; inset:0;
      pointer-events:none;
      z-index:2;
      overflow:hidden;
    `;
    container.appendChild(artifactsDiv);
    artifactsRef.current = artifactsDiv;

    // Overlays: labels and marker labels
    const labelsDiv = document.createElement("div");
    labelsDiv.style.cssText = `
      position:absolute; inset:0;
      pointer-events:none;
      z-index:10;
      overflow:hidden;
    `;
    container.appendChild(labelsDiv);
    labelsRef.current = labelsDiv;

    // Selection overlay
    const selDiv = document.createElement("div");
    selDiv.style.cssText = `
      position:absolute; top:0; height:100%;
      pointer-events:none;
      background:${colors.selection};
      border-left:2px solid ${colors.selectionBorder};
      border-right:2px solid ${colors.selectionBorder};
      display:none;
      z-index:5;
    `;
    container.appendChild(selDiv);
    selectionRef.current = selDiv;

    // Initial sizing
    const resize = () => {
      const el = containerRef.current;
      const r = rendererRef.current;
      const c = cameraRef.current;
      if (!el || !r || !c) return;

      const W = el.clientWidth;
      const H = el.clientHeight;

      r.setSize(W, H, false);
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      r.setClearColor(colors.background, 1);

      c.right = W;
      c.top = H;
      c.updateProjectionMatrix();

      requestRender();
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    return () => {
      ro.disconnect();

      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);

      // Cleanup three
      channelLineRef.current.forEach((line) => {
        const geom = line.geometry as THREE.BufferGeometry;
        geom.dispose();
        (line.material as THREE.Material).dispose();
      });
      channelLineRef.current.clear();
      channelGeomRef.current.clear();

      renderer.dispose();

      // Remove DOM
      if (canvasRef.current && container.contains(canvasRef.current)) container.removeChild(canvasRef.current);
      if (artifactsRef.current && container.contains(artifactsRef.current)) container.removeChild(artifactsRef.current);
      if (labelsRef.current && container.contains(labelsRef.current)) container.removeChild(labelsRef.current);
      if (selectionRef.current && container.contains(selectionRef.current)) container.removeChild(selectionRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update theme colors
  useEffect(() => {
    const r = rendererRef.current;
    if (!r) return;
    r.setClearColor(colors.background, 1);
    if (selectionRef.current) {
      selectionRef.current.style.background = colors.selection;
      selectionRef.current.style.borderLeftColor = colors.selectionBorder;
      selectionRef.current.style.borderRightColor = colors.selectionBorder;
    }
    requestRender();
  }, [colors, requestRender]);

  // Mouse interactions
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;

      const tAbs = currentTime + (x / rect.width) * timeWindow;

      setIsDragging(true);
      dragStartRef.current = { x, tAbs };
      selectionAbsRef.current = null;

      if (selectionRef.current) selectionRef.current.style.display = "none";
    },
    [currentTime, timeWindow],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;
      const el = containerRef.current;
      const sel = selectionRef.current;
      const start = dragStartRef.current;
      if (!el || !sel || !start) return;

      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;

      const left = Math.min(start.x, x);
      const width = Math.abs(x - start.x);

      if (width < 6) {
        sel.style.display = "none";
        selectionAbsRef.current = null;
        return;
      }

      sel.style.display = "block";
      sel.style.left = `${left}px`;
      sel.style.width = `${width}px`;

      const tAbs = currentTime + (x / rect.width) * timeWindow;
      selectionAbsRef.current = {
        startTime: Math.min(start.tAbs, tAbs),
        endTime: Math.max(start.tAbs, tAbs),
      };
    },
    [isDragging, currentTime, timeWindow],
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      const el = containerRef.current;
      const start = dragStartRef.current;
      if (!el || !start) {
        setIsDragging(false);
        dragStartRef.current = null;
        return;
      }

      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const dist = Math.abs(x - start.x);

      if (dist < 6) {
        const tAbs = currentTime + (x / rect.width) * timeWindow;
        onTimeClick?.(tAbs);
        onSelectionChange?.(null);
      } else {
        onSelectionChange?.(selectionAbsRef.current);
      }

      setIsDragging(false);
      dragStartRef.current = null;
    },
    [currentTime, timeWindow, onTimeClick, onSelectionChange],
  );

  const handleMouseLeave = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);
    dragStartRef.current = null;
  }, [isDragging]);

  // Determine which channels to render
  const channelsToRender = useMemo(() => {
    if (!signals || signals.length === 0) return [];
    const v = Array.from(visibleChannels);
    if (v.length > 0) return v.sort((a, b) => a - b);
    return signals.map((_, i) => i);
  }, [signals, visibleChannels]);

  // Draw / update grid (cheap)
  const rebuildGrid = useCallback(() => {
    const el = containerRef.current;
    const gridGroup = gridGroupRef.current;
    if (!el || !gridGroup) return;

    const W = el.clientWidth;
    const H = el.clientHeight;

    // Clear old grid objects
    while (gridGroup.children.length) {
      const obj = gridGroup.children.pop();
      if (!obj) break;
      const line = obj as THREE.Line;
      (line.geometry as THREE.BufferGeometry).dispose();
      (line.material as THREE.Material).dispose();
    }

    const minorMat = new THREE.LineBasicMaterial({ color: colors.grid, transparent: true, opacity: 0.55 });
    const majorMat = new THREE.LineBasicMaterial({ color: colors.gridStrong, transparent: true, opacity: 0.75 });

    // Vertical grid lines: 1s minor, 5s major (bounded)
    const maxLines = 240;
    const interval = timeWindow <= 10 ? 1 : timeWindow <= 30 ? 2 : 5;
    const majorEvery = interval * 5;

    for (let t = 0; t <= timeWindow; t += interval) {
      if (gridGroup.children.length > maxLines) break;
      const x = (t / timeWindow) * W;
      const geom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, 0, 0), new THREE.Vector3(x, H, 0)]);
      const mat = t % majorEvery === 0 ? majorMat : minorMat;
      gridGroup.add(new THREE.Line(geom, mat));
    }

    // Horizontal lane separators
    const n = Math.max(1, channelsToRender.length);
    const pad = 4;
    const laneH = (H - (n + 1) * pad) / n;

    for (let i = 0; i <= n; i++) {
      const y = pad + i * (laneH + pad);
      const geom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, y, 0), new THREE.Vector3(W, y, 0)]);
      const mat = minorMat;
      gridGroup.add(new THREE.Line(geom, mat));
    }
  }, [channelsToRender.length, colors.grid, colors.gridStrong, timeWindow]);

  // Update artifacts overlay (HTML) — window-relative
  const rebuildArtifactsOverlay = useCallback(() => {
    const el = containerRef.current;
    const root = artifactsRef.current;
    if (!el || !root) return;

    root.innerHTML = "";

    if (!artifactIntervals || artifactIntervals.length === 0) return;

    const W = el.clientWidth;
    const H = el.clientHeight;
    const n = Math.max(1, channelsToRender.length);
    const pad = 4;
    const laneH = (H - (n + 1) * pad) / n;

    const bg = showArtifactsAsRed ? colors.artifactBgRed : colors.artifactBg;
    const bd = showArtifactsAsRed ? colors.artifactBorderRed : colors.artifactBorder;

    for (const a of artifactIntervals) {
      if (a.end_sec < 0 || a.start_sec > timeWindow) continue;

      const s = clamp(a.start_sec, 0, timeWindow);
      const e = clamp(a.end_sec, 0, timeWindow);
      const x1 = (s / timeWindow) * W;
      const x2 = (e / timeWindow) * W;

      const affected = a.channel != null ? [a.channel] : channelsToRender;

      for (const chIdx of affected) {
        const laneIdx = channelsToRender.indexOf(chIdx);
        if (laneIdx < 0) continue;

        const top = pad + laneIdx * (laneH + pad);

        const div = document.createElement("div");
        div.style.cssText = `
          position:absolute;
          left:${x1}px;
          top:${top}px;
          width:${Math.max(2, x2 - x1)}px;
          height:${laneH}px;
          background:${bg};
          border-left:1px solid ${bd};
          border-right:1px solid ${bd};
          pointer-events:none;
          box-sizing:border-box;
        `;
        root.appendChild(div);
      }
    }
  }, [artifactIntervals, channelsToRender, colors, showArtifactsAsRed, timeWindow]);

  // Update labels + marker labels (HTML) — cheap and deterministic
  const rebuildLabels = useCallback(() => {
    const el = containerRef.current;
    const root = labelsRef.current;
    if (!el || !root) return;

    root.innerHTML = "";

    const W = el.clientWidth;
    const H = el.clientHeight;
    const n = Math.max(1, channelsToRender.length);
    const pad = 4;
    const laneH = (H - (n + 1) * pad) / n;

    // Channel labels
    for (let i = 0; i < channelsToRender.length; i++) {
      const chIdx = channelsToRender[i];
      const label = channelLabels[chIdx] ?? `Ch${chIdx + 1}`;

      let colorHex: number;
      if (channelColors[chIdx]) {
        colorHex = parseColorToHex(channelColors[chIdx]);
      } else {
        const c = getChannelColor(label);
        const group = c.label.toLowerCase() as ChannelGroup;
        colorHex =
          CHANNEL_THEME_COLORS[group]?.[theme === "light" ? "light" : "dark"] ??
          DEFAULT_CHANNEL_PALETTE[chIdx % DEFAULT_CHANNEL_PALETTE.length];
      }
      const colorStr = `#${colorHex.toString(16).padStart(6, "0")}`;

      const top = pad + i * (laneH + pad);

      const div = document.createElement("div");
      div.style.cssText = `
        position:absolute;
        left:8px;
        top:${top + 2}px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size:10px;
        font-weight:600;
        color:${colors.text};
        background:${theme === "light" ? "rgba(250,250,250,0.85)" : "rgba(10,10,10,0.85)"};
        padding:2px 6px;
        border-radius:4px;
        border-left:3px solid ${colorStr};
        pointer-events:none;
        white-space:nowrap;
      `;
      div.textContent = label;
      root.appendChild(div);
    }

    // Time labels (bottom)
    const interval = timeWindow <= 10 ? 1 : timeWindow <= 30 ? 5 : 10;
    for (let t = 0; t <= timeWindow; t += interval) {
      const x = (t / timeWindow) * W;
      const abs = currentTime + t;
      const mm = Math.floor(abs / 60);
      const ss = Math.floor(abs % 60);

      const div = document.createElement("div");
      div.style.cssText = `
        position:absolute;
        left:${x + 2}px;
        bottom:4px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size:9px;
        color:${colors.textMuted};
        background:${theme === "light" ? "rgba(250,250,250,0.75)" : "rgba(10,10,10,0.75)"};
        padding:1px 3px;
        border-radius:3px;
        pointer-events:none;
      `;
      div.textContent = `${mm}:${ss.toString().padStart(2, "0")}`;
      root.appendChild(div);
    }

    // Marker labels (vertical marker lines are drawn in three; labels are HTML)
    for (const m of markers) {
      const local = m.marker_type === "window" ? m.timestamp_sec : m.timestamp_sec - currentTime;

      if (local < 0 || local > timeWindow) continue;
      const x = (local / timeWindow) * W;

      const div = document.createElement("div");
      div.style.cssText = `
        position:absolute;
        left:${x + 4}px;
        top:6px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size:9px;
        font-weight:700;
        color:${theme === "light" ? "#111827" : "#e5e7eb"};
        background:${theme === "light" ? "rgba(255,255,255,0.9)" : "rgba(0,0,0,0.75)"};
        padding:2px 6px;
        border-radius:6px;
        border:1px solid ${theme === "light" ? "rgba(17,24,39,0.25)" : "rgba(229,231,235,0.25)"};
        pointer-events:none;
        white-space:nowrap;
      `;
      div.textContent = m.label ?? m.marker_type;
      root.appendChild(div);
    }
  }, [
    channelColors,
    channelLabels,
    channelsToRender,
    colors.text,
    colors.textMuted,
    currentTime,
    markers,
    theme,
    timeWindow,
  ]);

  // Update channel lines (core performance fix: reuse geometries)
  const updateWaveforms = useCallback(() => {
    const el = containerRef.current;
    const scene = sceneRef.current;
    const lineGroup = lineGroupRef.current;
    if (!el || !scene || !lineGroup) return;

    if (!signals || signals.length === 0) return;
    if (channelsToRender.length === 0) return;

    const W = el.clientWidth;
    const H = el.clientHeight;

    const pad = 4;
    const n = channelsToRender.length;
    const laneH = (H - (n + 1) * pad) / n;
    const laneHalf = laneH * 0.46; // keep margin

    // Remove lines for channels that are no longer visible
    const keep = new Set(channelsToRender);
    for (const [chIdx, line] of channelLineRef.current.entries()) {
      if (!keep.has(chIdx)) {
        lineGroup.remove(line);
        (line.geometry as THREE.BufferGeometry).dispose();
        (line.material as THREE.Material).dispose();
        channelLineRef.current.delete(chIdx);
        channelGeomRef.current.delete(chIdx);
      }
    }

    // For each visible channel: build envelope positions from the WINDOWED buffer directly
    for (let lane = 0; lane < channelsToRender.length; lane++) {
      const chIdx = channelsToRender[lane];
      const buf = signals[chIdx];
      if (!buf || buf.length === 0) continue;

      // Lane baseline y (top-down coordinate system)
      const top = pad + lane * (laneH + pad);
      const baselineY = top + laneH / 2;

      // RAW rendering: no filtering, no baseline subtraction, no autoscale.
      // We only apply user amplitudeScale.
      const gain = amplitudeScale;

      const pos = buildEnvelopePositions(buf, W, baselineY, laneHalf, gain);

      // Color
      let colorHex: number;
      if (channelColors[chIdx]) {
        colorHex = parseColorToHex(channelColors[chIdx]);
      } else {
        const label = channelLabels[chIdx] ?? `Ch${chIdx + 1}`;
        const c = getChannelColor(label);
        const group = c.label.toLowerCase() as ChannelGroup;
        colorHex =
          CHANNEL_THEME_COLORS[group]?.[theme === "light" ? "light" : "dark"] ??
          DEFAULT_CHANNEL_PALETTE[chIdx % DEFAULT_CHANNEL_PALETTE.length];
      }

      // Reuse or create geometry+line
      let line = channelLineRef.current.get(chIdx);
      let geom = channelGeomRef.current.get(chIdx);

      if (!line || !geom) {
        geom = new THREE.BufferGeometry();
        const attr = new THREE.BufferAttribute(pos, 3);
        geom.setAttribute("position", attr);

        const mat = new THREE.LineBasicMaterial({
          color: colorHex,
          transparent: true,
          opacity: 0.95,
        });

        line = new THREE.Line(geom, mat);
        line.frustumCulled = false;

        channelGeomRef.current.set(chIdx, geom);
        channelLineRef.current.set(chIdx, line);
        lineGroup.add(line);
      } else {
        // Update existing attribute
        const attr = geom.getAttribute("position") as THREE.BufferAttribute;
        if (!attr || attr.array.length !== pos.length) {
          // Replace attribute if length changed (e.g., resize)
          geom.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        } else {
          (attr.array as Float32Array).set(pos);
          attr.needsUpdate = true;
        }

        // Update material color
        const mat = line.material as THREE.LineBasicMaterial;
        if (mat.color.getHex() !== colorHex) mat.color.setHex(colorHex);
      }
    }

    requestRender();
  }, [signals, channelsToRender, channelColors, channelLabels, amplitudeScale, theme, requestRender]);

  // Draw markers as vertical lines (three.js)
  const updateMarkers = useCallback(() => {
    const el = containerRef.current;
    const gridGroup = gridGroupRef.current;
    if (!el || !gridGroup) return;

    // Remove old marker lines from grid group: we tag them via name
    const toRemove: THREE.Object3D[] = [];
    for (const child of gridGroup.children) {
      if (child.name === "marker-line") toRemove.push(child);
    }
    for (const obj of toRemove) {
      const line = obj as THREE.Line;
      gridGroup.remove(line);
      (line.geometry as THREE.BufferGeometry).dispose();
      (line.material as THREE.Material).dispose();
    }

    if (!markers || markers.length === 0) return;

    const W = el.clientWidth;
    const H = el.clientHeight;

    const colorMap: Record<string, number> = {
      event: theme === "light" ? 0x2563eb : 0x3b82f6,
      seizure: theme === "light" ? 0xdc2626 : 0xef4444,
      artifact: theme === "light" ? 0xd97706 : 0xf59e0b,
      sleep: theme === "light" ? 0x7c3aed : 0x8b5cf6,
      window: theme === "light" ? 0x111827 : 0xe5e7eb,
    };

    for (const m of markers) {
      const local = m.marker_type === "window" ? m.timestamp_sec : m.timestamp_sec - currentTime;
      if (local < 0 || local > timeWindow) continue;

      const x = (local / timeWindow) * W;
      const mat = new THREE.LineBasicMaterial({
        color: colorMap[m.marker_type] ?? colorMap.event,
        transparent: true,
        opacity: 0.9,
      });
      const geom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, 0, 0), new THREE.Vector3(x, H, 0)]);
      const line = new THREE.Line(geom, mat);
      line.name = "marker-line";
      gridGroup.add(line);
    }

    requestRender();
  }, [markers, currentTime, timeWindow, theme, requestRender]);

  // Rebuild grid + overlays when layout/time changes
  useEffect(() => {
    rebuildGrid();
    rebuildArtifactsOverlay();
    rebuildLabels();
    updateMarkers();
    updateWaveforms();
  }, [rebuildGrid, rebuildArtifactsOverlay, rebuildLabels, updateMarkers, updateWaveforms]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative cursor-crosshair"
      style={{
        background: theme === "light" ? "#fafafa" : "#0a0a0a",
        borderRadius: 6,
        overflow: "hidden",
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
    />
  );
}

export const WebGLEEGViewer = memo(WebGLEEGViewerComponent);
