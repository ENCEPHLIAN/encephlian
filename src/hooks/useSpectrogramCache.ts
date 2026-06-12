/**
 * useSpectrogramCache — owns the spectrogram Web Worker, queues per-channel
 * FFT jobs, and serves cached results.
 *
 * Cache key: `${channelId}|${windowStart.toFixed(3)}|${windowSec.toFixed(3)}|${sampleRate}|${fftSize}|${overlap}`.
 * LRU eviction once `maxEntries` is reached (default 64) — at 5 channels per
 * window that's ~13 windows of history, plenty for paging back and forth.
 *
 * The hook does NOT own signal extraction; the caller passes in
 * `getChannelSignal(channelId) -> Float32Array | null`. This keeps the cache
 * agnostic to whether the data lives in a Three.js buffer, an ESF response,
 * or a raw EDF slice.
 *
 * Returns:
 *   - spectrograms: map of channelId → response (undefined while computing)
 *   - loading: set of channelIds currently in-flight
 *   - meta: { fftSize, overlap, binHz, frameSec } once at least one result lands
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  SpectrogramRequest,
  SpectrogramResponse,
} from "@/components/viewer/spectrogram-worker";
// Vite-native worker import. The ?worker query yields a constructor.
import SpectrogramWorker from "@/components/viewer/spectrogram-worker.ts?worker";

export interface UseSpectrogramCacheOpts {
  studyId: string | null | undefined;
  windowStart: number;
  windowSec: number;
  channels: string[];
  sampleRate: number;
  /** Pull the windowed Float32Array for a channel. Return null if unavailable. */
  getChannelSignal: (channelId: string) => Float32Array | null;
  /** FFT length (power of 2). Default 256 — ~1 Hz bin at 250 Hz. */
  fftSize?: number;
  /** Frame overlap, 0..1. Default 0.5. */
  overlap?: number;
  /** Maximum cached entries (LRU). Default 64. */
  maxEntries?: number;
  /** Skip computation entirely (e.g., panel is collapsed). Default false. */
  paused?: boolean;
}

export interface SpectrogramMeta {
  fftSize: number;
  overlap: number;
  binHz: number;
  frameSec: number;
}

export interface UseSpectrogramCacheResult {
  spectrograms: Record<string, SpectrogramResponse | undefined>;
  loading: Set<string>;
  meta: SpectrogramMeta | null;
}

function cacheKey(
  channelId: string,
  studyId: string | null | undefined,
  windowStart: number,
  windowSec: number,
  sampleRate: number,
  fftSize: number,
  overlap: number,
): string {
  const sid = studyId ?? "-";
  return `${sid}|${channelId}|${windowStart.toFixed(3)}|${windowSec.toFixed(3)}|${sampleRate}|${fftSize}|${overlap.toFixed(3)}`;
}

