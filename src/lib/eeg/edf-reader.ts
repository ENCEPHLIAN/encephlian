/**
 * EdfChunkReader — lazy on-demand EDF reading from an ArrayBuffer.
 *
 * Does NOT parse the whole file upfront. Reads only the byte ranges needed
 * for each requested window. O(nSamples × nChannels) per getChunk call,
 * with contiguous memory access within each EDF record.
 *
 * Usage:
 *   const reader = new EdfChunkReader(arrayBuffer);
 *   const sig = reader.getChunk(startSample, nSamples); // number[][]
 */

import type { EDFSignalHeader, EDFHeader } from "./edf-parser";

export class EdfChunkReader {
  private view: DataView;
  private hdr: EDFHeader;
  private sigHdrs: EDFSignalHeader[];
  private scales: { gain: number; offset: number }[];
  /** Byte size of one full EDF record (all channels interleaved) */
  private bytesPerRecord: number;

  constructor(buffer: ArrayBuffer) {
    this.view = new DataView(buffer);
    const rb = (off: number, len: number) =>
      new TextDecoder("ascii").decode(new Uint8Array(buffer, off, len)).trim();

    // ── Fixed header ─────────────────────────────────────────────
    const ns = parseInt(rb(252, 4), 10);
    this.hdr = {
      version: rb(0, 8),
      patientId: rb(8, 80),
      recordingId: rb(88, 80),
      startDate: rb(168, 8),
      startTime: rb(176, 8),
      headerBytes: parseInt(rb(184, 8), 10),
      reserved: rb(192, 44),
      numDataRecords: parseInt(rb(236, 8), 10),
      dataRecordDuration: parseFloat(rb(244, 8)),
      numSignals: ns,
    };

    // ── Signal headers ────────────────────────────────────────────
    let off = 256;
    const labels: string[] = [];
    for (let i = 0; i < ns; i++) labels.push(rb(off + i * 16, 16));
    off += ns * 16;
    const transducers: string[] = [];
    for (let i = 0; i < ns; i++) transducers.push(rb(off + i * 80, 80));
    off += ns * 80;
    const physDims: string[] = [];
    for (let i = 0; i < ns; i++) physDims.push(rb(off + i * 8, 8));
    off += ns * 8;
    const physMin: number[] = [];
    for (let i = 0; i < ns; i++) physMin.push(parseFloat(rb(off + i * 8, 8)));
    off += ns * 8;
    const physMax: number[] = [];
    for (let i = 0; i < ns; i++) physMax.push(parseFloat(rb(off + i * 8, 8)));
    off += ns * 8;
    const digMin: number[] = [];
    for (let i = 0; i < ns; i++) digMin.push(parseInt(rb(off + i * 8, 8), 10));
    off += ns * 8;
    const digMax: number[] = [];
    for (let i = 0; i < ns; i++) digMax.push(parseInt(rb(off + i * 8, 8), 10));
    off += ns * 8;
    const prefilt: string[] = [];
    for (let i = 0; i < ns; i++) prefilt.push(rb(off + i * 80, 80));
    off += ns * 80;
    const spr: number[] = [];
    for (let i = 0; i < ns; i++) spr.push(parseInt(rb(off + i * 8, 8), 10));
    off += ns * 8;
    const res: string[] = [];
    for (let i = 0; i < ns; i++) res.push(rb(off + i * 32, 32));

    this.sigHdrs = Array.from({ length: ns }, (_, i) => ({
      label: labels[i].replace(/\.+$/, "").trim(),
      transducerType: transducers[i],
      physicalDimension: physDims[i],
      physicalMinimum: physMin[i],
      physicalMaximum: physMax[i],
      digitalMinimum: digMin[i],
      digitalMaximum: digMax[i],
      prefiltering: prefilt[i],
      numSamplesPerRecord: spr[i],
      reserved: res[i],
    }));

    this.scales = this.sigHdrs.map((s) => {
      const digRange = s.digitalMaximum - s.digitalMinimum;
      const physRange = s.physicalMaximum - s.physicalMinimum;
      const gain = digRange !== 0 ? physRange / digRange : 1;
      return { gain, offset: s.physicalMinimum - s.digitalMinimum * gain };
    });

    this.bytesPerRecord = this.sigHdrs.reduce((acc, s) => acc + s.numSamplesPerRecord * 2, 0);
  }

  get nChannels() { return this.hdr.numSignals; }

  /** Samples per second (from first signal) */
  get sampleRate() {
    const dur = this.hdr.dataRecordDuration;
    return dur > 0 ? this.sigHdrs[0].numSamplesPerRecord / dur : 256;
  }

  /** Total samples per channel */
  get totalSamples() {
    return this.hdr.numDataRecords * this.sigHdrs[0].numSamplesPerRecord;
  }

  get duration() {
    return this.hdr.numDataRecords * this.hdr.dataRecordDuration;
  }

  get labels(): string[] {
    return this.sigHdrs.map((s) => s.label);
  }

  get patientId() { return this.hdr.patientId; }

  /**
   * Read `nSamples` samples for all channels starting at `startSample`.
   * Returns number[][] shaped [nChannels][nSamples].
   * Only reads the necessary byte ranges from the ArrayBuffer.
   */
  getChunk(startSample: number, nSamples: number): number[][] {
    const nCh = this.nChannels;
    const out: number[][] = Array.from({ length: nCh }, () => new Array(nSamples).fill(0));

    // All signals assumed to have the same sample rate (standard EDF assumption)
    const sprMain = this.sigHdrs[0].numSamplesPerRecord;
    const startRec = Math.floor(startSample / sprMain);
    const endRec = Math.min(
      Math.ceil((startSample + nSamples) / sprMain),
      this.hdr.numDataRecords,
    );

    for (let rec = startRec; rec < endRec; rec++) {
      const recStartSample = rec * sprMain;
      // Byte offset of this record's start in the file
      let chByteBase = this.hdr.headerBytes + rec * this.bytesPerRecord;

      for (let ch = 0; ch < nCh; ch++) {
        const chSpr = this.sigHdrs[ch].numSamplesPerRecord;
        const { gain, offset } = this.scales[ch];

        // Sample index range within this record that overlaps with our request
        const sampStart = Math.max(startSample, recStartSample) - recStartSample;
        const sampEnd = Math.min(startSample + nSamples, recStartSample + chSpr) - recStartSample;

        for (let s = sampStart; s < sampEnd; s++) {
          const outIdx = recStartSample + s - startSample;
          if (outIdx < 0 || outIdx >= nSamples) continue;
          const digital = this.view.getInt16(chByteBase + s * 2, true /* little-endian */);
          out[ch][outIdx] = digital * gain + offset;
        }

        chByteBase += chSpr * 2;
      }
    }

    return out;
  }
}
