/**
 * mind.report.v2 — honest-output schema for ENCEPHLIAN clinical reports.
 *
 * Every emission carries a provenance tag stating WHO derived it (model, rule,
 * biomarker, pending, clinician) plus what was needed to derive it. Pending
 * findings are first-class: the system can refuse to assert what it cannot
 * compute. This file is the single source of truth for the v2 schema and is
 * intentionally backend-agnostic so model heads stay swappable.
 *
 * Adapter: mind.report.v1 (iplane today) → MindReportV2 lives in
 * `src/lib/mindReportV2Adapter.ts` (task #58).
 */

export type ProvenanceKind =
  | "model"      // ML output (VIGIL, FORGE, VERTEX, MIND-Triage, MIND-Clean…)
  | "rule"       // Deterministic libs/score rule (e.g. bs_ratio > 0.10 → discontinuous)
  | "biomarker"  // Numeric signal biomarker (amplitude asymmetry, BS ratio…)
  | "pending"    // System refused to assert — required input unavailable
  | "clinician"; // Clinician override after AI proposal

export interface Provenance {
  derived_from: ProvenanceKind;
  source: string;                         // e.g. "mind_triage_v3", "score_engine_v1"
  version?: string | null;                // schema or pipeline version
  model_version?: string | null;          // model-specific version when derived_from='model'
  model_run_id?: string | null;           // audit id linking back to the inference run
  rule_name?: string | null;              // when derived_from='rule'
  rule_version?: string | null;
  confidence?: number | null;             // raw [0,1]
  calibrated_confidence?: number | null;  // post-Platt scaling once calibration ships
  pending_reason?: string | null;         // human-readable when derived_from='pending'
  missing_channels?: string[] | null;     // VIGIL-flagged channels that blocked assertion
  missing_markers?: string[] | null;      // photic, HV, sleep markers absent in the recording
}

export interface FieldProposal<T> {
  /** Stable id for prose binding and edit-delta capture. Use dot-notation,
   *  e.g. "background_activity.pdr_frequency_hz". Never reorder or rename;
   *  add new ids when adding new fields. */
  field_id: string;
  value: T | null;
  provenance: Provenance;
  /** Channels required to assert this field; the channel-dependency gate
   *  (paper §9) compares these against the VIGIL quality mask. */
  required_channels?: string[] | null;
  derivation_path?: string[];
  // Clinician override audit trail
  original_value?: T | null;
  original_derived_from?: ProvenanceKind | null;
  edit_timestamp?: string | null;         // ISO 8601
  edited_by?: string | null;              // clinician id (auth.users.id)
  /** Hook for edit-delta weighting per paper §10.3 / §12.3. Optional in v2 —
   *  wired by task #67 (edit-delta capture). */
  information_value?: number | null;
}

/* ─── SCORE-aligned report sections ──────────────────────────────────────── */

export type SymmetryClass = "symmetric" | "asymmetric_mild" | "asymmetric_marked";
export type ContinuityClass = "continuous" | "discontinuous" | "burst_suppression";

export interface BackgroundActivitySection {
  pdr_present: FieldProposal<boolean>;
  pdr_frequency_hz: FieldProposal<number>;
  pdr_symmetry: FieldProposal<SymmetryClass>;
  continuity: FieldProposal<ContinuityClass>;
  symmetry: FieldProposal<SymmetryClass>;
  generalized_slowing: FieldProposal<string | null>;
  focal_slowing: FieldProposal<Array<{ region: string; frequency_band: string }> | null>;
  reactivity: FieldProposal<"reactive" | "non_reactive" | "unknown">;
}

export interface InterictalSection {
  ieds: FieldProposal<Array<{
    type: string;            // "sharp_wave" | "spike" | "spike_and_wave" | …
    location: string;        // e.g. "left temporal"
    onset_time?: number | null;
    confidence?: number | null;
  }>>;
  sharp_transients_count: FieldProposal<number>;
  asymmetry: FieldProposal<{
    present: boolean;
    region?: string | null;
    index?: number | null;
  }>;
}

export interface IctalSection {
  seizure_events: FieldProposal<Array<{
    type: string;
    onset_time: number;
    offset_time: number;
    confidence?: number | null;
  }>>;
  status_epilepticus_concern: FieldProposal<boolean>;
}

export interface PhotoModulatorsSection {
  photic_response: FieldProposal<"normal" | "photoparoxysmal" | "absent" | "not_assessed">;
  hyperventilation_response: FieldProposal<"normal" | "abnormal" | "not_assessed">;
}

export interface SignatureSection {
  diagnostic_significance: FieldProposal<string>;
  diagnostic_significance_text: FieldProposal<string>;
  summary_of_findings: FieldProposal<string>;
}

/* ─── Top-level v2 root ──────────────────────────────────────────────────── */

export interface ReportLimitation {
  reason: string;             // "Channel O1 flagged BAD by VIGIL", etc.
  channels?: string[];
  markers?: string[];
  /** field_ids of the FieldProposals this limitation blocks. */
  affects_fields?: string[];
}

export interface ReportSummary {
  // O(1) lookups for the three-counter strip on study cards (§5).
  asserted_count: number;
  pending_count: number;
  limitations_count: number;
}

export interface MindReportV2 {
  schema_version: "mind.report.v2";
  study_id: string;
  generated_at: string;        // ISO 8601
  generated_by: string;        // e.g. "iplane:9375a0b" — pipeline+SHA
  summary: ReportSummary;
  limitations: ReportLimitation[];
  signature: SignatureSection;
  background_activity: BackgroundActivitySection;
  interictal: InterictalSection;
  ictal: IctalSection;
  photo_modulators: PhotoModulatorsSection;
  /** AUGUR (post-v1) — CFG-decoded prose bidirectionally bound to field_ids. */
  prose?: {
    text: string;
    field_bindings: Array<{ field_id: string; char_range: [number, number] }>;
  } | null;
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */

export function isPending<T>(f: FieldProposal<T>): boolean {
  return f.provenance.derived_from === "pending";
}

export function isAsserted<T>(f: FieldProposal<T>): boolean {
  const k = f.provenance.derived_from;
  return k === "model" || k === "rule" || k === "biomarker" || k === "clinician";
}

/** Walk every FieldProposal in a report (excluding summary, which is derived). */
export function walkFields(
  report: Omit<MindReportV2, "summary">,
): FieldProposal<unknown>[] {
  const fields: FieldProposal<unknown>[] = [];
  const sections: Array<Record<string, unknown>> = [
    report.signature as unknown as Record<string, unknown>,
    report.background_activity as unknown as Record<string, unknown>,
    report.interictal as unknown as Record<string, unknown>,
    report.ictal as unknown as Record<string, unknown>,
    report.photo_modulators as unknown as Record<string, unknown>,
  ];
  for (const section of sections) {
    for (const v of Object.values(section)) {
      if (v && typeof v === "object" && "provenance" in (v as object)) {
        fields.push(v as FieldProposal<unknown>);
      }
    }
  }
  return fields;
}

export function computeSummary(
  report: Omit<MindReportV2, "summary">,
): ReportSummary {
  const fields = walkFields(report);
  return {
    asserted_count: fields.filter(isAsserted).length,
    pending_count: fields.filter(isPending).length,
    limitations_count: report.limitations.length,
  };
}
