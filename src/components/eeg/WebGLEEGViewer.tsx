import { useEffect, useRef, useCallback, memo, useMemo } from "react";
import * as THREE from "three";

/* =======================
   TYPES
======================= */
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

interface WebGLEEGViewerProps {
  signals: number[][] | null;
  channelLabels: string[];
  channelIndexOrder?: number[];
  sampleRate: number;
  currentTime: number;
  timeWindow: number;
  amplitudeScale: number;
  visibleChannels: Set<number>;
  theme: string;
  markers?: Marker[];
  artifactIntervals?: ArtifactInterval[];
  channelColors?: string[];
  showArtifactsAsRed?: boolean;
  onTimeClick?: (time: number) => void;
}

/* =======================
   THEME COLORS (HSL-based, matching index.css)
======================= */
const THEME_COLORS = {
  dark: {
    bg: 0x0f0f0f,
    grid: 0x1a1a1a,
    gridStrong: 0x292929,
    cursor: 0xffffff,
    text: "hsl(30, 5%, 92%)",
    textMuted: "hsl(0, 0%, 55%)",
    artifactBg: "hsla(0, 65%, 55%, 0.15)",
    artifactBorder: "hsla(0, 65%, 55%, 0.5)",
  },
  light: {
    bg: 0xfaf9f7,
    grid: 0xe8e5e0,
    gridStrong: 0xd4d0c8,
    cursor: 0x111111,
    text: "hsl(220, 10%, 15%)",
    textMuted: "hsl(220, 10%, 45%)",
    artifactBg: "hsla(0, 65%, 55%, 0.12)",
    artifactBorder: "hsla(0, 65%, 55%, 0.45)",
  },
};

/* Channel color palette for EEG traces */
const CHANNEL_COLORS = {
  dark: [
    0x60a5fa, 0x4ade80, 0xfbbf24, 0xa78bfa, 0xf87171,
    0x34d399, 0xfb923c, 0x818cf8, 0xf472b6, 0x22d3d8,
    0xa3e635, 0xe879f9, 0xfcd34d, 0x6ee7b7, 0x93c5fd,
    0xc084fc, 0xfdba74, 0x86efac, 0xfca5a5, 0x67e8f9,
  ],
  light: [
    0x2563eb, 0x16a34a, 0xd97706, 0x7c3aed, 0xdc2626,
    0x059669, 0xea580c, 0x4f46e5, 0xdb2777, 0x0891b2,
    0x65a30d, 0xc026d3, 0xca8a04, 0x10b981, 0x3b82f6,
    0x9333ea, 0xf97316, 0x22c55e, 0xef4444, 0x06b6d4,
  ],
};

/* =======================
   UTILITY FUNCTIONS
======================= */
function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function parseColorToHex(color: string): number {
  if (color.startsWith("#")) return parseInt(color.slice(1), 16);
  return 0x808080;
}

/** Robust scale: compute p95(|x - median|) for auto-gain */
function robustP95Scale(xs: number[]): number {
  if (!xs.length) return 1;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const med = sorted.length % 2 ? sorted[mid] : 0.5 * (sorted[mid - 1] + sorted[mid]);
  const abs = xs.map((v) => Math.abs(v - med)).sort((a, b) => a - b);
  const idx = Math.min(abs.length - 1, Math.floor(abs.length * 0.95));
  return abs[idx] || 1;
}

