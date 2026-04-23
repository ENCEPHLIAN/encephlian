/** Extract study UUID from Read API path tail (e.g. /studies/{uuid}/meta). */
export function extractStudyIdFromReadApiTail(tail: string): string | null {
  const m = tail.match(/\/studies\/([0-9a-fA-F-]{36})\b/i);
  return m?.[1] ?? null;
}

/** chunk.bin polling would flood pipeline_events — only log coarse assets + errors. */
export function isReadApiChunkBinPath(tail: string): boolean {
  return /\/chunk\.bin(?:\?|$)/i.test(tail);
}
