/**
 * Parse the 80-byte EDF "local patient identification" field (bytes 8–87).
 *
 * EDF+ format: `code sex date_of_birth name [additional...]`
 * subfields separated by spaces; underscores encode spaces within a name.
 * Old (plain) EDF uses the field as free text.
 *
 * Returns null for fields that are absent or marked unknown ("X").
 */
export function parseEDFPatientField(raw: string): {
  patientCode: string | null;
  sex: "M" | "F" | null;
  dob: string | null;
  name: string | null;
} {
  const s = raw.replace(/\0/g, "").trim();
  if (!s) return { patientCode: null, sex: null, dob: null, name: null };

  const parts = s.split(/\s+/);

  const code  = parts[0] && parts[0] !== "X" ? parts[0] : null;
  const rawSex = parts[1]?.toUpperCase();
  const sex   = rawSex === "M" ? "M" : rawSex === "F" ? "F" : null;
  const dob   = parts[2] && parts[2] !== "X" ? parts[2] : null;
  const nameRaw = parts.slice(3).join(" ").replace(/_/g, " ").trim();
  const name  = nameRaw && nameRaw !== "X" ? nameRaw : null;

  return { patientCode: code, sex, dob, name };
}

/**
 * Read the first 256 bytes of an EDF/BDF File and extract patient demographics.
 * Returns only the fields that contain actual data (null fields are omitted).
 */
export async function extractEDFPatientMeta(file: File): Promise<{
  patient_name?: string;
  patient_id?: string;
  patient_sex?: string;
  patient_dob?: string;
}> {
  try {
    const buf  = await file.slice(0, 256).arrayBuffer();
    const u8   = new Uint8Array(buf);
    const raw  = String.fromCharCode(...u8.slice(8, 88));
    const { patientCode, sex, dob, name } = parseEDFPatientField(raw);

    const out: { patient_name?: string; patient_id?: string; patient_sex?: string; patient_dob?: string } = {};
    if (name)        out.patient_name = name;
    if (patientCode) out.patient_id   = patientCode;
    if (sex)         out.patient_sex  = sex;
    if (dob)         out.patient_dob  = dob;
    return out;
  } catch {
    return {};
  }
}
