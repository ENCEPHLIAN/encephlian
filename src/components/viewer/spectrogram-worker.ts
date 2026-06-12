/**
 * Spectrogram Web Worker — off-main-thread STFT.
 *
 * Receives a 1-D channel signal (already windowed by the caller) and returns a
 * spectrogram matrix (frames × bins, row-major) of log-power values in dB.
 *
 * Algorithm:
 *   1. Slide a Hann-windowed FFT of size `fftSize` across the signal with
 *      `overlap` fractional step (0.5 = 50% overlap by default).
 *   2. Real radix-2 FFT (pure JS — no deps). fftSize MUST be a power of two.
 *   3. Magnitude squared → 10 · log10(|X|² / fftSize) ⇒ dB.
 *   4. Returns the matrix plus the (dbMin, dbMax) for the caller to choose a
 *      colormap range.
 *
 * Frames stored row-major: spectrogram[frameIdx * nBins + binIdx].
 * Frequency bin k corresponds to k · (sampleRate / fftSize) Hz.
 *
 * No external libs. Worker is owned by useSpectrogramCache.
 */

export interface SpectrogramRequest {
  channelId: string;
  signal: Float32Array;
  sampleRate: number;
  fftSize: number;     // must be power of two; default 256
  overlap: number;     // 0..1; default 0.5
  /** Frequency band of clinical interest, used to set dbMin/dbMax for the
   *  colormap so the band of interest isn't crushed by DC or HF noise. */
  fMin?: number;       // Hz, default 0.5
  fMax?: number;       // Hz, default 30
}

export interface SpectrogramResponse {
  channelId: string;
  spectrogram: Float32Array; // frames × nBins, row-major, dB
  nFrames: number;
  nBins: number;             // fftSize/2 + 1
  binHz: number;             // Hz per bin
  frameSec: number;          // seconds per frame (hop / sampleRate)
  dbMin: number;             // min dB observed within [fMin, fMax]
  dbMax: number;             // max dB observed within [fMin, fMax]
  ok: true;
}

export interface SpectrogramError {
  channelId: string;
  ok: false;
  error: string;
}

// ── Real radix-2 FFT, in-place on interleaved [Re, Im, Re, Im, ...] array. ──
// Standard Cooley-Tukey decimation-in-time. Pure JS, no deps.
function fftRadix2InPlace(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  // Bit-reverse permutation.
  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) {
      j ^= bit;
    }
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }
  // Butterflies.
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let wkRe = 1;
      let wkIm = 0;
      for (let k = 0; k < half; k++) {
        const tRe = wkRe * re[i + k + half] - wkIm * im[i + k + half];
        const tIm = wkRe * im[i + k + half] + wkIm * re[i + k + half];
        re[i + k + half] = re[i + k] - tRe;
        im[i + k + half] = im[i + k] - tIm;
        re[i + k] += tRe;
        im[i + k] += tIm;
        const nwRe = wkRe * wRe - wkIm * wIm;
        const nwIm = wkRe * wIm + wkIm * wRe;
        wkRe = nwRe;
        wkIm = nwIm;
      }
    }
  }
}

function hannWindow(n: number): Float32Array {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
  }
  return w;
}

function isPow2(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

function computeSpectrogram(req: SpectrogramRequest): SpectrogramResponse | SpectrogramError {
  const { channelId, signal, sampleRate, fftSize, overlap } = req;
  if (!isPow2(fftSize)) {
    return { channelId, ok: false, error: `fftSize must be power of 2, got ${fftSize}` };
  }
  if (signal.length < fftSize) {
    // Not enough samples — return a single all-floor frame so callers can render an empty strip.
    const nBins = (fftSize >> 1) + 1;
    return {
      channelId,
      spectrogram: new Float32Array(nBins).fill(-120),
      nFrames: 1,
      nBins,
      binHz: sampleRate / fftSize,
      frameSec: fftSize / sampleRate,
      dbMin: -120,
      dbMax: -120,
      ok: true,
    };
  }

  const hop = Math.max(1, Math.floor(fftSize * (1 - overlap)));
  const nFrames = Math.max(1, Math.floor((signal.length - fftSize) / hop) + 1);
  const nBins = (fftSize >> 1) + 1;
  const win = hannWindow(fftSize);
  const re = new Float32Array(fftSize);
  const im = new Float32Array(fftSize);
  const spec = new Float32Array(nFrames * nBins);

  const fMin = req.fMin ?? 0.5;
  const fMax = req.fMax ?? 30;
  const binHz = sampleRate / fftSize;
  const kLo = Math.max(1, Math.floor(fMin / binHz));
  const kHi = Math.min(nBins - 1, Math.ceil(fMax / binHz));

  let dbMin = Infinity;
  let dbMax = -Infinity;

  // Floor for log to avoid -Infinity on perfect silence.
  const eps = 1e-12;

  for (let f = 0; f < nFrames; f++) {
    const off = f * hop;
    // Load + window.
    for (let i = 0; i < fftSize; i++) {
      re[i] = signal[off + i] * win[i];
      im[i] = 0;
    }
    fftRadix2InPlace(re, im);
    // Power → dB (one-sided spectrum).
    for (let k = 0; k < nBins; k++) {
      const p = re[k] * re[k] + im[k] * im[k];
      const db = 10 * Math.log10(p / fftSize + eps);
      spec[f * nBins + k] = db;
      // Track dynamic range only within the clinical band, so DC + line noise
      // outside it don't blow out the colormap.
      if (k >= kLo && k <= kHi) {
        if (db < dbMin) dbMin = db;
        if (db > dbMax) dbMax = db;
      }
    }
  }

  if (!isFinite(dbMin) || !isFinite(dbMax)) {
    dbMin = -120;
    dbMax = 0;
  }
  // Guard against zero-width range.
  if (dbMax - dbMin < 1) {
    dbMax = dbMin + 1;
  }

  return {
    channelId,
    spectrogram: spec,
    nFrames,
    nBins,
    binHz,
    frameSec: hop / sampleRate,
    dbMin,
    dbMax,
    ok: true,
  };
}

self.onmessage = (e: MessageEvent<SpectrogramRequest>) => {
  const result = computeSpectrogram(e.data);
  if (result.ok) {
    // Transfer the underlying buffer to avoid a copy.
    (self as unknown as Worker).postMessage(result, [result.spectrogram.buffer]);
  } else {
    (self as unknown as Worker).postMessage(result);
  }
};

// Empty export so TS treats this file as a module under isolatedModules.
export {};
