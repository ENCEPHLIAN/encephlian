// Standard 10-20 system channels (important channels only)
export const STANDARD_1020_CHANNELS = [
  // Frontal
  "FP1", "FP2", "FPZ",
  "F7", "F3", "FZ", "F4", "F8",
  "AF7", "AF3", "AFZ", "AF4", "AF8",
  
  // Temporal
  "T3", "T4", "T5", "T6",
  "T7", "T8", "T9", "T10",
  "FT7", "FT8", "TP7", "TP8",
  
  // Central
  "C3", "CZ", "C4",
  
  // Parietal
  "P3", "PZ", "P4",
  "P7", "P8",
  
  // Occipital
  "O1", "OZ", "O2",
  "PO7", "PO3", "POZ", "PO4", "PO8",
];

/**
 * Check if a channel label matches any standard 10-20 channel
 */
export function isStandardChannel(label: string): boolean {
  const normalized = label.trim().toUpperCase().replace(/\./g, "");
  return STANDARD_1020_CHANNELS.some(std => 
    normalized === std || normalized.startsWith(std)
  );
}

/**
 * Filter to only standard 10-20 channels
 */
export function filterStandardChannels(labels: string[]): number[] {
  return labels
    .map((label, index) => ({ label, index }))
    .filter(({ label }) => isStandardChannel(label))
    .map(({ index }) => index);
}
