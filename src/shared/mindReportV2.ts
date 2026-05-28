/**
 * mind.report.v2 — canonical honest-output schema.
 *
 * Zod is the single source of truth: every consumer (UI, adapter, edge fns
 * via JSON Schema export) derives types from these schemas. Runtime
 * validation runs at every boundary where untrusted data enters — fetched
 * payloads, RPC results, IndexedDB drafts. If a payload doesn't parse, the
 * error names the offending field so debugging isn't archaeology.
 *
 * Mirror in DB: supabase/migrations/20260528010000_honest_output_foundation.sql
 *   (schema_definitions row + studies.triage_draft_json shape-check trigger)
 *
 * This file replaces hand-written interfaces with z.infer-derived types so
 * the schema can never drift from the validator. Helper predicates and the
 * derived `summary` computation live at the bottom.
 */

import { z } from "zod";

/* ───── Provenance ──────────────────────────────────────────────────────── */

export const ProvenanceKindSchema = z.enum([
  "model",      // ML output (VIGIL, FORGE, VERTEX, MIND-Triage, MIND-Clean…)
  "rule",       // Deterministic libs/score rule
  "biomarker",  // Signal-derived numeric biomarker
  "pending",    // System refused to assert — required input unavailable
  "clinician",  // Clinician override after model proposal
]);
export type ProvenanceKind = z.infer<typeof ProvenanceKindSchema>;

export const ProvenanceSchema = z.object({
  derived_from:          ProvenanceKindSchema,
  source:                z.string(),
  version:               z.string().nullish(),
  model_version:         z.string().nullish(),
  model_run_id:          z.string().nullish(),
  rule_name:             z.string().nullish(),
  rule_version:          z.string().nullish(),
  confidence:            z.number().min(0).max(1).nullish(),
  calibrated_confidence: z.number().min(0).max(1).nullish(),
  pending_reason:        z.string().nullish(),
  missing_channels:      z.array(z.string()).nullish(),
  missing_markers:       z.array(z.string()).nullish(),
});
export type Provenance = z.infer<typeof ProvenanceSchema>;

/* ───── FieldProposal<T> ────────────────────────────────────────────────── */
/**
 * Zod factory for FieldProposal<T>. The value's type is parameterised so
 * each section declares its own typed fields. The factory keeps the rest
 * (provenance, required_channels, edit metadata) consistent.
 */
export const FieldProposalSchema = <V extends z.ZodTypeAny>(value: V) =>
  z.object({
    field_id:              z.string(),
    value:                 value.nullable(),
    provenance:            ProvenanceSchema,
    required_channels:     z.array(z.string()).nullish(),
    derivation_path:       z.array(z.string()).optional(),
    original_value:        value.nullish(),
    original_derived_from: ProvenanceKindSchema.nullish(),
    edit_timestamp:        z.string().nullish(),
    edited_by:             z.string().nullish(),
    information_value:     z.number().nullish(),
  });

/** Generic FieldProposal type — used when the value type is opaque
 *  (walkers, predicates, edit-delta capture). */
export interface FieldProposal<T> {
  field_id: string;
  value: T | null;
  provenance: Provenance;
  required_channels?: string[] | null;
  derivation_path?: string[];
  original_value?: T | null;
  original_derived_from?: ProvenanceKind | null;
  edit_timestamp?: string | null;
  edited_by?: string | null;
  information_value?: number | null;
}

/* ───── Enums used by sections ──────────────────────────────────────────── */

export const SymmetryClassSchema = z.enum(["symmetric", "asymmetric_mild", "asymmetric_marked"]);
export type SymmetryClass = z.infer<typeof SymmetryClassSchema>;

export const ContinuityClassSchema = z.enum(["continuous", "discontinuous", "burst_suppression"]);
export type ContinuityClass = z.infer<typeof ContinuityClassSchema>;

export const ReactivitySchema = z.enum(["reactive", "non_reactive", "unknown"]);
export const PhoticResponseSchema = z.enum(["normal", "photoparoxysmal", "absent", "not_assessed"]);
export const HyperventilationResponseSchema = z.enum(["normal", "abnormal", "not_assessed"]);

const FocalSlowingItemSchema = z.object({
  region: z.string(),
  frequency_band: z.string(),
});

const IedItemSchema = z.object({
  type:        z.string(),
  location:    z.string(),
  onset_time:  z.number().nullish(),
  confidence:  z.number().min(0).max(1).nullish(),
});

const AsymmetrySchema = z.object({
  present: z.boolean(),
  region:  z.string().nullish(),
  index:   z.number().nullish(),
});

const SeizureEventSchema = z.object({
  type:        z.string(),
  onset_time:  z.number(),
  offset_time: z.number(),
  confidence:  z.number().min(0).max(1).nullish(),
});

/* ───── SCORE-aligned sections ──────────────────────────────────────────── */

export const BackgroundActivitySectionSchema = z.object({
  pdr_present:         FieldProposalSchema(z.boolean()),
  pdr_frequency_hz:    FieldProposalSchema(z.number()),
  pdr_symmetry:        FieldProposalSchema(SymmetryClassSchema),
  continuity:          FieldProposalSchema(ContinuityClassSchema),
  symmetry:            FieldProposalSchema(SymmetryClassSchema),
  generalized_slowing: FieldProposalSchema(z.string()),
  focal_slowing:       FieldProposalSchema(z.array(FocalSlowingItemSchema)),
  reactivity:          FieldProposalSchema(ReactivitySchema),
});
export type BackgroundActivitySection = z.infer<typeof BackgroundActivitySectionSchema>;

