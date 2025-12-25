import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { getChannelColor, ChannelGroup } from "@/lib/eeg/channel-groups";

interface Marker {
  id: string;
  timestamp_sec: number; // NOTE: expects WINDOW-LOCAL time (0..timeWindow)
  marker_type: string;
  label?: string;
}

interface ArtifactInterval {
  start_sec: number; // NOTE: expects WINDOW-LOCAL time (0..timeWindow)
  end_sec: number;
  label?: string;
  channel?: number; // canonical channel index (global)
}

interface Selection {
  startTime: number; // GLOBAL time (sec) as provided by parent callback
  endTime: number;
}

interface WebGLEEGViewerProps {
  signals: number[][] | null; // [nCh][nSamp] windowed buffer ONLY (raw immutable)
  channelLabels: string[];
  sampleRate: number;
  currentTime: number; // for compatibility; should be 0 for windowed
  timeWindow: number;
  amplitudeScale: number; // user multiplier only (1.0 default)
  visibleChannels: Set<number>;
  theme: string;
  markers?: Marker[];
  artifactIntervals?: ArtifactInterval[];
  channelColors?: string[];
  showArtifactsAsRed?: boolean;
  onTimeClick?: (time: number) => void; // expects GLOBAL time (sec)
  onSelectionChange?: (selection: Selection | null) => void;
}

const THEME = {
  dark: {
    bg: 0x0b0b0b,
    grid: 0x1c1c1c,
    gridStrong: 0x2a2a2a,
    text: "#e5e5e5",
    textMuted: "#9aa0a6",
    artifactBg: "rgba(239, 68, 68, 0.14)",
    artifactBorder: "rgba(239, 68, 68, 0.40)",
  },
  light: {
    bg: 0xf8fafc,
    grid: 0xe5e7eb,
    gridStrong: 0xcbd5e1,
    text: "#0f172a",
    textMuted: "#475569",
    artifactBg: "rgba(239, 68, 68, 0.12)",
    artifactBorder: "rgba(239, 68, 68, 0.35)",
  },
} as const;

const CHANNEL_THEME_COLORS: Record<ChannelGroup, { dark: number; light: number }> = {
  frontal: { dark: 0x60a5fa, light: 0x2563eb },
  central: { dark: 0x4ade80, light: 0x16a34a },
  temporal: { dark: 0xfbbf24, light: 0xd97706 },
  occipital: { dark: 0xa78bfa, light: 0x7c3aed },
  other: { dark: 0x94a3b8, light: 0x64748b },
};

const FALLBACK_PALETTE = [
  0x60a5fa, 0x4ade80, 0xfbbf24, 0xa78bfa, 0xf87171,
  0x34d399, 0xfb923c, 0x818cf8, 0xf472b6, 0x22d3d8,
  0xa3e635, 0xe879f9, 0xfcd34d, 0x6ee7b7, 0x93c5fd,
];

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function median(arr: number[]) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function percentileAbs(arr: number[], p: number) {
  if (!arr.length) return 1;
  const s = arr.map((v) => Math.abs(v)).sort((a, b) => a - b);
  const idx = clamp(Math.floor((p / 100) * s.length), 0, s.length - 1);
  return s[idx] || 1;
}

function parseColorToHex(color: string): number {
  if (!color) return 0x9aa0a6;
  if (color.startsWith("#")) return parseInt(color.slice(1), 16);
  return 0x9aa0a6;
}

/**
 * IMPORTANT:
 * This renderer assumes `signals` is already WINDOWED (0..timeWindow).
 * It must NOT re-apply global currentTime offsets to the buffer.
 */
