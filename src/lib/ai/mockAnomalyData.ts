// Mock data generator for AI Anomaly Detection teaser
// NO API calls - pure client-side mock data

export type AnomalyType = "spike" | "seizure" | "artifact" | "background" | "asymmetry";

export interface AnomalyDetection {
  type: AnomalyType;
  count: number;
  confidence: number;
  status: "normal" | "abnormal" | "review";
  description: string;
  icon: string;
}

export interface TimelineMarker {
  timestamp: number; // seconds
  type: AnomalyType;
  intensity: number; // 0-1
}

/**
 * Generate deterministic mock anomaly data based on study ID
 * Uses study ID as seed for consistent results per study
 */
export function generateMockAnomalies(studyId?: string): {
  detections: AnomalyDetection[];
  timeline: TimelineMarker[];
  overallStatus: "normal" | "abnormal" | "review";
} {
  // Use study ID for deterministic "randomness"
  const seed = studyId ? hashCode(studyId) : 12345;
  const rng = seededRandom(seed);
  
  // Generate detection results
  const detections: AnomalyDetection[] = [
    {
      type: "spike",
      count: Math.floor(rng() * 15),
      confidence: 0.85 + rng() * 0.14,
      status: rng() > 0.7 ? "review" : "normal",
      description: "Sharp transients, possible epileptiform activity",
      icon: "🔴"
    },
    {
      type: "seizure",
      count: Math.floor(rng() * 4),
      confidence: 0.15 + rng() * 0.3,
      status: rng() > 0.9 ? "abnormal" : "normal",
      description: "Rhythmic patterns, frequency changes",
      icon: "🟠"
    },
    {
      type: "artifact",
      count: 8 + Math.floor(rng() * 10),
      confidence: 0.75 + rng() * 0.2,
      status: "normal",
      description: "EMG, eye blink, movement artifacts",
      icon: "🟡"
    },
    {
      type: "background",
      count: 1,
      confidence: 0.95 + rng() * 0.04,
      status: rng() > 0.8 ? "normal" : "review",
      description: "Alpha rhythm, sleep spindles",
      icon: "🟢"
    },
    {
      type: "asymmetry",
      count: Math.floor(rng() * 3),
      confidence: 0.4 + rng() * 0.3,
      status: rng() > 0.85 ? "review" : "normal",
      description: "Left-right hemisphere differences",
      icon: "🔵"
    }
  ];
  
  // Generate timeline markers (20 minute recording)
  const timeline: TimelineMarker[] = [];
  const duration = 1200; // 20 minutes in seconds
  
  detections.forEach(detection => {
    for (let i = 0; i < detection.count; i++) {
      timeline.push({
        timestamp: rng() * duration,
        type: detection.type,
        intensity: 0.3 + rng() * 0.7
      });
    }
  });
  
  // Sort timeline by timestamp
  timeline.sort((a, b) => a.timestamp - b.timestamp);
  
  // Determine overall status
  const hasAbnormal = detections.some(d => d.status === "abnormal");
  const hasReview = detections.some(d => d.status === "review");
  const overallStatus = hasAbnormal ? "abnormal" : hasReview ? "review" : "normal";
  
  return { detections, timeline, overallStatus };
}

/**
 * Simple hash function for string to number
 */
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Seeded random number generator
 */
function seededRandom(seed: number) {
  let state = seed;
  return function() {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
}
