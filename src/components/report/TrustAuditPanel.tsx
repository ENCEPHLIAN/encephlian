/**
 * TrustAuditPanel — single surface listing every clinical claim in the
 * mind.report and the derivation path that produced it.
 *
 * Built on the trust principle: every visible claim must be traceable to
 * evidence, and every absence of evidence must be visible.
 *
 * Renders three columns per row:
 *   FIELD              VALUE                   DERIVED FROM
 *   triage             abnormal (78%)          mind_triage_v3 (model) + biomarker_upgrade
 *   PDR present        yes                     score_engine_v1 (rule)
 *   burst suppression  near-zero (0.001)       biomarkers.v1 (deterministic)
 *   IED morphology     (empty)                 pending: requires mind_ied model
 *
 * No prose. No animation. Just an auditable list.
 */
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Shield, Brain, Waves, FileText, AlertCircle, CheckCircle2,
} from "lucide-react";

type Provenance = "model" | "rule" | "biomarker" | "pending" | "mixed";

interface ClaimRow {
  section: string;
  field: string;
  value: string;
  derived_from: Provenance;
  source: string;
  confidence?: number | null;
  notes?: string;
}

const PROVENANCE_STYLES: Record<Provenance, string> = {
  model:      "border-emerald-500/40 text-emerald-700 dark:text-emerald-400",
  rule:       "border-amber-500/40 text-amber-700 dark:text-amber-400",
  biomarker:  "border-blue-500/40 text-blue-700 dark:text-blue-400",
  mixed:      "border-purple-500/40 text-purple-700 dark:text-purple-400",
  pending:    "border-muted-foreground/30 text-muted-foreground",
};

function extractClaims(report: any): ClaimRow[] {
  const rows: ClaimRow[] = [];
  if (!report) return rows;

  const triage = report.triage ?? {};
  const clean = report.clean ?? {};
  const seizure = report.seizure ?? {};
  const biomarkers = report.biomarkers ?? {};
  const score = report.score ?? {};
  const bg = score.background_activity ?? {};

  // ─── Triage ──────────────────────────────────────────────────
  const triageModel = (triage.model ?? "mind_triage_v3") as string;
  const hasSpectralRule = triageModel.includes("spectral_rules");
  const hasBiomarkerRule = triageModel.includes("biomarker_rules");
  const triageProv: Provenance = hasSpectralRule || hasBiomarkerRule ? "mixed" : "model";
  rows.push({
    section: "Triage",
    field: "Classification",
    value: triage.classification != null
      ? `${triage.classification}${typeof triage.confidence === "number" ? ` (${Math.round(triage.confidence * 100)}%)` : ""}`
      : "—",
    derived_from: triageProv,
    source: triageModel,
    confidence: typeof triage.confidence === "number" ? triage.confidence : null,
    notes: triage.quality_flag ? `flag: ${triage.quality_flag}` : undefined,
  });
  if (triage.abnormality_subtypes?.length) {
    rows.push({
      section: "Triage",
      field: "Abnormality subtype",
      value: triage.abnormality_subtypes.join(", "),
      derived_from: "pending",
      source: "mind_subtype_v1 not yet trained — value not from a model",
    });
  } else {
    rows.push({
      section: "Triage",
      field: "Abnormality subtype",
      value: "(not classified)",
      derived_from: "pending",
      source: "mind_subtype_v1 not yet trained",
    });
  }

  // ─── Background ──────────────────────────────────────────────
  const pdrPresent = bg.pdr?.present ?? bg.posterior_dominant_rhythm?.present;
  rows.push({
    section: "Background",
    field: "PDR present",
    value: pdrPresent == null ? "—" : (pdrPresent ? "yes" : "no"),
    derived_from: "rule",
    source: "score_engine_v1 (deterministic — posterior alpha vs theta vs delta)",
  });
  const pdrFreq = bg.pdr?.frequency_hz ?? bg.posterior_dominant_rhythm?.frequency;
  rows.push({
    section: "Background",
    field: "PDR frequency",
    value: pdrFreq != null ? `${pdrFreq} Hz` : "—",
    derived_from: pdrFreq != null ? "rule" : "pending",
    source: "score_engine_v1",
  });
  rows.push({
    section: "Background",
    field: "Generalised slowing",
    value: bg.generalized_slowing ?? "—",
    derived_from: bg.generalized_slowing ? "rule" : "pending",
    source: "score_engine_v1",
  });

  // ─── Biomarkers ──────────────────────────────────────────────
  const events = Array.isArray(biomarkers.events) ? biomarkers.events : [];
  rows.push({
    section: "Biomarkers",
    field: "Burst-suppression ratio",
    value: typeof biomarkers.burst_suppression_ratio === "number"
      ? `${(biomarkers.burst_suppression_ratio * 100).toFixed(2)}%`
      : "—",
    derived_from: "biomarker",
    source: "biomarkers.detect_burst_suppression v1.0",
  });
  rows.push({
    section: "Biomarkers",
    field: "Ripple/HFO rate",
    value: typeof biomarkers.ripple_rate_per_min === "number"
      ? `${biomarkers.ripple_rate_per_min.toFixed(2)} / min`
      : "—",
    derived_from: "biomarker",
    source: "biomarkers.detect_ripple_hfo v1.0 (80–125 Hz band)",
  });
  rows.push({
    section: "Biomarkers",
    field: "Sharp transient rate",
    value: typeof biomarkers.sharp_transient_rate_per_min === "number"
      ? `${biomarkers.sharp_transient_rate_per_min.toFixed(2)} / min`
      : "—",
    derived_from: "biomarker",
    source: "biomarkers.detect_sharp_transients v1.0 (slope > 50 µV/ms)",
  });
  rows.push({
    section: "Biomarkers",
    field: "Hemispheric asymmetry",
    value: typeof biomarkers.amplitude_asymmetry_max_index === "number"
      ? `${biomarkers.amplitude_asymmetry_max_index.toFixed(2)}${biomarkers.amplitude_asymmetry_max_pair ? ` @ ${biomarkers.amplitude_asymmetry_max_pair}` : ""}`
      : "—",
    derived_from: "biomarker",
    source: "biomarkers.compute_amplitude_asymmetry v1.0",
  });
  rows.push({
    section: "Biomarkers",
    field: "Total events detected",
    value: `${events.length}`,
    derived_from: "biomarker",
    source: "biomarkers v1.0 (deterministic detectors)",
  });

  // ─── Artefacts (clean v2) ────────────────────────────────────
  rows.push({
    section: "Artefacts",
    field: "Clean percentage",
    value: typeof clean.clean_percentage === "number"
      ? `${clean.clean_percentage.toFixed(1)}%`
      : "—",
    derived_from: "model",
    source: "mind_clean_v2 (per-window 5-class)",
  });
  rows.push({
    section: "Artefacts",
    field: "Artefact windows",
    value: `${clean.artifact_windows ?? 0} of ${clean.total_windows ?? 0} (2s windows)`,
    derived_from: "model",
    source: "mind_clean_v2",
  });

  // ─── Seizure (pending) ───────────────────────────────────────
  rows.push({
    section: "Seizure",
    field: "Events detected",
    value: `${Array.isArray(seizure.events) ? seizure.events.length : 0}`,
    derived_from: "pending",
    source: "mind_seizure_v1 not yet deployed — placeholder returns empty list",
  });
  rows.push({
    section: "Seizure",
    field: "IED classification",
    value: "(not classified)",
    derived_from: "pending",
    source: "mind_ied not yet trained — sharp transients flagged but not classified",
  });

  return rows;
}

