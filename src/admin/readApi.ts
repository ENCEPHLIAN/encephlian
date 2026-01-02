import { getReadApiKey, resolveReadApiBase } from "./config";

export type ReadApiResult<T> =
  | { ok: true; data: T; ms: number }
  | { ok: false; error: string; ms: number };

function nowMs(): number {
  return (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
}

function base(): string {
  const b = resolveReadApiBase();
  if (!b) throw new Error("Missing Read API base URL");
  return b.replace(/\/+$/, "");
}

function key(): string {
  return getReadApiKey();
}

async function req<T>(path: string, init?: RequestInit): Promise<ReadApiResult<T>> {
  const t0 = nowMs();
  try {
    const url = `${base()}${path}`;
    const headers: Record<string, string> = { ...(init?.headers as any) };

    const k = key();
    if (k) headers["x-api-key"] = k;

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
    const url = `${base()}/studies/${encodeURIComponent(studyId)}/chunk.bin?start=${start}&length=${length}&root=${encodeURIComponent(root)}`;
    const headers: Record<string, string> = {};
    const k = key();
    if (k) headers["x-api-key"] = k;

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
  return !!getReadApiKey();
}
