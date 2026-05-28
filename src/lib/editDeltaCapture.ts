/**
 * Fire-and-forget capture of clinician edit deltas to clinician_edit_deltas.
 *
 * Every accept/edit/clear/reject action on a draft field produces one row.
 * Rows are append-only (no update/delete policy on the table) so the audit
 * trail is immutable. Downstream training pipelines (post-v1, paper §10.3)
 * compute information_value per row to weight clinician corrections in the
 * next model training cycle.
 *
 * Failure modes intentionally do NOT block the UI:
 *   - Not authenticated → resolves { ok: false } silently. Surfacing an
 *     error during signing would confuse the clinician; the missing row is
 *     a recoverable gap, not a clinical risk.
 *   - RLS reject → same. Logged to console for ops to chase.
 *   - Network drop → same. We don't retry; the next session's editor
 *     captures the next edit anyway.
 */

import { supabase } from "@/integrations/supabase/client";

export type EditDeltaType = "accept" | "edit" | "clear" | "reject";

export interface EditDeltaParams {
  studyId: string;
  /** v2-style dot-path id (e.g. "background_activity.pdr_frequency_hz") OR
   *  the editable-surface key (e.g. "pdr_frequency_hz") when the editor
   *  doesn't yet emit fully-qualified field_ids. AdminEditDeltas tolerates
   *  both. */
  fieldId: string;
  editType: EditDeltaType;
  originalValue?: unknown;
  newValue?: unknown;
  /** Provenance kind of the field BEFORE the edit ('model' | 'rule' | …).
   *  Lets us answer "what kinds of model outputs do clinicians most often
   *  reject?" without joining against the emission row. */
  originalDerivedFrom?: string | null;
  /** FK to report_emission_events.id when known. Null otherwise. */
  sourceEmissionId?: string | null;
  /** For edit_type='reject': reason taken from RejectFinding (artifact /
   *  wrong_lateralization / missed_finding / spurious_finding / other). */
  reasonCode?: string | null;
  reasonText?: string | null;
  clientRequestId?: string | null;
}

export interface EditDeltaResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export async function captureEditDelta(params: EditDeltaParams): Promise<EditDeltaResult> {
  try {
    const { data: authRes } = await supabase.auth.getUser();
    const clinicianId = authRes.user?.id;
    if (!clinicianId) {
      return { ok: false, error: "not_authenticated" };
    }

    const { data, error } = await supabase
      .from("clinician_edit_deltas")
      .insert({
        study_id:               params.studyId,
        clinician_id:           clinicianId,
        field_id:               params.fieldId,
        edit_type:              params.editType,
        original_value:         params.originalValue === undefined ? null : (params.originalValue as any),
        new_value:              params.newValue      === undefined ? null : (params.newValue      as any),
        original_derived_from:  params.originalDerivedFrom ?? null,
        source_emission_id:     params.sourceEmissionId    ?? null,
        reason_code:            params.reasonCode          ?? null,
        reason_text:            params.reasonText          ?? null,
        client_request_id:      params.clientRequestId     ?? null,
      })
      .select("id")
      .single();

    if (error) {
      // Log for ops; never throw at the editor.
      // eslint-disable-next-line no-console
      console.warn("[editDeltaCapture] insert failed:", error.message, {
        fieldId: params.fieldId, editType: params.editType,
      });
      return { ok: false, error: error.message };
    }
    return { ok: true, id: data?.id };
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.warn("[editDeltaCapture] unexpected error:", e?.message ?? e);
    return { ok: false, error: e?.message ?? "unknown" };
  }
}

/** Generate a short request_id for correlating a clinician session's edits.
 *  Stable for the lifetime of the session per study; use one per editor mount. */
export function newEditDeltaSessionId(): string {
  const arr = new Uint8Array(4);
  crypto.getRandomValues(arr);
  return "edt_" + Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}
