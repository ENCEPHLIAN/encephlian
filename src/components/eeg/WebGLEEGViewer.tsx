import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { getChannelColor, ChannelGroup } from "@/lib/eeg/channel-groups";

interface Marker {
  id: string;
  timestamp_sec: number; // local window time (0..timeWindow)
  marker_type: string;
  label?: string;
}

interface ArtifactInterval {
  start_sec: number; // local window time
  end_sec: number;   // local window time
  label?: string;
  channel?: number;
}

interface Selection {
  startTime: number;
  endTime: number;
}

interface WebGLEEGViewerProps {
  signals: number[][] | null; // WINDOWED buffer: signals[ch][i] for i in [0..windowSamples)
  channelLabels: string[];
  sampleRate: number;
  currentTime: number; // MUST be 0 for windowed buffer
  timeWindow: number;
  amplitudeScale: number;
  visibleChannels: Set<number>;
  theme: string;
  markers?: Marker[];
  artifactIntervals?: ArtifactInterval[];
  channelColors?: string[];
  showArtifactsAsRed?: boolean;
  onTimeClick?: (time: number) => void; // local window time
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

function parseColorToHex(color: string): number {
  if (color.startsWith("#")) return parseInt(color.slice(1), 16);
  return 0x808080;
}

function percentileAbs(arr: number[], p: number): number {
  if (!arr.length) return 1;
  const absVals = new Array(arr.length);
  for (let i = 0; i < arr.length; i++) absVals[i] = Math.abs(arr[i]);
  absVals.sort((a, b) => a - b);
  const idx = Math.min(Math.floor((p / 100) * absVals.length), absVals.length - 1);
  return absVals[idx] || 1;
}

// Min/max envelope positions for alias-resistant rendering.
// Returns Float32Array of xyz positions in screen space.
function buildEnvelopePositions(
  buf: number[],
  widthPx: number,
  baselineY: number,
  laneHalf: number,
  gain: number
): Float32Array {
  const pixelCount = Math.min(widthPx, 2000);
  const samplesPerPixel = buf.length / pixelCount;

  // envelope: 2 points per pixel (min/max)
  const out = new Float32Array(pixelCount * 2 * 3);
  let k = 0;

  for (let px = 0; px < pixelCount; px++) {
    const s0 = Math.floor(px * samplesPerPixel);
    const s1 = Math.min(Math.ceil((px + 1) * samplesPerPixel), buf.length);

    let minV = Infinity;
    let maxV = -Infinity;

    for (let s = s0; s < s1; s++) {
      const v = buf[s];
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
    if (minV === Infinity) {
      minV = 0;
      maxV = 0;
    }

    const x = (px / (pixelCount - 1)) * widthPx;

    const scaledMin = Math.max(-laneHalf, Math.min(laneHalf, minV * gain));
    const scaledMax = Math.max(-laneHalf, Math.min(laneHalf, maxV * gain));

    // two points at same x: top then bottom (creates vertical segments)
    out[k++] = x; out[k++] = baselineY - scaledMax; out[k++] = 0;
    out[k++] = x; out[k++] = baselineY - scaledMin; out[k++] = 0;
  }

  return out;
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
  channelColors = [],
  showArtifactsAsRed = true,
  onTimeClick,
  onSelectionChange,
}: WebGLEEGViewerProps) {
  const colors = useMemo(() => (theme === "light" ? THEME_COLORS.light : THEME_COLORS.dark), [theme]);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);

  const gridGroupRef = useRef<THREE.Group | null>(null);
  const lineGroupRef = useRef<THREE.Group | null>(null);

  const labelsRef = useRef<HTMLDivElement | null>(null);
  const artifactOverlaysRef = useRef<HTMLDivElement | null>(null);
  const selectionRef = useRef<HTMLDivElement | null>(null);

  const animationFrameRef = useRef<number | null>(null);

  // reusable per-channel objects
  const channelLineRef = useRef<Map<number, THREE.Line>>(new Map());
  const channelGeomRef = useRef<Map<number, THREE.BufferGeometry>>(new Map());

