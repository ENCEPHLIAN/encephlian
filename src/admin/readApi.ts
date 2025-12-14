/**
 * Encephlian Read API configuration and client
 * Reads from VITE_ENCEPH_READ_API_BASE and VITE_ENCEPH_READ_API_KEY
 */

const API_BASE = import.meta.env.VITE_ENCEPH_READ_API_BASE || '';
const API_KEY = import.meta.env.VITE_ENCEPH_READ_API_KEY || '';

interface FetchOptions extends RequestInit {
  params?: Record<string, string | number>;
}

export async function readApiFetch<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
  const { params, ...fetchOptions } = options;
  
  let url = `${API_BASE}${endpoint}`;
  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      searchParams.append(key, String(value));
    });
    url += `?${searchParams.toString()}`;
  }

  const response = await fetch(url, {
    ...fetchOptions,
    headers: {
      'X-API-KEY': API_KEY,
      'Content-Type': 'application/json',
      ...fetchOptions.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API Error ${response.status}: ${errorText}`);
  }

  return response.json();
}

export interface StudyMeta {
  study_id: string;
  n_channels: number;
  sampling_rate_hz: number;
  n_samples: number;
  channel_names: string[];
  normal_abnormal?: {
    decision: string;
    confidence?: number;
  };
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

export async function fetchStudyMeta(studyId: string): Promise<StudyMeta> {
  return readApiFetch<StudyMeta>(`/studies/${studyId}/meta`);
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