export function useSpectrogramCache(opts: UseSpectrogramCacheOpts): UseSpectrogramCacheResult {
  const {
    studyId,
    windowStart,
    windowSec,
    channels,
    sampleRate,
    getChannelSignal,
    fftSize = 256,
    overlap = 0.5,
    maxEntries = 64,
    paused = false,
  } = opts;

  // LRU cache: Map preserves insertion order; we re-insert on hit.
  const cacheRef = useRef<Map<string, SpectrogramResponse>>(new Map());
  const workerRef = useRef<Worker | null>(null);
  // Tracks in-flight cache keys so we don't dispatch duplicate jobs.
  const inflightRef = useRef<Set<string>>(new Set());
  // Track latest getChannelSignal in a ref so the dispatch effect doesn't
  // re-run every render (callers commonly pass an inline closure).
  const getSignalRef = useRef(getChannelSignal);
  useEffect(() => { getSignalRef.current = getChannelSignal; }, [getChannelSignal]);

  const [tick, setTick] = useState(0);
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const [meta, setMeta] = useState<SpectrogramMeta | null>(null);

  // ── Worker lifecycle ─────────────────────────────────────────────────────
  useEffect(() => {
    const worker = new SpectrogramWorker();
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent<SpectrogramResponse | { channelId: string; ok: false; error: string }>) => {
      const msg = e.data;
      // The worker echoes channelId; we need to figure out which cache key it
      // corresponds to. We stash that mapping at dispatch time.
      const pending = pendingByChannelRef.current.get(msg.channelId);
      if (!pending) return;
      pendingByChannelRef.current.delete(msg.channelId);

      if (!msg.ok) {
        // Silently drop failed jobs — UI shows skeleton for missing entries.
        inflightRef.current.delete(pending.key);
        setLoading(prev => {
          if (!prev.has(msg.channelId)) return prev;
          const next = new Set(prev);
          next.delete(msg.channelId);
          return next;
        });
        return;
      }

      // Insert into LRU. Re-insert (delete + set) keeps insertion-order recent.
      const cache = cacheRef.current;
      cache.delete(pending.key);
      cache.set(pending.key, msg);
      // Evict oldest entries when over capacity.
      while (cache.size > maxEntries) {
        const first = cache.keys().next();
        if (first.done) break;
        cache.delete(first.value);
      }
      inflightRef.current.delete(pending.key);

      setMeta(prev => prev ?? {
        fftSize,
        overlap,
        binHz: msg.binHz,
        frameSec: msg.frameSec,
      });
      setLoading(prev => {
        if (!prev.has(msg.channelId)) return prev;
        const next = new Set(prev);
        next.delete(msg.channelId);
        return next;
      });
      setTick(t => t + 1);
    };

    // Snapshot the refs we touch in cleanup — by the time React tears the
    // effect down the underlying objects haven't changed (they're owned by
    // this hook), but the linter prefers the explicit local capture.
    const pendingRef = pendingByChannelRef;
    const inflightSnapshotRef = inflightRef;
    return () => {
      worker.terminate();
      workerRef.current = null;
      pendingRef.current.clear();
      inflightSnapshotRef.current.clear();
    };
    // Worker is durable across windowStart/windowSec changes; only fftSize/overlap
    // recreate it (because cached entries become incompatible).
  }, [fftSize, overlap, maxEntries]);

  // Track which cache key a channelId is currently computing for.
  const pendingByChannelRef = useRef<Map<string, { key: string }>>(new Map());

  // ── Dispatch jobs whenever inputs change ─────────────────────────────────
  useEffect(() => {
    if (paused) return;
    const worker = workerRef.current;
    if (!worker) return;

    const needed: string[] = [];
    for (const ch of channels) {
      const key = cacheKey(ch, studyId, windowStart, windowSec, sampleRate, fftSize, overlap);
      const cache = cacheRef.current;
      if (cache.has(key)) {
        // Bump recency on hit.
        const v = cache.get(key)!;
        cache.delete(key);
        cache.set(key, v);
        continue;
      }
      if (inflightRef.current.has(key)) continue;
      needed.push(ch);
    }

    if (needed.length === 0) return;

    const nextLoading = new Set<string>();
    for (const ch of needed) {
      const signal = getSignalRef.current(ch);
      if (!signal || signal.length === 0) continue;
      const key = cacheKey(ch, studyId, windowStart, windowSec, sampleRate, fftSize, overlap);
      inflightRef.current.add(key);
      pendingByChannelRef.current.set(ch, { key });
      nextLoading.add(ch);
      const req: SpectrogramRequest = {
        channelId: ch,
        signal,
        sampleRate,
        fftSize,
        overlap,
        fMin: 0.5,
        fMax: 30,
      };
      // Note: we don't transfer signal.buffer because the caller may reuse it.
      worker.postMessage(req);
    }
    if (nextLoading.size > 0) {
      setLoading(prev => {
        const next = new Set(prev);
        for (const c of nextLoading) next.add(c);
        return next;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studyId, windowStart, windowSec, sampleRate, fftSize, overlap, paused, channels.join("|")]);

  // ── Project the cache to the channel set the caller asked for ────────────
  const spectrograms = useMemo<Record<string, SpectrogramResponse | undefined>>(() => {
    const out: Record<string, SpectrogramResponse | undefined> = {};
    for (const ch of channels) {
      const key = cacheKey(ch, studyId, windowStart, windowSec, sampleRate, fftSize, overlap);
      out[ch] = cacheRef.current.get(key);
    }
    return out;
    // tick is the cache-mutation signal; channels.join() handles array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, channels.join("|"), studyId, windowStart, windowSec, sampleRate, fftSize, overlap]);

  // Cancel cb for caller use (e.g., panel unmount) — currently a no-op because
  // the worker effect's cleanup terminates pending jobs implicitly.
  useEffect(() => {
    return () => { /* lifecycle handled by worker effect */ };
  }, []);

  return { spectrograms, loading, meta };
}