const SECTION_ICONS: Record<string, typeof Brain> = {
  Triage: Brain,
  Background: Waves,
  Biomarkers: FileText,
  Artefacts: AlertCircle,
  Seizure: Shield,
};

export function TrustAuditPanel({ report }: { report: any }) {
  const rows = extractClaims(report);
  const provenanceCount: Record<Provenance, number> = {
    model: 0, rule: 0, biomarker: 0, mixed: 0, pending: 0,
  };
  for (const r of rows) provenanceCount[r.derived_from] = (provenanceCount[r.derived_from] ?? 0) + 1;

  const sections = Array.from(new Set(rows.map((r) => r.section)));

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap pb-2 border-b">
          <Shield className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Trust audit</h3>
          <p className="text-[10px] text-muted-foreground ml-2">
            Every clinical claim in this report, with the component that produced it.
          </p>
          <div className="ml-auto flex gap-1 flex-wrap">
            {(Object.keys(provenanceCount) as Provenance[]).filter((k) => provenanceCount[k] > 0).map((k) => (
              <Badge key={k} variant="outline" className={`text-[9px] gap-1 ${PROVENANCE_STYLES[k]}`}>
                {k} · {provenanceCount[k]}
              </Badge>
            ))}
          </div>
        </div>

        {sections.map((section) => {
          const sectionRows = rows.filter((r) => r.section === section);
          const Icon = SECTION_ICONS[section] ?? CheckCircle2;
          return (
            <div key={section} className="space-y-1">
              <div className="flex items-center gap-1.5 mt-2">
                <Icon className="h-3 w-3 text-muted-foreground" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {section}
                </span>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.5fr)] gap-x-3 gap-y-1 text-[10.5px]">
                {sectionRows.map((r) => (
                  <div key={`${r.section}/${r.field}`} className="contents">
                    <div className="text-muted-foreground py-1">{r.field}</div>
                    <div className="font-mono py-1 truncate" title={r.value}>{r.value}</div>
                    <div className="flex items-center gap-1.5 py-1 min-w-0">
                      <Badge variant="outline" className={`text-[8.5px] px-1.5 py-0 h-auto shrink-0 ${PROVENANCE_STYLES[r.derived_from]}`}>
                        {r.derived_from}
                      </Badge>
                      <span className="text-[9.5px] text-muted-foreground truncate" title={r.source}>
                        {r.source}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        <p className="text-[9.5px] text-muted-foreground pt-2 border-t leading-relaxed">
          Provenance vocabulary: <strong>model</strong> = trained ONNX neural network,&nbsp;
          <strong>rule</strong> = deterministic clinical rule applied to signal features,&nbsp;
          <strong>biomarker</strong> = deterministic signal-processing detector on µV signal,&nbsp;
          <strong>mixed</strong> = model output upgraded or qualified by rule/biomarker,&nbsp;
          <strong>pending</strong> = a required component is not yet trained or deployed; the field is
          explicitly absent rather than fabricated.
        </p>
      </CardContent>
    </Card>
  );
}
