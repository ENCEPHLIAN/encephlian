import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { getChannelColor, ChannelGroup } from "@/lib/eeg/channel-groups";

interface Marker {
  id?: string;
  timestamp_sec: number; // EXPECTED: window-local seconds (0..timeWindow)
  marker_type: string;
  label?: string;
}

interface ArtifactInterval {
  start_sec: number; // EXPECTED: window-local seconds (0..timeWindow)
  end_sec: number; // EXPECTED: window-local seconds (0..timeWindow)
  label?: string;
  channel?: number; // channel index in the global channel index space (same as signals[channelIndex])
}

interface Selection {
  startTime: number; // window-local seconds
  endTime: number; // window-local seconds
}

interface WebGLEEGViewerProps {
  signals: number[][] | null; // EXPECTED: already-windowed chunk, channel-major
  channelLabels: string[];
  sampleRate: number;
  currentTime: number; // ignored for rendering (window-local rendering); kept for API compat
  timeWindow: number;
  amplitudeScale: number; // user gain only (RAW scaling)
  visibleChannels: Set<number>;
  theme: string;
  markers?: Marker[]; // window-local markers
  artifactIntervals?: ArtifactInterval[]; // window-local intervals
  channelColors?: string[];
  showArtifactsAsRed?: boolean;
  onTimeClick?: (timeSec: number) => void; // window-local
  onSelectionChange?: (selection: Selection | null) => void;
}

