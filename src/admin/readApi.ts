/**
 * Read API client (MVP lock: TUH_CANON_001)
 * - Uses VITE_ENCEPH_READ_API_BASE + VITE_ENCEPH_READ_API_KEY
 * - Supports JSON meta/artifacts + BINARY chunk.bin
 */

const API_BASE = (import.meta.env.VITE_ENCEPH_READ_API_BASE as string) || "";
const API_KEY = (import.meta.env.VITE_ENCEPH_READ_API_KEY as string) || "";

type Params = Record<string, string | number | boolean | undefined>;

export class ApiError extends Error {
  constructor(
    public status: number,
    public details: string,
  ) {
    super(`API Error ${status}: ${details}`);
    this.name = "ApiError";
  }
}

function buildUrl(path: string, params?: Params) {
  const url = new URL(path, API_BASE);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v === undefined) return;
      url.searchParams.set(k, String(v));
    });
  }
  return url.toString();
}

async function apiFetch(
  endpoint: string,
  opts: { params?: Params; skipAuth?: boolean; headers?: Record<string, string> } = {},
) {
  if (!API_BASE) throw new Error("Missing VITE_ENCEPH_READ_API_BASE");
  const headers: Record<string, string> = { ...(opts.headers || {}) };
  if (!opts.skipAuth) {
    if (!API_KEY) throw new Error("Missing VITE_ENCEPH_READ_API_KEY");
    headers["X-API-KEY"] = API_KEY;
  }
  const r = await fetch(buildUrl(endpoint, opts.params), { headers });
  if (!r.ok) throw new ApiError(r.status, await r.text());
  return r;
}

/* ---------- Types ---------- */
export interface CanonicalMeta {
  study_id: string;
  n_channels: number;
  sampling_rate_hz: number;
  n_samples: number;
  channel_map?: Array<{ index: number; canonical_id: string; original_label?: string; unit?: string }>;
}

export interface StudyMetaResponse {
  meta?: CanonicalMeta; // old server shape
  study_id?: string; // new server shape
  n_channels?: number;
  sampling_rate_hz?: number;
  n_samples?: number;
  channel_map?: CanonicalMeta["channel_map"];
}

export interface HealthResponse {
  ok?: boolean;
  status?: string;
  root?: string;
}

/* ---------- Minimal API ---------- */
export function isApiConfigured() {
  return Boolean(API_BASE && API_KEY);
}
export function getApiBase() {
  return API_BASE;
}

export async function checkHealth(): Promise<HealthResponse> {
  const r = await apiFetch("/health", { skipAuth: true });
  return r.json();
}

export async function fetchStudyMeta(studyId: string): Promise<CanonicalMeta> {
  const r = await apiFetch(`/studies/${studyId}/meta`, { params: { root: "." } });
  const j: StudyMetaResponse = await r.json();
  return (j.meta ?? j) as CanonicalMeta;
}

export async function fetchArtifacts(studyId: string): Promise<any> {
  const r = await apiFetch(`/studies/${studyId}/artifacts`, { params: { root: "." } });
  return r.json();
}

/**
 * Binary chunk: float32, channel-major, headers include x-eeg-*
 * Returns Float32Array + header info.
 */
export async function fetchChunkBin(studyId: string, start: number, length: number) {
  const r = await apiFetch(`/studies/${studyId}/chunk.bin`, { params: { root: ".", start, length } });

  const nCh = Number(r.headers.get("x-eeg-nchannels"));
  const nSamp = Number(r.headers.get("x-eeg-length"));
  const sr = Number(r.headers.get("x-eeg-samplerate"));
  const dtype = r.headers.get("x-eeg-dtype");

  const buf = await r.arrayBuffer();
  const data = new Float32Array(buf);

  return { data, nCh, nSamp, sr, dtype };
}
