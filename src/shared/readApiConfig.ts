export const READ_API_OVERRIDE_LS_KEY = "enceph.readApiBase.override.v3";
const READ_API_OVERRIDE_LS_KEY_OLD_ADMIN = "enceph.admin.readApiBase.override.v2";
const READ_API_OVERRIDE_LS_KEY_OLD_APP = "enceph.admin.readApiBase.override";

export const LOCAL_READ_API_DEFAULT = "http://127.0.0.1:8787";

// ✅ Your current Azure Read API FQDN (whitecoast)
export const PROD_READ_API_DEFAULT =
  "https://enceph-readapi.whitecoast-5be3fbc0.centralindia.azurecontainerapps.io";

export function trimSlashes(s: string): string {
  return (s || "").trim().replace(/\/+$/, "");
}

export function getEnvReadApiBase(): string {
  return trimSlashes((import.meta as any).env?.VITE_ENCEPH_READ_API_BASE || "");
}

export function resolveReadApiBase(): string {
  // 1) localStorage override wins
  try {
    const ls = trimSlashes(localStorage.getItem(READ_API_OVERRIDE_LS_KEY) || "");
    if (ls) return ls;
  } catch {}

  // 2) env default next
  const envBase = getEnvReadApiBase();
  if (envBase) return envBase;

  // 3) fallback based on host
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
    localStorage.removeItem(READ_API_OVERRIDE_LS_KEY_OLD_ADMIN);
    localStorage.removeItem(READ_API_OVERRIDE_LS_KEY_OLD_APP);
  } catch {}
}

export function getReadApiKey(): string {
  return ((import.meta as any).env?.VITE_ENCEPH_READ_API_KEY || "").trim();
}