/* =======================
   THEME
======================= */
const THEME_COLORS = {
  dark: {
    background: 0x0a0a0a,
    grid: 0x1a1a1a,
    gridStrong: 0x262626,
    text: "#e5e5e5",
    textMuted: "#737373",
    selection: "rgba(59, 130, 246, 0.18)",
    selectionBorder: "rgba(59, 130, 246, 0.55)",
    artifactBgRed: "rgba(239, 68, 68, 0.18)",
    artifactBorderRed: "rgba(239, 68, 68, 0.55)",
  },
  light: {
    background: 0xfafafa,
    grid: 0xf0f0f0,
    gridStrong: 0xe0e0e0,
    text: "#171717",
    textMuted: "#525252",
    selection: "rgba(59, 130, 246, 0.14)",
    selectionBorder: "rgba(59, 130, 246, 0.45)",
    artifactBgRed: "rgba(239, 68, 68, 0.20)",
    artifactBorderRed: "rgba(239, 68, 68, 0.60)",
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

/* =======================
   PERFORMANCE HELPERS
======================= */

// Envelope builder on RAW values (deterministic, no filtering).
// Returns a Float32Array of y-values length = 2*pixelCount (alternating max/min).
function buildEnvelopeY(signal: number[], pixelCount: number, gain: number, clampAbs: number): Float32Array {
  const n = signal.length;
  const out = new Float32Array(pixelCount * 2);
  if (n === 0 || pixelCount <= 0) return out;

  const spp = n / pixelCount;

  for (let px = 0; px < pixelCount; px++) {
    const s0 = Math.floor(px * spp);
    const s1 = Math.min(Math.ceil((px + 1) * spp), n);

    let minV = Infinity;
    let maxV = -Infinity;

    for (let s = s0; s < s1; s++) {
      const v = signal[s];
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }

    if (minV === Infinity) {
      minV = 0;
      maxV = 0;
    }

    // Apply user gain (RAW scaling only)
    let yMin = minV * gain;
    let yMax = maxV * gain;

    // Clamp to lane
    if (yMin < -clampAbs) yMin = -clampAbs;
    if (yMin > clampAbs) yMin = clampAbs;
    if (yMax < -clampAbs) yMax = -clampAbs;
    if (yMax > clampAbs) yMax = clampAbs;

    // Alternate pattern for a continuous polyline-ish look
    // Even px: (max, min) Odd px: (min, max)
    const i = px * 2;
    if (px % 2 === 0) {
      out[i] = yMax;
      out[i + 1] = yMin;
    } else {
      out[i] = yMin;
      out[i + 1] = yMax;
    }
  }

  return out;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

/* =======================
   COMPONENT
======================= */
function WebGLEEGViewerComponent(props: WebGLEEGViewerProps) {
  const {
    signals,
    channelLabels,
    sampleRate,
    currentTime, // intentionally not used for slicing
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

  const colors = useMemo(() => (theme === "dark" ? THEME_COLORS.dark : THEME_COLORS.light), [theme]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);

  // We keep a persistent set of channel lines to avoid teardown each render.
  // Map channelIndex -> { line, geometry, material, positions }
  const channelLineRef = useRef<
    Map<number, { line: THREE.Line; geom: THREE.BufferGeometry; mat: THREE.LineBasicMaterial; pos: Float32Array }>
  >(new Map());

  // Grid lines persistent
  const gridRef = useRef<{
    lines: THREE.Line[];
    mats: { weak: THREE.LineBasicMaterial; strong: THREE.LineBasicMaterial };
  } | null>(null);

  // DOM overlays (artifacts, labels, selection, marker labels)
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const labelsRef = useRef<HTMLDivElement | null>(null);
  const selectionRef = useRef<HTMLDivElement | null>(null);

  // Selection state
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; t: number } | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);

  // Build list of channels to render (stable order)
  const channelsToRender = useMemo(() => {
    if (!signals || signals.length === 0) return [];
    const vis = Array.from(visibleChannels).sort((a, b) => a - b);
    return vis.length > 0 ? vis : signals.map((_, i) => i);
  }, [signals, visibleChannels]);

  /* =======================
     INIT THREE + OVERLAYS
  ======================= */
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Canvas
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;";
    container.appendChild(canvas);
    canvasRef.current = canvas;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false, // envelope already anti-aliases effectively; keep fast
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(colors.background);
    rendererRef.current = renderer;

    // Scene/camera
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.OrthographicCamera(0, width, height, 0, 0.1, 1000);
    camera.position.z = 100;
    cameraRef.current = camera;

    // Overlays
    const overlay = document.createElement("div");
    overlay.style.cssText = `
      position:absolute;top:0;left:0;width:100%;height:100%;
      pointer-events:none;overflow:hidden;z-index:2;
    `;
    container.appendChild(overlay);
    overlayRef.current = overlay;

    const labels = document.createElement("div");
    labels.style.cssText = `
      position:absolute;top:0;left:0;width:100%;height:100%;
      pointer-events:none;overflow:hidden;z-index:10;
    `;
    container.appendChild(labels);
    labelsRef.current = labels;

    const selectionDiv = document.createElement("div");
    selectionDiv.style.cssText = `
      position:absolute;top:0;height:100%;pointer-events:none;
      background:${colors.selection};
      border-left:2px solid ${colors.selectionBorder};
      border-right:2px solid ${colors.selectionBorder};
      display:none;z-index:5;
      box-sizing:border-box;
    `;
    container.appendChild(selectionDiv);
    selectionRef.current = selectionDiv;

    // Materials for grid
    const weak = new THREE.LineBasicMaterial({ color: colors.grid, transparent: true, opacity: 0.55 });
    const strong = new THREE.LineBasicMaterial({ color: colors.gridStrong, transparent: true, opacity: 0.8 });
    gridRef.current = { lines: [], mats: { weak, strong } };

    const handleResize = () => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      rendererRef.current.setSize(w, h);
      cameraRef.current.right = w;
      cameraRef.current.top = h;
      cameraRef.current.updateProjectionMatrix();
    };

    const ro = new ResizeObserver(handleResize);
    ro.observe(container);

    return () => {
      ro.disconnect();

      // Cleanup three
      channelLineRef.current.forEach(({ line, geom, mat }) => {
        scene.remove(line);
        geom.dispose();
        mat.dispose();
      });
      channelLineRef.current.clear();

      if (gridRef.current) {
        gridRef.current.lines.forEach((l) => {
          scene.remove(l);
          l.geometry.dispose();
          (l.material as THREE.Material).dispose();
        });
        gridRef.current.mats.weak.dispose();
        gridRef.current.mats.strong.dispose();
      }
      gridRef.current = null;

      renderer.dispose();

      // Cleanup DOM
      if (canvasRef.current && container.contains(canvasRef.current)) container.removeChild(canvasRef.current);
      if (overlayRef.current && container.contains(overlayRef.current)) container.removeChild(overlayRef.current);
      if (labelsRef.current && container.contains(labelsRef.current)) container.removeChild(labelsRef.current);
      if (selectionRef.current && container.contains(selectionRef.current)) container.removeChild(selectionRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update background when theme changes
  useEffect(() => {
    if (rendererRef.current) rendererRef.current.setClearColor(colors.background);
    if (selectionRef.current) {
      selectionRef.current.style.background = colors.selection;
      selectionRef.current.style.borderLeft = `2px solid ${colors.selectionBorder}`;
      selectionRef.current.style.borderRight = `2px solid ${colors.selectionBorder}`;
    }
  }, [colors.background, colors.selection, colors.selectionBorder]);

  /* =======================
     MOUSE INTERACTION
  ======================= */
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const t = (x / rect.width) * timeWindow;

      setIsDragging(true);
      setDragStart({ x, t });
      setSelection(null);
      if (selectionRef.current) selectionRef.current.style.display = "none";
    },
    [timeWindow],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging || !dragStart || !containerRef.current || !selectionRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const t = (x / rect.width) * timeWindow;

      const left = Math.min(dragStart.x, x);
      const width = Math.abs(x - dragStart.x);

      if (width > 5) {
        selectionRef.current.style.display = "block";
        selectionRef.current.style.left = `${left}px`;
        selectionRef.current.style.width = `${width}px`;

        const sel = { startTime: Math.min(dragStart.t, t), endTime: Math.max(dragStart.t, t) };
        setSelection(sel);
      }
    },
    [isDragging, dragStart, timeWindow],
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;

      if (isDragging && dragStart) {
        const distance = Math.abs(x - dragStart.x);
        if (distance < 5) {
          const t = (x / rect.width) * timeWindow;
          onTimeClick?.(t);
          if (selectionRef.current) selectionRef.current.style.display = "none";
          setSelection(null);
          onSelectionChange?.(null);
        } else {
          if (selection) onSelectionChange?.(selection);
        }
      }

      setIsDragging(false);
      setDragStart(null);
    },
    [isDragging, dragStart, selection, timeWindow, onTimeClick, onSelectionChange],
  );

  const handleMouseLeave = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      setDragStart(null);
    }
  }, [isDragging]);

  /* =======================
     GRID (persistent rebuild only when size/timeWindow/channels change)
  ======================= */
  const rebuildGrid = useCallback(() => {
    if (!sceneRef.current || !cameraRef.current || !rendererRef.current || !containerRef.current || !gridRef.current)
      return;

    const scene = sceneRef.current;
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    // Remove old grid
    gridRef.current.lines.forEach((l) => {
      scene.remove(l);
      l.geometry.dispose();
      // materials reused (weak/strong) -> don't dispose here
    });
    gridRef.current.lines = [];

    const weak = gridRef.current.mats.weak;
    const strong = gridRef.current.mats.strong;

    // Vertical grid (seconds) strong every 5s
    const step = timeWindow <= 10 ? 1 : timeWindow <= 30 ? 5 : 10;
    for (let s = 0; s <= timeWindow + 1e-6; s += step) {
      const x = (s / timeWindow) * width;
      const geom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, 0, 0),
        new THREE.Vector3(x, height, 0),
      ]);
      const mat = Math.round(s) % (step * 5) === 0 ? strong : weak;
      const line = new THREE.Line(geom, mat);
      scene.add(line);
      gridRef.current.lines.push(line);
    }

    // Horizontal separators per lane
    const n = channelsToRender.length || 1;
    const pad = 4;
    const laneH = (height - (n + 1) * pad) / n;

    for (let i = 0; i <= n; i++) {
      const y = pad + i * (laneH + pad);
      const geom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, y, 0),
        new THREE.Vector3(width, y, 0),
      ]);
      const line = new THREE.Line(geom, weak);
      scene.add(line);
      gridRef.current.lines.push(line);
    }
  }, [timeWindow, channelsToRender.length]);

  /* =======================
     CHANNEL COLOR RESOLUTION
  ======================= */
  const resolveChannelColor = useCallback(
    (label: string, chIndex: number) => {
      if (channelColors[chIndex]) return parseColorToHex(channelColors[chIndex]);
      const colorInfo = getChannelColor(label);
      const groupKey = colorInfo.label.toLowerCase() as ChannelGroup;
      return (
        CHANNEL_THEME_COLORS[groupKey]?.[theme === "dark" ? "dark" : "light"] ??
        DEFAULT_CHANNEL_PALETTE[chIndex % DEFAULT_CHANNEL_PALETTE.length]
      );
    },
    [channelColors, theme],
  );

  /* =======================
     OVERLAY DOM (artifacts + marker labels + time labels + channel labels)
     - we rebuild these only on dependency changes, not per frame
  ======================= */
  const rebuildOverlays = useCallback(() => {
    if (!containerRef.current || !overlayRef.current || !labelsRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    overlayRef.current.innerHTML = "";
    labelsRef.current.innerHTML = "";

    const n = channelsToRender.length || 1;
    const pad = 4;
    const laneH = (height - (n + 1) * pad) / n;

    // Channel labels
    for (let di = 0; di < channelsToRender.length; di++) {
      const chIndex = channelsToRender[di];
      const label = channelLabels[chIndex] || `Ch${chIndex + 1}`;
      const c = resolveChannelColor(label, chIndex);
      const cStr = `#${c.toString(16).padStart(6, "0")}`;

      const top = pad + di * (laneH + pad);
      const el = document.createElement("div");
      el.style.cssText = `
        position:absolute;left:8px;top:${top + 4}px;
        font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;
        font-size:10px;font-weight:600;color:${colors.text};
        background:${theme === "dark" ? "rgba(10,10,10,0.85)" : "rgba(250,250,250,0.9)"};
        padding:2px 6px;border-radius:3px;border-left:3px solid ${cStr};
        pointer-events:none;
      `;
      el.textContent = label;
      labelsRef.current.appendChild(el);
    }

    // Artifact overlays (red)
    const bg = colors.artifactBgRed;
    const bd = colors.artifactBorderRed;

    for (const a of artifactIntervals) {
      // Expect window-local coords
      const a0 = clamp(a.start_sec, 0, timeWindow);
      const a1 = clamp(a.end_sec, 0, timeWindow);
      if (a1 <= a0) continue;

      const x1 = (a0 / timeWindow) * width;
      const x2 = (a1 / timeWindow) * width;

      const affected = a.channel != null ? [a.channel] : channelsToRender;
      for (const chIdx of affected) {
        const di = channelsToRender.indexOf(chIdx);
        if (di === -1) continue;

        const top = pad + di * (laneH + pad);

        const el = document.createElement("div");
        el.style.cssText = `
          position:absolute;left:${x1}px;top:${top}px;width:${Math.max(2, x2 - x1)}px;height:${laneH}px;
          background:${showArtifactsAsRed ? bg : bg};
          border-left:1px solid ${bd};border-right:1px solid ${bd};
          box-sizing:border-box;
        `;
        overlayRef.current.appendChild(el);
      }
    }

    // Marker verticals + labels (use overlay for lines, labels for chips)
    const markerColor: Record<string, string> = {
      event: theme === "dark" ? "#3b82f6" : "#2563eb",
      seizure: theme === "dark" ? "#ef4444" : "#dc2626",
      artifact: theme === "dark" ? "#f59e0b" : "#d97706",
      sleep: theme === "dark" ? "#8b5cf6" : "#7c3aed",
    };

    for (const m of markers) {
      const t = m.timestamp_sec; // window-local expected
      if (t < 0 || t > timeWindow) continue;
      const x = (t / timeWindow) * width;

      const line = document.createElement("div");
      line.style.cssText = `
        position:absolute;left:${x}px;top:0;height:100%;width:2px;
        background:${markerColor[m.marker_type] ?? (theme === "dark" ? "#888" : "#666")};
        opacity:0.9;
      `;
      overlayRef.current.appendChild(line);

      const chip = document.createElement("div");
      const c = markerColor[m.marker_type] ?? (theme === "dark" ? "#888" : "#666");
      chip.style.cssText = `
        position:absolute;left:${Math.min(x + 4, width - 140)}px;top:6px;
        max-width:140px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
        font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;
        font-size:9px;font-weight:700;color:${c};
        background:${theme === "dark" ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.9)"};
        border:1px solid ${c};
        padding:2px 6px;border-radius:3px;
      `;
      chip.textContent = m.label ?? m.marker_type;
      labelsRef.current.appendChild(chip);
    }

    // Time labels (bottom)
    const interval = timeWindow <= 10 ? 1 : timeWindow <= 30 ? 5 : 10;
    for (let s = 0; s <= timeWindow + 1e-6; s += interval) {
      const x = (s / timeWindow) * width;

      const el = document.createElement("div");
      el.style.cssText = `
        position:absolute;left:${x + 2}px;bottom:4px;
        font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;
        font-size:9px;color:${colors.textMuted};
        background:${theme === "dark" ? "rgba(10,10,10,0.7)" : "rgba(250,250,250,0.7)"};
        padding:1px 3px;border-radius:2px;
      `;
      el.textContent = `${s.toFixed(0)}s`;
      labelsRef.current.appendChild(el);
    }
  }, [
    artifactIntervals,
    markers,
    channelLabels,
    channelsToRender,
    colors.artifactBgRed,
    colors.artifactBorderRed,
    colors.text,
    colors.textMuted,
    resolveChannelColor,
    showArtifactsAsRed,
    theme,
    timeWindow,
  ]);

  /* =======================
     WAVEFORM UPDATE (no teardown)
  ======================= */
  const renderWaveforms = useCallback(() => {
    if (!signals || signals.length === 0) return;
    if (!sceneRef.current || !cameraRef.current || !rendererRef.current || !containerRef.current) return;

    const scene = sceneRef.current;
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const n = channelsToRender.length || 1;
    const pad = 4;
    const laneH = (height - (n + 1) * pad) / n;
    const usable = laneH * 0.65;
    const clampAbs = laneH * 0.48;

    // Pixel budget (cap for perf)
    const pixelCount = Math.min(Math.floor(width), 1800);

    // For deterministic raw rendering, only user gain applies.
    const gain = amplitudeScale;

    // Ensure each channel line exists and update its buffer
    for (let di = 0; di < channelsToRender.length; di++) {
      const chIndex = channelsToRender[di];
      const sig = signals[chIndex];
      if (!sig || sig.length === 0) continue;

      const label = channelLabels[chIndex] || `Ch${chIndex + 1}`;
      const colorHex = resolveChannelColor(label, chIndex);

      // envelope y values (window-local)
      const envY = buildEnvelopeY(sig, pixelCount, gain, clampAbs);

      // Build/update positions: x mapped to [0,width], y around lane baseline
      // positions length = envY.length * 3
      const baselineY = pad + di * (laneH + pad) + laneH / 2;

      const neededVerts = envY.length;
      const neededFloats = neededVerts * 3;

      let entry = channelLineRef.current.get(chIndex);
      if (!entry) {
        const pos = new Float32Array(neededFloats);
        const geom = new THREE.BufferGeometry();
        geom.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        const mat = new THREE.LineBasicMaterial({ color: colorHex });
        const line = new THREE.Line(geom, mat);
        scene.add(line);
        entry = { line, geom, mat, pos };
        channelLineRef.current.set(chIndex, entry);
      } else {
        // If buffer size changed (resize), recreate buffer attribute (cheap)
        if (entry.pos.length !== neededFloats) {
          entry.pos = new Float32Array(neededFloats);
          entry.geom.setAttribute("position", new THREE.BufferAttribute(entry.pos, 3));
        }
        // Update color if needed
        if (entry.mat.color.getHex() !== colorHex) entry.mat.color.setHex(colorHex);
      }

      const pos = entry.pos;

      for (let i = 0; i < neededVerts; i++) {
        const px = Math.floor(i / 2);
        const x = (px / pixelCount) * width;

        // y in signal space (μV*gain), screen y goes down, so subtract
        const y = baselineY - envY[i];

        const j = i * 3;
        pos[j] = x;
        pos[j + 1] = y;
        pos[j + 2] = 0;
      }

      (entry.geom.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    }

    // Remove lines for channels no longer visible
    for (const [chIndex, entry] of channelLineRef.current.entries()) {
      if (!channelsToRender.includes(chIndex)) {
        scene.remove(entry.line);
        entry.geom.dispose();
        entry.mat.dispose();
        channelLineRef.current.delete(chIndex);
      }
    }

    rendererRef.current.render(scene, cameraRef.current);
  }, [signals, channelsToRender, amplitudeScale, channelLabels, resolveChannelColor]);

  /* =======================
     EFFECTS: rebuild grid/overlays on structural changes
  ======================= */
  useEffect(() => {
    rebuildGrid();
    rebuildOverlays();
    // We also render once after rebuild
    requestAnimationFrame(() => renderWaveforms());
  }, [rebuildGrid, rebuildOverlays, renderWaveforms]);

  // Render whenever waveform inputs change (signals, gain, visible channels)
  useEffect(() => {
    requestAnimationFrame(() => renderWaveforms());
  }, [renderWaveforms]);

  /* =======================
     NOTE ABOUT currentTime
     We intentionally do NOT use currentTime to reslice signals.
     EEGViewer.tsx should pass window-local data and set currentTime=0.
  ======================= */

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative cursor-crosshair"
      style={{
        background: theme === "dark" ? "#0a0a0a" : "#fafafa",
        borderRadius: 6,
        overflow: "hidden",
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      aria-label="EEG viewer"
    />
  );
}

export const WebGLEEGViewer = memo(WebGLEEGViewerComponent);
