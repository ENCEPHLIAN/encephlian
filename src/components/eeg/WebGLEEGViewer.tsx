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
  onSelectionChange?: (selection: Selection | null) => void;
}

// Color palette for dark and light themes
const THEME_COLORS = {
  dark: {
    background: 0x0a0a0a,
    grid: 0x1a1a1a,
    gridStrong: 0x262626,
    text: "#e5e5e5",
    textMuted: "#737373",
    selection: "rgba(59, 130, 246, 0.2)",
    selectionBorder: "rgba(59, 130, 246, 0.6)",
    artifactBg: "rgba(251, 191, 36, 0.12)",
    artifactBgRed: "rgba(239, 68, 68, 0.18)",
    artifactBorder: "rgba(251, 191, 36, 0.4)",
    artifactBorderRed: "rgba(239, 68, 68, 0.5)",
  },
  light: {
    background: 0xfafafa,
    grid: 0xf0f0f0,
    gridStrong: 0xe0e0e0,
    text: "#171717",
    textMuted: "#525252",
    selection: "rgba(59, 130, 246, 0.15)",
    selectionBorder: "rgba(59, 130, 246, 0.5)",
    artifactBg: "rgba(251, 191, 36, 0.15)",
    artifactBgRed: "rgba(239, 68, 68, 0.2)",
    artifactBorder: "rgba(251, 191, 36, 0.5)",
    artifactBorderRed: "rgba(239, 68, 68, 0.6)",
  },
};

// Default channel colors
const DEFAULT_CHANNEL_PALETTE = [
  0x60a5fa, 0x4ade80, 0xfbbf24, 0xa78bfa, 0xf87171,
  0x34d399, 0xfb923c, 0x818cf8, 0xf472b6, 0x22d3d8,
  0xa3e635, 0xe879f9, 0xfcd34d, 0x6ee7b7, 0x93c5fd,
  0xc084fc, 0xfdba74, 0x86efac, 0xfca5a5, 0x67e8f9,
];

// Enhanced channel colors with better contrast
const CHANNEL_THEME_COLORS: Record<ChannelGroup, { dark: number; light: number }> = {
  frontal: { dark: 0x60a5fa, light: 0x2563eb },
  central: { dark: 0x4ade80, light: 0x16a34a },
  temporal: { dark: 0xfbbf24, light: 0xd97706 },
  occipital: { dark: 0xa78bfa, light: 0x7c3aed },
  other: { dark: 0x94a3b8, light: 0x64748b },
};

/* ============================================
   CLINICAL-GRADE SIGNAL PROCESSING UTILITIES
   ============================================ */

/** Compute median of an array (non-destructive) */
function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Compute percentile (0-100) of absolute values */
function percentileAbs(arr: number[], p: number): number {
  if (arr.length === 0) return 1;
  const absVals = arr.map(Math.abs).sort((a, b) => a - b);
  const idx = Math.min(Math.floor((p / 100) * absVals.length), absVals.length - 1);
  return absVals[idx] || 1;
}

/** Compute MAD (Median Absolute Deviation) - robust scale estimator */
function mad(arr: number[], baseline: number): number {
  if (arr.length === 0) return 1;
  const deviations = arr.map(v => Math.abs(v - baseline));
  return median(deviations) || 1;
}

/** Parse hex color string to number */
function parseColorToHex(color: string): number {
  if (color.startsWith("#")) {
    return parseInt(color.slice(1), 16);
  }
  return 0x808080;
}

/** Butterworth-style IIR bandpass filter (simplified) */
function applyBandpassFilter(
  signal: number[],
  sampleRate: number,
  lowCut: number = 0.5,
  highCut: number = 40
): number[] {
  const n = signal.length;
  if (n < 4) return [...signal];

  const alpha = 1 / (1 + (2 * Math.PI * lowCut) / sampleRate);
  const highPassed = new Array(n);
  highPassed[0] = signal[0];
  for (let i = 1; i < n; i++) {
    highPassed[i] = alpha * (highPassed[i - 1] + signal[i] - signal[i - 1]);
  }

  const beta = (2 * Math.PI * highCut) / sampleRate / (1 + (2 * Math.PI * highCut) / sampleRate);
  const filtered = new Array(n);
  filtered[0] = highPassed[0];
  for (let i = 1; i < n; i++) {
    filtered[i] = filtered[i - 1] + beta * (highPassed[i] - filtered[i - 1]);
  }

  return filtered;
}

