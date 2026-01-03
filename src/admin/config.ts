export const READ_API_OVERRIDE_LS_KEY = "enceph.admin.readApiBase.override";

export const LOCAL_READ_API_DEFAULT = "http://127.0.0.1:8787";
export const PROD_READ_API_DEFAULT =
  "https://enceph-readapi.whitecoast-5be3fbc0.centralindia.azurecontainerapps.io";

function trimSlashes(s: string): string {
  return (s || "").trim().replace(/\/+$/, "");
}

export function getEnvReadApiBase(): string {
  return trimSlashes(String((import.meta as any).env?.VITE_ENCEPH_READ_API_BASE || ""));
}

export function getReadApiKey(): string {
  return String((import.meta as any).env?.VITE_ENCEPH_READ_API_KEY || "").trim();
}

export function resolveReadApiBase(): string {
  // 1) localStorage override (highest priority)
  try {
    const ov = trimSlashes(localStorage.getItem(READ_API_OVERRIDE_LS_KEY) || "");
    if (ov) return ov;
  } catch {}

  // 2) env base (build-time / runtime for Vite dev)
  const envBase = getEnvReadApiBase();
  if (envBase) return envBase;

  // 3) host-based fallback
  const host =
    typeof window !== "undefined" && window.location?.hostname
      ? window.location.hostname
      : "";
  const isLocal = host === "localhost" || host === "127.0.0.1";
  return isLocal ? LOCAL_READ_API_DEFAULT : PROD_READ_API_DEFAULT;
}

export function setReadApiBaseOverride(base: string) {
  const v = trimSlashes(base);
  if (!v) return;
  try {
    localStorage.setItem(READ_API_OVERRIDE_LS_KEY, v);
  } catch {}
}

export function clearReadApiBaseOverride() {
  try {
    localStorage.removeItem(READ_API_OVERRIDE_LS_KEY);
  } catch {}
}
