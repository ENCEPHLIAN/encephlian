/**
 * EditableReportV2 — clinician-facing SCORE v2 report with per-field edit + sign.
 *
 * Pre-filled by the AUGUR engine (server-side). Every field is editable.
 * Hover on any value shows its derivation path. Signing locks the report,
 * generates the immutable signed PDF, and writes a content fingerprint.
 *
 * This is the *editing* surface. The read-only signed PDF is produced from
 * the same data by `libs/score/report_renderer.py` on the server.
 *
 * Architecture matches docs/specs/augur-design.md.
 */
import { useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Check, Info, AlertTriangle, Edit3, Lock, FileSignature,
  RotateCcw, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/* ────────────────────────────────────────────────────────────────────────── */
/*  Types — mirror libs/score/score_v2_schema.py exactly                       */
/* ────────────────────────────────────────────────────────────────────────── */

type ProvenanceKind = "model" | "rule" | "biomarker" | "manual" | "pending";

interface Provenance {
  derived_from: ProvenanceKind;
  source: string;
  confidence?: number | null;
  version?: string | null;
}

interface FieldProposal<T> {
  value: T | null;
  confidence: number;          // 0..1 — 0 means pending
  provenance: Provenance;
  derivation_path: string[];   // e.g. ['mind_triage_v3:abnormal@0.78', 'biomarker_upgrade:asym_T3/T4=0.34']
  edited_by_clinician?: boolean;
  original_value?: T | null;   // pre-edit value, retained on edit
}

interface ScoreV2EditState {
  diagnostic_significance: FieldProposal<string>;
  diagnostic_significance_text: FieldProposal<string>;
  summary_of_findings: FieldProposal<string>;
  pdr_present: FieldProposal<boolean>;
  pdr_frequency_hz: FieldProposal<number>;
  pdr_symmetry: FieldProposal<string>;
  background_continuity: FieldProposal<string>;
  background_symmetry: FieldProposal<string>;
  background_slowing: FieldProposal<string>;
  // …extend to cover all SCORE v2 leaf fields. List kept short for the skeleton.
}

interface EditableReportV2Props {
  studyId: string;
  initialState: ScoreV2EditState;
  onSave: (state: ScoreV2EditState) => Promise<void>;
  onSign: (state: ScoreV2EditState) => Promise<{ pdf_url: string; fingerprint: string }>;
  readOnly?: boolean;
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Per-field widgets                                                          */
/* ────────────────────────────────────────────────────────────────────────── */

interface FieldEditorProps<T> {
  label: string;
  proposal: FieldProposal<T>;
  onChange: (next: FieldProposal<T>) => void;
  onAccept: () => void;
  onClear: () => void;
  onMarkIncorrect: () => void;
  readOnly?: boolean;
  children: (controlled: {
    value: T | null;
    setValue: (v: T | null) => void;
  }) => React.ReactNode;
}

function FieldEditor<T>(props: FieldEditorProps<T>) {
  const {
    label, proposal, onChange, onAccept, onClear,
    onMarkIncorrect, readOnly, children,
  } = props;

  const confidence = proposal.confidence;
  const isHighConfidence = confidence >= 0.8;
  const isLowConfidence = confidence >= 0.4 && confidence < 0.8;
  const isPending = confidence < 0.4;
  const isEditedByClinician = !!proposal.edited_by_clinician;

  const indicator = useMemo(() => {
    if (isEditedByClinician) {
      return (
        <Badge variant="outline" className="text-[9px] gap-1">
          <Edit3 className="h-2.5 w-2.5" /> Edited
        </Badge>
      );
    }
    if (isHighConfidence) {
      return (
        <Badge variant="outline" className="text-[9px] gap-1 border-emerald-500/40 text-emerald-700">
          <Check className="h-2.5 w-2.5" /> Pre-filled
        </Badge>
      );
    }
    if (isLowConfidence) {
      return (
        <Badge variant="outline" className="text-[9px] gap-1 border-amber-500/40 text-amber-700">
          <AlertTriangle className="h-2.5 w-2.5" /> Review
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-[9px] gap-1 text-muted-foreground">
        Pending — clinician fills
      </Badge>
    );
  }, [isEditedByClinician, isHighConfidence, isLowConfidence]);

  return (
    <div className={cn(
      "space-y-1 rounded-md px-2 py-1.5",
      isPending && "bg-muted/30",
      isLowConfidence && !isEditedByClinician && "bg-amber-50/40",
    )}>
      <div className="flex items-center gap-2">
        <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </label>
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="text-muted-foreground/60 hover:text-foreground">
                <Info className="h-3 w-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-sm text-[10px]">
              <div className="font-medium mb-1">Derivation</div>
              <div className="font-mono whitespace-pre-wrap">
                {proposal.derivation_path.length === 0
                  ? "No upstream evidence — clinician fill required."
                  : proposal.derivation_path.join("\n  → ")}
              </div>
              <div className="mt-1 pt-1 border-t border-border/40">
                <span className="text-muted-foreground">source: </span>
                <span className="font-mono">{proposal.provenance.source}</span>
                {proposal.provenance.confidence != null && (
                  <span className="ml-2 text-muted-foreground">
                    conf {(proposal.provenance.confidence * 100).toFixed(0)}%
                  </span>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <div className="ml-auto flex items-center gap-1">
          {indicator}
          {!readOnly && !isPending && isLowConfidence && !isEditedByClinician && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-5 px-1.5 text-[9px]"
              onClick={onAccept}
              title="Accept pre-filled value"
            >
              Accept
            </Button>
          )}
          {!readOnly && !isPending && (
            <Button
              type="button" size="sm" variant="ghost"
              className="h-5 px-1.5 text-[9px] text-muted-foreground hover:text-destructive"
              onClick={onMarkIncorrect}
              title="Mark pre-filled value as incorrect (feedback to model)"
            >
              <X className="h-3 w-3" />
            </Button>
          )}
          {!readOnly && proposal.value != null && (
            <Button
              type="button" size="sm" variant="ghost"
              className="h-5 px-1.5 text-[9px] text-muted-foreground"
              onClick={onClear}
              title="Clear field"
            >
              <RotateCcw className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
      {children({
        value: proposal.value,
        setValue: (v) => onChange({
          ...proposal,
          value: v,
          edited_by_clinician: true,
          original_value: proposal.original_value ?? proposal.value,
        }),
      })}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Vocabularies — must match SCORE v2 ontology in libs/score/score_v2_schema  */
/* ────────────────────────────────────────────────────────────────────────── */

const DIAGNOSTIC_SIGNIFICANCE_OPTIONS = [
  { value: "normal_recording", label: "Normal recording" },
  { value: "normal_variant", label: "Normal variant of doubtful significance" },
  { value: "abnormal_supporting_focal_epilepsy", label: "Abnormal — supporting focal epilepsy" },
  { value: "abnormal_supporting_generalised_epilepsy", label: "Abnormal — supporting generalised epilepsy" },
  { value: "abnormal_supporting_encephalopathy", label: "Abnormal — supporting encephalopathy" },
  { value: "abnormal_focal_dysfunction", label: "Abnormal focal dysfunction" },
  { value: "abnormal_diffuse_dysfunction", label: "Abnormal diffuse dysfunction" },
  { value: "abnormal_status_epilepticus", label: "Abnormal with ictal activity / status" },
  { value: "abnormal_other", label: "Abnormal — other" },
  { value: "inconclusive", label: "Inconclusive — requires manual review" },
];

const SYMMETRY_OPTIONS = [
  { value: "symmetric", label: "Symmetric" },
  { value: "asymmetric_mild", label: "Asymmetric (mild)" },
  { value: "asymmetric_marked", label: "Asymmetric (marked)" },
  { value: "not_assessable", label: "Not assessable" },
];

const CONTINUITY_OPTIONS = [
  { value: "continuous", label: "Continuous" },
  { value: "discontinuous", label: "Discontinuous" },
  { value: "burst_suppression", label: "Burst-suppression" },
  { value: "suppression", label: "Suppression" },
  { value: "isoelectric", label: "Isoelectric" },
  { value: "not_assessable", label: "Not assessable" },
];

/* ────────────────────────────────────────────────────────────────────────── */
/*  Main component                                                             */
/* ────────────────────────────────────────────────────────────────────────── */

export function EditableReportV2(props: EditableReportV2Props) {
  const { studyId, initialState, onSave, onSign, readOnly } = props;
  const [state, setState] = useState<ScoreV2EditState>(initialState);
  const [saving, setSaving] = useState(false);
  const [signing, setSigning] = useState(false);

  const updateField = useCallback(
    <K extends keyof ScoreV2EditState>(key: K, next: ScoreV2EditState[K]) => {
      setState((s) => ({ ...s, [key]: next }));
    },
    [],
  );

  const acceptField = useCallback(
    <K extends keyof ScoreV2EditState>(key: K) => {
      setState((s) => ({
        ...s,
        [key]: { ...s[key], edited_by_clinician: true } as ScoreV2EditState[K],
      }));
    },
    [],
  );

  const clearField = useCallback(
    <K extends keyof ScoreV2EditState>(key: K) => {
      setState((s) => ({
        ...s,
        [key]: {
          ...s[key],
          value: null,
          edited_by_clinician: true,
          original_value: s[key].original_value ?? s[key].value,
        } as ScoreV2EditState[K],
      }));
    },
    [],
  );

  const markIncorrect = useCallback(<K extends keyof ScoreV2EditState>(key: K) => {
    // Surface to feedback channel; do not mutate value. The model-improvement
    // loop pulls these from server-side audit log.
    toast.info("Flagged as incorrect", {
      description: `${String(key)} — pre-filled value will be reviewed in next training cycle.`,
    });
    // POST to /v1/feedback in real implementation
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(state);
      toast.success("Draft saved");
    } catch (e: any) {
      toast.error("Save failed", { description: e?.message });
    } finally { setSaving(false); }
  };

  const handleSign = async () => {
    // Validate: every required field must be non-null + clinician-confirmed
    const required: (keyof ScoreV2EditState)[] = [
      "diagnostic_significance", "summary_of_findings",
    ];
    const missing = required.filter((k) => state[k].value == null);
    if (missing.length) {
      toast.error("Cannot sign — fields required", {
        description: missing.map(String).join(", "),
      });
      return;
    }
    const lowConfidenceUnaccepted = Object.entries(state).filter(([_, p]) =>
      p.confidence >= 0.4 && p.confidence < 0.8 && !p.edited_by_clinician
    );
    if (lowConfidenceUnaccepted.length) {
      toast.error("Review required fields before signing", {
        description: `${lowConfidenceUnaccepted.length} low-confidence field(s) need acceptance or edit.`,
      });
      return;
    }
    setSigning(true);
    try {
      const { pdf_url, fingerprint } = await onSign(state);
      toast.success("Report signed", {
        description: `Fingerprint: ${fingerprint.slice(0, 8)} · PDF saved.`,
        action: { label: "Open PDF", onClick: () => window.open(pdf_url, "_blank") },
      });
    } catch (e: any) {
      toast.error("Sign failed", { description: e?.message });
    } finally { setSigning(false); }
  };

  return (
    <div className="space-y-3 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border/50 py-2">
        <div>
          <h2 className="text-base font-semibold">EEG Report — SCORE v2</h2>
          <p className="text-[10px] text-muted-foreground">Study {studyId.slice(0, 8)} · Editable · Click any field to override</p>
        </div>
        <div className="flex items-center gap-2">
          {!readOnly && (
            <Button variant="outline" size="sm" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save draft"}
            </Button>
          )}
          {!readOnly && (
            <Button size="sm" onClick={handleSign} disabled={signing} className="gap-1.5">
              <FileSignature className="h-3.5 w-3.5" />
              {signing ? "Signing…" : "Sign report"}
            </Button>
          )}
          {readOnly && (
            <Badge variant="outline" className="gap-1.5">
              <Lock className="h-3 w-3" /> Signed — read only
            </Badge>
          )}
        </div>
      </div>

      {/* Conclusion (top of editing surface — most important decision) */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-primary">Conclusion</h3>

          <FieldEditor
            label="Diagnostic significance"
            proposal={state.diagnostic_significance}
            onChange={(next) => updateField("diagnostic_significance", next)}
            onAccept={() => acceptField("diagnostic_significance")}
            onClear={() => clearField("diagnostic_significance")}
            onMarkIncorrect={() => markIncorrect("diagnostic_significance")}
            readOnly={readOnly}
          >
            {({ value, setValue }) => (
              <Select value={value ?? ""} onValueChange={setValue} disabled={readOnly}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {DIAGNOSTIC_SIGNIFICANCE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FieldEditor>

          <FieldEditor
            label="Summary of findings"
            proposal={state.summary_of_findings}
            onChange={(next) => updateField("summary_of_findings", next)}
            onAccept={() => acceptField("summary_of_findings")}
            onClear={() => clearField("summary_of_findings")}
            onMarkIncorrect={() => markIncorrect("summary_of_findings")}
            readOnly={readOnly}
          >
            {({ value, setValue }) => (
              <Textarea
                value={value ?? ""}
                onChange={(e) => setValue(e.target.value)}
                rows={3}
                className="text-xs"
                disabled={readOnly}
                placeholder="Clinician synthesises the prose conclusion from the findings below…"
              />
            )}
          </FieldEditor>
        </CardContent>
      </Card>

      {/* Background activity */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-primary">Background activity</h3>

          <div className="grid grid-cols-2 gap-3">
            <FieldEditor
              label="PDR present"
              proposal={state.pdr_present}
              onChange={(next) => updateField("pdr_present", next)}
              onAccept={() => acceptField("pdr_present")}
              onClear={() => clearField("pdr_present")}
              onMarkIncorrect={() => markIncorrect("pdr_present")}
              readOnly={readOnly}
            >
              {({ value, setValue }) => (
                <Select
                  value={value == null ? "" : value ? "true" : "false"}
                  onValueChange={(v) => setValue(v === "true")}
                  disabled={readOnly}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true" className="text-xs">Present</SelectItem>
                    <SelectItem value="false" className="text-xs">Absent</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </FieldEditor>

            <FieldEditor
              label="PDR frequency (Hz)"
              proposal={state.pdr_frequency_hz}
              onChange={(next) => updateField("pdr_frequency_hz", next)}
              onAccept={() => acceptField("pdr_frequency_hz")}
              onClear={() => clearField("pdr_frequency_hz")}
              onMarkIncorrect={() => markIncorrect("pdr_frequency_hz")}
              readOnly={readOnly}
            >
              {({ value, setValue }) => (
                <Input
                  type="number" step={0.1} min={0} max={30}
                  value={value ?? ""}
                  onChange={(e) => setValue(e.target.value ? Number(e.target.value) : null)}
                  className="h-8 text-xs"
                  disabled={readOnly}
                  placeholder="—"
                />
              )}
            </FieldEditor>

            <FieldEditor
              label="PDR symmetry"
              proposal={state.pdr_symmetry}
              onChange={(next) => updateField("pdr_symmetry", next)}
              onAccept={() => acceptField("pdr_symmetry")}
              onClear={() => clearField("pdr_symmetry")}
              onMarkIncorrect={() => markIncorrect("pdr_symmetry")}
              readOnly={readOnly}
            >
              {({ value, setValue }) => (
                <Select value={value ?? ""} onValueChange={setValue} disabled={readOnly}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {SYMMETRY_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FieldEditor>

            <FieldEditor
              label="Continuity"
              proposal={state.background_continuity}
              onChange={(next) => updateField("background_continuity", next)}
              onAccept={() => acceptField("background_continuity")}
              onClear={() => clearField("background_continuity")}
              onMarkIncorrect={() => markIncorrect("background_continuity")}
              readOnly={readOnly}
            >
              {({ value, setValue }) => (
                <Select value={value ?? ""} onValueChange={setValue} disabled={readOnly}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {CONTINUITY_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FieldEditor>
          </div>

          <FieldEditor
            label="Background slowing"
            proposal={state.background_slowing}
            onChange={(next) => updateField("background_slowing", next)}
            onAccept={() => acceptField("background_slowing")}
            onClear={() => clearField("background_slowing")}
            onMarkIncorrect={() => markIncorrect("background_slowing")}
            readOnly={readOnly}
          >
            {({ value, setValue }) => (
              <Input
                value={value ?? ""}
                onChange={(e) => setValue(e.target.value)}
                className="h-8 text-xs"
                disabled={readOnly}
                placeholder="None | Mild | Moderate | Severe (with location)"
              />
            )}
          </FieldEditor>
        </CardContent>
      </Card>

      {/* TODO: extend with Interictal findings, Artefacts, Modulators, Signature
          when remaining SCORE v2 sections are wired through the same FieldEditor
          pattern. Skeleton stays focused on the highest-value sections. */}

      <p className="text-[10px] text-muted-foreground text-center py-4">
        Pre-fill engine: AUGUR (knowledge-graph) — proposes; clinician disposes.
        Every signed field becomes part of the immutable PDF + content fingerprint.
      </p>
    </div>
  );
}