export const InterictalSectionSchema = z.object({
  ieds:                   FieldProposalSchema(z.array(IedItemSchema)),
  sharp_transients_count: FieldProposalSchema(z.number().int().min(0)),
  asymmetry:              FieldProposalSchema(AsymmetrySchema),
});
export type InterictalSection = z.infer<typeof InterictalSectionSchema>;

export const IctalSectionSchema = z.object({
  seizure_events:              FieldProposalSchema(z.array(SeizureEventSchema)),
  status_epilepticus_concern:  FieldProposalSchema(z.boolean()),
});
export type IctalSection = z.infer<typeof IctalSectionSchema>;

export const PhotoModulatorsSectionSchema = z.object({
  photic_response:           FieldProposalSchema(PhoticResponseSchema),
  hyperventilation_response: FieldProposalSchema(HyperventilationResponseSchema),
});
export type PhotoModulatorsSection = z.infer<typeof PhotoModulatorsSectionSchema>;

export const SignatureSectionSchema = z.object({
  diagnostic_significance:      FieldProposalSchema(z.string()),
  diagnostic_significance_text: FieldProposalSchema(z.string()),
  summary_of_findings:          FieldProposalSchema(z.string()),
});
export type SignatureSection = z.infer<typeof SignatureSectionSchema>;

/* ───── Top-level pieces ────────────────────────────────────────────────── */

export const ReportLimitationSchema = z.object({
  reason:         z.string(),
  channels:       z.array(z.string()).optional(),
  markers:        z.array(z.string()).optional(),
  affects_fields: z.array(z.string()).optional(),
});
export type ReportLimitation = z.infer<typeof ReportLimitationSchema>;

export const ReportSummarySchema = z.object({
  asserted_count:    z.number().int().min(0),
  pending_count:     z.number().int().min(0),
  limitations_count: z.number().int().min(0),
});
export type ReportSummary = z.infer<typeof ReportSummarySchema>;

export const ProseBindingSchema = z.object({
  text: z.string(),
  field_bindings: z.array(z.object({
    field_id:   z.string(),
    char_range: z.tuple([z.number().int().min(0), z.number().int().min(0)]),
  })),
});
export type ProseBinding = z.infer<typeof ProseBindingSchema>;

/* ───── Root ────────────────────────────────────────────────────────────── */

export const MindReportV2Schema = z.object({
  schema_version:       z.literal("mind.report.v2"),
  study_id:             z.string().uuid(),
  generated_at:         z.string().datetime({ offset: true }),
  generated_by:         z.string(),
  summary:              ReportSummarySchema,
  limitations:          z.array(ReportLimitationSchema),
  signature:            SignatureSectionSchema,
  background_activity:  BackgroundActivitySectionSchema,
  interictal:           InterictalSectionSchema,
  ictal:                IctalSectionSchema,
  photo_modulators:     PhotoModulatorsSectionSchema,
  prose:                ProseBindingSchema.nullish(),
});
export type MindReportV2 = z.infer<typeof MindReportV2Schema>;

/* ───── Boundary validators ─────────────────────────────────────────────── */

/** Strict parse. Throws ZodError if the payload doesn't match. Use when
 *  failure should bubble up to an error boundary. */
export function parseMindReportV2(input: unknown): MindReportV2 {
  return MindReportV2Schema.parse(input);
}

/** Non-throwing parse. Use when the caller wants to fall through gracefully
 *  (e.g. render a "report unavailable" state instead of crashing). */
export function safeParseMindReportV2(input: unknown) {
  return MindReportV2Schema.safeParse(input);
}

/** Compact error formatter for logs / toasts. */
export function formatV2Errors(err: z.ZodError): string {
  return err.issues
    .slice(0, 5)
    .map((i) => `${i.path.join(".")}: ${i.message}`)
    .join(" · ");
}

/* ───── Predicates and walkers ──────────────────────────────────────────── */

export function isPending<T>(f: FieldProposal<T>): boolean {
  return f.provenance.derived_from === "pending";
}

export function isAsserted<T>(f: FieldProposal<T>): boolean {
  const k = f.provenance.derived_from;
  return k === "model" || k === "rule" || k === "biomarker" || k === "clinician";
}

/** Walk every FieldProposal in a report (excluding the derived summary). */
export function walkFields(
  report: Omit<MindReportV2, "summary">,
): FieldProposal<unknown>[] {
  const fields: FieldProposal<unknown>[] = [];
  const sections: Array<Record<string, unknown>> = [
    report.signature           as unknown as Record<string, unknown>,
    report.background_activity as unknown as Record<string, unknown>,
    report.interictal          as unknown as Record<string, unknown>,
    report.ictal               as unknown as Record<string, unknown>,
    report.photo_modulators    as unknown as Record<string, unknown>,
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

/** Compute summary counts. The adapter uses this so the summary block can
 *  never disagree with the actual content. */
export function computeSummary(
  report: Omit<MindReportV2, "summary">,
): ReportSummary {
  const fields = walkFields(report);
  return {
    asserted_count:    fields.filter(isAsserted).length,
    pending_count:     fields.filter(isPending).length,
    limitations_count: report.limitations.length,
  };
}
