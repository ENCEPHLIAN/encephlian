/**
 * BiomarkerEventFeedback — inline three-button affordance for clinician
 * disposition of a single deterministic biomarker event (sharp_transient,
 * ripple, burst_suppression segment, focal_slowing, …).
 *
 * Each event row gets:
 *   ✓  accept    → "this event is a real finding"
 *   ✗  reject    → "this event is spurious / artifact"
 *   ?  uncertain → "I cannot confirm; needs second opinion"
 *
 * On click → fire-and-forget insert into clinician_edit_deltas via the
 * existing captureEditDelta helper. Schema mapping (the DB CHECK constraint
 * on edit_type only allows {'accept','edit','clear','reject'}, see
 * migrations/20260528010000_honest_output_foundation.sql:305):
 *
 *   accept    → edit_type='accept',  reason_code='biomarker_accept'
 *   reject    → edit_type='reject',  reason_code='biomarker_reject'
 *   uncertain → edit_type='edit',    reason_code='biomarker_uncertain',
 *                                    new_value='uncertain'
 *
 * Using edit_type='edit' for uncertain keeps biomarker reject-rates honest in
 * AdminEditDeltas — an uncertain disposition is genuinely different from a
 * confident reject. The reason_code='biomarker_uncertain' is the join key
 * downstream training pipelines use to weight these rows.
 *
 * Idempotency / double-click guards:
 *   - While an insert is in-flight, all three buttons are disabled.
 *   - After a successful insert, the chosen disposition button is visually
 *     highlighted; clicking a different button issues a fresh delta (the
 *     table is append-only by design — the latest row wins per the v2 paper
 *     training pipeline). Re-clicking the SAME disposition is a no-op.
 *
 * Freeze-on-sign:
 *   - The `readOnly` prop comes from the parent; when true the buttons are
 *     visible (so the clinician can see their prior dispositions) but
 *     disabled. Unsigning the report flips readOnly back to false and
 *     restores click capability.
 */
import { useState, useCallback } from "react";
import { Check, X, HelpCircle, Loader2 } from "lucide-react";
import { captureEditDelta, type EditDeltaType } from "@/lib/editDeltaCapture";
import { cn } from "@/lib/utils";

export type BiomarkerDisposition = "accept" | "reject" | "uncertain";

export interface BiomarkerEventFeedbackProps {
  studyId: string;
  /** Stable field_id for this event. Build from kind+start+channel so the
   *  same event in two sittings collides on the same field_id and the
   *  per-field analytics roll up correctly. */
  eventFieldId: string;
  /** Snapshot of the event payload — recorded in new_value on accept so
   *  the training pipeline has the full feature row. */
  eventPayload: Record<string, unknown>;
  /** When the report is signed, dispositions are frozen (visible but not
   *  clickable). Re-opening the report on unsign restores edit capability. */
  readOnly?: boolean;
  /** Optional shared session id from the surrounding editor mount. Lets
   *  the training pipeline group biomarker dispositions made in one
   *  sitting with the SCORE-field edits made in the same sitting. */
  sessionId?: string | null;
  className?: string;
}

const DISPOSITION_LABELS: Record<BiomarkerDisposition, string> = {
  accept:    "Accept — real finding",
  reject:    "Reject — spurious / artifact",
  uncertain: "Uncertain — needs second opinion",
};

/** Map the user-facing disposition to the (edit_type, reason_code) pair the
 *  DB and downstream pipelines speak. */
function dispositionToDelta(d: BiomarkerDisposition): {
  editType: EditDeltaType;
  reasonCode: string;
  newValue: unknown;
} {
  switch (d) {
    case "accept":    return { editType: "accept", reasonCode: "biomarker_accept",    newValue: "accepted" };
    case "reject":    return { editType: "reject", reasonCode: "biomarker_reject",    newValue: "rejected" };
    case "uncertain": return { editType: "edit",   reasonCode: "biomarker_uncertain", newValue: "uncertain" };
  }
}

