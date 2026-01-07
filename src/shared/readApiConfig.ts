export const READ_API_OVERRIDE_LS_KEY = "enceph.readApiBase.override.v3";
const READ_API_OVERRIDE_LS_KEY_OLD_ADMIN = "enceph.admin.readApiBase.override.v2";
const READ_API_OVERRIDE_LS_KEY_OLD_APP = "enceph.admin.readApiBase.override";

export const LOCAL_READ_API_DEFAULT = "http://127.0.0.1:8787"\;

export const PROD_READ_API_DEFAULT =
  "https://enceph-readapi.whitecoast-5be3fbc0.centralindia.azurecontainerapps.io"\;

function trimSlashes(s: string) {
  return (s || "").trim().replace(/\/+$/, "");
}

export function getEnvBase(): string {
  return trimSlashes((import.meta as any).env?.VITE_ENCEPH_READ_API_BASE || "");
}

function isProbablyValidBase(base: string): boolean {
  const b = trimSlashes(base);
  if (!b) return false;

  // Kill legacy drift explicitly
  if (b.includes("happywater")) return false;

  // If it's localhost, accept http. Otherwise require https.
  if (b.startsWith("http://127.0.0.1") || b.startsWith("http://localhost")) return true;
  return b.startsWith("https://");
}

export function getReadApiBase(): string {
  // Highest priority: explicit env base
  const envBase = getEnvBase();
  if (isProbablyValidBase(envBase)) return envBase;

  // Next: user override, but only if sane
  const ls = trimSlashes(localStorage.getItem(READ_API_OVERRIDE_LS_KEY) || "");
  if (isProbablyValidBase(ls)) return ls;

  // Fallback: local vs prod
  const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  return isLocal ? LOCAL_READ_API_DEFAULT : PROD_READ_API_DEFAULT;
}

export function setReadApiOverride(base: string) {
  const v = trimSlashes(base);
  if (v) localStorage.setItem(READ_API_OVERRIDE_LS_KEY, v);
}

export function clearReadApiOverride() {
  localStorage.removeItem(READ_API_OVERRIDE_LS_KEY);
  localStorage.removeItem(READ_API_OVERRIDE_LS_KEY_OLD_ADMIN);
  localStorage.removeItem(READ_API_OVERRIDE_LS_KEY_OLD_APP);
}

export function getReadApiKey(): string {
  return ((import.meta as any).env?.VITE_ENCEPH_READ_API_KEY || "").trim();
}
