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

/** One-line title: handle + patient (no raw UUID). */
export function getStudyListTitle(study: StudyLike): string {
  const meta = study.meta as Record<string, unknown> | undefined;
  const patient = typeof meta?.patient_name === "string" && meta.patient_name.trim()
    ? meta.patient_name.trim()
    : typeof meta?.patient_id === "string" && meta.patient_id.trim()
      ? meta.patient_id.trim()
      : "Study";
  return `${patient} · ${getStudyHandle(study)}`;
}

/** Browser tab / accessibility title. */
export function getStudyDocumentTitle(study: StudyLike): string {
  const meta = study.meta as Record<string, unknown> | undefined;
  const patient = typeof meta?.patient_name === "string" && meta.patient_name.trim()
    ? meta.patient_name.trim()
    : "Study";
  const src = formatStudySourceLine(study.meta, study.original_format ?? null);
  const handle = getStudyHandle(study);
  return src ? `${patient} — ${handle} — ${src}` : `${patient} — ${handle}`;
}
