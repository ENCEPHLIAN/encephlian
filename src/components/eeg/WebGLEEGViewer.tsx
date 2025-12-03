import { useEffect, useRef, useCallback, memo } from "react";
import * as THREE from "three";
import { getChannelColor } from "@/lib/eeg/channel-groups";

interface Marker {
  id: string;
  timestamp_sec: number;
  marker_type: string;
  label?: string;
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
}

// Performance-optimized WebGL EEG Viewer using Three.js
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
}: WebGLEEGViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const linesRef = useRef<Map<number, THREE.Line>>(new Map());
  const markerLinesRef = useRef<THREE.Line[]>([]);
  const animationFrameRef = useRef<number>(0);
  const labelsRef = useRef<HTMLDivElement | null>(null);

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Create renderer with antialiasing
    const renderer = new THREE.WebGLRenderer({ 
      antialias: true,
      alpha: true,
      powerPreference: "high-performance"
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(theme === "dark" ? 0x0a0a0a : 0xffffff);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Create scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Create orthographic camera for 2D view
    const camera = new THREE.OrthographicCamera(0, width, height, 0, 0.1, 1000);
    camera.position.z = 100;
    cameraRef.current = camera;

    // Create labels container
    const labelsDiv = document.createElement("div");
    labelsDiv.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      overflow: hidden;
    `;
    container.appendChild(labelsDiv);
    labelsRef.current = labelsDiv;

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
      cancelAnimationFrame(animationFrameRef.current);
      renderer.dispose();
      container.removeChild(renderer.domElement);
      if (labelsRef.current) {
        container.removeChild(labelsRef.current);
      }
      linesRef.current.clear();
    };
  }, [theme]);

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
    if (numVisibleChannels === 0) return;

    const channelHeight = height / numVisibleChannels;
    const startSample = Math.floor(currentTime * sampleRate);
    const samplesToShow = Math.floor(timeWindow * sampleRate);

    // Clear existing lines
    linesRef.current.forEach((line) => scene.remove(line));
    linesRef.current.clear();
    markerLinesRef.current.forEach((line) => scene.remove(line));
    markerLinesRef.current = [];

    // Clear labels
    if (labelsRef.current) {
      labelsRef.current.innerHTML = "";
    }

    // Draw grid lines
    const gridMaterial = new THREE.LineBasicMaterial({ 
      color: theme === "dark" ? 0x1a1a1a : 0xf0f0f0,
      transparent: true,
      opacity: 0.5
    });

    // Vertical grid (every second)
    for (let i = 0; i <= timeWindow; i++) {
      const x = (i / timeWindow) * width;
      const points = [new THREE.Vector3(x, 0, 0), new THREE.Vector3(x, height, 0)];
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(geometry, gridMaterial);
      scene.add(line);
      markerLinesRef.current.push(line);
    }

    // Horizontal grid (channel separators)
    for (let i = 0; i <= numVisibleChannels; i++) {
      const y = i * channelHeight;
      const points = [new THREE.Vector3(0, y, 0), new THREE.Vector3(width, y, 0)];
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(geometry, gridMaterial);
      scene.add(line);
      markerLinesRef.current.push(line);
    }

    // Draw each visible channel
    visibleChannelIndices.forEach((channelIndex, displayIndex) => {
      const signal = signals[channelIndex];
      if (!signal) return;

      const baselineY = height - (displayIndex + 0.5) * channelHeight;
      const channelColor = getChannelColor(channelLabels[channelIndex]);
      
      // Convert hex color to Three.js color
      const colorHex = channelColor.stroke.replace("#", "0x");
      const material = new THREE.LineBasicMaterial({ 
        color: parseInt(colorHex, 16),
        linewidth: 1.5
      });

      // Build points array with downsampling for performance
      const points: THREE.Vector3[] = [];
      const endSample = Math.min(startSample + samplesToShow, signal.length);
      
      // Downsample if too many points (max ~2000 points per channel for smooth rendering)
      const maxPoints = 2000;
      const step = Math.max(1, Math.floor(samplesToShow / maxPoints));
      
      for (let i = startSample; i < endSample; i += step) {
        const x = ((i - startSample) / samplesToShow) * width;
        const value = signal[i] || 0;
        const y = baselineY - (value * amplitudeScale * 3);
        points.push(new THREE.Vector3(x, y, 0));
      }

      if (points.length > 1) {
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(geometry, material);
        scene.add(line);
        linesRef.current.set(channelIndex, line);
      }

      // Add channel label
      if (labelsRef.current) {
        const label = document.createElement("div");
        label.style.cssText = `
          position: absolute;
          left: 8px;
          top: ${(displayIndex + 0.5) * channelHeight - 8}px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 12px;
          color: ${theme === "dark" ? "#e0e0e0" : "#202020"};
          display: flex;
          align-items: center;
          gap: 4px;
        `;
        
        const colorDot = document.createElement("span");
        colorDot.style.cssText = `
          width: 4px;
          height: 12px;
          background: ${channelColor.stroke};
          border-radius: 1px;
        `;
        
        label.appendChild(colorDot);
        label.appendChild(document.createTextNode(channelLabels[channelIndex] || `Ch${channelIndex + 1}`));
        labelsRef.current.appendChild(label);
      }
    });

    // Draw markers
    const markerColors: Record<string, number> = {
      event: 0x3b82f6,
      seizure: 0xef4444,
      artifact: 0xf59e0b,
      sleep: 0x8b5cf6
    };

    markers.forEach(marker => {
      const markerTime = marker.timestamp_sec - currentTime;
      if (markerTime >= 0 && markerTime <= timeWindow) {
        const x = (markerTime / timeWindow) * width;
        
        const markerMaterial = new THREE.LineBasicMaterial({
          color: markerColors[marker.marker_type] || 0x888888,
          linewidth: 2
        });

        const points = [new THREE.Vector3(x, 0, 0), new THREE.Vector3(x, height, 0)];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(geometry, markerMaterial);
        scene.add(line);
        markerLinesRef.current.push(line);

        // Marker label
        if (labelsRef.current) {
          const label = document.createElement("div");
          const colorStr = `#${markerColors[marker.marker_type]?.toString(16).padStart(6, "0") || "888888"}`;
          label.style.cssText = `
            position: absolute;
            left: ${x + 4}px;
            top: 4px;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            font-size: 10px;
            font-weight: bold;
            color: ${colorStr};
            background: ${theme === "dark" ? "rgba(0,0,0,0.7)" : "rgba(255,255,255,0.7)"};
            padding: 2px 4px;
            border-radius: 2px;
          `;
          label.textContent = marker.label || marker.marker_type;
          labelsRef.current.appendChild(label);
        }
      }
    });

    // Add time labels
    if (labelsRef.current) {
      for (let i = 0; i <= timeWindow; i++) {
        const x = (i / timeWindow) * width;
        const time = currentTime + i;
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        
        const label = document.createElement("div");
        label.style.cssText = `
          position: absolute;
          left: ${x + 2}px;
          bottom: 4px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 10px;
          color: ${theme === "dark" ? "#a0a0a0" : "#404040"};
        `;
        label.textContent = `${minutes}:${seconds.toString().padStart(2, "0")}`;
        labelsRef.current.appendChild(label);
      }
    }

    // Render
    rendererRef.current.render(scene, cameraRef.current);
  }, [signals, channelLabels, sampleRate, currentTime, timeWindow, amplitudeScale, visibleChannels, theme, markers]);

  // Run update on dependency changes
  useEffect(() => {
    updateWaveforms();
  }, [updateWaveforms]);

  return (
    <div 
      ref={containerRef} 
      className="w-full h-full relative"
      style={{ 
        background: theme === "dark" ? "#0a0a0a" : "#ffffff",
        borderRadius: 6,
        overflow: "hidden"
      }}
    />
  );
}

export const WebGLEEGViewer = memo(WebGLEEGViewerComponent);
