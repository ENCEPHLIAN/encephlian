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
  /** Byte size of one full EDF record (all channels interleaved, including non-EEG) */
  private bytesPerRecord: number;
  /** Byte offset of each channel within a single record */
  private chByteOffsetInRecord: number[];
  /** Indices into sigHdrs that are actual EEG channels (same spr as primary, not annotations) */
  private eegIdx: number[];
  /** Samples-per-record for the primary EEG channels */
  private primarySpr: number;

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

    // ── Pre-compute per-channel byte offset within a record ───────
    this.chByteOffsetInRecord = new Array(ns);
    let byteOff = 0;
    for (let i = 0; i < ns; i++) {
      this.chByteOffsetInRecord[i] = byteOff;
      byteOff += this.sigHdrs[i].numSamplesPerRecord * 2;
    }

    // ── Identify EEG channels ─────────────────────────────────────
    // Exclude EDF Annotations channels (EDF+ standard) and channels
    // with wildly different sample rates (stimuli, EMG etc at different Fs).
    // Primary spr = most common spr among non-annotation channels.
    const nonAnnot = this.sigHdrs
      .map((s, i) => ({ i, s }))
      .filter(({ s }) => !s.label.toLowerCase().includes("edf annotations"));

    if (nonAnnot.length === 0) {
      // Degenerate file — use all channels
      this.primarySpr = this.sigHdrs[0]?.numSamplesPerRecord ?? 256;
      this.eegIdx = this.sigHdrs.map((_, i) => i);
    } else {
      // Pick the spr that appears most often (handles files with a lone different-rate channel)
      const sprCount = new Map<number, number>();
      for (const { s } of nonAnnot) sprCount.set(s.numSamplesPerRecord, (sprCount.get(s.numSamplesPerRecord) ?? 0) + 1);
      let bestSpr = nonAnnot[0].s.numSamplesPerRecord;
      let bestCount = 0;
      for (const [sp, cnt] of sprCount) { if (cnt > bestCount) { bestSpr = sp; bestCount = cnt; } }
      this.primarySpr = bestSpr;
      this.eegIdx = nonAnnot.filter(({ s }) => s.numSamplesPerRecord === bestSpr).map(({ i }) => i);
    }
  }

  /** Number of EEG channels (excludes annotation/mixed-rate channels) */
  get nChannels() { return this.eegIdx.length; }

  /** Samples per second */
  get sampleRate() {
    const dur = this.hdr.dataRecordDuration;
    return dur > 0 ? this.primarySpr / dur : 256;
  }

  /** Total samples per EEG channel */
  get totalSamples() {
    return this.hdr.numDataRecords * this.primarySpr;
  }

  get duration() {
    return this.hdr.numDataRecords * this.hdr.dataRecordDuration;
  }

  get labels(): string[] {
    return this.eegIdx.map((i) => this.sigHdrs[i].label.replace(/\.+$/, "").trim());
  }

  get patientId() { return this.hdr.patientId; }

  /**
   * Read `nSamples` samples for all EEG channels starting at `startSample`.
   * Returns number[][] shaped [nEegChannels][nSamples].
   * Zeroes are returned for out-of-range positions (pre/post padding).
   */
  getChunk(startSample: number, nSamples: number): number[][] {
    const nCh = this.eegIdx.length;
    const out: number[][] = Array.from({ length: nCh }, () => new Array(nSamples).fill(0));

    const sprMain = this.primarySpr;
    const startRec = Math.floor(startSample / sprMain);
    const endRec = Math.min(
      Math.ceil((startSample + nSamples) / sprMain),
      this.hdr.numDataRecords,
    );

    for (let rec = startRec; rec < endRec; rec++) {
      const recStartSample = rec * sprMain;
      const recordByteBase = this.hdr.headerBytes + rec * this.bytesPerRecord;

      // Sample range within this record that overlaps [startSample, startSample+nSamples)
      const inRecStart = Math.max(startSample, recStartSample) - recStartSample;
      const inRecEnd   = Math.min(startSample + nSamples, recStartSample + sprMain) - recStartSample;

      for (let ci = 0; ci < nCh; ci++) {
        const chIdx = this.eegIdx[ci];
        const { gain, offset } = this.scales[chIdx];
        const chBase = recordByteBase + this.chByteOffsetInRecord[chIdx];

        for (let s = inRecStart; s < inRecEnd; s++) {
          const outIdx = recStartSample + s - startSample;
          if (outIdx < 0 || outIdx >= nSamples) continue;
          const digital = this.view.getInt16(chBase + s * 2, true /* little-endian */);
          out[ci][outIdx] = digital * gain + offset;
        }
      }
    }

    return out;
  }
}
