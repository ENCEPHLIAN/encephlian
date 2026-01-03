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

function nowMs(): number {
  return (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
}

function base(): string {
  const b = resolveReadApiBase();
  if (!b) throw new Error("Missing Read API base URL");
  return b.replace(/\/+$/, "");
}

function proxyBase(): string {
  const s = String((import.meta as any).env?.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
  return s ? `${s}/functions/v1/read_api_proxy` : "";
}

function anonKey(): string {
  return String((import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY || "").trim();
}

function addProxyAuth(headers: Record<string, string>) {
  const anon = anonKey();
  if (!anon) return;
  headers["apikey"] = anon;
  headers["authorization"] = `Bearer ${anon}`;
}

function key(): string {
  return getReadApiKey();
}

function resolveUrl(path: string): string {
  const k = key();
  if (k) return `${base()}${path}`;
  const p = proxyBase();
  if (p) return `${p}${path}`;
  return `${base()}${path}`;
}

async function req<T>(path: string, init?: RequestInit): Promise<ReadApiResult<T>> {
  const t0 = nowMs();
  try {
    const url = resolveUrl(path);
    const headers: Record<string, string> = { ...(init?.headers as any) };

    const k = key();
    if (k) headers["x-api-key"] = k;

    const p = proxyBase();
    if (!k && p && url.startsWith(p)) addProxyAuth(headers);

    const res = await fetch(url, { ...init, headers });
    const ms = Math.round(nowMs() - t0);

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { ok: false, error: `${res.status} ${res.statusText}${txt ? ` — ${txt}` : ""}`, ms };
    }

    const data = (await res.json()) as T;
    return { ok: true, data, ms };
  } catch (e: any) {
    const ms = Math.round(nowMs() - t0);
    return { ok: false, error: e?.message || String(e), ms };
  }
}

export async function getHealth() {
  return req<{ ok: boolean }>("/health");
}

export async function getMeta(studyId: string, root = ".") {
  return req<any>(`/studies/${encodeURIComponent(studyId)}/meta?root=${encodeURIComponent(root)}`);
}

export async function getArtifacts(studyId: string, root = ".") {
  return req<any>(`/studies/${encodeURIComponent(studyId)}/artifacts?root=${encodeURIComponent(root)}`);
}

export async function getAnnotations(studyId: string, root = ".") {
  return req<any>(`/studies/${encodeURIComponent(studyId)}/annotations?root=${encodeURIComponent(root)}`);
}

export async function getSegments(studyId: string, root = ".") {
  return req<any>(`/studies/${encodeURIComponent(studyId)}/segments?root=${encodeURIComponent(root)}`);
}

export async function getChunkHeaders(studyId: string, start: number, length: number, root = ".") {
  const t0 = nowMs();
  try {
    const path = `/studies/${encodeURIComponent(studyId)}/chunk.bin?start=${start}&length=${length}&root=${encodeURIComponent(root)}`;
    const url = resolveUrl(path);

    const headers: Record<string, string> = {};
    const k = key();
    if (k) headers["x-api-key"] = k;

    const p = proxyBase();
    if (!k && p && url.startsWith(p)) addProxyAuth(headers);

    const res = await fetch(url, { method: "GET", headers });
    const ms = Math.round(nowMs() - t0);

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { ok: false as const, error: `${res.status} ${res.statusText}${txt ? ` — ${txt}` : ""}`, ms };
    }

    const h: Record<string, string> = {};
    res.headers.forEach((v, k) => (h[k.toLowerCase()] = v));
    return { ok: true as const, headers: h, ms };
  } catch (e: any) {
    const ms = Math.round(nowMs() - t0);
    return { ok: false as const, error: e?.message || String(e), ms };
  }
}

export function getResolvedBaseForUI(): string {
  return resolveReadApiBase();
}

export function getResolvedKeyPresent(): boolean {
  // The key is stored server-side; if we can use the proxy, treat it as present.
  return !!getReadApiKey() || !!proxyBase();
}
