// Montage transformation functions for EEG signal processing
// Implements common clinical montages without external dependencies

type ChannelPair = [string, string];

// Standard 10-20 electrode positions for montage pairs
const LONGITUDINAL_PAIRS: ChannelPair[] = [
  // Left hemisphere chain
  ["Fp1", "F3"], ["F3", "C3"], ["C3", "P3"], ["P3", "O1"],
  ["Fp1", "F7"], ["F7", "T3"], ["T3", "T5"], ["T5", "O1"],
  
  // Right hemisphere chain
  ["Fp2", "F4"], ["F4", "C4"], ["C4", "P4"], ["P4", "O2"],
  ["Fp2", "F8"], ["F8", "T4"], ["T4", "T6"], ["T6", "O2"],
  
  // Midline
  ["Fz", "Cz"], ["Cz", "Pz"]
];

const TRANSVERSE_PAIRS: ChannelPair[] = [
  // Front-to-back chains
  ["Fp1", "Fp2"],
  ["F7", "F3"], ["F3", "Fz"], ["Fz", "F4"], ["F4", "F8"],
  ["T3", "C3"], ["C3", "Cz"], ["Cz", "C4"], ["C4", "T4"],
  ["T5", "P3"], ["P3", "Pz"], ["Pz", "P4"], ["P4", "T6"],
  ["O1", "O2"]
];

/**
 * Find channel index by label (case-insensitive, handles whitespace)
 */
function findChannelIndex(labels: string[], target: string): number {
  const normalized = target.trim().toUpperCase();
  return labels.findIndex(label => label.trim().toUpperCase() === normalized);
}

/**
 * Create bipolar derivation: signal1 - signal2
 */
function createBipolarSignal(signal1: number[], signal2: number[]): number[] {
  const length = Math.min(signal1.length, signal2.length);
  const result = new Array(length);
  
  for (let i = 0; i < length; i++) {
    result[i] = signal1[i] - signal2[i];
  }
  
  return result;
}

/**
 * Apply montage transformation to raw EEG signals
 */
export function applyMontage(
  signals: number[][],
  channelLabels: string[],
  montage: string
): { signals: number[][], labels: string[] } {
  
  // Referential montage - return as-is
  if (montage === "referential") {
    return { signals, labels: channelLabels };
  }
  
  // Bipolar Longitudinal montage
  if (montage === "bipolar-longitudinal") {
    const newSignals: number[][] = [];
    const newLabels: string[] = [];
    
    for (const [ch1, ch2] of LONGITUDINAL_PAIRS) {
      const idx1 = findChannelIndex(channelLabels, ch1);
      const idx2 = findChannelIndex(channelLabels, ch2);
      
      if (idx1 !== -1 && idx2 !== -1) {
        newSignals.push(createBipolarSignal(signals[idx1], signals[idx2]));
        newLabels.push(`${ch1}-${ch2}`);
      }
    }
    
    return { signals: newSignals, labels: newLabels };
  }
  
  // Bipolar Transverse montage
  if (montage === "bipolar-transverse") {
    const newSignals: number[][] = [];
    const newLabels: string[] = [];
    
    for (const [ch1, ch2] of TRANSVERSE_PAIRS) {
      const idx1 = findChannelIndex(channelLabels, ch1);
      const idx2 = findChannelIndex(channelLabels, ch2);
      
      if (idx1 !== -1 && idx2 !== -1) {
        newSignals.push(createBipolarSignal(signals[idx1], signals[idx2]));
        newLabels.push(`${ch1}-${ch2}`);
      }
    }
    
    return { signals: newSignals, labels: newLabels };
  }
  
  // Average Reference montage
  if (montage === "average-reference") {
    // Calculate average of all channels at each timepoint
    const numSamples = signals[0].length;
    const numChannels = signals.length;
    const avgSignal = new Array(numSamples).fill(0);
    
    for (let i = 0; i < numSamples; i++) {
      let sum = 0;
      for (let ch = 0; ch < numChannels; ch++) {
        sum += signals[ch][i];
      }
      avgSignal[i] = sum / numChannels;
    }
    
    // Subtract average from each channel
    const newSignals = signals.map(signal => 
      signal.map((val, i) => val - avgSignal[i])
    );
    
    return { 
      signals: newSignals, 
      labels: channelLabels.map(label => `${label}-Avg`)
    };
  }
  
  // Laplacian montage (simplified)
  if (montage === "laplacian") {
    // For now, return referential (full Laplacian requires spatial neighbors)
    return { signals, labels: channelLabels };
  }
  
  // Default: return unchanged
  return { signals, labels: channelLabels };
}
