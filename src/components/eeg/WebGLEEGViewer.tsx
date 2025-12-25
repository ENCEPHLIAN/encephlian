import { useEffect, useRef, useCallback, memo, useState, useMemo } from "react";
import * as THREE from "three";

interface Marker {
  id: string;
  timestamp_sec: number; // WINDOW-LOCAL seconds [0..timeWindow]
  marker_type: string;
  label?: string;
}

interface ArtifactInterval {
  start_sec: number; // WINDOW-LOCAL seconds [0..timeWindow]
  end_sec: number;   // WINDOW-LOCAL seconds [0..timeWindow]
  label?: string;
  channel?: number;  // canonical channel index (after reorder), or null for all
}

interface Selection {
  startTime: number;
  endTime: number;
}

interface WebGLEEGViewerProps {
  signals: number[][] | null;      // [channel][sample] WINDOWED BUFFER ONLY
  channelLabels: string[];
  sampleRate: number;
  currentTime: number;             // MUST BE 0 for windowed buffers (ignored)
  timeWindow: number;
  amplitudeScale: number;          // raw multiplier only
  visibleChannels: Set<number>;
  theme: string;
  markers?: Marker[];
  artifactIntervals?: ArtifactInterval[];
  showArtifactsAsRed?: boolean;
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
    selection: "rgba(59, 130, 246, 0.2)",
    selectionBorder: "rgba(59, 130, 246, 0.6)",
    artifactBgRed: "rgba(239, 68, 68, 0.18)",
    artifactBorderRed: "rgba(239, 68, 68, 0.6)",
  },
  light: {
    background: 0xfafafa,
    grid: 0xf0f0f0,
    gridStrong: 0xe0e0e0,
    text: "#171717",
    textMuted: "#525252",
    selection: "rgba(59, 130, 246, 0.15)",
    selectionBorder: "rgba(59, 130, 246, 0.5)",
    artifactBgRed: "rgba(239, 68, 68, 0.2)",
    artifactBorderRed: "rgba(239, 68, 68, 0.7)",
  },
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

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
  showArtifactsAsRed = true,
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

  const labelsRef = useRef<HTMLDivElement | null>(null);
  const artifactOverlaysRef = useRef<HTMLDivElement | null>(null);
  const selectionRef = useRef<HTMLDivElement | null>(null);

  const rafRef = useRef<number | null>(null);

  // selection UI
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; time: number } | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);

  const colors = useMemo(() => (theme === "light" ? THEME_COLORS.light : THEME_COLORS.dark), [theme]);

  const requestRender = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    });
  }, []);

  // init three
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;";
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
    renderer.setClearColor(colors.background);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.OrthographicCamera(0, width, height, 0, 0.1, 1000);
    camera.position.z = 10;
    cameraRef.current = camera;

    const gridGroup = new THREE.Group();
    gridGroupRef.current = gridGroup;
    scene.add(gridGroup);

    const waveGroup = new THREE.Group();
    waveGroupRef.current = waveGroup;
    scene.add(waveGroup);

    // overlays (DOM)
    const artifactDiv = document.createElement("div");
    artifactDiv.style.cssText = `position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:2;overflow:hidden;`;
    container.appendChild(artifactDiv);
    artifactOverlaysRef.current = artifactDiv;

    const labelsDiv = document.createElement("div");
    labelsDiv.style.cssText = `position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:10;overflow:hidden;`;
    container.appendChild(labelsDiv);
    labelsRef.current = labelsDiv;

    const selectionDiv = document.createElement("div");
    selectionDiv.style.cssText = `
      position:absolute;top:0;height:100%;pointer-events:none;display:none;z-index:5;
      background:${colors.selection}; border-left:2px solid ${colors.selectionBorder}; border-right:2px solid ${colors.selectionBorder};
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
      requestRender();
    };

    const ro = new ResizeObserver(handleResize);
    ro.observe(container);

    return () => {
      ro.disconnect();
      renderer.dispose();
      if (canvasRef.current && container.contains(canvasRef.current)) container.removeChild(canvasRef.current);
      if (labelsRef.current && container.contains(labelsRef.current)) container.removeChild(labelsRef.current);
      if (artifactOverlaysRef.current && container.contains(artifactOverlaysRef.current)) container.removeChild(artifactOverlaysRef.current);
      if (selectionRef.current && container.contains(selectionRef.current)) container.removeChild(selectionRef.current);
      waveGroup.clear();
      gridGroup.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // theme change
  useEffect(() => {
    if (rendererRef.current) rendererRef.current.setClearColor(colors.background);
    requestRender();
  }, [colors.background, requestRender]);

  // mouse selection (window-local time)
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const timeAtClick = (x / rect.width) * timeWindow;

      setIsDragging(true);
      setDragStart({ x, time: timeAtClick });
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
      const timeAtMouse = (x / rect.width) * timeWindow;

      const left = Math.min(dragStart.x, x);
      const w = Math.abs(x - dragStart.x);

      if (w > 5) {
        selectionRef.current.style.display = "block";
        selectionRef.current.style.left = `${left}px`;
        selectionRef.current.style.width = `${w}px`;
        setSelection({ startTime: Math.min(dragStart.time, timeAtMouse), endTime: Math.max(dragStart.time, timeAtMouse) });
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
        const dist = Math.abs(x - dragStart.x);
        if (dist < 5) {
          const t = (x / rect.width) * timeWindow;
          onTimeClick?.(t);
          if (selectionRef.current) selectionRef.current.style.display = "none";
          setSelection(null);
        } else if (selection) {
          onSelectionChange?.(selection);
        }
      }
      setIsDragging(false);
      setDragStart(null);
    },
    [isDragging, dragStart, timeWindow, selection, onTimeClick, onSelectionChange],
  );

  const handleMouseLeave = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      setDragStart(null);
    }
  }, [isDragging]);

  // build grid + labels + artifact overlays + markers (layout level)
  const rebuildLayout = useCallback(() => {
    const el = containerRef.current;
    const gridGroup = gridGroupRef.current;
    const waveGroup = waveGroupRef.current;
    if (!el || !gridGroup || !waveGroup) return;

    const W = el.clientWidth;
    const H = el.clientHeight;

    // clear grid
    gridGroup.clear();

    // clear DOM overlays
    if (labelsRef.current) labelsRef.current.innerHTML = "";
    if (artifactOverlaysRef.current) artifactOverlaysRef.current.innerHTML = "";

    // choose channels
    const nCh = signals?.length ?? 0;
    const channelsToRender = Array.from(visibleChannels).sort((a, b) => a - b);
    const chs = channelsToRender.length ? channelsToRender : [...Array(nCh).keys()];
    const n = chs.length || 1;

    const PAD = 4;
    const laneH = (H - (n + 1) * PAD) / n;

    // grid materials
    const gridMat = new THREE.LineBasicMaterial({ color: colors.grid, transparent: true, opacity: 0.5 });
    const gridStrongMat = new THREE.LineBasicMaterial({ color: colors.gridStrong, transparent: true, opacity: 0.7 });

    // vertical grid (1s lines; strong every 5s)
    const seconds = Math.max(1, Math.floor(timeWindow));
    for (let i = 0; i <= seconds; i++) {
      const x = (i / timeWindow) * W;
      const geom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, 0, 0), new THREE.Vector3(x, H, 0)]);
      const line = new THREE.Line(geom, i % 5 === 0 ? gridStrongMat : gridMat);
      gridGroup.add(line);
    }

    // lane separators
    for (let i = 0; i <= n; i++) {
      const y = PAD + i * (laneH + PAD);
      const geom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, y, 0), new THREE.Vector3(W, y, 0)]);
      const line = new THREE.Line(geom, gridMat);
      gridGroup.add(line);
    }

    // labels
    if (labelsRef.current && signals) {
      for (let i = 0; i < chs.length; i++) {
        const chIdx = chs[i];
        const laneTop = PAD + i * (laneH + PAD);
        const label = channelLabels[chIdx] ?? `Ch${chIdx + 1}`;
        const elLab = document.createElement("div");
        elLab.style.cssText = `
          position:absolute; left:8px; top:${laneTop + 2}px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 10px; font-weight: 600;
          color:${colors.text};
          background:${theme === "light" ? "rgba(250,250,250,0.85)" : "rgba(10,10,10,0.85)"};
          padding:2px 6px; border-radius:3px;
        `;
        elLab.textContent = label;
        labelsRef.current.appendChild(elLab);
      }
    }

    // artifacts overlays (DOM, red)
    if (artifactOverlaysRef.current && signals) {
      for (const a of artifactIntervals) {
        const s = clamp(a.start_sec, 0, timeWindow);
        const e = clamp(a.end_sec, 0, timeWindow);
        if (e <= s) continue;

        const x1 = (s / timeWindow) * W;
        const x2 = (e / timeWindow) * W;
        const affected = a.channel != null ? [a.channel] : chs;

        for (const chIdx of affected) {
          const displayIndex = chs.indexOf(chIdx);
          if (displayIndex === -1) continue;

          const laneTop = PAD + displayIndex * (laneH + PAD);
          const overlay = document.createElement("div");
          overlay.style.cssText = `
            position:absolute;
            left:${x1}px; top:${laneTop}px; width:${Math.max(2, x2 - x1)}px; height:${laneH}px;
            background:${colors.artifactBgRed};
            border-left: 1px solid ${colors.artifactBorderRed};
            border-right: 1px solid ${colors.artifactBorderRed};
            pointer-events:none;
            box-sizing:border-box;
          `;
          artifactOverlaysRef.current.appendChild(overlay);
        }
      }
    }

    // markers (three lines)
    const colorMap: Record<string, number> = {
      event: theme === "light" ? 0x2563eb : 0x3b82f6,
      seizure: theme === "light" ? 0xdc2626 : 0xef4444,
      artifact: theme === "light" ? 0xd97706 : 0xf59e0b,
      sleep: theme === "light" ? 0x7c3aed : 0x8b5cf6,
    };

    for (const m of markers) {
      const local = m.timestamp_sec;
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
  }, [signals, visibleChannels, channelLabels, artifactIntervals, markers, theme, timeWindow, colors, requestRender]);

  // update waveforms only when signals/amplitude changes
  const updateWaveforms = useCallback(() => {
    const el = containerRef.current;
    const waveGroup = waveGroupRef.current;
    if (!el || !waveGroup) return;
    if (!signals || signals.length === 0) return;

    const W = el.clientWidth;
    const H = el.clientHeight;

    // clear old waves
    waveGroup.clear();

    const channelsToRender = Array.from(visibleChannels).sort((a, b) => a - b);
    const chs = channelsToRender.length ? channelsToRender : [...Array(signals.length).keys()];

    const PAD = 4;
    const laneH = (H - (chs.length + 1) * PAD) / (chs.length || 1);

    // Render parameters
    const MAX_POINTS = 2000; // per channel cap for performance
    const mat = new THREE.LineBasicMaterial({ color: theme === "light" ? 0x111111 : 0xe5e5e5, transparent: true, opacity: 0.95 });

    for (let lane = 0; lane < chs.length; lane++) {
      const chIdx = chs[lane];
      const sig = signals[chIdx];
      if (!sig || sig.length === 0) continue;

      const laneTop = PAD + lane * (laneH + PAD);
      const midY = laneTop + laneH / 2;

      // window buffer is exactly timeWindow seconds (or close). map samples to x
      const nSamp = sig.length;
      const step = Math.max(1, Math.floor(nSamp / MAX_POINTS));

      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < nSamp; i += step) {
        const x = (i / (nSamp - 1)) * W;
        const y = midY - sig[i] * amplitudeScale;
        pts.push(new THREE.Vector3(x, y, 0));
      }

      if (pts.length > 1) {
        const geom = new THREE.BufferGeometry().setFromPoints(pts);
        const line = new THREE.Line(geom, mat);
        waveGroup.add(line);
      }
    }

    requestRender();
  }, [signals, visibleChannels, amplitudeScale, theme, requestRender]);

  // rebuild layout bits when these change
  useEffect(() => {
    rebuildLayout();
  }, [rebuildLayout]);

  // update waveforms when signals/amplitude changes
  useEffect(() => {
    updateWaveforms();
  }, [updateWaveforms]);

  // sanity: currentTime should be 0 for windowed buffers
  useEffect(() => {
    void sampleRate;
    void currentTime;
  }, [sampleRate, currentTime]);

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
