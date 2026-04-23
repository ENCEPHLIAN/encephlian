/** Short human-facing study code: `ENC-YYMMDD-XXXX` (collision risk is negligible at pilot scale). */

export function generateEncStudyReference(): string {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `ENC-${yy}${mm}${dd}-${rand}`;
}
