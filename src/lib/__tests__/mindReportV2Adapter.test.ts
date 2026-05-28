import { describe, it, expect } from "vitest";
import { adaptV1ToV2 } from "../mindReportV2Adapter";
import { parseMindReportV2, isPending, isAsserted, walkFields } from "@/shared/mindReportV2";

const STUDY_UUID = "22222222-2222-2222-2222-222222222222";

describe("adaptV1ToV2", () => {
  it("produces a valid MindReportV2 even from empty v1", () => {
    const out = adaptV1ToV2({}, STUDY_UUID);
    // Should pass strict Zod validation (the adapter itself validates).
    expect(() => parseMindReportV2(out)).not.toThrow();
    expect(out.schema_version).toBe("mind.report.v2");
    expect(out.study_id).toBe(STUDY_UUID);
  });

  it("marks most fields pending when v1 lacks triage/biomarkers", () => {
    const out = adaptV1ToV2({}, STUDY_UUID);
    const fields = walkFields(out);
    const pendingCount = fields.filter(isPending).length;
    expect(pendingCount).toBeGreaterThan(0);
  });

  it("preserves study_id == passed argument", () => {
    const out = adaptV1ToV2({ triage: { classification: "normal" } }, STUDY_UUID);
    expect(out.study_id).toBe(STUDY_UUID);
  });

  it("maps triage=normal → diagnostic_significance='normal_recording'", () => {
    const out = adaptV1ToV2({ triage: { classification: "normal", confidence: 0.92, model: "mind_triage_v3" } }, STUDY_UUID);
    expect(out.signature.diagnostic_significance.value).toBe("normal_recording");
    expect(out.signature.diagnostic_significance.provenance.derived_from).toBe("model");
  });

  it("maps triage=abnormal + sharps>0 → significance='abnormal_supporting_focal_epilepsy'", () => {
    const out = adaptV1ToV2({
      triage: { classification: "abnormal", confidence: 0.81, model: "mind_triage_v3" },
      biomarkers: { events: [{ kind: "sharp_transient" }, { kind: "sharp_transient" }] },
    }, STUDY_UUID);
    expect(out.signature.diagnostic_significance.value).toBe("abnormal_supporting_focal_epilepsy");
    expect(out.interictal.sharp_transients_count.value).toBe(2);
  });

  it("maps bs_ratio > 0.50 → continuity='burst_suppression'", () => {
    const out = adaptV1ToV2({ biomarkers: { burst_suppression_ratio: 0.62 } }, STUDY_UUID);
    expect(out.background_activity.continuity.value).toBe("burst_suppression");
  });

  it("maps bs_ratio in (0.10, 0.50] → continuity='discontinuous'", () => {
    const out = adaptV1ToV2({ biomarkers: { burst_suppression_ratio: 0.20 } }, STUDY_UUID);
    expect(out.background_activity.continuity.value).toBe("discontinuous");
  });

  it("maps bs_ratio <= 0.10 → continuity='continuous'", () => {
    const out = adaptV1ToV2({ biomarkers: { burst_suppression_ratio: 0.05 } }, STUDY_UUID);
    expect(out.background_activity.continuity.value).toBe("continuous");
  });

  it("maps asymmetry index > 0.30 → symmetry='asymmetric_marked'", () => {
    const out = adaptV1ToV2({ biomarkers: { amplitude_asymmetry_max_index: 0.35 } }, STUDY_UUID);
    expect(out.background_activity.symmetry.value).toBe("asymmetric_marked");
  });

  it("maps asymmetry index in (0.15, 0.30] → 'asymmetric_mild'", () => {
    const out = adaptV1ToV2({ biomarkers: { amplitude_asymmetry_max_index: 0.20 } }, STUDY_UUID);
    expect(out.background_activity.symmetry.value).toBe("asymmetric_mild");
  });

  it("maps inconclusive → significance='inconclusive' with low confidence", () => {
    const out = adaptV1ToV2({ triage: { classification: "inconclusive" } }, STUDY_UUID);
    expect(out.signature.diagnostic_significance.value).toBe("inconclusive");
    const conf = out.signature.diagnostic_significance.provenance.confidence;
    expect(conf).toBeLessThan(0.5);
  });

  it("PDR frequency present → asserted; absent → pending", () => {
    const a = adaptV1ToV2({ score: { background_activity: { pdr: { frequency_hz: 9.5 } } } }, STUDY_UUID);
    expect(isAsserted(a.background_activity.pdr_frequency_hz)).toBe(true);

    const b = adaptV1ToV2({}, STUDY_UUID);
    expect(isPending(b.background_activity.pdr_frequency_hz)).toBe(true);
  });

  it("adds a seizure heuristic limitation when seizure.model is heuristic_v0.1 or missing", () => {
    const out = adaptV1ToV2({}, STUDY_UUID);
    const seizureLim = out.limitations.find((l) => l.affects_fields?.includes("ictal.seizure_events"));
    expect(seizureLim).toBeDefined();
  });

  it("photic_response and hyperventilation are pending until backend reports them", () => {
    const out = adaptV1ToV2({}, STUDY_UUID);
    expect(isPending(out.photo_modulators.photic_response)).toBe(true);
    expect(isPending(out.photo_modulators.hyperventilation_response)).toBe(true);
  });

  it("IEDs are pending until VERTEX Head C lands", () => {
    const out = adaptV1ToV2({ biomarkers: { events: [{ kind: "sharp_transient" }] } }, STUDY_UUID);
    expect(isPending(out.interictal.ieds)).toBe(true);
    // But sharp transients are counted as a biomarker (asserted) separately:
    expect(isAsserted(out.interictal.sharp_transients_count)).toBe(true);
    expect(out.interictal.sharp_transients_count.value).toBe(1);
  });

  it("required_channels are set for occipital-dependent PDR fields", () => {
    const out = adaptV1ToV2({ score: { background_activity: { pdr: { frequency_hz: 9.2 } } } }, STUDY_UUID);
    expect(out.background_activity.pdr_frequency_hz.required_channels).toContain("O1");
    expect(out.background_activity.pdr_frequency_hz.required_channels).toContain("O2");
  });

  it("summary.asserted + pending counts match the walker", () => {
    const out = adaptV1ToV2({
      triage: { classification: "normal", confidence: 0.9 },
      biomarkers: { burst_suppression_ratio: 0.02 },
    }, STUDY_UUID);
    const fields = walkFields(out);
    expect(out.summary.asserted_count).toBe(fields.filter(isAsserted).length);
    expect(out.summary.pending_count).toBe(fields.filter(isPending).length);
    expect(out.summary.limitations_count).toBe(out.limitations.length);
  });

  it("pass-through when input is already v2", () => {
    const v2 = adaptV1ToV2({}, STUDY_UUID);
    const again = adaptV1ToV2(v2, STUDY_UUID);
    expect(again.schema_version).toBe("mind.report.v2");
    expect(again.study_id).toBe(STUDY_UUID);
  });
});
