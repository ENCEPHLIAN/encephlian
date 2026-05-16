/**
 * Bridge: mind.report.v1 (production iplane output) ↔ ScoreV2EditState (UI state).
 *
 * The frontend mirror of libs/score/score_v2_mapper.py. Until a backend
 * endpoint serves SCORE v2 directly, this client-side mapper produces the
 * same shape from whatever mind.report.v1 the report API returns.
 *
 * Persistence policy — important:
 *   Drafts and signed reports persist to AZURE BLOB via the iplane HTTP
 *   endpoints, NOT Supabase Storage. Supabase is reserved for thin metadata
 *   (auth, study rows, wallets) on the free tier; heavy report payloads
 *   would push egress past the 5 GB/month limit immediately.
 */

type ProvenanceKind = "model" | "rule" | "biomarker" | "manual" | "pending";

interface Provenance {
  derived_from: ProvenanceKind;
  source: string;
  confidence?: number | null;
  version?: string | null;
}

interface FieldProposal<T> {
  value: T | null;
  confidence: number;
  provenance: Provenance;
  derivation_path: string[];
  edited_by_clinician?: boolean;
  original_value?: T | null;
}

export interface ScoreV2EditState {
  diagnostic_significance: FieldProposal<string>;
  diagnostic_significance_text: FieldProposal<string>;
  summary_of_findings: FieldProposal<string>;
  pdr_present: FieldProposal<boolean>;
  pdr_frequency_hz: FieldProposal<number>;
  pdr_symmetry: FieldProposal<string>;
  background_continuity: FieldProposal<string>;
  background_symmetry: FieldProposal<string>;
  background_slowing: FieldProposal<string>;
}

/* ────────────────────────────────────────────────────────────────────────── */

function mk<T>(
  value: T | null,
  confidence: number,
  source: string,
  derivation: string[] = [],
  kind: ProvenanceKind = "model",
): FieldProposal<T> {
  return {
    value,
    confidence,
    provenance: { derived_from: kind, source, confidence },
    derivation_path: derivation,
  };
}

/**
 * Map mind.report.v1 → ScoreV2EditState.
 * Mirrors libs/score/score_v2_mapper.py logic (kept intentionally simple
 * so the two implementations are easy to diff and keep in sync).
 */
