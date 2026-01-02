export const READ_API_OVERRIDE_LS_KEY = "enceph.admin.readApiBase.override";

// Local dev Read API
export const LOCAL_READ_API_DEFAULT = "http://127.0.0.1:8787";

// ✅ Current Azure Read API FQDN (update if it changes)
export const PROD_READ_API_DEFAULT =
  "https://enceph-readapi.whitecoast-5be3fbc0.centralindia.azurecontainerapps.io";

function trimSlashes(s: string): string {
  return (s || "").trim().replace(/\/+$/, "");
}

export function resolveReadApiBase(): string {
  // 1) localStorage override wins
  try {
    const ls = trimSlashes(localStorage.getItem(READ_API_OVERRIDE_LS_KEY) || "");
    if (ls) return ls;
  } catch {}

  // 2) env default next
  const envBase = trimSlashes((import.meta as any).env?.VITE_ENCEPH_READ_API_BASE || "");
  if (envBase) return envBase;

  // 3) hostname heuristic fallback
  const host = (typeof window !== "undefined" && window.location?.hostname) || "";
  const isLocal = host === "localhost" || host === "127.0.0.1";
  return isLocal ? LOCAL_READ_API_DEFAULT : PROD_READ_API_DEFAULT;
}

export function getReadApiKey(): string {
  return ((import.meta as any).env?.VITE_ENCEPH_READ_API_KEY || "").trim();
}
