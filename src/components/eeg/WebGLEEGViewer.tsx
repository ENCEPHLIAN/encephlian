import { useEffect, useRef, useCallback, memo, useState, useMemo } from "react";
import * as THREE from "three";
import { getChannelColor, ChannelGroup } from "@/lib/eeg/channel-groups";

interface Marker {
  id: string;
  timestamp_sec: number;
  marker_type: string;
  label?: string;
}

interface ArtifactInterval {
  start_sec: number;
  end_sec: number;
  label?: string;
  channel?: number;
}

interface Selection {
  startTime: number;
  endTime: number;
}

interface WebGLEEGViewerProps {
  signals: number[][] | null;
  channelLabels: string[];
  channelIndexOrder?: number[]; // IMPORTANT: stable channel ordering
  sampleRate: number;
  currentTime: number; // cursor time within window
  timeWindow: number;
  amplitudeScale: number;
  visibleChannels: Set<number>;
  theme: string;
  markers?: Marker[];
  artifactIntervals?: ArtifactInterval[];
  channelColors?: string[];
  showArtifactsAsRed?: boolean;
  onTimeClick?: (time: number) => void;
  onSelectionChange?: (selection: Selection | null) => void;
}

const THEME_COLORS = {
  dark: {
    bg: 0x0a0a0a,
    grid: 0x1a1a1a,
    gridStrong: 0x262626,
    text: "#e5e5e5",
    textMuted: "#737373",
    selection: "rgba(59, 130, 246, 0.2)",
    selectionBorder: "rgba(59, 130, 246, 0.6)",
    artifactBgRed: "rgba(239, 68, 68, 0.18)",
    artifactBorderRed: "rgba(239, 68, 68, 0.55)",
  },
  light: {
    bg: 0xfafafa,
    grid: 0xf0f0f0,
    gridStrong: 0xe0e0e0,
    text: "#171717",
    textMuted: "#525252",
    selection: "rgba(59, 130, 246, 0.15)",
    selectionBorder: "rgba(59, 130, 246, 0.5)",
    artifactBgRed: "rgba(239, 68, 68, 0.16)",
    artifactBorderRed: "rgba(239, 68, 68, 0.55)",
  },
};

const DEFAULT_CHANNEL_PALETTE = [
  0x60a5fa, 0x4ade80, 0xfbbf24, 0xa78bfa, 0xf87171,
  0x34d399, 0xfb923c, 0x818cf8, 0xf472b6, 0x22d3d8,
  0xa3e635, 0xe879f9, 0xfcd34d, 0x6ee7b7, 0x93c5fd,
  0xc084fc, 0xfdba74, 0x86efac, 0xfca5a5, 0x67e8f9,
];