function WebGLEEGViewerComponent({
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
}: WebGLEEGViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);

  const gridGroupRef = useRef<THREE.Group | null>(null);
  const waveGroupRef = useRef<THREE.Group | null>(null);
  const markerGroupRef = useRef<THREE.Group | null>(null);

  const labelsRef = useRef<HTMLDivElement | null>(null);
  const artifactLayerRef = useRef<HTMLDivElement | null>(null);

  const rafRef = useRef<number | null>(null);
  const smoothedGainRef = useRef<Map<number, number>>(new Map());

  // selection UI (optional; keep lightweight)
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; tGlobal: number } | null>(null);
  const selectionRef = useRef<HTMLDivElement | null>(null);

  const colors = useMemo(() => (theme === "light" ? THEME.light : THEME.dark), [theme]);

  // Init Three + overlay layers once
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const W = el.clientWidth;
    const H = el.clientHeight;

    // canvas
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;";
    el.appendChild(canvas);
    canvasRef.current = canvas;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(colors.bg, 1);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const cam = new THREE.OrthographicCamera(0, W, H, 0, -100, 100);
    cam.position.z = 10;
    cameraRef.current = cam;

    const gridGroup = new THREE.Group();
    const waveGroup = new THREE.Group();
    const markerGroup = new THREE.Group();
    gridGroupRef.current = gridGroup;
    waveGroupRef.current = waveGroup;
    markerGroupRef.current = markerGroup;

    scene.add(gridGroup);
    scene.add(waveGroup);
    scene.add(markerGroup);

    // artifacts layer (DOM, fast rectangles)
    const art = document.createElement("div");
    art.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:2;";
    el.appendChild(art);
    artifactLayerRef.current = art;

    // labels layer
    const labels = document.createElement("div");
    labels.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:5;";
    el.appendChild(labels);
    labelsRef.current = labels;

    // selection overlay
    const sel = document.createElement("div");
    sel.style.cssText = `position:absolute;top:0;height:100%;display:none;pointer-events:none;z-index:4;
      background: rgba(59,130,246,0.18); border-left:2px solid rgba(59,130,246,0.55); border-right:2px solid rgba(59,130,246,0.55);`;
    el.appendChild(sel);
    selectionRef.current = sel;

    const renderOnce = () => {
      if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    };

    const ro = new ResizeObserver(() => {
      const el2 = containerRef.current;
      const r = rendererRef.current;
      const cam2 = cameraRef.current;
      if (!el2 || !r || !cam2) return;
      const w = el2.clientWidth;
      const h = el2.clientHeight;
      r.setSize(w, h);
      cam2.right = w;
      cam2.top = h;
      cam2.updateProjectionMatrix();
      r.setClearColor(colors.bg, 1);
      renderOnce();
    });
    ro.observe(el);

    renderOnce();

    return () => {
      ro.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      try {
        renderer.dispose();
      } catch {}
      if (canvasRef.current && el.contains(canvasRef.current)) el.removeChild(canvasRef.current);
      if (labelsRef.current && el.contains(labelsRef.current)) el.removeChild(labelsRef.current);
      if (artifactLayerRef.current && el.contains(artifactLayerRef.current)) el.removeChild(artifactLayerRef.current);
      if (selectionRef.current && el.contains(selectionRef.current)) el.removeChild(selectionRef.current);
      canvasRef.current = null;
      labelsRef.current = null;
      artifactLayerRef.current = null;
      selectionRef.current = null;
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      gridGroupRef.current = null;
      waveGroupRef.current = null;
      markerGroupRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requestRender = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;
      rendererRef.current.setClearColor(colors.bg, 1);
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    });
  }, [colors.bg]);

  // Mouse interactions (time click + selection)
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;

      // IMPORTANT: parent wants GLOBAL time; this component is window-local.
      // We treat "global currentTime" as provided by parent in outer page, not used for rendering here.
      // For click, we convert x->local, then caller should add global offset in parent if needed.
      const tLocal = (x / rect.width) * timeWindow;
      const tGlobal = (currentTime || 0) + tLocal;

      setIsDragging(true);
      dragStartRef.current = { x, tGlobal };

      if (selectionRef.current) selectionRef.current.style.display = "none";
      onSelectionChange?.(null);
    },
    [timeWindow, currentTime, onSelectionChange],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging || !dragStartRef.current) return;
      const el = containerRef.current;
      const sel = selectionRef.current;
      if (!el || !sel) return;

      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;

      const left = Math.min(dragStartRef.current.x, x);
      const width = Math.abs(x - dragStartRef.current.x);

      if (width < 5) return;

      sel.style.display = "block";
      sel.style.left = `${left}px`;
      sel.style.width = `${width}px`;
    },
    [isDragging],
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      const el = containerRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;

      const ds = dragStartRef.current;
      dragStartRef.current = null;
      setIsDragging(false);

      if (!ds) return;

      const dist = Math.abs(x - ds.x);
      const tLocal = (x / rect.width) * timeWindow;
      const tGlobal = (currentTime || 0) + tLocal;

      if (dist < 5) {
        if (selectionRef.current) selectionRef.current.style.display = "none";
        onTimeClick?.(tGlobal);
        onSelectionChange?.(null);
        return;
      }

      const a = ds.tGlobal;
      const b = tGlobal;
      const sel = { startTime: Math.min(a, b), endTime: Math.max(a, b) };
      onSelectionChange?.(sel);
    },
    [timeWindow, currentTime, onTimeClick, onSelectionChange],
  );

  const handleMouseLeave = useCallback(() => {
    dragStartRef.current = null;
    setIsDragging(false);
    if (selectionRef.current) selectionRef.current.style.display = "none";
  }, []);

  // Build grid + artifact overlays + markers (cheap; rebuild when layout changes)
  const rebuildLayout = useCallback(() => {
    const el = containerRef.current;
    const grid = gridGroupRef.current;
    const markerGroup = markerGroupRef.current;
    if (!el || !grid || !markerGroup) return;

    const W = el.clientWidth;
    const H = el.clientHeight;

    // clear groups (dispose geometries/materials)
    const disposeGroup = (g: THREE.Group) => {
      g.children.forEach((c) => {
        const o: any = c;
        if (o.geometry) o.geometry.dispose?.();
        if (o.material) o.material.dispose?.();
      });
      g.clear();
    };
    disposeGroup(grid);
    disposeGroup(markerGroup);

    if (labelsRef.current) labelsRef.current.innerHTML = "";
    if (artifactLayerRef.current) artifactLayerRef.current.innerHTML = "";

    // Determine channels to show
    const chs = signals?.length ? [...Array(signals.length).keys()] : [...Array(channelLabels.length).keys()];
    const channelsToRender = Array.from(visibleChannels).sort((a, b) => a - b);
    const useChs = channelsToRender.length ? channelsToRender : chs;

    const PAD = 4;
    const laneH = (H - (useChs.length + 1) * PAD) / Math.max(1, useChs.length);

    // Grid materials
    const matThin = new THREE.LineBasicMaterial({ color: colors.grid, transparent: true, opacity: 0.45 });
    const matStrong = new THREE.LineBasicMaterial({ color: colors.gridStrong, transparent: true, opacity: 0.65 });

    // Vertical grid (seconds; stronger every 5s)
    const step = timeWindow <= 10 ? 1 : timeWindow <= 30 ? 2 : 5;
    for (let s = 0; s <= timeWindow + 1e-6; s += step) {
      const x = (s / timeWindow) * W;
      const isStrong = s % (5 * step) === 0;
      const geom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, 0, 0), new THREE.Vector3(x, H, 0)]);
      grid.add(new THREE.Line(geom, isStrong ? matStrong : matThin));
    }

    // Lane separators
    for (let i = 0; i <= useChs.length; i++) {
      const y = PAD + i * (laneH + PAD);
      const geom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, y, 0), new THREE.Vector3(W, y, 0)]);
      grid.add(new THREE.Line(geom, matThin));
    }

    // Artifact overlays (DOM rectangles, per lane)
    if (artifactLayerRef.current) {
      for (const a of artifactIntervals) {
        const a0 = clamp(a.start_sec, 0, timeWindow);
        const a1 = clamp(a.end_sec, 0, timeWindow);
        if (a1 <= 0 || a0 >= timeWindow || a1 <= a0) continue;

        const x1 = (a0 / timeWindow) * W;
        const x2 = (a1 / timeWindow) * W;

        const affected = a.channel != null ? [a.channel] : useChs;

        for (const chIdx of affected) {
          const lane = useChs.indexOf(chIdx);
          if (lane === -1) continue;

          const top = PAD + lane * (laneH + PAD);

          const div = document.createElement("div");
          div.style.cssText = `
            position:absolute;
            left:${x1}px; top:${top}px;
            width:${Math.max(2, x2 - x1)}px; height:${laneH}px;
            background:${colors.artifactBg};
            border-left:1px solid ${colors.artifactBorder};
            border-right:1px solid ${colors.artifactBorder};
            pointer-events:none;
            box-sizing:border-box;
          `;
          if (!showArtifactsAsRed) {
            // degrade to subtle (still visible)
            div.style.background = theme === "light" ? "rgba(251,191,36,0.12)" : "rgba(251,191,36,0.10)";
            div.style.borderLeftColor = theme === "light" ? "rgba(251,191,36,0.35)" : "rgba(251,191,36,0.28)";
            div.style.borderRightColor = div.style.borderLeftColor;
          }
          artifactLayerRef.current!.appendChild(div);
        }
      }
    }

    // Markers (Three vertical lines) – markers are WINDOW-LOCAL (0..timeWindow)
    const markerColors: Record<string, number> = {
      event: theme === "light" ? 0x2563eb : 0x3b82f6,
      seizure: theme === "light" ? 0xdc2626 : 0xef4444,
      artifact: theme === "light" ? 0xd97706 : 0xf59e0b,
      sleep: theme === "light" ? 0x7c3aed : 0x8b5cf6,
    };

    for (const m of markers) {
      const t = m.timestamp_sec;
      if (t < 0 || t > timeWindow) continue;

      const x = (t / timeWindow) * W;
      const mat = new THREE.LineBasicMaterial({
        color: markerColors[m.marker_type] ?? markerColors.event,
        transparent: true,
        opacity: 0.9,
      });
      const geom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, 0, 0), new THREE.Vector3(x, H, 0)]);
      markerGroup.add(new THREE.Line(geom, mat));
    }

    requestRender();
  }, [artifactIntervals, channelLabels.length, colors, markers, requestRender, showArtifactsAsRed, signals, theme, timeWindow, visibleChannels]);

  // The core fix: alias-free waveform rendering
  const updateWaveforms = useCallback(() => {
    const el = containerRef.current;
    const waveGroup = waveGroupRef.current;
    if (!el || !waveGroup) return;
    if (!signals || signals.length === 0) return;

    const W = el.clientWidth;
    const H = el.clientHeight;

    // clear old lines (dispose)
    waveGroup.children.forEach((c: any) => {
      c.geometry?.dispose?.();
      c.material?.dispose?.();
    });
    waveGroup.clear();

    const channelsToRender = Array.from(visibleChannels).sort((a, b) => a - b);
    const useChs = channelsToRender.length ? channelsToRender : [...Array(signals.length).keys()];

    const PAD = 4;
    const laneH = (H - (useChs.length + 1) * PAD) / Math.max(1, useChs.length);
    const usable = laneH * 0.70; // amount of lane used by trace

    // We render using envelope per pixel column: for each x, min/max samples in that column.
    const pixelCols = clamp(Math.floor(W), 200, 2200);

    for (let lane = 0; lane < useChs.length; lane++) {
      const chIdx = useChs[lane];
      const sig = signals[chIdx];
      if (!sig || sig.length < 2) continue;

      const laneTop = PAD + lane * (laneH + PAD);
      const midY = laneTop + laneH / 2;

      // Robust display scaling: baseline (median) + p95 abs to map into usable height.
      // This is display-only; raw is untouched.
      const base = median(sig);
      const centered = sig.map((v) => v - base);
      const p95 = percentileAbs(centered, 95);
      const autoGain = (usable / 2) / Math.max(p95, 1e-9);

      const prev = smoothedGainRef.current.get(chIdx) ?? autoGain;
      const smooth = prev * 0.85 + autoGain * 0.15;
      smoothedGainRef.current.set(chIdx, smooth);

      const gain = smooth * Math.max(1e-6, amplitudeScale);

      // Color
      let col: number;
      if (channelColors[chIdx]) {
        col = parseColorToHex(channelColors[chIdx]);
      } else {
        const label = channelLabels[chIdx] || `Ch${chIdx + 1}`;
        const info = getChannelColor(label);
        const g = (info.label?.toLowerCase?.() || "other") as ChannelGroup;
        col =
          CHANNEL_THEME_COLORS[g]?.[theme === "light" ? "light" : "dark"] ??
          FALLBACK_PALETTE[chIdx % FALLBACK_PALETTE.length];
      }

      const mat = new THREE.LineBasicMaterial({
        color: col,
        transparent: true,
        opacity: 0.95,
      });

      // Envelope
      const n = centered.length;
      const spp = n / pixelCols;

      const pts: THREE.Vector3[] = [];
      for (let px = 0; px < pixelCols; px++) {
        const s0 = Math.floor(px * spp);
        const s1 = Math.min(n, Math.ceil((px + 1) * spp));
        let mn = Infinity;
        let mx = -Infinity;
        for (let i = s0; i < s1; i++) {
          const v = centered[i];
          if (v < mn) mn = v;
          if (v > mx) mx = v;
        }
        if (!Number.isFinite(mn) || !Number.isFinite(mx)) continue;

        const x = (px / (pixelCols - 1)) * W;

        const y1 = midY - clamp(mx * gain, -laneH * 0.49, laneH * 0.49);
        const y2 = midY - clamp(mn * gain, -laneH * 0.49, laneH * 0.49);

        // Draw as vertical segment (envelope), alternating to keep continuity visually
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
        const line = new THREE.Line(geom, mat);
        waveGroup.add(line);
      }

      // Channel label (DOM, stable)
      if (labelsRef.current) {
        const label = channelLabels[chIdx] || `Ch${chIdx + 1}`;
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
  }, [amplitudeScale, channelColors, channelLabels, colors.text, requestRender, signals, theme, visibleChannels]);

  // Rebuild layout when major layout inputs change
  useEffect(() => {
    rebuildLayout();
  }, [rebuildLayout]);

  // Update waveforms when signals or scaling changes
  useEffect(() => {
    updateWaveforms();
  }, [updateWaveforms]);

  // Theme background update
  useEffect(() => {
    if (rendererRef.current) rendererRef.current.setClearColor(colors.bg, 1);
    requestRender();
  }, [colors.bg, requestRender]);

  // sanity: this component should not depend on global time for windowed buffers
  useEffect(() => {
    void sampleRate;
    void currentTime;
  }, [sampleRate, currentTime]);

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
