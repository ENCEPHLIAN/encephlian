/** Browser SHA-256 (hex) of file bytes — used for deterministic study identity / dedupe. */

export function isSha256Available(): boolean {
  return typeof globalThis.crypto?.subtle?.digest === "function";
}

export async function sha256HexFromFile(file: Blob): Promise<string> {
  if (!isSha256Available()) {
    throw new Error("SHA256 requires a secure context (HTTPS)");
  }
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
