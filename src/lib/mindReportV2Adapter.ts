/**
 * mind.report.v1 → MindReportV2 adapter.
 *
 * Translates legacy iplane payloads into the v2 honest-output shape so the
 * UI can render against v2 even though backend still emits v1. When iplane
 * is upgraded to emit v2 natively (task #66), this becomes a pass-through
 * on the schema_version check.
 *
 * Field semantics mirror libs/score/score_v2_mapper.py.
 */

import {
  MindReportV2,
  FieldProposal,
  Provenance,
  ProvenanceKind,
  ReportLimitation,
  SymmetryClass,
  ContinuityClass,
  computeSummary,
} from "@/shared/mindReportV2";

function mkPending<T>(
  field_id: string,
  reason: string,
  missing_channels?: string[],
  missing_markers?: string[],
): FieldProposal<T> {
  return {
    field_id,
    value: null,
    provenance: {
      derived_from: "pending",
      source: "v1_adapter",
      pending_reason: reason,
      missing_channels: missing_channels ?? null,
      missing_markers: missing_markers ?? null,
    },
  };
}

function mk<T>(args: {
  field_id: string;
  value: T | null;
  kind: ProvenanceKind;
  source: string;
  confidence?: number;
  derivation?: string[];
  required_channels?: string[];
}): FieldProposal<T> {
  const prov: Provenance = {
    derived_from: args.kind,
    source: args.source,
    confidence: args.confidence ?? null,
  };
  return {
    field_id: args.field_id,
    value: args.value,
    provenance: prov,
    derivation_path: args.derivation,
    required_channels: args.required_channels ?? null,
  };
}