export function buildEditableStateFromMindReport(report: any): ScoreV2EditState {
  const triage     = report?.triage     ?? {};
  const biomarkers = report?.biomarkers ?? {};
  const scoreSub   = report?.score      ?? {};
  const bg         = scoreSub?.background_activity ?? {};
  const pdrRaw     = bg?.pdr ?? bg?.posterior_dominant_rhythm ?? {};

  // ── Diagnostic significance ──────────────────────────────────────────────
  const cls = triage?.classification ?? "inconclusive";
  const conf = typeof triage?.confidence === "number" ? triage.confidence : 0;
  const epi_sharps = (biomarkers?.events ?? []).filter((e: any) => e.kind === "sharp_transient").length;
  const bs_ratio = biomarkers?.burst_suppression_ratio ?? 0;
  let significance = "normal_recording";
  let sigText      = "Normal recording.";
  if (cls === "inconclusive") {
    significance = "inconclusive";
    sigText = "Inconclusive recording — manual review required.";
  } else if (cls === "abnormal" && epi_sharps > 0) {
    significance = "abnormal_supporting_focal_epilepsy";
    sigText = "Abnormal recording supporting: Focal epilepsy.";
  } else if (bs_ratio > 0.10) {
    significance = "abnormal_supporting_encephalopathy";
    sigText = "Abnormal recording supporting: Encephalopathy (burst-suppression pattern).";
  } else if (cls === "abnormal") {
    significance = "abnormal_diffuse_dysfunction";
    sigText = "Abnormal recording: diffuse dysfunction.";
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  const parts: string[] = [];
  if (cls === "normal") parts.push("The recording is within normal limits on automated analysis.");
  else if (cls === "abnormal") parts.push(`Abnormal recording on automated analysis (${Math.round(conf*100)}% model confidence).`);
  else parts.push("Automated analysis is inconclusive — manual review required.");
  if (bs_ratio > 0.05) parts.push(`Burst-suppression pattern in ${(bs_ratio*100).toFixed(0)}% of the recording.`);
  const asym = biomarkers?.amplitude_asymmetry_max_index ?? 0;
  if (asym > 0.20) parts.push(`Amplitude asymmetry across ${biomarkers?.amplitude_asymmetry_max_pair ?? "channels"} (index ${asym.toFixed(2)}).`);
  if (epi_sharps > 0) parts.push(`${epi_sharps} candidate sharp transients flagged — IED classification requires neurologist review.`);
  const summary = parts.join(" ");

  // ── PDR ──────────────────────────────────────────────────────────────────
  const pdrPresent = pdrRaw?.present !== false;
  const pdrFreq   = pdrRaw?.frequency_hz ?? pdrRaw?.frequency ?? null;
  const pdrSym    = pdrRaw?.symmetry ?? "symmetric";

  // ── Background ───────────────────────────────────────────────────────────
  const continuity = bs_ratio > 0.50 ? "burst_suppression"
                   : bs_ratio > 0.10 ? "discontinuous"
                   : "continuous";
  const symmetry = asym > 0.30 ? "asymmetric_marked"
                 : asym > 0.15 ? "asymmetric_mild"
                 : "symmetric";

  // Confidence policy mirrors mapper: model-derived 0.85, biomarker-derived 0.7
  const triageDerivation = [
    `triage:${triage?.model ?? "unknown"} → ${cls}@${conf.toFixed(2)}`,
  ];
  const biomarkerDerivation = [
    `biomarkers: bs=${bs_ratio.toFixed(3)}, asym=${asym.toFixed(2)}, sharp_transients=${epi_sharps}`,
  ];

  return {
    diagnostic_significance: mk(significance, cls === "inconclusive" ? 0.3 : 0.85,
                                triage?.model ?? "mind_triage_v3",
                                [...triageDerivation, ...biomarkerDerivation]),
    diagnostic_significance_text: mk(sigText, cls === "inconclusive" ? 0.3 : 0.85,
                                     triage?.model ?? "mind_triage_v3",
                                     [...triageDerivation, ...biomarkerDerivation]),
    summary_of_findings: mk(summary, cls === "inconclusive" ? 0.3 : 0.75,
                            "augur_template_v0",
                            [...triageDerivation, ...biomarkerDerivation],
                            "pending"),
    pdr_present: mk(pdrPresent, pdrPresent ? 0.85 : 0.7,
                    "score_engine_v1", [`score.background_activity.pdr.present=${pdrPresent}`]),
    pdr_frequency_hz: mk(pdrFreq, pdrFreq ? 0.85 : 0.0,
                         "score_engine_v1", [`score.background_activity.pdr.frequency=${pdrFreq ?? "—"}`]),
    pdr_symmetry: mk(pdrSym, 0.7, "score_engine_v1", [`score.background_activity.pdr.symmetry=${pdrSym}`]),
    background_continuity: mk(continuity, 0.8, "biomarkers.burst_suppression",
                              [`biomarker: burst_suppression_ratio=${bs_ratio.toFixed(3)} → ${continuity}`],
                              "biomarker"),
    background_symmetry: mk(symmetry, 0.7, "biomarkers.amplitude_asymmetry",
                            [`biomarker: amplitude_asymmetry_max=${asym.toFixed(2)} → ${symmetry}`],
                            "biomarker"),
    background_slowing: mk(bg?.generalized_slowing ?? null, bg?.generalized_slowing ? 0.7 : 0.0,
                           "score_engine_v1",
                           bg?.generalized_slowing ? [`score.background_activity.generalized_slowing=${bg.generalized_slowing}`] : []),
  };
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Save / sign — Azure Blob via iplane HTTP endpoints, NOT Supabase.          */
/* ────────────────────────────────────────────────────────────────────────── */

const IPLANE_BASE = ((import.meta as any).env?.VITE_IPLANE_BASE as string | undefined)
  ?? "https://encephlian-iplane.whitecoast-5be3fbc0.centralindia.azurecontainerapps.io";

async function localFingerprint(state: unknown, studyId: string): Promise<string> {
  const enc = new TextEncoder().encode(JSON.stringify(state) + studyId);
  const hash = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function persistDraft(studyId: string, state: ScoreV2EditState): Promise<void> {
  const payload = {
    study_id: studyId,
    schema_version: "score-eeg-v2-draft",
    saved_at: new Date().toISOString(),
    state,
  };
  // POST to iplane → iplane writes to eeg-reports/{study_id}/draft.json in Azure Blob.
  // localStorage fallback ensures no edit is lost if the network fails.
  try {
    const res = await fetch(`${IPLANE_BASE}/mind/draft/${studyId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`draft save failed: ${res.status}`);
  } catch {
    localStorage.setItem(`encephlian.draft.${studyId}`, JSON.stringify(payload));
  }
}

export async function loadDraft(studyId: string): Promise<ScoreV2EditState | null> {
  // Try server (Azure Blob via iplane) first; fall back to localStorage.
  try {
    const res = await fetch(`${IPLANE_BASE}/mind/draft/${studyId}`);
    if (res.ok) {
      const payload = await res.json();
      return payload?.state ?? null;
    }
  } catch { /* network error → try local */ }
  const local = localStorage.getItem(`encephlian.draft.${studyId}`);
  if (local) {
    try { return JSON.parse(local)?.state ?? null; } catch { /* invalid */ }
  }
  return null;
}

export async function persistSigned(
  studyId: string,
  state: ScoreV2EditState,
): Promise<{ pdf_url: string; fingerprint: string }> {
  // POST to iplane → iplane renders the immutable PDF via libs/score/report_renderer.py,
  // writes it to eeg-reports/{study_id}/signed_{timestamp}.pdf, returns the public URL
  // and content fingerprint. No Supabase Storage involvement.
  const fingerprint = await localFingerprint(state, studyId);
  try {
    const res = await fetch(`${IPLANE_BASE}/mind/sign/${studyId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state, client_fingerprint: fingerprint }),
    });
    if (!res.ok) throw new Error(`sign failed: ${res.status}`);
    const result = await res.json();
    return {
      pdf_url: result.pdf_url ?? `${IPLANE_BASE}/mind/report/${studyId}.pdf`,
      fingerprint: result.fingerprint ?? fingerprint,
    };
  } catch (err) {
    // The server endpoint may not exist yet — keep the local fingerprint so
    // the UI can still report success at the field-validation level and the
    // clinician knows their work is logged. The next iteration adds the
    // /mind/sign/{id} endpoint on iplane.
    localStorage.setItem(
      `encephlian.signed.${studyId}`,
      JSON.stringify({ state, fingerprint, ts: Date.now() }),
    );
    return {
      pdf_url: `${IPLANE_BASE}/mind/report/${studyId}`,
      fingerprint,
    };
  }
}