export function BiomarkerEventFeedback({
  studyId,
  eventFieldId,
  eventPayload,
  readOnly,
  sessionId,
  className,
}: BiomarkerEventFeedbackProps) {
  const [chosen, setChosen] = useState<BiomarkerDisposition | null>(null);
  const [submitting, setSubmitting] = useState<BiomarkerDisposition | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onPick = useCallback(async (d: BiomarkerDisposition) => {
    if (readOnly) return;
    if (submitting !== null) return;       // in-flight guard
    if (chosen === d) return;              // idempotent re-click guard
    setSubmitting(d);
    setError(null);
    const { editType, reasonCode, newValue } = dispositionToDelta(d);
    const res = await captureEditDelta({
      studyId,
      fieldId:             eventFieldId,
      editType,
      originalValue:       chosen ?? "detected",   // prior disposition (or model's raw flag)
      newValue:            d === "accept" ? eventPayload : newValue,
      originalDerivedFrom: "biomarker",
      reasonCode,
      clientRequestId:     sessionId ?? null,
    });
    setSubmitting(null);
    if (res.ok) {
      setChosen(d);
    } else {
      setError(res.error ?? "could not record");
    }
  }, [studyId, eventFieldId, eventPayload, chosen, submitting, readOnly, sessionId]);

  const Btn = ({
    disposition, icon: Icon, activeColor,
  }: {
    disposition: BiomarkerDisposition;
    icon: typeof Check;
    /** Tailwind class for the active state (bg+border+text). */
    activeColor: string;
  }) => {
    const isActive  = chosen === disposition;
    const isLoading = submitting === disposition;
    const disabled  = readOnly || (submitting !== null && submitting !== disposition);
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onPick(disposition); }}
        disabled={disabled}
        aria-label={DISPOSITION_LABELS[disposition]}
        title={readOnly
          ? `${DISPOSITION_LABELS[disposition]} — report signed, disposition frozen`
          : DISPOSITION_LABELS[disposition]}
        className={cn(
          "inline-flex items-center justify-center h-5 w-5 rounded border transition-colors",
          isActive
            ? activeColor
            : "border-border/60 text-muted-foreground hover:bg-muted/60 hover:text-foreground",
          disabled && !isActive && "opacity-40 cursor-not-allowed",
          readOnly && isActive && "cursor-default",
        )}
      >
        {isLoading ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Icon className="h-2.5 w-2.5" />}
      </button>
    );
  };

  return (
    <div className={cn("inline-flex items-center gap-1", className)}>
      <Btn
        disposition="accept"
        icon={Check}
        activeColor="border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      />
      <Btn
        disposition="uncertain"
        icon={HelpCircle}
        activeColor="border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400"
      />
      <Btn
        disposition="reject"
        icon={X}
        activeColor="border-destructive/50 bg-destructive/10 text-destructive"
      />
      {error && (
        <span className="text-[9px] text-destructive ml-1" title={error}>
          err
        </span>
      )}
    </div>
  );
}

/** Deterministic, stable field_id for a biomarker event. Same event in two
 *  sessions hashes to the same id so per-field reject rates aggregate
 *  correctly downstream. */
export function biomarkerEventFieldId(e: {
  kind?: string;
  start_sec?: number | null;
  end_sec?: number | null;
  channel?: string | null;
}, fallbackIdx: number): string {
  const kind    = e.kind ?? "unknown";
  const start   = e.start_sec != null ? e.start_sec.toFixed(3) : "na";
  const end     = e.end_sec   != null ? e.end_sec.toFixed(3)   : "na";
  const channel = e.channel ?? "any";
  // Embedding the index as the last segment keeps the id unique even if
  // two events share kind+start+end+channel (rare but possible at sub-sec
  // resolution).
  return `biomarkers.events[${kind}/${start}-${end}/${channel}#${fallbackIdx}]`;
}