  // selection state
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; time: number } | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);

  // Deterministic channel order
  const channelsToRender = useMemo(() => {
    const arr = Array.from(visibleChannels);
    arr.sort((a, b) => a - b);
    return arr;
  }, [visibleChannels]);

  const requestRender = useCallback(() => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;
    if (animationFrameRef.current != null) cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = requestAnimationFrame(() => {
      rendererRef.current!.render(sceneRef.current!, cameraRef.current!);
    });
  }, []);

  // init three + dom overlays
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const W = el.clientWidth;
    const H = el.clientHeight;

    // canvas
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute; inset:0; width:100%; height:100%;";
    el.appendChild(canvas);
    canvasRef.current = canvas;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(colors.background);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.OrthographicCamera(0, W, H, 0, 0.1, 1000);
    camera.position.z = 10;
    cameraRef.current = camera;

    const gridGroup = new THREE.Group();
    gridGroupRef.current = gridGroup;
    scene.add(gridGroup);

    const lineGroup = new THREE.Group();
    lineGroupRef.current = lineGroup;
    scene.add(lineGroup);

    // artifact overlay layer
    const artifactDiv = document.createElement("div");
    artifactDiv.style.cssText = "position:absolute; inset:0; pointer-events:none; overflow:hidden; z-index:2;";
    el.appendChild(artifactDiv);
    artifactOverlaysRef.current = artifactDiv;

    // labels layer
    const labelsDiv = document.createElement("div");
    labelsDiv.style.cssText = "position:absolute; inset:0; pointer-events:none; overflow:hidden; z-index:10;";
    el.appendChild(labelsDiv);
    labelsRef.current = labelsDiv;

    // selection overlay
    const selDiv = document.createElement("div");
    selDiv.style.cssText = `
      position:absolute; top:0; height:100%; display:none; z-index:5; pointer-events:none;
      background:${colors.selection}; border-left:2px solid ${colors.selectionBorder};
      border-right:2px solid ${colors.selectionBorder};
    `;
    el.appendChild(selDiv);
    selectionRef.current = selDiv;

    // resize
    const handleResize = () => {
      const el2 = containerRef.current;
      if (!el2 || !rendererRef.current || !cameraRef.current) return;
      const w = el2.clientWidth;
      const h = el2.clientHeight;
      rendererRef.current.setSize(w, h);
      cameraRef.current.right = w;
      cameraRef.current.top = h;
      cameraRef.current.updateProjectionMatrix();
      requestRender();
    };

    const ro = new ResizeObserver(handleResize);
    ro.observe(el);

    requestRender();

    return () => {
      ro.disconnect();
      renderer.dispose();

      if (canvasRef.current && el.contains(canvasRef.current)) el.removeChild(canvasRef.current);
      if (labelsRef.current && el.contains(labelsRef.current)) el.removeChild(labelsRef.current);
      if (artifactOverlaysRef.current && el.contains(artifactOverlaysRef.current)) el.removeChild(artifactOverlaysRef.current);
      if (selectionRef.current && el.contains(selectionRef.current)) el.removeChild(selectionRef.current);

      channelLineRef.current.clear();
      channelGeomRef.current.clear();
    };
  }, [colors.background, colors.selection, colors.selectionBorder, requestRender]);

  // theme clear color
  useEffect(() => {
    if (rendererRef.current) rendererRef.current.setClearColor(colors.background);
    requestRender();
  }, [colors.background, requestRender]);

  // mouse handlers (local window time)
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const t = (x / rect.width) * timeWindow;

      setIsDragging(true);
      setDragStart({ x, time: t });
      setSelection(null);
      if (selectionRef.current) selectionRef.current.style.display = "none";
    },
    [timeWindow]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging || !dragStart) return;
      const el = containerRef.current;
      if (!el || !selectionRef.current) return;

      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const t = (x / rect.width) * timeWindow;

      const left = Math.min(dragStart.x, x);
      const width = Math.abs(x - dragStart.x);

      if (width > 5) {
        selectionRef.current.style.display = "block";
        selectionRef.current.style.left = `${left}px`;
        selectionRef.current.style.width = `${width}px`;

        setSelection({
          startTime: Math.min(dragStart.time, t),
          endTime: Math.max(dragStart.time, t),
        });
      }
    },
    [isDragging, dragStart, timeWindow]
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      const el = containerRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;

      if (isDragging && dragStart) {
        const dist = Math.abs(x - dragStart.x);
        if (dist < 5) {
          const t = (x / rect.width) * timeWindow;
          onTimeClick?.(t);
          if (selectionRef.current) selectionRef.current.style.display = "none";
          setSelection(null);
        } else {
          if (selection) onSelectionChange?.(selection);
        }
      }

      setIsDragging(false);
      setDragStart(null);
    },
    [isDragging, dragStart, timeWindow, selection, onTimeClick, onSelectionChange]
  );

  const handleMouseLeave = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      setDragStart(null);
    }
  }, [isDragging]);

  // grid (rebuild only when layout/timeWindow changes)
  const rebuildGrid = useCallback(() => {
    const el = containerRef.current;
    const gridGroup = gridGroupRef.current;
    if (!el || !gridGroup) return;

    // clear grid children except marker lines (we rebuild markers separately)
    const keep: THREE.Object3D[] = [];
    for (const child of gridGroup.children) {
      if (child.name === "marker-line") keep.push(child);
      else {
        const line = child as THREE.Line;
        (line.geometry as THREE.BufferGeometry).dispose();
        (line.material as THREE.Material).dispose();
      }
    }
    gridGroup.clear();
    for (const child of keep) gridGroup.add(child);

    const W = el.clientWidth;
    const H = el.clientHeight;

    const gridMat = new THREE.LineBasicMaterial({ color: colors.grid, transparent: true, opacity: 0.5 });
    const gridStrongMat = new THREE.LineBasicMaterial({ color: colors.gridStrong, transparent: true, opacity: 0.7 });

    // vertical seconds grid (local window)
    const interval = timeWindow <= 10 ? 1 : timeWindow <= 30 ? 5 : 10;
    for (let i = 0; i <= timeWindow; i += interval) {
      const x = (i / timeWindow) * W;
      const geom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, 0, 0), new THREE.Vector3(x, H, 0)]);
      const mat = i % (interval * 5) === 0 ? gridStrongMat : gridMat;
      gridGroup.add(new THREE.Line(geom, mat));
    }

    // horizontal lane separators
    const pad = 4;
    const n = Math.max(1, channelsToRender.length || 1);
    const laneH = (H - (n + 1) * pad) / n;
    for (let i = 0; i <= n; i++) {
      const y = pad + i * (laneH + pad);
      const geom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, y, 0), new THREE.Vector3(W, y, 0)]);
      gridGroup.add(new THREE.Line(geom, gridMat));
    }

    requestRender();
  }, [channelsToRender.length, colors.grid, colors.gridStrong, requestRender, timeWindow]);

  // artifacts overlay (DOM) – rebuild when artifactIntervals or layout changes
  const rebuildArtifactsOverlay = useCallback(() => {
    const el = containerRef.current;
    const root = artifactOverlaysRef.current;
    if (!el || !root) return;

    root.innerHTML = "";
    if (!artifactIntervals || artifactIntervals.length === 0) return;

    const W = el.clientWidth;
    const H = el.clientHeight;

    const pad = 4;
    const n = Math.max(1, channelsToRender.length || 1);
    const laneH = (H - (n + 1) * pad) / n;

    const bg = colors.artifactBgRed;
    const border = colors.artifactBorderRed;

    for (const a of artifactIntervals) {
      const s = Math.max(0, a.start_sec);
      const e = Math.min(timeWindow, a.end_sec);
      if (e <= 0 || s >= timeWindow) continue;

      const x1 = (s / timeWindow) * W;
      const x2 = (e / timeWindow) * W;

      const affected = a.channel != null ? [a.channel] : channelsToRender;

      for (const chIdx of affected) {
        const lane = channelsToRender.indexOf(chIdx);
        if (lane === -1) continue;

        const top = pad + lane * (laneH + pad);
        const div = document.createElement("div");
        div.style.cssText = `
          position:absolute; left:${x1}px; top:${top}px; width:${Math.max(2, x2 - x1)}px; height:${laneH}px;
          background:${bg}; border-left:1px solid ${border}; border-right:1px solid ${border};
          box-sizing:border-box; pointer-events:none;
        `;
        root.appendChild(div);
      }
    }
  }, [artifactIntervals, channelsToRender, colors.artifactBgRed, colors.artifactBorderRed, timeWindow]);

  // labels (DOM) – rebuild when layout/theme/channel list changes
  const rebuildLabels = useCallback(() => {
    const el = containerRef.current;
    const root = labelsRef.current;
    if (!el || !root) return;

    root.innerHTML = "";

    const W = el.clientWidth;
    const H = el.clientHeight;

    const pad = 4;
    const n = Math.max(1, channelsToRender.length || 1);
    const laneH = (H - (n + 1) * pad) / n;

    // channel labels
    for (let lane = 0; lane < channelsToRender.length; lane++) {
      const chIdx = channelsToRender[lane];
      const top = pad + lane * (laneH + pad);
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

      const div = document.createElement("div");
      div.style.cssText = `
        position:absolute; left:8px; top:${top + 6}px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size:10px; font-weight:600; color:${colors.text};
        background:${theme === "light" ? "rgba(250,250,250,0.85)" : "rgba(10,10,10,0.85)"};
        padding:2px 6px; border-radius:6px;
        border-left:3px solid #${colorHex.toString(16).padStart(6, "0")};
        pointer-events:none; white-space:nowrap;
      `;
      div.textContent = label;
      root.appendChild(div);
    }

    // time labels along bottom
    const interval = timeWindow <= 10 ? 1 : timeWindow <= 30 ? 5 : 10;
    for (let i = 0; i <= timeWindow; i += interval) {
      const x = (i / timeWindow) * W;
      const div = document.createElement("div");
      div.style.cssText = `
        position:absolute; left:${x + 2}px; bottom:4px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size:9px; color:${colors.textMuted};
        background:${theme === "light" ? "rgba(250,250,250,0.7)" : "rgba(10,10,10,0.7)"};
        padding:1px 3px; border-radius:4px;
        pointer-events:none;
      `;
      div.textContent = `${i}s`;
      root.appendChild(div);
    }

    // marker labels at top
    for (const m of markers) {
      if (m.timestamp_sec < 0 || m.timestamp_sec > timeWindow) continue;
      const x = (m.timestamp_sec / timeWindow) * W;
      const div = document.createElement("div");
      div.style.cssText = `
        position:absolute; left:${Math.min(W - 120, x + 4)}px; top:4px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size:10px; font-weight:600;
        color:${colors.text};
        background:${theme === "light" ? "rgba(250,250,250,0.85)" : "rgba(10,10,10,0.85)"};
        padding:2px 6px; border-radius:6px;
        border:1px solid ${theme === "light" ? "rgba(17,24,39,0.25)" : "rgba(229,231,235,0.25)"};
        pointer-events:none; white-space:nowrap;
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
    markers,
    theme,
    timeWindow,
  ]);

  // waveforms (core): reuse geometries, robust gain so raw is visible
  const updateWaveforms = useCallback(() => {
    const el = containerRef.current;
    const lineGroup = lineGroupRef.current;
    if (!el || !lineGroup) return;

    if (!signals || signals.length === 0) return;
    if (channelsToRender.length === 0) return;

    const W = el.clientWidth;
    const H = el.clientHeight;

    const pad = 4;
    const n = channelsToRender.length;
    const laneH = (H - (n + 1) * pad) / n;
    const laneHalf = laneH * 0.46;

    // prune removed channels
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

    for (let lane = 0; lane < channelsToRender.length; lane++) {
      const chIdx = channelsToRender[lane];
      const buf = signals[chIdx];
      if (!buf || buf.length === 0) continue;

      const top = pad + lane * (laneH + pad);
      const baselineY = top + laneH / 2;

      // Robust lane-scaled gain (p95 abs)
      const p95 = percentileAbs(buf, 95);
      const gain = ((laneHalf * 0.9) / Math.max(p95, 1e-9)) * Math.max(0.05, amplitudeScale);

      const pos = buildEnvelopePositions(buf, W, baselineY, laneHalf, gain);

      // color
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

      let line = channelLineRef.current.get(chIdx);
      let geom = channelGeomRef.current.get(chIdx);

      if (!line || !geom) {
        geom = new THREE.BufferGeometry();
        geom.setAttribute("position", new THREE.BufferAttribute(pos, 3));

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
        const attr = geom.getAttribute("position") as THREE.BufferAttribute;
        if (!attr || attr.array.length !== pos.length) {
          geom.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        } else {
          (attr.array as Float32Array).set(pos);
          attr.needsUpdate = true;
        }

        const mat = line.material as THREE.LineBasicMaterial;
        if (mat.color.getHex() !== colorHex) mat.color.setHex(colorHex);
      }
    }

    requestRender();
  }, [signals, channelsToRender, channelColors, channelLabels, amplitudeScale, theme, requestRender]);

  // markers as three.js vertical lines
  const updateMarkers = useCallback(() => {
    const el = containerRef.current;
    const gridGroup = gridGroupRef.current;
    if (!el || !gridGroup) return;

    // remove old marker lines
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
  }, [markers, timeWindow, theme, requestRender]);

  // rebuild layout-only bits (not on every signal tick)
  useEffect(() => {
    rebuildGrid();
    rebuildArtifactsOverlay();
    rebuildLabels();
    updateMarkers();
    requestRender();
  }, [rebuildGrid, rebuildArtifactsOverlay, rebuildLabels, updateMarkers, requestRender]);

  // update waveforms when signals change
  useEffect(() => {
    updateWaveforms();
  }, [updateWaveforms]);

  // sanity: currentTime should be 0 for windowed buffers
  useEffect(() => {
    // If someone passes global time accidentally, it won’t break rendering, but we make intent explicit.
    // We purposely do NOT slice by currentTime in this component.
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
