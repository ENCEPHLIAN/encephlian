// Channel grouping and color coding for anatomical regions

export type ChannelGroup = "frontal" | "central" | "temporal" | "occipital" | "other";

export interface ChannelColor {
  stroke: string;
  label: string;
  bg: string;
}

// Color palette for channel groups (using HSL for theme compatibility)
export const CHANNEL_COLORS: Record<ChannelGroup, ChannelColor> = {
  frontal: {
    stroke: "hsl(217, 91%, 60%)", // Blue
    label: "Frontal",
    bg: "hsl(217, 91%, 95%)"
  },
  central: {
    stroke: "hsl(142, 76%, 45%)", // Green
    label: "Central",
    bg: "hsl(142, 76%, 95%)"
  },
  temporal: {
    stroke: "hsl(38, 92%, 50%)", // Amber
    label: "Temporal",
    bg: "hsl(38, 92%, 95%)"
  },
  occipital: {
    stroke: "hsl(271, 70%, 60%)", // Purple
    label: "Occipital",
    bg: "hsl(271, 70%, 95%)"
  },
  other: {
    stroke: "hsl(215, 16%, 47%)", // Gray
    label: "Other",
    bg: "hsl(215, 16%, 95%)"
  }
};

/**
 * Determine anatomical group based on channel label
 */
export function getChannelGroup(label: string): ChannelGroup {
  const normalized = label.trim().toUpperCase();
  
  // Frontal electrodes
  if (normalized.match(/^(FP|F[3478Z]?)/)) {
    return "frontal";
  }
  
  // Central electrodes
  if (normalized.match(/^(C[3Z4])/)) {
    return "central";
  }
  
  // Temporal electrodes
  if (normalized.match(/^(T[3456])/)) {
    return "temporal";
  }
  
  // Occipital electrodes
  if (normalized.match(/^(O[12Z]|P[34Z])/)) {
    return "occipital";
  }
  
  return "other";
}

/**
 * Get color for a channel based on its anatomical group
 */
export function getChannelColor(label: string): ChannelColor {
  const group = getChannelGroup(label);
  return CHANNEL_COLORS[group];
}

/**
 * Group channels by anatomical region
 */
export function groupChannels(labels: string[]): Map<ChannelGroup, number[]> {
  const groups = new Map<ChannelGroup, number[]>();
  
  labels.forEach((label, index) => {
    const group = getChannelGroup(label);
    if (!groups.has(group)) {
      groups.set(group, []);
    }
    groups.get(group)!.push(index);
  });
  
  return groups;
}
