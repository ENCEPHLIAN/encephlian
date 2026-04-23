/** Human-facing EEG source file label (`meta.original_filename` + format). */

export type StudyMetaLike = Record<string, unknown> | null | undefined;

export function getStudyOriginalFilename(meta: StudyMetaLike): string | null {
  if (!meta || typeof meta !== "object") return null;
  const v = (meta as Record<string, unknown>).original_filename;
  if (typeof v === "string") {
    const t = v.trim();
    if (t) return t;
  }
  return null;
}

export function getStudyFormatLabel(
  originalFormat: string | null | undefined,
  filename: string | null,
): string | null {
  if (originalFormat && typeof originalFormat === "string") {
    const t = originalFormat.replace(/^\./, "").trim();
    if (t) return t.toUpperCase();
  }
  if (filename) {
    const m = filename.match(/\.([a-z0-9]+)$/i);
    if (m?.[1]) return m[1].toUpperCase();
  }
  return null;
}

/** One line for lists/cards: `recording.edf · EDF` or filename only. */
export function formatStudySourceLine(
  meta: StudyMetaLike,
  originalFormat?: string | null,
): string | null {
  const name = getStudyOriginalFilename(meta);
  const fmt = getStudyFormatLabel(originalFormat ?? null, name);
  if (name && fmt) return `${name} · ${fmt}`;
  if (name) return name;
  if (fmt) return `Recording · ${fmt}`;
  return null;
}