/* ============================================
   COMPONENT
   ============================================ */

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
  showArtifactsAsRed = false,
  onTimeClick,
  onSelectionChange,
}: WebGLEEGViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const linesRef = useRef<Map<number, THREE.Line>>(new Map());
  const gridLinesRef = useRef<THREE.Line[]>([]);
  const labelsRef = useRef<HTMLDivElement | null>(null);
  const artifactOverlaysRef = useRef<HTMLDivElement | null>(null);
  const selectionRef = useRef<HTMLDivElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Auto-gain smoothing state
  const smoothedGainsRef = useRef<Map<number, number>>(new Map());

  // Selection state
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; time: number } | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);

  // Memoize colors
  const colors = useMemo(() => 
    theme === "dark" ? THEME_COLORS.dark : THEME_COLORS.light,
    [theme]
  );

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Create canvas
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position: absolute; top: 0; left: 0; width: 100%; height: 100%;";
    container.appendChild(canvas);
    canvasRef.current = canvas;

    // Create renderer
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(colors.background);
    rendererRef.current = renderer;

    // Create scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Create orthographic camera
    const camera = new THREE.OrthographicCamera(0, width, height, 0, 0.1, 1000);
    camera.position.z = 100;
    cameraRef.current = camera;

    // Create artifact overlays container
    const artifactDiv = document.createElement("div");
    artifactDiv.style.cssText = `
      position: absolute; top: 0; left: 0; width: 100%; height: 100%;
      pointer-events: none; overflow: hidden; z-index: 2;
    `;
    container.appendChild(artifactDiv);
    artifactOverlaysRef.current = artifactDiv;

    // Create labels container
    const labelsDiv = document.createElement("div");
    labelsDiv.style.cssText = `
      position: absolute; top: 0; left: 0; width: 100%; height: 100%;
      pointer-events: none; overflow: hidden; z-index: 10;
    `;
    container.appendChild(labelsDiv);
    labelsRef.current = labelsDiv;

    // Create selection overlay
    const selectionDiv = document.createElement("div");
    selectionDiv.style.cssText = `
      position: absolute; top: 0; height: 100%; pointer-events: none;
      background: ${colors.selection}; border-left: 2px solid ${colors.selectionBorder};
      border-right: 2px solid ${colors.selectionBorder}; display: none; z-index: 5;
    `;
    container.appendChild(selectionDiv);
    selectionRef.current = selectionDiv;

    // Handle resize
    const handleResize = () => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      rendererRef.current.setSize(w, h);
      cameraRef.current.right = w;
      cameraRef.current.top = h;
      cameraRef.current.updateProjectionMatrix();
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      renderer.dispose();
      if (canvasRef.current && container.contains(canvasRef.current)) {
        container.removeChild(canvasRef.current);
      }
      if (labelsRef.current && container.contains(labelsRef.current)) {
        container.removeChild(labelsRef.current);
      }
      if (artifactOverlaysRef.current && container.contains(artifactOverlaysRef.current)) {
        container.removeChild(artifactOverlaysRef.current);
      }
      if (selectionRef.current && container.contains(selectionRef.current)) {
        container.removeChild(selectionRef.current);
      }
      linesRef.current.clear();
      gridLinesRef.current = [];
    };
  }, []);

  // Update colors when theme changes
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setClearColor(colors.background);
    }
  }, [theme, colors.background]);

  // Mouse handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const timeAtClick = currentTime + (x / rect.width) * timeWindow;
    
    setIsDragging(true);
    setDragStart({ x, time: timeAtClick });
    setSelection(null);
    
    if (selectionRef.current) {
      selectionRef.current.style.display = "none";
    }
  }, [currentTime, timeWindow]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || !dragStart || !containerRef.current || !selectionRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const timeAtMouse = currentTime + (x / rect.width) * timeWindow;
    
    const left = Math.min(dragStart.x, x);
    const width = Math.abs(x - dragStart.x);
    
    if (width > 5) {
      selectionRef.current.style.display = "block";
      selectionRef.current.style.left = `${left}px`;
      selectionRef.current.style.width = `${width}px`;
      
      const newSelection = {
        startTime: Math.min(dragStart.time, timeAtMouse),
        endTime: Math.max(dragStart.time, timeAtMouse),
      };
      setSelection(newSelection);
    }
  }, [isDragging, dragStart, currentTime, timeWindow]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    
    if (isDragging && dragStart) {
      const distance = Math.abs(x - dragStart.x);
      
      if (distance < 5) {
        const timeAtClick = currentTime + (x / rect.width) * timeWindow;
        onTimeClick?.(timeAtClick);
        
        if (selectionRef.current) {
          selectionRef.current.style.display = "none";
        }
        setSelection(null);
      } else {
        if (selection) {
          onSelectionChange?.(selection);
        }
      }
    }
    
    setIsDragging(false);
    setDragStart(null);
  }, [isDragging, dragStart, currentTime, timeWindow, selection, onTimeClick, onSelectionChange]);

  const handleMouseLeave = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      setDragStart(null);
    }
  }, [isDragging]);

  // Update waveforms - CLINICAL-GRADE RENDERING
  const updateWaveforms = useCallback(() => {
    if (!sceneRef.current || !cameraRef.current || !rendererRef.current || !containerRef.current) return;
    if (!signals || !signals.length) return;

    const scene = sceneRef.current;
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    // Get visible channel indices
    const visibleChannelIndices = Array.from(visibleChannels).sort((a, b) => a - b);
    const numVisibleChannels = visibleChannelIndices.length;
    
    const channelsToRender = numVisibleChannels > 0 
      ? visibleChannelIndices 
      : signals.map((_, i) => i);
    
    const numChannels = channelsToRender.length;
    if (numChannels === 0) return;

    // Fixed lane height with padding for no overlap
    const LANE_PADDING = 4; // px padding between lanes
    const channelHeight = (height - (numChannels + 1) * LANE_PADDING) / numChannels;
    const usableHeight = channelHeight * 0.65; // Use 65% for trace, rest for spacing

    const startSample = Math.floor(currentTime * sampleRate);
    const samplesToShow = Math.floor(timeWindow * sampleRate);

    // Clear existing objects
    linesRef.current.forEach((line) => {
      scene.remove(line);
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    });
    linesRef.current.clear();

    gridLinesRef.current.forEach((line) => {
      scene.remove(line);
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    });
    gridLinesRef.current = [];

    if (labelsRef.current) labelsRef.current.innerHTML = "";
    if (artifactOverlaysRef.current) artifactOverlaysRef.current.innerHTML = "";

    // Draw artifact overlays per lane
    artifactIntervals.forEach((artifact) => {
      const artifactStart = artifact.start_sec;
      const artifactEnd = artifact.end_sec;
      
      if (artifactEnd >= 0 && artifactStart <= timeWindow) {
        const clampedStart = Math.max(0, artifactStart);
        const clampedEnd = Math.min(timeWindow, artifactEnd);
        
        const x1 = (clampedStart / timeWindow) * width;
        const x2 = (clampedEnd / timeWindow) * width;
        
        if (artifactOverlaysRef.current) {
          // Determine which channels to highlight
          const affectedChannels = artifact.channel != null 
            ? [artifact.channel]
            : channelsToRender;

          affectedChannels.forEach((chIdx) => {
            const displayIndex = channelsToRender.indexOf(chIdx);
            if (displayIndex === -1) return;

            const laneTop = LANE_PADDING + displayIndex * (channelHeight + LANE_PADDING);
            const bgColor = showArtifactsAsRed ? colors.artifactBgRed : colors.artifactBg;
            const borderColor = showArtifactsAsRed ? colors.artifactBorderRed : colors.artifactBorder;

            const overlayEl = document.createElement("div");
            overlayEl.style.cssText = `
              position: absolute;
              left: ${x1}px;
              top: ${laneTop}px;
              width: ${Math.max(2, x2 - x1)}px;
              height: ${channelHeight}px;
              background: ${bgColor};
              border-left: 1px solid ${borderColor};
              border-right: 1px solid ${borderColor};
              pointer-events: none;
              box-sizing: border-box;
            `;
            artifactOverlaysRef.current!.appendChild(overlayEl);
          });
        }
      }
    });

    // Draw grid lines
    const gridMaterial = new THREE.LineBasicMaterial({
      color: colors.grid,
      transparent: true,
      opacity: 0.5,
    });
    const gridStrongMaterial = new THREE.LineBasicMaterial({
      color: colors.gridStrong,
      transparent: true,
      opacity: 0.7,
    });

    // Vertical grid (every second, stronger every 5 seconds)
    for (let i = 0; i <= timeWindow; i++) {
      const x = (i / timeWindow) * width;
      const points = [new THREE.Vector3(x, 0, 0), new THREE.Vector3(x, height, 0)];
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = i % 5 === 0 ? gridStrongMaterial : gridMaterial;
      const line = new THREE.Line(geometry, material);
      scene.add(line);
      gridLinesRef.current.push(line);
    }

    // Horizontal grid (lane separators)
    for (let i = 0; i <= numChannels; i++) {
      const y = LANE_PADDING + i * (channelHeight + LANE_PADDING);
      const points = [new THREE.Vector3(0, y, 0), new THREE.Vector3(width, y, 0)];
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(geometry, gridMaterial);
      scene.add(line);
      gridLinesRef.current.push(line);
    }

    // Draw each channel with clinical-grade processing
    channelsToRender.forEach((channelIndex, displayIndex) => {
      const rawSignal = signals[channelIndex];
      if (!rawSignal) return;

      // Extract window (IMMUTABLE - never modify rawSignal)
      const endSample = Math.min(startSample + samplesToShow, rawSignal.length);
      const windowSignal = rawSignal.slice(startSample, endSample);
      
      if (windowSignal.length === 0) return;
      
      // Apply bandpass filter
      const filteredSignal = applyBandpassFilter(windowSignal, sampleRate, 0.5, 40);

      // === CLINICAL DISPLAY TRANSFORM ===
      // 1. Compute baseline = median of window
      const baseline = median(filteredSignal);
      
      // 2. Subtract baseline (display only, immutable source)
      const centered = filteredSignal.map(v => v - baseline);

      // 3. Robust autoscale using 95th percentile of |centered|
      const p95 = percentileAbs(centered, 95);
      // Target: traces fill ~65% of lane height with minimal clipping
      // autoGain makes p95 map to usableHeight/2
      const autoGain = (usableHeight / 2) / Math.max(p95, 1e-10);

      // Smooth the auto-gain to avoid jumpy rendering
      const prevGain = smoothedGainsRef.current.get(channelIndex) ?? autoGain;
      const smoothedGain = prevGain * 0.85 + autoGain * 0.15;
      smoothedGainsRef.current.set(channelIndex, smoothedGain);

      // Final gain = smoothed auto-gain * user amplitudeScale multiplier
      const finalGain = smoothedGain * amplitudeScale;

      // Lane position (inverted Y for Three.js)
      const laneTop = height - LANE_PADDING - displayIndex * (channelHeight + LANE_PADDING);
      const baselineY = laneTop - channelHeight / 2;

      const label = channelLabels[channelIndex] || `Ch${channelIndex + 1}`;
      
      // Get channel color
      let channelColorHex: number;
      if (channelColors[channelIndex]) {
        channelColorHex = parseColorToHex(channelColors[channelIndex]);
      } else {
        const colorInfo = getChannelColor(label);
        const groupKey = colorInfo.label.toLowerCase() as ChannelGroup;
        channelColorHex = CHANNEL_THEME_COLORS[groupKey]?.[theme === "dark" ? "dark" : "light"] || 
                          DEFAULT_CHANNEL_PALETTE[channelIndex % DEFAULT_CHANNEL_PALETTE.length];
      }

      // === MIN/MAX ENVELOPE RENDERING ===
      // For each pixel column, compute min and max of samples mapping to that column
      // This eliminates aliasing and the "blocky" look
      const pixelCount = Math.min(width, 2000); // Cap for performance
      const samplesPerPixel = centered.length / pixelCount;

      const points: THREE.Vector3[] = [];

      if (samplesPerPixel <= 1.5) {
        // Low density: just draw the line normally
        for (let i = 0; i < centered.length; i++) {
          const x = (i / samplesToShow) * width;
          const value = centered[i] * finalGain;
          const clampedValue = Math.max(-channelHeight * 0.48, Math.min(channelHeight * 0.48, value));
          const y = baselineY - clampedValue;
          points.push(new THREE.Vector3(x, y, 0));
        }
      } else {
        // High density: min/max envelope for alias-free rendering
        for (let px = 0; px < pixelCount; px++) {
          const sampleStart = Math.floor(px * samplesPerPixel);
          const sampleEnd = Math.min(Math.ceil((px + 1) * samplesPerPixel), centered.length);
          
          let minVal = Infinity;
          let maxVal = -Infinity;
          
          for (let s = sampleStart; s < sampleEnd; s++) {
            const v = centered[s];
            if (v < minVal) minVal = v;
            if (v > maxVal) maxVal = v;
          }
          
          if (minVal === Infinity) continue;

          const x = (px / pixelCount) * width;
          
          // Scale and clamp
          const scaledMin = Math.max(-channelHeight * 0.48, Math.min(channelHeight * 0.48, minVal * finalGain));
          const scaledMax = Math.max(-channelHeight * 0.48, Math.min(channelHeight * 0.48, maxVal * finalGain));
          
          // Draw vertical segment from min to max (envelope)
          // For a continuous polyline, we alternate: max, min, max, min...
          // This creates a "filled" appearance without needing actual triangles
          if (px % 2 === 0) {
            points.push(new THREE.Vector3(x, baselineY - scaledMax, 0));
            points.push(new THREE.Vector3(x, baselineY - scaledMin, 0));
          } else {
            points.push(new THREE.Vector3(x, baselineY - scaledMin, 0));
            points.push(new THREE.Vector3(x, baselineY - scaledMax, 0));
          }
        }
      }

      if (points.length > 1) {
        const material = new THREE.LineBasicMaterial({
          color: channelColorHex,
          linewidth: 1,
        });
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(geometry, material);
        scene.add(line);
        linesRef.current.set(channelIndex, line);
      }

      // Add channel label
      if (labelsRef.current) {
        const screenY = height - laneTop + channelHeight / 2 - 10;
        const colorHexStr = `#${channelColorHex.toString(16).padStart(6, "0")}`;
        const labelEl = document.createElement("div");
        labelEl.style.cssText = `
          position: absolute; left: 8px;
          top: ${screenY}px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 10px; font-weight: 600;
          color: ${colors.text};
          display: flex; align-items: center; gap: 5px;
          background: ${theme === "dark" ? "rgba(10,10,10,0.9)" : "rgba(250,250,250,0.9)"};
          padding: 2px 6px; border-radius: 3px;
          border-left: 3px solid ${colorHexStr};
        `;
        labelEl.textContent = label;
        labelsRef.current.appendChild(labelEl);
      }
    });

    // Draw markers
    const markerColors: Record<string, number> = {
      event: theme === "dark" ? 0x3b82f6 : 0x2563eb,
      seizure: theme === "dark" ? 0xef4444 : 0xdc2626,
      artifact: theme === "dark" ? 0xf59e0b : 0xd97706,
      sleep: theme === "dark" ? 0x8b5cf6 : 0x7c3aed,
    };

    markers.forEach((marker) => {
      const markerTime = marker.timestamp_sec - currentTime;
      if (markerTime >= 0 && markerTime <= timeWindow) {
        const x = (markerTime / timeWindow) * width;
        const markerColor = markerColors[marker.marker_type] || (theme === "dark" ? 0x888888 : 0x666666);

        const markerMaterial = new THREE.LineBasicMaterial({
          color: markerColor,
          linewidth: 2,
        });

        const points = [new THREE.Vector3(x, 0, 0), new THREE.Vector3(x, height, 0)];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(geometry, markerMaterial);
        scene.add(line);
        gridLinesRef.current.push(line);

        // Marker label
        if (labelsRef.current) {
          const labelEl = document.createElement("div");
          const colorStr = `#${markerColor.toString(16).padStart(6, "0")}`;
          labelEl.style.cssText = `
            position: absolute; left: ${x + 4}px; top: 4px;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            font-size: 9px; font-weight: 600;
            color: ${colorStr};
            background: ${theme === "dark" ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.9)"};
            padding: 2px 5px; border-radius: 3px;
            border: 1px solid ${colorStr};
          `;
          labelEl.textContent = marker.label || marker.marker_type;
          labelsRef.current.appendChild(labelEl);
        }
      }
    });

    // Add time labels at bottom
    if (labelsRef.current) {
      const interval = timeWindow <= 10 ? 1 : timeWindow <= 30 ? 5 : 10;
      for (let i = 0; i <= timeWindow; i += interval) {
        const x = (i / timeWindow) * width;
        const time = currentTime + i;
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);

        const labelEl = document.createElement("div");
        labelEl.style.cssText = `
          position: absolute; left: ${x + 2}px; bottom: 4px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 9px; color: ${colors.textMuted};
          background: ${theme === "dark" ? "rgba(10,10,10,0.7)" : "rgba(250,250,250,0.7)"};
          padding: 1px 3px; border-radius: 2px;
        `;
        labelEl.textContent = `${minutes}:${seconds.toString().padStart(2, "0")}`;
        labelsRef.current.appendChild(labelEl);
      }
    }

    // Render
    rendererRef.current.render(scene, cameraRef.current);
  }, [signals, channelLabels, sampleRate, currentTime, timeWindow, amplitudeScale, visibleChannels, theme, markers, artifactIntervals, channelColors, colors, showArtifactsAsRed]);

  // Run update on dependency changes with requestAnimationFrame
  useEffect(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    
    animationFrameRef.current = requestAnimationFrame(() => {
      updateWaveforms();
    });
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [updateWaveforms]);

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
    />
  );
}

export const WebGLEEGViewer = memo(WebGLEEGViewerComponent);
