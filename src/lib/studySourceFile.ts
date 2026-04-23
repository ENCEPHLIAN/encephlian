/** Human-facing EEG source file label (`meta.original_filename` + format). */

export type StudyMetaLike = Record<string, unknown> | null | undefined;

const MAX_FILENAME_CHARS = 36;

function truncateFilename(name: string, max = MAX_FILENAME_CHARS): string {
  if (name.length <= max) return name;
  const ext = name.match(/(\.[^.]+)$/)?.[1] ?? "";
  const stem = ext ? name.slice(0, name.length - ext.length) : name;
  const budget = max - ext.length - 1;
  if (budget < 8) return name.slice(0, max - 1) + "…";
  return `${stem.slice(0, budget)}…${ext}`;
}

export function getStudyOriginalFilename(meta: StudyMetaLike): string | null {
  if (!meta || typeof meta !== "object") return null;
  const v = (meta as Record<string, unknown>).original_filename;
  if (typeof v === "string") {
    const t = v.trim();
    if (t) return truncateFilename(t);
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
