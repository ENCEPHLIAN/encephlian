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

export function getReadApiProxyBase(): string | null {
  const supabaseUrl = String((import.meta as any).env?.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
  if (!supabaseUrl) return null;
  return `${supabaseUrl}/functions/v1/read_api_proxy`;
}

function join(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}${path.startsWith("/") ? "" : "/"}${path}`;
}

function getGatewayHeaders(): Record<string, string> {
  const anon = String((import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY || "").trim();
  if (!anon) return {};
  return {
    apikey: anon,
    Authorization: `Bearer ${anon}`,
  };
}

export async function fetchJson<T>(
  path: string,
  opts?: { timeoutMs?: number; base?: string; requireKey?: boolean; method?: 'GET' | 'POST'; body?: unknown }
): Promise<FetchResult<T>> {
  const t0 = nowMs();

  const key = getReadApiKey();
  const requireKey = opts?.requireKey ?? false;
  const proxyBase = getReadApiProxyBase();
  const method = opts?.method || 'GET';

  const directBase = (opts?.base || resolveReadApiBase()).replace(/\/+$/, "");
  const baseToUse = (requireKey && !key && proxyBase) ? proxyBase : directBase;
  const url = join(baseToUse, path);

  if (requireKey && !key && !proxyBase) {
    return { ok: false, status: null, ms: 0, error: "Missing Read API key (no proxy available)" };
  }

  const controller = new AbortController();
  const timeoutMs = opts?.timeoutMs ?? 20000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const usingProxy = !!proxyBase && baseToUse === proxyBase;

    const headers: Record<string, string> = {
      ...(usingProxy ? getGatewayHeaders() : {}),
      ...(!usingProxy && key ? { "X-API-KEY": key } : {}),
    };

    if (method === 'POST' && opts?.body) {
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(url, {
      method,
      signal: controller.signal,
      headers,
      body: method === 'POST' && opts?.body ? JSON.stringify(opts.body) : undefined,
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

  const key = getReadApiKey();
  const requireKey = opts?.requireKey ?? false;
  const proxyBase = getReadApiProxyBase();

  const directBase = (opts?.base || resolveReadApiBase()).replace(/\/+$/, "");
  const baseToUse = (requireKey && !key && proxyBase) ? proxyBase : directBase;
  const url = join(baseToUse, path);

  if (requireKey && !key && !proxyBase) {
    return { ok: false, status: null, ms: 0, error: "Missing Read API key (no proxy available)" };
  }

  const controller = new AbortController();
  const timeoutMs = opts?.timeoutMs ?? 20000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const usingProxy = !!proxyBase && baseToUse === proxyBase;

    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        ...(usingProxy ? getGatewayHeaders() : {}),
        ...(!usingProxy && key ? { "X-API-KEY": key } : {}),
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

