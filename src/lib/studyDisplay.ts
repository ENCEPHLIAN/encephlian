import type { StudyMetaLike } from "@/lib/studySourceFile";
import { formatStudySourceLine } from "@/lib/studySourceFile";

export type StudyLike = {
  id: string;
  reference?: string | null;
  meta?: StudyMetaLike;
  original_format?: string | null;
};

/** Compact id when no ENC reference exists yet (no dashes, not full UUID). */
export function getStudyCompactId(study: Pick<StudyLike, "id">): string {
  return study.id.replace(/-/g, "").slice(0, 10);
}

/** Primary handle: ENC-… code, else short compact id. */
export function getStudyHandle(study: StudyLike): string {
  const r = study.reference?.trim();
  if (r) return r;
  return getStudyCompactId(study);
}

const BLANK_NAMES = new Set(["Pending", "X", "Unknown Patient", "Unknown"]);
function isBlankField(v: unknown): boolean {
  if (typeof v !== "string" || !v.trim()) return true;
  if (BLANK_NAMES.has(v.trim())) return true;
  if (v.startsWith("PT-")) return true;
  return false;
}

/** Primary displayable patient label: name → patient_id → filename stem → handle. */
export function getPatientLabel(study: StudyLike): string {
  const meta = study.meta as Record<string, unknown> | undefined;
  if (!isBlankField(meta?.patient_name)) return String(meta!.patient_name!).trim();
  if (!isBlankField(meta?.patient_id))   return String(meta!.patient_id!).trim();
  if (typeof meta?.original_filename === "string" && meta.original_filename) {
    return meta.original_filename.replace(/\.[^.]+$/, "").trim() || getStudyHandle(study);
  }
  return getStudyHandle(study);
}

/** One-line title: handle + patient (no raw UUID). */
export function getStudyListTitle(study: StudyLike): string {
  return `${getPatientLabel(study)} · ${getStudyHandle(study)}`;
}

/** Browser tab / accessibility title. */
export function getStudyDocumentTitle(study: StudyLike): string {
  const patient = getPatientLabel(study);
  const src = formatStudySourceLine(study.meta, study.original_format ?? null);
  const handle = getStudyHandle(study);
  return src ? `${patient} — ${handle} — ${src}` : `${patient} — ${handle}`;
}
