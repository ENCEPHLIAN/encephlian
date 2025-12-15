/**
 * Encephlian Read API configuration and client
 * Reads from VITE_ENCEPH_READ_API_BASE and VITE_ENCEPH_READ_API_KEY
 */

// Dev defaults - remove before production
const API_BASE = import.meta.env.VITE_ENCEPH_READ_API_BASE || 'https://placement-ala-katrina-rush.trycloudflare.com';
const API_KEY = import.meta.env.VITE_ENCEPH_READ_API_KEY || 'dev-secret';

interface FetchOptions extends RequestInit {
  params?: Record<string, string | number>;
  skipAuth?: boolean;
}

export async function readApiFetch<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
  const { params, skipAuth, ...fetchOptions } = options;
  
  let url = `${API_BASE}${endpoint}`;
  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      searchParams.append(key, String(value));
    });
    url += `?${searchParams.toString()}`;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...fetchOptions.headers as Record<string, string>,
  };

  // Only add API key if not skipping auth
  if (!skipAuth && API_KEY) {
    headers['X-API-KEY'] = API_KEY;
  }

  const response = await fetch(url, {
    ...fetchOptions,
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new ApiError(response.status, errorText);
  }

  return response.json();
}

export class ApiError extends Error {
  constructor(public status: number, public details: string) {
    super(`API Error ${status}: ${details}`);
    this.name = 'ApiError';
  }
}

export interface CanonicalMeta {
  study_id: string;
  n_channels: number;
  sampling_rate_hz: number;
  n_samples: number;
  canonical_version?: string;
  converter_id?: string;
  channel_map?: Array<{
    index: number;
    canonical_id: string;
    original_label: string;
    unit: string;
  }>;
  source?: {
    vendor: string;
    format: string;
  };
}

export interface NormalAbnormalResult {
  task: string;
  method: string;
  score_abnormal: number;
  decision: string;
}

export interface StudyMetaResponse {
  meta: CanonicalMeta;
  normal_abnormal?: NormalAbnormalResult;
}

export interface ChunkResponse {
  study_id: string;
  start_sample: number;
  length: number;
  n_channels: number;
  data_b64: string;
}

export interface ArtifactResponse {
  study_id: string;
  start_sample: number;
  length: number;
  mask_b64: string;
}

export interface HealthResponse {
  status: string;
  version?: string;
}

export async function checkHealth(): Promise<HealthResponse> {
  return readApiFetch<HealthResponse>('/health', { skipAuth: true });
}

export async function fetchStudyMeta(studyId: string): Promise<StudyMetaResponse> {
  return readApiFetch<StudyMetaResponse>(`/studies/${studyId}/meta`);
}

export async function fetchStudyChunk(
  studyId: string,
  startSample: number,
  length: number
): Promise<ChunkResponse> {
  return readApiFetch<ChunkResponse>(`/studies/${studyId}/chunk`, {
    params: { start: startSample, length },
  });
}

export async function fetchArtifactMask(
  studyId: string,
  startSample: number,
  length: number
): Promise<ArtifactResponse> {
  return readApiFetch<ArtifactResponse>(`/studies/${studyId}/artifact`, {
    params: { start: startSample, length },
  });
}

export function isApiConfigured(): boolean {
  return Boolean(API_BASE && API_KEY);
}

export function getApiBase(): string {
  return API_BASE;
}