export function adaptV1ToV2(v1: any, studyId: string): MindReportV2 {
  if (v1?.schema_version === "mind.report.v2") return v1 as MindReportV2;

  const triage     = v1?.triage     ?? {};
  const biomarkers = v1?.biomarkers ?? {};
  const score      = v1?.score      ?? {};
  const bg         = score?.background_activity ?? {};
  const pdrRaw     = bg?.pdr ?? bg?.posterior_dominant_rhythm ?? {};
  const seizure    = v1?.seizure    ?? {};

  const cls   = triage?.classification ?? "inconclusive";
  const conf  = typeof triage?.confidence === "number" ? triage.confidence : 0;
  const sharps = (biomarkers?.events ?? []).filter(
    (e: any) => e.kind === "sharp_transient",
  ).length;
  const bs_ratio = biomarkers?.burst_suppression_ratio ?? 0;
  const asymIdx  = biomarkers?.amplitude_asymmetry_max_index ?? 0;
  const asymPair = biomarkers?.amplitude_asymmetry_max_pair ?? null;

  // ─── Signature ────────────────────────────────────────────────────────
  let significance = "normal_recording";
  let sigText      = "Normal recording.";
  if (cls === "inconclusive") {
    significance = "inconclusive";
    sigText = "Inconclusive recording — manual review required.";
  } else if (cls === "abnormal" && sharps > 0) {
    significance = "abnormal_supporting_focal_epilepsy";
    sigText = "Abnormal recording supporting: Focal epilepsy.";
  } else if (bs_ratio > 0.10) {
    significance = "abnormal_supporting_encephalopathy";
    sigText = "Abnormal recording supporting: Encephalopathy (burst-suppression pattern).";
  } else if (cls === "abnormal") {
    significance = "abnormal_diffuse_dysfunction";
    sigText = "Abnormal recording: diffuse dysfunction.";
  }

  const summaryParts: string[] = [];
  if (cls === "normal") summaryParts.push("The recording is within normal limits on automated analysis.");
  else if (cls === "abnormal") summaryParts.push(`Abnormal recording on automated analysis (${Math.round(conf*100)}% model confidence).`);
  else summaryParts.push("Automated analysis is inconclusive — manual review required.");
  if (bs_ratio > 0.05) summaryParts.push(`Burst-suppression pattern in ${(bs_ratio*100).toFixed(0)}% of the recording.`);
  if (asymIdx > 0.20)  summaryParts.push(`Amplitude asymmetry across ${asymPair ?? "channels"} (index ${asymIdx.toFixed(2)}).`);
  if (sharps > 0)      summaryParts.push(`${sharps} candidate sharp transients flagged — IED classification requires neurologist review.`);

  const sigModelSource = triage?.model ?? "mind_triage_v3";

  // ─── Background activity ──────────────────────────────────────────────
  const pdrPresent = pdrRaw?.present !== false;
  const pdrFreq    = pdrRaw?.frequency_hz ?? pdrRaw?.frequency ?? null;
  const pdrSym     = (pdrRaw?.symmetry ?? "symmetric") as SymmetryClass;
  const continuity: ContinuityClass =
    bs_ratio > 0.50 ? "burst_suppression"
    : bs_ratio > 0.10 ? "discontinuous"
    : "continuous";
  const symmetry: SymmetryClass =
    asymIdx > 0.30 ? "asymmetric_marked"
    : asymIdx > 0.15 ? "asymmetric_mild"
    : "symmetric";

  // ─── Limitations ──────────────────────────────────────────────────────
  const limitations: ReportLimitation[] = [];
  if (!seizure?.model || seizure?.model === "heuristic_v0.1") {
    limitations.push({
      reason: "Seizure detection currently uses a rule-based heuristic (heuristic_v0.1). VERTEX seizure head not yet deployed.",
      affects_fields: ["ictal.seizure_events"],
    });
  }
  if (!v1?.photic_response) {
    limitations.push({
      reason: "Photic response not assessed (no photic-driver marker found in recording).",
      markers: ["photic_driver"],
      affects_fields: ["photo_modulators.photic_response"],
    });
  }
  if (!v1?.hyperventilation_response) {
    limitations.push({
      reason: "Hyperventilation response not assessed in this recording.",
      markers: ["hyperventilation"],
      affects_fields: ["photo_modulators.hyperventilation_response"],
    });
  }

  const partial: Omit<MindReportV2, "summary"> = {
    schema_version: "mind.report.v2",
    study_id: studyId,
    generated_at: v1?.generated_at ?? new Date().toISOString(),
    generated_by: v1?.generated_by ?? "v1_adapter",
    limitations,
    signature: {
      diagnostic_significance: mk({
        field_id: "signature.diagnostic_significance",
        value: significance,
        kind: cls === "inconclusive" ? "rule" : "model",
        source: sigModelSource,
        confidence: cls === "inconclusive" ? 0.3 : 0.85,
        derivation: [`triage:${sigModelSource} → ${cls}@${conf.toFixed(2)}`],
      }),
      diagnostic_significance_text: mk({
        field_id: "signature.diagnostic_significance_text",
        value: sigText,
        kind: cls === "inconclusive" ? "rule" : "model",
        source: sigModelSource,
        confidence: cls === "inconclusive" ? 0.3 : 0.85,
      }),
      summary_of_findings: mk({
        field_id: "signature.summary_of_findings",
        value: summaryParts.join(" "),
        kind: "rule",
        source: "v1_adapter_template",
        confidence: 0.75,
      }),
    },
    background_activity: {
      pdr_present: mk({
        field_id: "background_activity.pdr_present",
        value: pdrPresent,
        kind: "rule",
        source: "score_engine_v1",
        confidence: 0.85,
        required_channels: ["O1", "O2"],
      }),
      pdr_frequency_hz: pdrFreq != null
        ? mk({
            field_id: "background_activity.pdr_frequency_hz",
            value: pdrFreq,
            kind: "rule",
            source: "score_engine_v1",
            confidence: 0.85,
            required_channels: ["O1", "O2"],
          })
        : mkPending(
            "background_activity.pdr_frequency_hz",
            "PDR frequency not measured — eyes-closed posterior alpha epoch insufficient or occipital channels degraded.",
            ["O1", "O2"],
          ),
      pdr_symmetry: mk({
        field_id: "background_activity.pdr_symmetry",
        value: pdrSym,
        kind: "rule",
        source: "score_engine_v1",
        confidence: 0.7,
        required_channels: ["O1", "O2"],
      }),
      continuity: mk({
        field_id: "background_activity.continuity",
        value: continuity,
        kind: "biomarker",
        source: "biomarkers.burst_suppression_ratio",
        confidence: 0.8,
        derivation: [`bs_ratio=${bs_ratio.toFixed(3)} → ${continuity}`],
      }),
      symmetry: mk({
        field_id: "background_activity.symmetry",
        value: symmetry,
        kind: "biomarker",
        source: "biomarkers.amplitude_asymmetry",
        confidence: 0.7,
        derivation: [`asym_index=${asymIdx.toFixed(2)} → ${symmetry}`],
      }),
      generalized_slowing: bg?.generalized_slowing != null
        ? mk({
            field_id: "background_activity.generalized_slowing",
            value: bg.generalized_slowing,
            kind: "rule",
            source: "score_engine_v1",
            confidence: 0.7,
          })
        : mkPending(
            "background_activity.generalized_slowing",
            "Generalized slowing not assessed by the v1 mapper.",
          ),
      focal_slowing: mkPending(
        "background_activity.focal_slowing",
        "Focal slowing detection requires VERTEX Head D — not yet deployed.",
      ),
      reactivity: mkPending(
        "background_activity.reactivity",
        "Reactivity testing requires stim epochs not present in standard recording.",
      ),
    },
    interictal: {
      ieds: mkPending(
        "interictal.ieds",
        "IED classification requires VERTEX Head C — not yet deployed. Sharp-transient candidates are flagged separately.",
      ),
      sharp_transients_count: mk({
        field_id: "interictal.sharp_transients_count",
        value: sharps,
        kind: "biomarker",
        source: "biomarkers.events",
        confidence: 0.7,
        derivation: [`count(events.kind=sharp_transient)=${sharps}`],
      }),
      asymmetry: mk({
        field_id: "interictal.asymmetry",
        value: {
          present: asymIdx > 0.15,
          region: asymPair,
          index: asymIdx,
        },
        kind: "biomarker",
        source: "biomarkers.amplitude_asymmetry",
        confidence: 0.7,
      }),
    },
    ictal: {
      seizure_events: mk({
        field_id: "ictal.seizure_events",
        value: Array.isArray(seizure?.events) ? seizure.events : [],
        kind: "rule",
        source: seizure?.model ?? "heuristic_v0.1",
        confidence: 0.5,
        derivation: [`engine=${seizure?.model ?? "heuristic_v0.1"} (Z-score spike rule)`],
      }),
      status_epilepticus_concern: mkPending(
        "ictal.status_epilepticus_concern",
        "Status epilepticus assessment requires VERTEX seizure head — not yet deployed.",
      ),
    },
    photo_modulators: {
      photic_response: mkPending(
        "photo_modulators.photic_response",
        "Photic response not assessed (no photic-driver marker found in recording).",
        undefined,
        ["photic_driver"],
      ),
      hyperventilation_response: mkPending(
        "photo_modulators.hyperventilation_response",
        "Hyperventilation response not assessed in this recording.",
        undefined,
        ["hyperventilation"],
      ),
    },
    prose: null,
  };

  return { ...partial, summary: computeSummary(partial) };
}
