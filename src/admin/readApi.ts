// Consolidated Read API wrapper using shared client
import { fetchJson, fetchBinary, getReadApiProxyBase, type FetchResult } from "@/shared/readApiClient";
import { getReadApiKey, resolveReadApiBase } from "@/shared/readApiConfig";

export type ReadApiResult<T> =
  | { ok: true; data: T; ms: number }
  | { ok: false; error: string; ms: number };

// Canonical meta type for EEG study metadata
export interface CanonicalMeta {
  sampling_rate_hz: number;
  n_samples: number;
  n_channels: number;
  channel_map?: Array<{ index: number; canonical_id: string; original_label?: string }>;
  duration_sec?: number;
  [key: string]: any;
}

function toReadApiResult<T>(result: FetchResult<T>): ReadApiResult<T> {
  if (result.ok === true) {
    return { ok: true, data: result.data, ms: Math.round(result.ms) };
  }
  // TypeScript now knows result.ok === false
  const errorResult = result as { ok: false; error: string; ms: number };
  return { ok: false, error: errorResult.error, ms: Math.round(result.ms) };
}

export async function getHealth(): Promise<ReadApiResult<{ ok: boolean }>> {
  const result = await fetchJson<{ ok: boolean }>("/health", { timeoutMs: 8000 });
  return toReadApiResult(result);
}

export async function getMeta(studyId: string, root = "."): Promise<ReadApiResult<any>> {
  const result = await fetchJson<any>(
    `/studies/${encodeURIComponent(studyId)}/meta?root=${encodeURIComponent(root)}`,
    { timeoutMs: 20000, requireKey: true }
  );
  return toReadApiResult(result);
}

export async function getArtifacts(studyId: string, root = "."): Promise<ReadApiResult<any>> {
  const result = await fetchJson<any>(
    `/studies/${encodeURIComponent(studyId)}/artifacts?root=${encodeURIComponent(root)}`,
    { timeoutMs: 20000, requireKey: true }
  );
  return toReadApiResult(result);
}

export async function getAnnotations(studyId: string, root = "."): Promise<ReadApiResult<any>> {
  const result = await fetchJson<any>(
    `/studies/${encodeURIComponent(studyId)}/annotations?root=${encodeURIComponent(root)}`,
    { timeoutMs: 20000, requireKey: true }
  );
  return toReadApiResult(result);
}

export async function getSegments(studyId: string, root = "."): Promise<ReadApiResult<any>> {
  const result = await fetchJson<any>(
    `/studies/${encodeURIComponent(studyId)}/segments?root=${encodeURIComponent(root)}`,
    { timeoutMs: 20000, requireKey: true }
  );
  return toReadApiResult(result);
}

export async function getChunkHeaders(
  studyId: string,
  start: number,
  length: number,
  root = "."
): Promise<{ ok: true; headers: Record<string, string>; ms: number } | { ok: false; error: string; ms: number }> {
  const result = await fetchBinary(
    `/studies/${encodeURIComponent(studyId)}/chunk.bin?start=${start}&length=${length}&root=${encodeURIComponent(root)}`,
    { timeoutMs: 20000, requireKey: true }
  );
  if (result.ok === true) {
    return { ok: true, headers: result.headers, ms: Math.round(result.ms) };
  }
  const errorResult = result as { ok: false; error: string; ms: number };
  return { ok: false, error: errorResult.error, ms: Math.round(result.ms) };
}

export async function getChunkBinary(
  studyId: string,
  start: number,
  length: number,
  root = "."
): Promise<{ ok: true; data: ArrayBuffer; headers: Record<string, string>; ms: number } | { ok: false; error: string; ms: number }> {
  const result = await fetchBinary(
    `/studies/${encodeURIComponent(studyId)}/chunk.bin?start=${start}&length=${length}&root=${encodeURIComponent(root)}`,
    { timeoutMs: 30000, requireKey: true }
  );
  if (result.ok === true) {
    return { ok: true, data: result.data, headers: result.headers, ms: Math.round(result.ms) };
  }
  const errorResult = result as { ok: false; error: string; ms: number };
  return { ok: false, error: errorResult.error, ms: Math.round(result.ms) };
}

export function getResolvedBaseForUI(): string {
  return resolveReadApiBase();
}

export function getResolvedKeyPresent(): boolean {
  return !!getReadApiKey() || !!getReadApiProxyBase();
}
