import { getReadApiKey, resolveReadApiBase } from "@/shared/readApiConfig";

export type FetchResult<T> =
  | { ok: true; status: number; ms: number; data: T; headers: Record<string, string> }
  | { ok: false; status: number | null; ms: number; error: string };

function nowMs(): number {
  return (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
}

function toHeaderMap(h: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  h.forEach((v, k) => (out[k.toLowerCase()] = v));
  return out;
}

export async function fetchJson<T>(
  path: string,
  opts?: { timeoutMs?: number; base?: string; requireKey?: boolean }
): Promise<FetchResult<T>> {
  const t0 = nowMs();
  const base = (opts?.base || resolveReadApiBase()).replace(/\/+$/, "");
  const url = `${base}${path.startsWith("/") ? "" : "/"}${path}`;

  const key = getReadApiKey();
  const requireKey = opts?.requireKey ?? false;

  if (requireKey && !key) {
    return { ok: false, status: null, ms: 0, error: "Missing VITE_ENCEPH_READ_API_KEY" };
  }

  const controller = new AbortController();
  const timeoutMs = opts?.timeoutMs ?? 20000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        ...(key ? { "X-API-KEY": key } : {}),
      },
    });

    const ms = nowMs() - t0;
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, status: res.status, ms, error: text || `HTTP ${res.status}` };
    }
    const data = (await res.json()) as T;
    return { ok: true, status: res.status, ms, data, headers: toHeaderMap(res.headers) };
  } catch (e: any) {
    const ms = nowMs() - t0;
    const msg =
      e?.name === "AbortError" ? `Timeout after ${timeoutMs}ms` : (e?.message || String(e));
    return { ok: false, status: null, ms, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchBinary(
  path: string,
  opts?: { timeoutMs?: number; base?: string; requireKey?: boolean }
): Promise<FetchResult<ArrayBuffer>> {
  const t0 = nowMs();
  const base = (opts?.base || resolveReadApiBase()).replace(/\/+$/, "");
  const url = `${base}${path.startsWith("/") ? "" : "/"}${path}`;

  const key = getReadApiKey();
  const requireKey = opts?.requireKey ?? false;

  if (requireKey && !key) {
    return { ok: false, status: null, ms: 0, error: "Missing VITE_ENCEPH_READ_API_KEY" };
  }

  const controller = new AbortController();
  const timeoutMs = opts?.timeoutMs ?? 20000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        ...(key ? { "X-API-KEY": key } : {}),
      },
    });

    const ms = nowMs() - t0;
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, status: res.status, ms, error: text || `HTTP ${res.status}` };
    }
    const buf = await res.arrayBuffer();
    return { ok: true, status: res.status, ms, data: buf, headers: toHeaderMap(res.headers) };
  } catch (e: any) {
    const ms = nowMs() - t0;
    const msg =
      e?.name === "AbortError" ? `Timeout after ${timeoutMs}ms` : (e?.message || String(e));
    return { ok: false, status: null, ms, error: msg };
  } finally {
    clearTimeout(timer);
  }
}
