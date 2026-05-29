/**
 * Adapter drift check.
 *
 * Two adapters in the repo must produce semantically identical v2
 * payloads for the same v1 input:
 *
 *   1. src/lib/mindReportV2Adapter.ts  (canonical TS, Zod-validated)
 *   2. supabase/functions/promote_to_v2/v1ToV2.ts  (Deno mirror used
 *      by the edge function that promotes iplane writes server-side)
 *
 * If they drift, production v2 payloads from the edge function won't
 * match what the frontend Zod validator expects, and gates can produce
 * different results depending on the path the payload took. This test
 * runs both adapters on a battery of fixtures and asserts they produce
 * identical structure (ignoring environment-specific fields).
 *
 * If a fixture intentionally exercises a code path that differs (e.g.,
 * the TS adapter throws on invalid output), the test calls that out
 * explicitly rather than silently masking it.
 */

import { describe, it, expect } from "vitest";
import { adaptV1ToV2 as adaptTS  } from "../mindReportV2Adapter";
import { adaptV1ToV2 as adaptDeno } from "../../../supabase/functions/promote_to_v2/v1ToV2";

const STUDY_UUID = "33333333-3333-3333-3333-333333333333";

// Fields that legitimately differ between the two adapters.
// `generated_at` uses Date.now() in both — they'll be ~ms apart.
// `generated_by` is "v1_adapter" in TS vs "edge:promote_to_v2" in Deno.
// `summary` is overwritten by the DB recompute trigger anyway, but
// the TS adapter computes it accurately for its tests; the Deno
// adapter passes an initial 0-count summary expecting DB to fix it.
const IGNORE_KEYS = new Set(["generated_at", "generated_by", "summary"]);

function normalize(obj: any): any {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(normalize);
  const out: any = {};
  for (const [k, v] of Object.entries(obj)) {
    if (IGNORE_KEYS.has(k)) continue;
    out[k] = normalize(v);
  }
  return out;
}

const FIXTURES: Array<{ name: string; v1: any }> = [
  { name: "empty",              v1: {} },
  { name: "triage_normal",      v1: { triage: { classification: "normal", confidence: 0.9, model: "mind_triage_v3" } } },
  { name: "triage_abnormal",    v1: { triage: { classification: "abnormal", confidence: 0.82, model: "mind_triage_v3" } } },
  { name: "abnormal_with_sharps", v1: {
      triage:    { classification: "abnormal", confidence: 0.8, model: "mind_triage_v3" },
      biomarkers:{ events: [{ kind: "sharp_transient" }, { kind: "sharp_transient" }] },
  } },
  { name: "burst_suppression",  v1: { biomarkers: { burst_suppression_ratio: 0.62 } } },
  { name: "discontinuous",      v1: { biomarkers: { burst_suppression_ratio: 0.20 } } },
  { name: "asymmetry_marked",   v1: { biomarkers: { amplitude_asymmetry_max_index: 0.35, amplitude_asymmetry_max_pair: "F3/F4" } } },
  { name: "asymmetry_mild",     v1: { biomarkers: { amplitude_asymmetry_max_index: 0.20 } } },
  { name: "inconclusive",       v1: { triage: { classification: "inconclusive" } } },
  { name: "pdr_present",        v1: { score: { background_activity: { pdr: { frequency_hz: 9.5, present: true, symmetry: "symmetric" } } } } },
  { name: "pdr_absent",         v1: { score: { background_activity: { pdr: { present: false } } } } },
  { name: "with_seizure_events", v1: {
      seizure: { events: [{ type: "GTCS", onset_time: 12, offset_time: 60, confidence: 0.6 }], model: "heuristic_v0.1" },
  } },
];

describe("adapter drift (TS canonical vs Deno mirror)", () => {
  for (const fx of FIXTURES) {
    it(`fixture: ${fx.name}`, () => {
      const ts   = normalize(adaptTS(fx.v1, STUDY_UUID));
      const deno = normalize(adaptDeno(fx.v1, STUDY_UUID));
      expect(deno).toEqual(ts);
    });
  }

  it("study_id propagates identically", () => {
    const ts   = adaptTS({}, STUDY_UUID);
    const deno = adaptDeno({}, STUDY_UUID);
    expect(deno.study_id).toBe(STUDY_UUID);
    expect(ts.study_id).toBe(STUDY_UUID);
  });

  it("both produce schema_version='mind.report.v2'", () => {
    const ts   = adaptTS({}, STUDY_UUID);
    const deno = adaptDeno({}, STUDY_UUID);
    expect(ts.schema_version).toBe("mind.report.v2");
    expect(deno.schema_version).toBe("mind.report.v2");
  });
});
