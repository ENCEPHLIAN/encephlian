/**
 * v1 → v2 adapter (Deno edge-function mirror of src/lib/mindReportV2Adapter.ts).
 *
 * Keep this in sync with the canonical TypeScript adapter. The structure is
 * identical; only the import surface differs (no Zod here — the DB trigger
 * is the source-of-truth validator via pg_jsonschema). Drift is detected by
 * scripts/checkAdapterDrift.ts (run from CI before deploy).
 *
 * Shape produced exactly matches MindReportV2 in src/shared/mindReportV2.ts:
 *   discriminated-union provenance per kind, value=null when pending,
 *   sections fully populated (signature, background_activity, interictal,
 *   ictal, photo_modulators), summary recomputed (DB will overwrite anyway).
 */

type ProvenanceKind = "model" | "rule" | "biomarker" | "pending" | "clinician";

interface FieldProposal<T> {
  field_id: string;
  value: T | null;
  provenance: any;
  required_channels?: string[] | null;
  derivation_path?: string[];
  original_value?: T | null;
  original_derived_from?: ProvenanceKind | null;
  edit_timestamp?: string | null;
  edited_by?: string | null;
  information_value?: number | null;
}

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
  kind: "model" | "rule" | "biomarker";
  source: string;
  model_name?: string;
  model_version?: string;
  rule_name?: string;
  rule_version?: string;
  confidence?: number;
  derivation?: string[];
  required_channels?: string[];
}): FieldProposal<T> {
  let prov: any;
  if (args.kind === "model") {
    if (!args.model_name || !args.model_version) {
      throw new Error(`mk() for kind='model' requires model_name + model_version (field ${args.field_id})`);
    }
    prov = {
      derived_from: "model",
      source: args.source,
      model_name: args.model_name,
      model_version: args.model_version,
      confidence: args.confidence ?? null,
    };
  } else if (args.kind === "rule") {
    if (!args.rule_name) {
      throw new Error(`mk() for kind='rule' requires rule_name (field ${args.field_id})`);
    }
    prov = {
      derived_from: "rule",
      source: args.source,
      rule_name: args.rule_name,
      rule_version: args.rule_version ?? null,
      confidence: args.confidence ?? null,
    };
  } else {
    prov = {
      derived_from: "biomarker",
      source: args.source,
      confidence: args.confidence ?? null,
    };
  }
  return {
    field_id: args.field_id,
    value: args.value,
    provenance: prov,
    derivation_path: args.derivation,
    required_channels: args.required_channels ?? null,
  };
}

function splitLegacyModelId(id: string): { name: string; version: string } {
  const m = id.match(/^(.*)_v(\d+(?:\.\d+){0,2})$/);
  if (m) {
    const v = m[2].includes(".") ? m[2] : `${m[2]}.0.0`;
    return { name: m[1], version: v };
  }
  return { name: id, version: "0.0.0" };
}

export function adaptV1ToV2(v1: any, studyId: string): any {
  if (v1?.schema_version === "mind.report.v2") return v1;

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
  const sigModelSplit  = splitLegacyModelId(sigModelSource);
  const seizureSource  = seizure?.model ?? "heuristic_v0.1";
  const seizureSplit   = splitLegacyModelId(seizureSource);

  const pdrPresent = pdrRaw?.present !== false;
  const pdrFreq    = pdrRaw?.frequency_hz ?? pdrRaw?.frequency ?? null;
  const pdrSym     = pdrRaw?.symmetry ?? "symmetric";
  const continuity =
    bs_ratio > 0.50 ? "burst_suppression"
    : bs_ratio > 0.10 ? "discontinuous"
    : "continuous";
  const symmetry =
    asymIdx > 0.30 ? "asymmetric_marked"
    : asymIdx > 0.15 ? "asymmetric_mild"
    : "symmetric";

  const limitations: any[] = [];
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

  const sigKind = cls === "inconclusive" ? "rule" : "model";
  const sigConf = cls === "inconclusive" ? 0.3 : 0.85;

  const partial = {
    schema_version: "mind.report.v2",
    study_id: studyId,
    generated_at: v1?.generated_at ?? new Date().toISOString(),
    generated_by: "edge:promote_to_v2",
    limitations,
    signature: {
      diagnostic_significance: mk({
        field_id: "signature.diagnostic_significance",
        value: significance,
        kind: sigKind,
        source: sigModelSource,
        model_name: sigModelSplit.name,
        model_version: sigModelSplit.version,
        rule_name: "inconclusive_passthrough_v1",
        confidence: sigConf,
        derivation: [`triage:${sigModelSource} → ${cls}@${conf.toFixed(2)}`],
      }),
      diagnostic_significance_text: mk({
        field_id: "signature.diagnostic_significance_text",
        value: sigText,
        kind: sigKind,
        source: sigModelSource,
        model_name: sigModelSplit.name,
        model_version: sigModelSplit.version,
        rule_name: "inconclusive_passthrough_v1",
        confidence: sigConf,
      }),
      summary_of_findings: mk({
        field_id: "signature.summary_of_findings",
        value: summaryParts.join(" "),
        kind: "rule",
        source: "v1_adapter_template",
        rule_name: "summary_template_v1",
        confidence: 0.75,
      }),
    },
    background_activity: {
      pdr_present: mk({
        field_id: "background_activity.pdr_present",
        value: pdrPresent,
        kind: "rule",
        source: "score_engine_v1",
        rule_name: "pdr_present_from_score_v1",
        confidence: 0.85,
        required_channels: ["O1", "O2"],
      }),
      pdr_frequency_hz: pdrFreq != null
        ? mk({
            field_id: "background_activity.pdr_frequency_hz",
            value: pdrFreq,
            kind: "rule",
            source: "score_engine_v1",
            rule_name: "pdr_frequency_from_score_v1",
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
        rule_name: "pdr_symmetry_from_score_v1",
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
            rule_name: "generalized_slowing_from_score_v1",
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
        source: seizureSource,
        rule_name: `heuristic_seizure_zscore_${seizureSplit.version}`,
        rule_version: seizureSplit.version,
        confidence: 0.5,
        derivation: [`engine=${seizureSource} (Z-score spike rule)`],
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
    // Initial summary; recompute_v2_summary trigger overwrites.
    summary: { asserted_count: 0, pending_count: 0, limitations_count: limitations.length },
  };

  return partial;
}
