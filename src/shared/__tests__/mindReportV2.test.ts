import { describe, it, expect } from "vitest";
import {
  ProvenanceSchema,
  ProvenanceKindSchema,
  FieldProposalSchema,
  MindReportV2Schema,
  parseMindReportV2,
  safeParseMindReportV2,
  formatV2Errors,
  computeSummary,
  walkFields,
  isPending,
  isAsserted,
  type MindReportV2,
  type FieldProposal,
} from "../mindReportV2";
import { z } from "zod";

const SAMPLE_UUID = "11111111-1111-1111-1111-111111111111";
const SAMPLE_ISO  = "2026-05-28T19:00:00.000Z";

function mkValidV2(overrides?: Partial<MindReportV2>): MindReportV2 {
  const fp = <T>(field_id: string, value: T, kind: "model" | "rule" | "biomarker" | "pending" | "clinician" = "rule"): FieldProposal<T> => ({
    field_id,
    value,
    provenance: { derived_from: kind, source: "test" },
  });
  const pending = <T>(field_id: string): FieldProposal<T> => ({
    field_id,
    value: null,
    provenance: {
      derived_from: "pending",
      source: "test",
      pending_reason: "test pending",
    },
  });
  const partial = {
    schema_version: "mind.report.v2" as const,
    study_id: SAMPLE_UUID,
    generated_at: SAMPLE_ISO,
    generated_by: "test",
    limitations: [],
    signature: {
      diagnostic_significance:      fp("signature.diagnostic_significance", "normal_recording"),
      diagnostic_significance_text: fp("signature.diagnostic_significance_text", "Normal."),
      summary_of_findings:          fp("signature.summary_of_findings", "Within limits."),
    },
    background_activity: {
      pdr_present:         fp("background_activity.pdr_present", true),
      pdr_frequency_hz:    fp("background_activity.pdr_frequency_hz", 9.2),
      pdr_symmetry:        fp("background_activity.pdr_symmetry", "symmetric" as const),
      continuity:          fp("background_activity.continuity", "continuous" as const),
      symmetry:            fp("background_activity.symmetry", "symmetric" as const),
      generalized_slowing: pending<string>("background_activity.generalized_slowing"),
      focal_slowing:       pending<Array<{ region: string; frequency_band: string }>>("background_activity.focal_slowing"),
      reactivity:          pending<"reactive" | "non_reactive" | "unknown">("background_activity.reactivity"),
    },
    interictal: {
      ieds:                   pending<Array<{ type: string; location: string }>>("interictal.ieds"),
      sharp_transients_count: fp("interictal.sharp_transients_count", 0),
      asymmetry:              fp("interictal.asymmetry", { present: false }),
    },
    ictal: {
      seizure_events:             fp("ictal.seizure_events", []),
      status_epilepticus_concern: pending<boolean>("ictal.status_epilepticus_concern"),
    },
    photo_modulators: {
      photic_response:           pending<"normal" | "photoparoxysmal" | "absent" | "not_assessed">("photo_modulators.photic_response"),
      hyperventilation_response: pending<"normal" | "abnormal" | "not_assessed">("photo_modulators.hyperventilation_response"),
    },
    ...overrides,
  } as unknown as Omit<MindReportV2, "summary">;
  return { ...partial, summary: computeSummary(partial) } as MindReportV2;
}

describe("ProvenanceKindSchema", () => {
  it("accepts the five canonical kinds", () => {
    for (const k of ["model", "rule", "biomarker", "pending", "clinician"]) {
      expect(ProvenanceKindSchema.safeParse(k).success).toBe(true);
    }
  });
  it("rejects anything else", () => {
    for (const k of ["mixed", "ml", "manual", "MODEL", "", null, 42]) {
      expect(ProvenanceKindSchema.safeParse(k).success).toBe(false);
    }
  });
});

describe("ProvenanceSchema", () => {
  it("parses a minimal provenance", () => {
    expect(ProvenanceSchema.safeParse({ derived_from: "model", source: "mind_triage_v3" }).success).toBe(true);
  });
  it("requires source", () => {
    expect(ProvenanceSchema.safeParse({ derived_from: "model" }).success).toBe(false);
  });
  it("rejects confidence outside [0,1]", () => {
    expect(ProvenanceSchema.safeParse({ derived_from: "model", source: "x", confidence: 1.1 }).success).toBe(false);
    expect(ProvenanceSchema.safeParse({ derived_from: "model", source: "x", confidence: -0.1 }).success).toBe(false);
  });
  it("accepts null and missing for optional confidence", () => {
    expect(ProvenanceSchema.safeParse({ derived_from: "model", source: "x", confidence: null }).success).toBe(true);
    expect(ProvenanceSchema.safeParse({ derived_from: "model", source: "x" }).success).toBe(true);
  });
});

