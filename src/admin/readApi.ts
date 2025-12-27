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
    super(details);
  }
}

export type CanonicalMeta = {
  n_channels?: number;
  sampling_rate_hz?: number;
  duration_s?: number;
  channel_names?: string[];
  channel_map?: Array<{ index: number; canonical_id?: string; original_label?: string }>;
};

function buildUrl(endpoint: string, params?: Params) {
  const url = new URL(endpoint, API_BASE);
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

  const r = await fetch(buildUrl(endpoint, opts.params), {
    method: "GET",
    headers,
  });

  if (!r.ok) {
    const details = await r.text().catch(() => "");
    throw new ApiError(r.status, details || `HTTP ${r.status}`);
  }
  return r;
}

export async function checkHealth(): Promise<{ ok: boolean }> {
  const r = await apiFetch("/health", { skipAuth: true });
  return r.json();
}

export async function fetchStudyMeta(studyId: string): Promise<CanonicalMeta> {
  const r = await apiFetch(`/studies/${studyId}/meta`, { params: { root: "." } });
  return r.json();
}

export async function fetchArtifacts(studyId: string): Promise<any> {
  const r = await apiFetch(`/studies/${studyId}/artifacts`, { params: { root: "." } });
  return r.json();
}

/**
 * Binary chunk: float32, channel-major (planar), headers include x-eeg-*
 * Returns Float32Array + header info.
 */
export async function fetchChunkBin(studyId: string, start: number, length: number) {
  const r = await apiFetch(`/studies/${studyId}/chunk.bin`, { params: { root: ".", start, length } });

  const h = (name: string) => r.headers.get(name) ?? r.headers.get(name.toLowerCase()) ?? r.headers.get(name.toUpperCase());
  const nCh = Number(h("x-eeg-channel-count") ?? h("x-eeg-nchannels") ?? h("X-EEG-NCHANNELS") ?? "0");
  const nSamp = Number(h("x-eeg-samples-per-channel") ?? h("x-eeg-length") ?? h("X-EEG-LENGTH") ?? "0");
  const sr = Number(h("x-eeg-sample-rate-hz") ?? h("x-eeg-samplerate") ?? h("X-EEG-SAMPLERATE") ?? "0");
  const dtype = h("x-eeg-dtype") ?? h("X-EEG-DTYPE") ?? "f32le";
  const layout = h("x-eeg-layout") ?? "planar";
  const channelIds = (h("x-eeg-channel-ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const sha256 = h("x-eeg-content-sha256") ?? "";

  const buf = await r.arrayBuffer();
  const data = new Float32Array(buf);

  return { data, nCh, nSamp, sr, dtype, layout, channelIds, sha256 };
}