/* =======================
   MAIN COMPONENT
======================= */
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
}: WebGLEEGViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);

  const waveGroupRef = useRef<THREE.Group | null>(null);
  const gridGroupRef = useRef<THREE.Group | null>(null);
  const cursorLineRef = useRef<THREE.Line | null>(null);

  const labelsContainerRef = useRef<HTMLDivElement | null>(null);
  const artifactOverlaysRef = useRef<HTMLDivElement | null>(null);

  // Store current time in ref for smooth cursor updates without re-render
  const currentTimeRef = useRef(currentTime);
  currentTimeRef.current = currentTime;

  const colors = useMemo(() => (theme === "dark" ? THEME_COLORS.dark : THEME_COLORS.light), [theme]);
  const channelPalette = useMemo(() => (theme === "dark" ? CHANNEL_COLORS.dark : CHANNEL_COLORS.light), [theme]);

  // Initialize WebGL scene once
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Create canvas
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;";
    container.appendChild(canvas);
    canvasRef.current = canvas;

    // Create renderer
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    rendererRef.current = renderer;

    // Create scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Camera: use standard screen coordinates (Y increases downward for easier math)
    // We'll flip in our lane calculations instead
    const camera = new THREE.OrthographicCamera(0, width, 0, height, 0.1, 1000);
    camera.position.z = 100;
    cameraRef.current = camera;

    // Create groups
    const gridGroup = new THREE.Group();
    const waveGroup = new THREE.Group();
    scene.add(gridGroup);
    scene.add(waveGroup);
    gridGroupRef.current = gridGroup;
    waveGroupRef.current = waveGroup;

    // Create cursor line (will be updated via RAF)
    const cursorMat = new THREE.LineBasicMaterial({ 
      color: theme === "dark" ? 0xffffff : 0x111111, 
      transparent: true, 
      opacity: 0.8 
    });
    const cursorGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, height, 0),
    ]);
    const cursorLine = new THREE.Line(cursorGeom, cursorMat);
    scene.add(cursorLine);
    cursorLineRef.current = cursorLine;

    // Create artifact overlays container (DOM)
    const artifactDiv = document.createElement("div");
    artifactDiv.style.cssText = "position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:2;";
    container.appendChild(artifactDiv);
    artifactOverlaysRef.current = artifactDiv;

    // Create labels container (DOM)
    const labelsDiv = document.createElement("div");
    labelsDiv.style.cssText = "position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:10;";
    container.appendChild(labelsDiv);
    labelsContainerRef.current = labelsDiv;

    // Resize handler
    const handleResize = () => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      rendererRef.current.setSize(w, h);
      cameraRef.current.right = w;
      cameraRef.current.bottom = h;
      cameraRef.current.updateProjectionMatrix();

      // Update cursor height
      if (cursorLineRef.current) {
        const geom = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(0, h, 0),
        ]);
        cursorLineRef.current.geometry.dispose();
        cursorLineRef.current.geometry = geom;
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      renderer.dispose();
      if (canvasRef.current && container.contains(canvasRef.current)) {
        container.removeChild(canvasRef.current);
      }
      if (labelsContainerRef.current && container.contains(labelsContainerRef.current)) {
        container.removeChild(labelsContainerRef.current);
      }
      if (artifactOverlaysRef.current && container.contains(artifactOverlaysRef.current)) {
        container.removeChild(artifactOverlaysRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update theme colors
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setClearColor(colors.bg, 1);
    }
    if (cursorLineRef.current) {
      (cursorLineRef.current.material as THREE.LineBasicMaterial).color.setHex(colors.cursor);
    }
  }, [colors.bg, colors.cursor]);

  // Smooth cursor animation via RAF (no React state updates)
  useEffect(() => {
    let rafId: number;

    const updateCursor = () => {
      if (!containerRef.current || !cursorLineRef.current || !rendererRef.current || !sceneRef.current || !cameraRef.current) {
        rafId = requestAnimationFrame(updateCursor);
        return;
      }

      const W = containerRef.current.clientWidth;
      const t = currentTimeRef.current;
      const x = clamp((t / Math.max(1e-6, timeWindow)) * W, 0, W);
      
      cursorLineRef.current.position.x = x;
      rendererRef.current.render(sceneRef.current, cameraRef.current);
      
      rafId = requestAnimationFrame(updateCursor);
    };

    rafId = requestAnimationFrame(updateCursor);
    return () => cancelAnimationFrame(rafId);
  }, [timeWindow]);

  // Rebuild grid, artifacts, waveforms when data changes
  const rebuildAll = useCallback(() => {
    if (!containerRef.current || !gridGroupRef.current || !waveGroupRef.current) return;

    const W = containerRef.current.clientWidth;
    const H = containerRef.current.clientHeight;

    // --- Clear grid ---
    while (gridGroupRef.current.children.length) {
      const obj = gridGroupRef.current.children.pop()!;
      (obj as any).geometry?.dispose?.();
      (obj as any).material?.dispose?.();
    }

    // --- Clear waveforms ---
    while (waveGroupRef.current.children.length) {
      const obj = waveGroupRef.current.children.pop()!;
      (obj as any).geometry?.dispose?.();
      (obj as any).material?.dispose?.();
    }

    // --- Clear DOM overlays ---
    if (labelsContainerRef.current) labelsContainerRef.current.innerHTML = "";
    if (artifactOverlaysRef.current) artifactOverlaysRef.current.innerHTML = "";

    if (!signals) return;

    // Determine channel order: use provided order or default
    const order = channelIndexOrder?.length ? channelIndexOrder : signals.map((_, i) => i);
    const channelsToRender = order.filter((i) => visibleChannels.has(i));
    const n = Math.max(1, channelsToRender.length);

    const PAD = 4;
    const laneH = (H - (n + 1) * PAD) / n;

    // --- Draw grid ---
    const gridMat = new THREE.LineBasicMaterial({ color: colors.grid, transparent: true, opacity: 0.45 });
    const gridStrongMat = new THREE.LineBasicMaterial({ color: colors.gridStrong, transparent: true, opacity: 0.65 });

    // Vertical grid (time)
    const seconds = Math.max(1, Math.floor(timeWindow));
    for (let i = 0; i <= seconds; i++) {
      const x = (i / timeWindow) * W;
      const geom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, 0, 0),
        new THREE.Vector3(x, H, 0),
      ]);
      gridGroupRef.current.add(new THREE.Line(geom, i % 5 === 0 ? gridStrongMat : gridMat));
    }

    // Horizontal separators
    for (let i = 0; i <= n; i++) {
      const y = PAD + i * (laneH + PAD);
      const geom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, y, 0),
        new THREE.Vector3(W, y, 0),
      ]);
      gridGroupRef.current.add(new THREE.Line(geom, gridMat));
    }

    // --- Draw waveforms ---
    const samplesToShow = Math.max(2, Math.floor(timeWindow * sampleRate));

    for (let laneIdx = 0; laneIdx < channelsToRender.length; laneIdx++) {
      const chIdx = channelsToRender[laneIdx];
      const raw = signals[chIdx];
      if (!raw || raw.length < 2) continue;

      // Get samples for this window
      const windowData = raw.slice(0, Math.min(samplesToShow, raw.length));

      // Compute robust auto-scale
      const p95 = robustP95Scale(windowData);
      const usable = laneH * 0.70;
      const autoGain = (usable / 2) / Math.max(p95, 1e-9);
      const gain = autoGain * Math.max(1e-6, amplitudeScale);

      // Lane position: laneIdx=0 is at TOP (small Y value)
      const laneTop = PAD + laneIdx * (laneH + PAD);
      const midY = laneTop + laneH / 2;

      // Pick color
      let col: number;
      if (channelColors[chIdx]) {
        col = parseColorToHex(channelColors[chIdx]);
      } else {
        col = channelPalette[laneIdx % channelPalette.length];
      }

      const mat = new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.95 });

      // Min/max envelope rendering (eliminates aliasing)
      const pixelCols = Math.min(Math.floor(W), 1800);
      const nS = windowData.length;
      const spp = nS / pixelCols;

      const pts: THREE.Vector3[] = [];
      for (let px = 0; px < pixelCols; px++) {
        const s0 = Math.floor(px * spp);
        const s1 = Math.min(nS, Math.ceil((px + 1) * spp));
        let mn = Infinity, mx = -Infinity;
        for (let i = s0; i < s1; i++) {
          const v = windowData[i];
          if (v < mn) mn = v;
          if (v > mx) mx = v;
        }
        if (!Number.isFinite(mn) || !Number.isFinite(mx)) continue;

        const x = (px / Math.max(1, pixelCols - 1)) * W;
        // Note: positive values go UP (smaller Y), negative go DOWN (larger Y)
        const y1 = midY - clamp(mx * gain, -laneH * 0.49, laneH * 0.49);
        const y2 = midY - clamp(mn * gain, -laneH * 0.49, laneH * 0.49);

        // Zig-zag pattern for envelope
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

      // Channel label (DOM)
      if (labelsContainerRef.current) {
        const label = channelLabels[laneIdx] || `Ch${chIdx + 1}`;
        const div = document.createElement("div");
        const cHex = `#${col.toString(16).padStart(6, "0")}`;
        div.style.cssText = `
          position:absolute;
          left:8px;
          top:${laneTop + 2}px;
          font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;
          font-size:10px;
          font-weight:700;
          color:${colors.text};
          background:${theme === "light" ? "rgba(248,250,252,0.85)" : "rgba(11,11,11,0.75)"};
          padding:2px 6px;
          border-radius:4px;
          border-left:3px solid ${cHex};
          pointer-events:none;
        `;
        div.textContent = label;
        labelsContainerRef.current.appendChild(div);
      }
    }

    // --- Draw artifact overlays (DOM) ---
    if (artifactOverlaysRef.current && showArtifactsAsRed) {
      for (const a of artifactIntervals) {
        if (a.end_sec < 0 || a.start_sec > timeWindow) continue;

        const s0 = Math.max(0, a.start_sec);
        const s1 = Math.min(timeWindow, a.end_sec);
        const x1 = (s0 / timeWindow) * W;
        const x2 = (s1 / timeWindow) * W;

        // Determine affected channels
        const affected = a.channel != null ? [a.channel] : channelsToRender;

        for (const chIdx of affected) {
          const laneIdx = channelsToRender.indexOf(chIdx);
          if (laneIdx === -1) continue;

          const laneTop = PAD + laneIdx * (laneH + PAD);
          const overlay = document.createElement("div");
          overlay.style.cssText = `
            position:absolute;
            left:${x1}px;
            top:${laneTop}px;
            width:${Math.max(2, x2 - x1)}px;
            height:${laneH}px;
            background:${colors.artifactBg};
            border-left:1px solid ${colors.artifactBorder};
            border-right:1px solid ${colors.artifactBorder};
            pointer-events:none;
            box-sizing:border-box;
          `;
          artifactOverlaysRef.current.appendChild(overlay);
        }
      }
    }

    // --- Draw markers (DOM) ---
    if (labelsContainerRef.current) {
      for (const m of markers) {
        if (m.timestamp_sec < 0 || m.timestamp_sec > timeWindow) continue;

        const x = (m.timestamp_sec / timeWindow) * W;
        const div = document.createElement("div");
        div.style.cssText = `
          position:absolute;
          left:${x + 4}px;
          top:4px;
          font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;
          font-size:9px;
          font-weight:700;
          color:${theme === "dark" ? "#93c5fd" : "#1d4ed8"};
          background:${theme === "dark" ? "rgba(0,0,0,0.7)" : "rgba(255,255,255,0.75)"};
          padding:2px 6px;
          border-radius:4px;
          pointer-events:none;
        `;
        div.textContent = m.label ?? m.marker_type;
        labelsContainerRef.current.appendChild(div);
      }
    }
  }, [
    signals,
    channelLabels,
    channelIndexOrder,
    sampleRate,
    timeWindow,
    amplitudeScale,
    visibleChannels,
    theme,
    markers,
    artifactIntervals,
    channelColors,
    showArtifactsAsRed,
    colors,
    channelPalette,
  ]);

  // Rebuild when dependencies change
  useEffect(() => {
    rebuildAll();
  }, [rebuildAll]);

  // Handle click to seek
  const handleClick = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current || !onTimeClick) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const t = (x / rect.width) * timeWindow;
    onTimeClick(t);
  }, [timeWindow, onTimeClick]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative cursor-crosshair"
      style={{ borderRadius: 8, overflow: "hidden" }}
      onClick={handleClick}
    />
  );
}

export const WebGLEEGViewer = memo(WebGLEEGViewerComponent);