describe("FieldProposalSchema factory", () => {
  const Bool = FieldProposalSchema(z.boolean());
  it("parses a valid boolean proposal", () => {
    expect(Bool.safeParse({
      field_id: "x.y",
      value: true,
      provenance: { derived_from: "rule", source: "r" },
    }).success).toBe(true);
  });
  it("accepts null value", () => {
    expect(Bool.safeParse({
      field_id: "x.y",
      value: null,
      provenance: { derived_from: "pending", source: "r" },
    }).success).toBe(true);
  });
  it("rejects wrong value type", () => {
    expect(Bool.safeParse({
      field_id: "x.y",
      value: "true",
      provenance: { derived_from: "rule", source: "r" },
    }).success).toBe(false);
  });
});

describe("MindReportV2Schema (root)", () => {
  it("parses a complete valid payload", () => {
    expect(MindReportV2Schema.safeParse(mkValidV2()).success).toBe(true);
  });

  it("rejects wrong schema_version", () => {
    const r = MindReportV2Schema.safeParse({ ...mkValidV2(), schema_version: "mind.report.v1" });
    expect(r.success).toBe(false);
  });

  it("rejects non-uuid study_id", () => {
    const r = MindReportV2Schema.safeParse({ ...mkValidV2(), study_id: "not-a-uuid" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes("study_id"))).toBe(true);
    }
  });

  it("rejects missing top-level key", () => {
    const v = mkValidV2() as any;
    delete v.signature;
    const r = MindReportV2Schema.safeParse(v);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path[0] === "signature")).toBe(true);
    }
  });

  it("rejects negative summary count", () => {
    const v = mkValidV2();
    v.summary.asserted_count = -1;
    expect(MindReportV2Schema.safeParse(v).success).toBe(false);
  });
});

describe("parse / safeParse / formatV2Errors", () => {
  it("parseMindReportV2 throws on invalid", () => {
    expect(() => parseMindReportV2({ broken: true })).toThrow();
  });
  it("safeParseMindReportV2 returns success=false on invalid", () => {
    const r = safeParseMindReportV2({ broken: true });
    expect(r.success).toBe(false);
  });
  it("formatV2Errors yields a compact one-line message", () => {
    const r = safeParseMindReportV2({});
    if (!r.success) {
      const msg = formatV2Errors(r.error);
      expect(typeof msg).toBe("string");
      expect(msg.length).toBeGreaterThan(0);
      expect(msg.split(" · ").length).toBeLessThanOrEqual(5);
    }
  });
});

describe("predicates and walkers", () => {
  const v = mkValidV2();

  it("isPending / isAsserted are mutually exclusive on a given kind", () => {
    const all = walkFields(v);
    for (const f of all) {
      const p = isPending(f);
      const a = isAsserted(f);
      // clinician/model/rule/biomarker → asserted=true, pending=false
      // pending → pending=true, asserted=false
      expect(p && a).toBe(false);
    }
  });

  it("walkFields visits every section", () => {
    const all = walkFields(v);
    expect(all.length).toBeGreaterThanOrEqual(
      // 3 signature + 8 background_activity + 3 interictal + 2 ictal + 2 photo_modulators
      3 + 8 + 3 + 2 + 2,
    );
  });

  it("computeSummary matches walkFields counts", () => {
    const all = walkFields(v);
    const asserted = all.filter(isAsserted).length;
    const pending  = all.filter(isPending).length;
    expect(v.summary.asserted_count).toBe(asserted);
    expect(v.summary.pending_count).toBe(pending);
    expect(v.summary.limitations_count).toBe(v.limitations.length);
  });

  it("limitations are counted from the limitations array", () => {
    const v2 = mkValidV2({ limitations: [
      { reason: "missing O1", channels: ["O1"] },
      { reason: "no photic" },
    ]});
    expect(v2.summary.limitations_count).toBe(2);
  });
});