const CHANNEL_THEME_COLORS: Record<ChannelGroup, { dark: number; light: number }> = {
  frontal: { dark: 0x60a5fa, light: 0x2563eb },
  central: { dark: 0x4ade80, light: 0x16a34a },
  temporal: { dark: 0xfbbf24, light: 0xd97706 },
  occipital: { dark: 0xa78bfa, light: 0x7c3aed },
  other: { dark: 0x94a3b8, light: 0x64748b },
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function parseColorToHex(color: string): number {
  if (color.startsWith("#")) return parseInt(color.slice(1), 16);
  return 0x808080;
}

/** Robust scale: compute p95(|x - median|) */
function robustP95Scale(xs: number[]): number {
  if (!xs.length) return 1;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const med = sorted.length % 2 ? sorted[mid] : 0.5 * (sorted[mid - 1] + sorted[mid]);
  const abs = xs.map((v) => Math.abs(v - med)).sort((a, b) => a - b);
  const idx = Math.min(abs.length - 1, Math.floor(abs.length * 0.95));
  return abs[idx] || 1;
}

function WebGLEEGViewerComponent({
  signals,
  channelLabels,
  channelIndexOrder,
  sampleRate,
  currentTime,
  timeWindow,
  amplitudeScale,
  visibleChannels,
  theme,
  markers = [],
  artifactIntervals = [],
  channelColors = [],
  showArtifactsAsRed = false,
  onTimeClick,
  onSelectionChange,
}: WebGLEEGViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);

  const waveGroupRef = useRef<THREE.Group | null>(null);
  const gridGroupRef = useRef<THREE.Group | null>(null);
  const cursorLineRef = useRef<THREE.Line | null>(null);

  const labelsRef = useRef<HTMLDivElement | null>(null);
  const artifactOverlaysRef = useRef<HTMLDivElement | null>(null);
  const selectionRef = useRef<HTMLDivElement | null>(null);

  const animationFrameRef = useRef<number | null>(null);

  // Selection state
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; time: number } | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);

  const colors = useMemo(() => (theme === "dark" ? THEME_COLORS.dark : THEME_COLORS.light), [theme]);

  const requestRender = useCallback(() => {
    const r = rendererRef.current;
    const s = sceneRef.current;
    const c = cameraRef.current;
    if (!r || !s || !c) return;
    r.render(s, c);
  }, []);

  // Initialize scene
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute; inset:0; width:100%; height:100%;";
    container.appendChild(canvas);
    canvasRef.current = canvas;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(colors.bg, 1);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.OrthographicCamera(0, width, height, 0, 0.1, 1000);
    camera.position.z = 100;
    cameraRef.current = camera;

    const gridGroup = new THREE.Group();
    const waveGroup = new THREE.Group();
    scene.add(gridGroup);
    scene.add(waveGroup);
    gridGroupRef.current = gridGroup;
    waveGroupRef.current = waveGroup;

    // Cursor (vertical line)
    const cursorMat = new THREE.LineBasicMaterial({ color: theme === "dark" ? 0xffffff : 0x111111, transparent: true, opacity: 0.75 });
    const cursorGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, height, 0)]);
    const cursorLine = new THREE.Line(cursorGeom, cursorMat);
    scene.add(cursorLine);
    cursorLineRef.current = cursorLine;

    // Artifact overlays container
    const artifactDiv = document.createElement("div");
    artifactDiv.style.cssText = "position:absolute; inset:0; pointer-events:none; overflow:hidden; z-index:2;";
    container.appendChild(artifactDiv);
    artifactOverlaysRef.current = artifactDiv;

    // Labels container
    const labelsDiv = document.createElement("div");
    labelsDiv.style.cssText = "position:absolute; inset:0; pointer-events:none; overflow:hidden; z-index:10;";
    container.appendChild(labelsDiv);
    labelsRef.current = labelsDiv;

    // Selection overlay
    const selectionDiv = document.createElement("div");
    selectionDiv.style.cssText = `
      position:absolute; top:0; height:100%; pointer-events:none;
      background:${colors.selection}; border-left:2px solid ${colors.selectionBorder};
      border-right:2px solid ${colors.selectionBorder}; display:none; z-index:5;
    `;
    container.appendChild(selectionDiv);
    selectionRef.current = selectionDiv;

    const handleResize = () => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      rendererRef.current.setSize(w, h);
      cameraRef.current.right = w;
      cameraRef.current.top = h;
      cameraRef.current.updateProjectionMatrix();

      // update cursor height
      if (cursorLineRef.current) {
        const geom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, h, 0)]);
        cursorLineRef.current.geometry.dispose();
        cursorLineRef.current.geometry = geom;
      }
      requestRender();
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      renderer.dispose();
      if (canvasRef.current && container.contains(canvasRef.current)) container.removeChild(canvasRef.current);
      if (labelsRef.current && container.contains(labelsRef.current)) container.removeChild(labelsRef.current);
      if (artifactOverlaysRef.current && container.contains(artifactOverlaysRef.current)) container.removeChild(artifactOverlaysRef.current);
      if (selectionRef.current && container.contains(selectionRef.current)) container.removeChild(selectionRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update theme background
  useEffect(() => {
    if (rendererRef.current) rendererRef.current.setClearColor(colors.bg, 1);
    requestRender();
  }, [colors.bg, requestRender]);

  // Cursor update (smooth playback)
  useEffect(() => {
    if (!containerRef.current || !cursorLineRef.current) return;
    const W = containerRef.current.clientWidth;
    const x = (clamp(currentTime, 0, timeWindow) / Math.max(1e-6, timeWindow)) * W;
    cursorLineRef.current.position.x = x;
    requestRender();
  }, [currentTime, timeWindow, requestRender]);

  // Mouse handlers (time click/selection)
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const timeAtClick = (x / rect.width) * timeWindow; // LOCAL within window
    setIsDragging(true);
    setDragStart({ x, time: timeAtClick });
    setSelection(null);
    if (selectionRef.current) selectionRef.current.style.display = "none";
  }, [timeWindow]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || !dragStart || !containerRef.current || !selectionRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const timeAtMouse = (x / rect.width) * timeWindow;

    const left = Math.min(dragStart.x, x);
    const width = Math.abs(x - dragStart.x);

    if (width > 5) {
      selectionRef.current.style.display = "block";
      selectionRef.current.style.left = `${left}px`;
      selectionRef.current.style.width = `${width}px`;
      setSelection({
        startTime: Math.min(dragStart.time, timeAtMouse),
        endTime: Math.max(dragStart.time, timeAtMouse),
      });
    }
  }, [isDragging, dragStart, timeWindow]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;

    if (isDragging && dragStart) {
      const distance = Math.abs(x - dragStart.x);

      if (distance < 5) {
        const timeAtClick = (x / rect.width) * timeWindow;
        onTimeClick?.(timeAtClick);
        if (selectionRef.current) selectionRef.current.style.display = "none";
        setSelection(null);
      } else {
        if (selection) onSelectionChange?.(selection);
      }
    }

    setIsDragging(false);
    setDragStart(null);
  }, [isDragging, dragStart, selection, onTimeClick, onSelectionChange, timeWindow]);

  const handleMouseLeave = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      setDragStart(null);
    }
  }, [isDragging]);

  // Rebuild grid + overlays + labels when layout inputs change
  const rebuildLayout = useCallback(() => {
    if (!containerRef.current || !gridGroupRef.current) return;

    const W = containerRef.current.clientWidth;
    const H = containerRef.current.clientHeight;

    // clear grid group
    while (gridGroupRef.current.children.length) {
      const obj = gridGroupRef.current.children.pop()!;
      const anyObj = obj as any;
      if (anyObj.geometry) anyObj.geometry.dispose?.();
      if (anyObj.material) anyObj.material.dispose?.();
    }

    // clear overlays/labels
    if (labelsRef.current) labelsRef.current.innerHTML = "";
    if (artifactOverlaysRef.current) artifactOverlaysRef.current.innerHTML = "";

    // Determine channels to render (ORDERED)
    const order = channelIndexOrder && channelIndexOrder.length ? channelIndexOrder : (signals ? signals.map((_, i) => i) : []);
    const channelsToRender = order.filter((i) => visibleChannels.has(i));

    const PAD = 4;
    const n = Math.max(1, channelsToRender.length);
    const laneH = (H - (n + 1) * PAD) / n;

    // grid materials
    const gridMat = new THREE.LineBasicMaterial({ color: colors.grid, transparent: true, opacity: 0.45 });
    const gridStrongMat = new THREE.LineBasicMaterial({ color: colors.gridStrong, transparent: true, opacity: 0.65 });

    // vertical grid
    const seconds = Math.max(1, Math.floor(timeWindow));
    for (let i = 0; i <= seconds; i++) {
      const x = (i / seconds) * W;
      const geom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, 0, 0), new THREE.Vector3(x, H, 0)]);
      const mat = i % 5 === 0 ? gridStrongMat : gridMat;
      gridGroupRef.current.add(new THREE.Line(geom, mat));
    }

    // horizontal separators
    for (let i = 0; i <= n; i++) {
      const y = PAD + i * (laneH + PAD);
      const geom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, y, 0), new THREE.Vector3(W, y, 0)]);
      gridGroupRef.current.add(new THREE.Line(geom, gridMat));
    }

    // artifact overlays (DOM)
    if (artifactOverlaysRef.current) {
      for (const a of artifactIntervals) {
        if (a.end_sec < 0 || a.start_sec > timeWindow) continue;
        const s0 = Math.max(0, a.start_sec);
        const s1 = Math.min(timeWindow, a.end_sec);
        const x1 = (s0 / timeWindow) * W;
        const x2 = (s1 / timeWindow) * W;

        const affected = a.channel != null ? [a.channel] : channelsToRender;

        for (const chIdx of affected) {
          const laneIdx = channelsToRender.indexOf(chIdx);
          if (laneIdx === -1) continue;

          const top = PAD + laneIdx * (laneH + PAD);
          const overlay = document.createElement("div");
          overlay.style.cssText = `
            position:absolute;
            left:${x1}px;
            top:${top}px;
            width:${Math.max(2, x2 - x1)}px;
            height:${laneH}px;
            background:${showArtifactsAsRed ? colors.artifactBgRed : "transparent"};
            border-left:1px solid ${colors.artifactBorderRed};
            border-right:1px solid ${colors.artifactBorderRed};
            pointer-events:none;
            box-sizing:border-box;
          `;
          artifactOverlaysRef.current.appendChild(overlay);
        }
      }
    }

    // marker labels (DOM at top)
    if (labelsRef.current) {
      for (const m of markers) {
        if (m.timestamp_sec < 0 || m.timestamp_sec > timeWindow) continue;
        const x = (m.timestamp_sec / timeWindow) * W;

        const div = document.createElement("div");
        div.style.cssText = `
          position:absolute;
          left:${x + 4}px;
          top:4px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size:9px; font-weight:700;
          color:${theme === "dark" ? "#93c5fd" : "#1d4ed8"};
          background:${theme === "dark" ? "rgba(0,0,0,0.7)" : "rgba(255,255,255,0.75)"};
          padding:2px 6px;
          border-radius:4px;
          pointer-events:none;
        `;
        div.textContent = m.label ?? m.marker_type;
        labelsRef.current.appendChild(div);
      }
    }

    requestRender();
  }, [artifactIntervals, channelIndexOrder, colors.artifactBgRed, colors.artifactBorderRed, colors.grid, colors.gridStrong, markers, requestRender, showArtifactsAsRed, signals, theme, timeWindow, visibleChannels]);

  // Update waveforms (only when signals/scaling/order changes)
  const updateWaveforms = useCallback(() => {
    if (!containerRef.current || !waveGroupRef.current || !signals) return;

    const W = containerRef.current.clientWidth;
    const H = containerRef.current.clientHeight;

    // clear wave group
    while (waveGroupRef.current.children.length) {
      const obj = waveGroupRef.current.children.pop()!;
      const anyObj = obj as any;
      if (anyObj.geometry) anyObj.geometry.dispose?.();
      if (anyObj.material) anyObj.material.dispose?.();
    }

    // Determine channels (ORDERED)
    const order = channelIndexOrder && channelIndexOrder.length ? channelIndexOrder : signals.map((_, i) => i);
    const channelsToRender = order.filter((i) => visibleChannels.has(i));

    const PAD = 4;
    const n = Math.max(1, channelsToRender.length);
    const laneH = (H - (n + 1) * PAD) / n;
    const usable = laneH * 0.70;

    // Determine samples in the WINDOWED buffer
    const samplesToShow = Math.max(2, Math.floor(timeWindow * sampleRate));

    for (let laneIdx = 0; laneIdx < channelsToRender.length; laneIdx++) {
      const chIdx = channelsToRender[laneIdx];
      const raw = signals[chIdx];
      if (!raw || raw.length < 2) continue;

      // signals[] is already the fetched window; use first N samples
      const window = raw.slice(0, Math.min(samplesToShow, raw.length));

      // Robust fixed scaling within the window (display-only)
      const p95 = robustP95Scale(window);
      const autoGain = (usable / 2) / Math.max(p95, 1e-9);
      const gain = autoGain * Math.max(1e-6, amplitudeScale);

      const laneTop = PAD + laneIdx * (laneH + PAD);
      const midY = laneTop + laneH / 2;

      // pick color
      let col: number;
      if (channelColors[chIdx]) {
        col = parseColorToHex(channelColors[chIdx]);
      } else {
        const label = channelLabels[laneIdx] || `Ch${chIdx + 1}`;
        const info = getChannelColor(label);
        const groupKey = (info.label?.toLowerCase?.() ?? "other") as ChannelGroup;
        col =
          CHANNEL_THEME_COLORS[groupKey]?.[theme === "dark" ? "dark" : "light"] ??
          DEFAULT_CHANNEL_PALETTE[chIdx % DEFAULT_CHANNEL_PALETTE.length];
      }

      const mat = new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.95 });

      // Min/max envelope per pixel column (alias-free)
      const pixelCols = Math.min(Math.floor(W), 1800);
      const nS = window.length;
      const spp = nS / pixelCols;

      const pts: THREE.Vector3[] = [];
      for (let px = 0; px < pixelCols; px++) {
        const s0 = Math.floor(px * spp);
        const s1 = Math.min(nS, Math.ceil((px + 1) * spp));
        let mn = Infinity, mx = -Infinity;
        for (let i = s0; i < s1; i++) {
          const v = window[i];
          if (v < mn) mn = v;
          if (v > mx) mx = v;
        }
        if (!Number.isFinite(mn) || !Number.isFinite(mx)) continue;

        const x = (px / Math.max(1, pixelCols - 1)) * W;
        const y1 = midY - clamp(mx * gain, -laneH * 0.49, laneH * 0.49);
        const y2 = midY - clamp(mn * gain, -laneH * 0.49, laneH * 0.49);

        if (px % 2 === 0) {
          pts.push(new THREE.Vector3(x, y1, 0));
          pts.push(new THREE.Vector3(x, y2, 0));
        } else {
          pts.push(new THREE.Vector3(x, y2, 0));
          pts.push(new THREE.Vector3(x, y1, 0));
        }
      }

      if (pts.length > 1) {
        const geom = new THREE.BufferGeometry().setFromPoints(pts);
        waveGroupRef.current.add(new THREE.Line(geom, mat));
      }

      // Channel label (DOM) aligned to lane ordering
      if (labelsRef.current) {
        const label = channelLabels[laneIdx] || `Ch${chIdx + 1}`;
        const div = document.createElement("div");
        const cHex = `#${col.toString(16).padStart(6, "0")}`;
        div.style.cssText = `
          position:absolute;
          left:8px;
          top:${laneTop + 2}px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size:10px; font-weight:700;
          color:${colors.text};
          background:${theme === "light" ? "rgba(248,250,252,0.85)" : "rgba(11,11,11,0.75)"};
          padding:2px 6px;
          border-radius:4px;
          border-left:3px solid ${cHex};
          pointer-events:none;
        `;
        div.textContent = label;
        labelsRef.current.appendChild(div);
      }
    }

    requestRender();
  }, [amplitudeScale, channelColors, channelIndexOrder, channelLabels, colors.text, requestRender, sampleRate, signals, theme, timeWindow, visibleChannels]);

  // Rebuild layout when these change
  useEffect(() => {
    rebuildLayout();
  }, [rebuildLayout]);

  // Update waveforms when these change
  useEffect(() => {
    // Clear labels then redraw labels within updateWaveforms (keeps aligned)
    if (labelsRef.current) labelsRef.current.innerHTML = "";
    updateWaveforms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateWaveforms]);

  // throttle any accidental excess renders
  useEffect(() => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = requestAnimationFrame(() => requestRender());
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [requestRender, currentTime]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative cursor-crosshair"
      style={{ borderRadius: 8, overflow: "hidden" }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
    />
  );
}

export const WebGLEEGViewer = memo(WebGLEEGViewerComponent);
