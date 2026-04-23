/**
 * C-Plane base URL (Container Apps). Set CPLANE_URL in Supabase Edge secrets for prod/staging.
 * No trailing slash.
 */
export function getCplaneBaseUrl(): string {
  const raw = (Deno.env.get("CPLANE_URL") ?? Deno.env.get("CPLANE_INTERNAL_URL") ?? "").trim();
  if (raw) return raw.replace(/\/+$/, "");
  return "https://encephlian-cplane.whitecoast-5be3fbc0.centralindia.azurecontainerapps.io";
}
