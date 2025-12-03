/**
 * EDF/BDF Parser for Browser
 * 
 * This module provides a proper EDF (European Data Format) parser for EEG files.
 * Parses header metadata and extracts actual signal data.
 * 
 * EDF Specification: https://www.edfplus.info/specs/edf.html
 */

export interface EDFHeader {
  version: string;
  patientId: string;
  recordingId: string;
  startDate: string;
  startTime: string;
  headerBytes: number;
  reserved: string;
  numDataRecords: number;
  dataRecordDuration: number;
  numSignals: number;
}

export interface EDFSignalHeader {
  label: string;
  transducerType: string;
  physicalDimension: string;
  physicalMinimum: number;
  physicalMaximum: number;
  digitalMinimum: number;
  digitalMaximum: number;
  prefiltering: string;
  numSamplesPerRecord: number;
  reserved: string;
}

export interface ParsedEDF {
  header: EDFHeader;
  signalHeaders: EDFSignalHeader[];
  signals: number[][];
  channelLabels: string[];
  sampleRate: number;
  duration: number;
  metadata: {
    patient_id: string;
    recording_id: string;
    start_date: string;
    start_time: string;
    num_channels: number;
  };
}

/**
 * Parse EDF file from ArrayBuffer
 */
export function parseEDF(buffer: ArrayBuffer): ParsedEDF {
  const view = new DataView(buffer);
  const decoder = new TextDecoder("ascii");
  
  // Helper to read ASCII string from buffer
  const readString = (offset: number, length: number): string => {
    const bytes = new Uint8Array(buffer, offset, length);
    return decoder.decode(bytes).trim();
  };

  // Parse fixed header (256 bytes)
  const header: EDFHeader = {
    version: readString(0, 8),
    patientId: readString(8, 80),
    recordingId: readString(88, 80),
    startDate: readString(168, 8),
    startTime: readString(176, 8),
    headerBytes: parseInt(readString(184, 8), 10),
    reserved: readString(192, 44),
    numDataRecords: parseInt(readString(236, 8), 10),
    dataRecordDuration: parseFloat(readString(244, 8)),
    numSignals: parseInt(readString(252, 4), 10),
  };

  const ns = header.numSignals;
  let offset = 256;

  // Parse signal headers (ns * 256 bytes total)
  const signalHeaders: EDFSignalHeader[] = [];
  
  // Read labels (16 chars each)
  const labels: string[] = [];
  for (let i = 0; i < ns; i++) {
    labels.push(readString(offset + i * 16, 16));
  }
  offset += ns * 16;

  // Read transducer types (80 chars each)
  const transducerTypes: string[] = [];
  for (let i = 0; i < ns; i++) {
    transducerTypes.push(readString(offset + i * 80, 80));
  }
  offset += ns * 80;

  // Read physical dimensions (8 chars each)
  const physicalDimensions: string[] = [];
  for (let i = 0; i < ns; i++) {
    physicalDimensions.push(readString(offset + i * 8, 8));
  }
  offset += ns * 8;

  // Read physical minimums (8 chars each)
  const physicalMinimums: number[] = [];
  for (let i = 0; i < ns; i++) {
    physicalMinimums.push(parseFloat(readString(offset + i * 8, 8)));
  }
  offset += ns * 8;

  // Read physical maximums (8 chars each)
  const physicalMaximums: number[] = [];
  for (let i = 0; i < ns; i++) {
    physicalMaximums.push(parseFloat(readString(offset + i * 8, 8)));
  }
  offset += ns * 8;

  // Read digital minimums (8 chars each)
  const digitalMinimums: number[] = [];
  for (let i = 0; i < ns; i++) {
    digitalMinimums.push(parseInt(readString(offset + i * 8, 8), 10));
  }
  offset += ns * 8;

  // Read digital maximums (8 chars each)
  const digitalMaximums: number[] = [];
  for (let i = 0; i < ns; i++) {
    digitalMaximums.push(parseInt(readString(offset + i * 8, 8), 10));
  }
  offset += ns * 8;

  // Read prefiltering (80 chars each)
  const prefilterings: string[] = [];
  for (let i = 0; i < ns; i++) {
    prefilterings.push(readString(offset + i * 80, 80));
  }
  offset += ns * 80;

  // Read number of samples per data record (8 chars each)
  const numSamplesPerRecord: number[] = [];
  for (let i = 0; i < ns; i++) {
    numSamplesPerRecord.push(parseInt(readString(offset + i * 8, 8), 10));
  }
  offset += ns * 8;

  // Read reserved (32 chars each)
  const reserved: string[] = [];
  for (let i = 0; i < ns; i++) {
    reserved.push(readString(offset + i * 32, 32));
  }
  offset += ns * 32;

  // Build signal headers array
  for (let i = 0; i < ns; i++) {
    signalHeaders.push({
      label: labels[i],
      transducerType: transducerTypes[i],
      physicalDimension: physicalDimensions[i],
      physicalMinimum: physicalMinimums[i],
      physicalMaximum: physicalMaximums[i],
      digitalMinimum: digitalMinimums[i],
      digitalMaximum: digitalMaximums[i],
      prefiltering: prefilterings[i],
      numSamplesPerRecord: numSamplesPerRecord[i],
      reserved: reserved[i],
    });
  }

  // Calculate scaling factors for each channel
  const scalingFactors = signalHeaders.map((sh) => {
    const digitalRange = sh.digitalMaximum - sh.digitalMinimum;
    const physicalRange = sh.physicalMaximum - sh.physicalMinimum;
    return {
      gain: digitalRange !== 0 ? physicalRange / digitalRange : 1,
      offset: sh.physicalMinimum - (sh.digitalMinimum * (physicalRange / digitalRange)),
    };
  });

  // Parse data records
  const dataOffset = header.headerBytes;
  const numRecords = header.numDataRecords;
  
  // Initialize signal arrays
  const signals: number[][] = signalHeaders.map((sh) => {
    const totalSamples = sh.numSamplesPerRecord * numRecords;
    return new Array(totalSamples);
  });

  // Read data records
  let byteOffset = dataOffset;
  
  for (let record = 0; record < numRecords; record++) {
    for (let signal = 0; signal < ns; signal++) {
      const samplesInRecord = signalHeaders[signal].numSamplesPerRecord;
      const signalOffset = record * samplesInRecord;
      const scaling = scalingFactors[signal];

      for (let sample = 0; sample < samplesInRecord; sample++) {
        // EDF stores 16-bit signed integers (little-endian)
        const digitalValue = view.getInt16(byteOffset, true);
        const physicalValue = (digitalValue * scaling.gain) + scaling.offset;
        signals[signal][signalOffset + sample] = physicalValue;
        byteOffset += 2;
      }
    }
  }

  // Calculate sample rate (samples per second)
  const sampleRate = signalHeaders[0]?.numSamplesPerRecord / header.dataRecordDuration || 256;
  
  // Calculate total duration
  const duration = header.numDataRecords * header.dataRecordDuration;

  // Clean up channel labels (remove trailing dots/spaces)
  const channelLabels = labels.map((l) => l.replace(/\.+$/, "").trim());

  return {
    header,
    signalHeaders,
    signals,
    channelLabels,
    sampleRate,
    duration,
    metadata: {
      patient_id: header.patientId,
      recording_id: header.recordingId,
      start_date: header.startDate,
      start_time: header.startTime,
      num_channels: ns,
    },
  };
}

