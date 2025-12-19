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
}

interface Selection {
  startTime: number;
  endTime: number;
}

interface WebGLEEGViewerProps {
  signals: number[][];
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
  onTimeClick?: (time: number) => void;
  onSelectionChange?: (selection: Selection | null) => void;
}

// Color palette for dark and light themes
const THEME_COLORS = {
  dark: {
    background: 0x0f0f0f,
    grid: 0x1e1e1e,
    gridStrong: 0x2a2a2a,
    text: "#e0e0e0",
    textMuted: "#808080",
    selection: "rgba(59, 130, 246, 0.2)",
    selectionBorder: "rgba(59, 130, 246, 0.6)",
    artifactBg: "rgba(251, 191, 36, 0.15)",
  },
  light: {
    background: 0xffffff,
    grid: 0xf0f0f0,
    gridStrong: 0xe0e0e0,
    text: "#1a1a1a",
    textMuted: "#666666",
    selection: "rgba(59, 130, 246, 0.15)",
    selectionBorder: "rgba(59, 130, 246, 0.5)",
    artifactBg: "rgba(251, 191, 36, 0.2)",
  },
};

// Default channel colors (used when channelColors prop not provided)
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

/**
 * Butterworth-style IIR bandpass filter (simplified)
 */
function applyBandpassFilter(
  signal: number[],
  sampleRate: number,
  lowCut: number = 0.5,
  highCut: number = 40
): number[] {
  const n = signal.length;
  if (n < 4) return signal;

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

/** Parse hex color string to number */
function parseColorToHex(color: string): number {
  if (color.startsWith("#")) {
    return parseInt(color.slice(1), 16);
  }
  return 0x808080;
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

  // Selection state
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; time: number } | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);

  // Memoize colors to prevent infinite re-renders
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

    // Create artifact overlays container (behind labels)
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

  // Update waveforms
  const updateWaveforms = useCallback(() => {
    if (!sceneRef.current || !cameraRef.current || !rendererRef.current || !containerRef.current) return;
    if (!signals.length) return;

    const scene = sceneRef.current;
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    // Get visible channel indices
    const visibleChannelIndices = Array.from(visibleChannels).sort((a, b) => a - b);
    const numVisibleChannels = visibleChannelIndices.length;
    
    // FALLBACK: If no visible channels, show all
    const channelsToRender = numVisibleChannels > 0 
      ? visibleChannelIndices 
      : signals.map((_, i) => i);
    
    const numChannels = channelsToRender.length;
    if (numChannels === 0) return;

    const channelHeight = height / numChannels;
    const startSample = Math.floor(currentTime * sampleRate);
    const samplesToShow = Math.floor(timeWindow * sampleRate);

    // Clear existing lines
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

    // Clear labels
    if (labelsRef.current) {
      labelsRef.current.innerHTML = "";
    }

    // Clear artifact overlays
    if (artifactOverlaysRef.current) {
      artifactOverlaysRef.current.innerHTML = "";
    }

    // Draw artifact overlays (behind everything)
    artifactIntervals.forEach((artifact) => {
      const artifactStart = artifact.start_sec - currentTime;
      const artifactEnd = artifact.end_sec - currentTime;
      
      if (artifactEnd >= 0 && artifactStart <= timeWindow) {
        const clampedStart = Math.max(0, artifactStart);
        const clampedEnd = Math.min(timeWindow, artifactEnd);
        
        const x1 = (clampedStart / timeWindow) * width;
        const x2 = (clampedEnd / timeWindow) * width;
        
        if (artifactOverlaysRef.current) {
          const overlayEl = document.createElement("div");
          overlayEl.style.cssText = `
            position: absolute;
            left: ${x1}px;
            top: 0;
            width: ${x2 - x1}px;
            height: 100%;
            background: ${colors.artifactBg};
            pointer-events: none;
          `;
          artifactOverlaysRef.current.appendChild(overlayEl);
        }
      }
    });

    // Draw grid lines
    const gridMaterial = new THREE.LineBasicMaterial({
      color: colors.grid,
      transparent: true,
      opacity: 0.4,
    });
    const gridStrongMaterial = new THREE.LineBasicMaterial({
      color: colors.gridStrong,
      transparent: true,
      opacity: 0.6,
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

    // Horizontal grid (channel separators)
    for (let i = 0; i <= numChannels; i++) {
      const y = i * channelHeight;
      const points = [new THREE.Vector3(0, y, 0), new THREE.Vector3(width, y, 0)];
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(geometry, gridMaterial);
      scene.add(line);
      gridLinesRef.current.push(line);
    }

    // Draw each visible channel
    channelsToRender.forEach((channelIndex, displayIndex) => {
      const rawSignal = signals[channelIndex];
      if (!rawSignal) return;

      // Extract window and apply filter
      const endSample = Math.min(startSample + samplesToShow, rawSignal.length);
      const windowSignal = rawSignal.slice(startSample, endSample);
      
      if (windowSignal.length === 0) return;
      
      const filteredSignal = applyBandpassFilter(windowSignal, sampleRate, 0.5, 40);

      const baselineY = height - (displayIndex + 0.5) * channelHeight;
      const label = channelLabels[channelIndex] || `Ch${channelIndex + 1}`;
      
      // Get channel color - prefer provided colors, fallback to deterministic palette
      let channelColorHex: number;
      if (channelColors[channelIndex]) {
        channelColorHex = parseColorToHex(channelColors[channelIndex]);
      } else {
        // Fallback: use group-based or default palette
        const colorInfo = getChannelColor(label);
        const groupKey = colorInfo.label.toLowerCase() as ChannelGroup;
        channelColorHex = CHANNEL_THEME_COLORS[groupKey]?.[theme === "dark" ? "dark" : "light"] || 
                          DEFAULT_CHANNEL_PALETTE[channelIndex % DEFAULT_CHANNEL_PALETTE.length];
      }

      const material = new THREE.LineBasicMaterial({
        color: channelColorHex,
        linewidth: 1,
      });

      // Build points array with downsampling
      const points: THREE.Vector3[] = [];
      const maxPoints = 3000;
      const step = Math.max(1, Math.floor(filteredSignal.length / maxPoints));

      for (let i = 0; i < filteredSignal.length; i += step) {
        const x = (i / samplesToShow) * width;
        const value = filteredSignal[i] || 0;
        // Scale with amplitude and clamp
        const scaledValue = Math.max(-channelHeight * 0.45, Math.min(channelHeight * 0.45, value * amplitudeScale * 2));
        const y = baselineY - scaledValue;
        points.push(new THREE.Vector3(x, y, 0));
      }

      if (points.length > 1) {
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(geometry, material);
        scene.add(line);
        linesRef.current.set(channelIndex, line);
      }

      // Add channel label with color indicator
      if (labelsRef.current) {
        const labelEl = document.createElement("div");
        const colorHexStr = `#${channelColorHex.toString(16).padStart(6, "0")}`;
        labelEl.style.cssText = `
          position: absolute; left: 8px;
          top: ${(displayIndex + 0.5) * channelHeight - 10}px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 11px; font-weight: 500;
          color: ${colors.text};
          display: flex; align-items: center; gap: 6px;
          background: ${theme === "dark" ? "rgba(15,15,15,0.85)" : "rgba(255,255,255,0.85)"};
          padding: 2px 6px; border-radius: 3px;
        `;

        const colorDot = document.createElement("span");
        colorDot.style.cssText = `
          width: 3px; height: 14px;
          background: ${colorHexStr};
          border-radius: 1px;
        `;

        labelEl.appendChild(colorDot);
        labelEl.appendChild(document.createTextNode(label));
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
            font-size: 10px; font-weight: 600;
            color: ${colorStr};
            background: ${theme === "dark" ? "rgba(0,0,0,0.8)" : "rgba(255,255,255,0.9)"};
            padding: 2px 6px; border-radius: 3px;
            border: 1px solid ${colorStr};
          `;
          labelEl.textContent = marker.label || marker.marker_type;
          labelsRef.current.appendChild(labelEl);
        }
      }
    });

    // Add time labels at bottom
    if (labelsRef.current) {
      for (let i = 0; i <= timeWindow; i += 5) {
        const x = (i / timeWindow) * width;
        const time = currentTime + i;
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);

        const labelEl = document.createElement("div");
        labelEl.style.cssText = `
          position: absolute; left: ${x + 2}px; bottom: 4px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 10px; color: ${colors.textMuted};
        `;
        labelEl.textContent = `${minutes}:${seconds.toString().padStart(2, "0")}`;
        labelsRef.current.appendChild(labelEl);
      }
    }

    // Render
    rendererRef.current.render(scene, cameraRef.current);
  }, [signals, channelLabels, sampleRate, currentTime, timeWindow, amplitudeScale, visibleChannels, theme, markers, artifactIntervals, channelColors, colors]);

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
        background: theme === "dark" ? "#0f0f0f" : "#ffffff",
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
