import { useCallback, useRef } from "react";

const BLOCK_SEC = 2;

export interface CachedBlock {
  blockIdx: number;
  data: number[][];
  fetchedAt: number;
}

export interface ChunkCacheOptions {
  nChannels: number;
  samplingRate: number;
  totalSamples: number;
  fetchBlock: (startSample: number, lengthSamples: number) => Promise<number[][]>;
}

export function useEEGChunkCache(options: ChunkCacheOptions) {
  const cacheRef = useRef<Map<number, CachedBlock>>(new Map());
  const inFlightRef = useRef<Set<number>>(new Set());
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const getBlockLen = useCallback(() => {
    return Math.floor(BLOCK_SEC * optionsRef.current.samplingRate);
  }, []);

  const getBlockIdx = useCallback((startSample: number) => {
    const blockLen = getBlockLen();
    return Math.floor(startSample / blockLen);
  }, [getBlockLen]);

  const fetchBlockIfNeeded = useCallback(async (blockIdx: number): Promise<CachedBlock | null> => {
    const cache = cacheRef.current;
    const inFlight = inFlightRef.current;
    const { samplingRate, totalSamples, fetchBlock } = optionsRef.current;
    const blockLen = getBlockLen();

    // Already cached
    if (cache.has(blockIdx)) {
      return cache.get(blockIdx)!;
    }

    // Already fetching
    if (inFlight.has(blockIdx)) {
      return null;
    }

    const startSample = blockIdx * blockLen;
    if (startSample >= totalSamples || startSample < 0) {
      return null;
    }

    const lengthSamples = Math.min(blockLen, totalSamples - startSample);
    if (lengthSamples <= 0) return null;

    inFlight.add(blockIdx);

    try {
      const data = await fetchBlock(startSample, lengthSamples);
      const block: CachedBlock = {
        blockIdx,
        data,
        fetchedAt: Date.now(),
      };
      cache.set(blockIdx, block);
      return block;
    } catch (e) {
      console.error(`Failed to fetch block ${blockIdx}:`, e);
      return null;
    } finally {
      inFlight.delete(blockIdx);
    }
  }, [getBlockLen]);

  const prefetchBlocks = useCallback(async (currentBlockIdx: number): Promise<void> => {
    // Prefetch idx-2..idx+2
    const blocksToFetch: number[] = [];
    for (let i = currentBlockIdx - 2; i <= currentBlockIdx + 2; i++) {
      if (i >= 0 && !cacheRef.current.has(i) && !inFlightRef.current.has(i)) {
        blocksToFetch.push(i);
      }
    }

    // Fetch in parallel
    await Promise.all(blocksToFetch.map(idx => fetchBlockIfNeeded(idx)));
  }, [fetchBlockIfNeeded]);

  const evictOldBlocks = useCallback((currentBlockIdx: number) => {
    const cache = cacheRef.current;
    const minIdx = currentBlockIdx - 10;
    const maxIdx = currentBlockIdx + 10;

    const toEvict: number[] = [];
    cache.forEach((_, idx) => {
      if (idx < minIdx || idx > maxIdx) {
        toEvict.push(idx);
      }
    });

    toEvict.forEach(idx => cache.delete(idx));
  }, []);

  const getWindowData = useCallback((startSample: number, lengthSamples: number): number[][] | null => {
    const cache = cacheRef.current;
    const blockLen = getBlockLen();
    const { nChannels, totalSamples } = optionsRef.current;

    const startBlockIdx = Math.floor(startSample / blockLen);
    const endSample = Math.min(startSample + lengthSamples, totalSamples);
    const endBlockIdx = Math.floor((endSample - 1) / blockLen);

    // Check if all required blocks are cached
    for (let idx = startBlockIdx; idx <= endBlockIdx; idx++) {
      if (!cache.has(idx)) {
        return null; // Not all blocks available yet
      }
    }

    // Stitch blocks together
    const result: number[][] = Array.from({ length: nChannels }, () => []);

    for (let idx = startBlockIdx; idx <= endBlockIdx; idx++) {
      const block = cache.get(idx)!;
      const blockStart = idx * blockLen;
      const blockDataLen = block.data[0]?.length || 0;
      
      // Calculate which portion of this block we need
      const copyStart = Math.max(0, startSample - blockStart);
      const blockEnd = blockStart + blockDataLen;
      const copyEnd = Math.min(blockDataLen, endSample - blockStart);

      for (let ch = 0; ch < nChannels && ch < block.data.length; ch++) {
        const slice = block.data[ch].slice(copyStart, copyEnd);
        result[ch].push(...slice);
      }
    }

    return result;
  }, [getBlockLen]);

  const updateCache = useCallback(async (startSample: number, lengthSamples: number): Promise<number[][] | null> => {
    const blockLen = getBlockLen();
    const currentBlockIdx = Math.floor(startSample / blockLen);

    // Evict old blocks
    evictOldBlocks(currentBlockIdx);

    // Prefetch nearby blocks
    await prefetchBlocks(currentBlockIdx);

    // Return stitched window data
    return getWindowData(startSample, lengthSamples);
  }, [getBlockLen, evictOldBlocks, prefetchBlocks, getWindowData]);

  const clearCache = useCallback(() => {
    cacheRef.current.clear();
    inFlightRef.current.clear();
  }, []);

  const getCacheStats = useCallback(() => {
    return {
      cachedBlocks: cacheRef.current.size,
      inFlightBlocks: inFlightRef.current.size,
      blockIndices: Array.from(cacheRef.current.keys()).sort((a, b) => a - b),
    };
  }, []);

  return {
    updateCache,
    getWindowData,
    clearCache,
    getCacheStats,
    getBlockIdx,
    getBlockLen,
  };
}