/**
 * Parse BDF file (similar to EDF but 24-bit samples)
 */
export function parseBDF(buffer: ArrayBuffer): ParsedEDF {
  const view = new DataView(buffer);
  const decoder = new TextDecoder("ascii");
  
  const readString = (offset: number, length: number): string => {
    const bytes = new Uint8Array(buffer, offset, length);
    return decoder.decode(bytes).trim();
  };

  // BDF header is same as EDF
  const header: EDFHeader = {
    version: readString(0, 8),
    patientId: readString(8, 80),
    recordingId: readString(88, 80),
    startDate: readString(168, 8),
    startTime: readString(176, 8),
    headerBytes: parseInt(readString(184, 8), 10),
    reserved: readString(192, 44),
    numDataRecords: parseInt(readString(236, 8), 10),
    dataRecordDuration: parseFloat(readString(244, 8)),
    numSignals: parseInt(readString(252, 4), 10),
  };

  const ns = header.numSignals;
  let offset = 256;

  // Parse signal headers (same as EDF)
  const signalHeaders: EDFSignalHeader[] = [];
  
  const labels: string[] = [];
  for (let i = 0; i < ns; i++) {
    labels.push(readString(offset + i * 16, 16));
  }
  offset += ns * 16;

  const transducerTypes: string[] = [];
  for (let i = 0; i < ns; i++) {
    transducerTypes.push(readString(offset + i * 80, 80));
  }
  offset += ns * 80;

  const physicalDimensions: string[] = [];
  for (let i = 0; i < ns; i++) {
    physicalDimensions.push(readString(offset + i * 8, 8));
  }
  offset += ns * 8;

  const physicalMinimums: number[] = [];
  for (let i = 0; i < ns; i++) {
    physicalMinimums.push(parseFloat(readString(offset + i * 8, 8)));
  }
  offset += ns * 8;

  const physicalMaximums: number[] = [];
  for (let i = 0; i < ns; i++) {
    physicalMaximums.push(parseFloat(readString(offset + i * 8, 8)));
  }
  offset += ns * 8;

  const digitalMinimums: number[] = [];
  for (let i = 0; i < ns; i++) {
    digitalMinimums.push(parseInt(readString(offset + i * 8, 8), 10));
  }
  offset += ns * 8;

  const digitalMaximums: number[] = [];
  for (let i = 0; i < ns; i++) {
    digitalMaximums.push(parseInt(readString(offset + i * 8, 8), 10));
  }
  offset += ns * 8;

  const prefilterings: string[] = [];
  for (let i = 0; i < ns; i++) {
    prefilterings.push(readString(offset + i * 80, 80));
  }
  offset += ns * 80;

  const numSamplesPerRecord: number[] = [];
  for (let i = 0; i < ns; i++) {
    numSamplesPerRecord.push(parseInt(readString(offset + i * 8, 8), 10));
  }
  offset += ns * 8;

  const reserved: string[] = [];
  for (let i = 0; i < ns; i++) {
    reserved.push(readString(offset + i * 32, 32));
  }
  offset += ns * 32;

  for (let i = 0; i < ns; i++) {
    signalHeaders.push({
      label: labels[i],
      transducerType: transducerTypes[i],
      physicalDimension: physicalDimensions[i],
      physicalMinimum: physicalMinimums[i],
      physicalMaximum: physicalMaximums[i],
      digitalMinimum: digitalMinimums[i],
      digitalMaximum: digitalMaximums[i],
      prefiltering: prefilterings[i],
      numSamplesPerRecord: numSamplesPerRecord[i],
      reserved: reserved[i],
    });
  }

  const scalingFactors = signalHeaders.map((sh) => {
    const digitalRange = sh.digitalMaximum - sh.digitalMinimum;
    const physicalRange = sh.physicalMaximum - sh.physicalMinimum;
    return {
      gain: digitalRange !== 0 ? physicalRange / digitalRange : 1,
      offset: sh.physicalMinimum - (sh.digitalMinimum * (physicalRange / digitalRange)),
    };
  });

  const dataOffset = header.headerBytes;
  const numRecords = header.numDataRecords;
  
  const signals: number[][] = signalHeaders.map((sh) => {
    const totalSamples = sh.numSamplesPerRecord * numRecords;
    return new Array(totalSamples);
  });

  let byteOffset = dataOffset;
  
  for (let record = 0; record < numRecords; record++) {
    for (let signal = 0; signal < ns; signal++) {
      const samplesInRecord = signalHeaders[signal].numSamplesPerRecord;
      const signalOffset = record * samplesInRecord;
      const scaling = scalingFactors[signal];

      for (let sample = 0; sample < samplesInRecord; sample++) {
        // BDF stores 24-bit signed integers (little-endian)
        const b0 = view.getUint8(byteOffset);
        const b1 = view.getUint8(byteOffset + 1);
        const b2 = view.getUint8(byteOffset + 2);
        
        // Convert to signed 24-bit integer
        let digitalValue = b0 | (b1 << 8) | (b2 << 16);
        if (digitalValue >= 0x800000) {
          digitalValue -= 0x1000000;
        }
        
        const physicalValue = (digitalValue * scaling.gain) + scaling.offset;
        signals[signal][signalOffset + sample] = physicalValue;
        byteOffset += 3;
      }
    }
  }

  const sampleRate = signalHeaders[0]?.numSamplesPerRecord / header.dataRecordDuration || 256;
  const duration = header.numDataRecords * header.dataRecordDuration;
  const channelLabels = labels.map((l) => l.replace(/\.+$/, "").trim());

  return {
    header,
    signalHeaders,
    signals,
    channelLabels,
    sampleRate,
    duration,
    metadata: {
      patient_id: header.patientId,
      recording_id: header.recordingId,
      start_date: header.startDate,
      start_time: header.startTime,
      num_channels: ns,
    },
  };
}

/**
 * Chunk signals into smaller windows for memory efficiency
 */
export function chunkSignals(
  signals: number[][],
  sampleRate: number,
  windowSeconds: number = 300 // 5 minutes
): { chunk: number[][]; startTime: number; endTime: number }[] {
  const samplesPerWindow = sampleRate * windowSeconds;
  const totalSamples = signals[0]?.length || 0;
  const numChunks = Math.ceil(totalSamples / samplesPerWindow);
  
  const chunks: { chunk: number[][]; startTime: number; endTime: number }[] = [];
  
  for (let i = 0; i < numChunks; i++) {
    const startSample = i * samplesPerWindow;
    const endSample = Math.min(startSample + samplesPerWindow, totalSamples);
    
    const chunk = signals.map((signal) => signal.slice(startSample, endSample));
    
    chunks.push({
      chunk,
      startTime: startSample / sampleRate,
      endTime: endSample / sampleRate,
    });
  }
  
  return chunks;
}
