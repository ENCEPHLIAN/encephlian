import { supabase } from "@/integrations/supabase/client";

/** Starts C-Plane canonicalization (idempotent). Call only after SLA + token deduction. */
export function triggerCPlaneProcess(studyId: string): void {
  const cplaneBase = import.meta.env.VITE_CPLANE_BASE as string | undefined;
  if (!cplaneBase) {
    console.warn("[triage] VITE_CPLANE_BASE missing — cannot start pipeline");
    return;
  }
  fetch(`${cplaneBase}/process`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ study_id: studyId }),
  }).catch(async (err) => {
    const detail = err instanceof Error ? err.message : String(err);
    console.warn("[triage] C-Plane trigger failed:", detail);
    try {
      await supabase.from("study_pipeline_events").insert({
        study_id: studyId,
        step: "cplane_trigger",
        status: "error",
        source: "e-plane",
        detail: { error: detail, cplane_base: cplaneBase, ts: new Date().toISOString() },
      });
      await supabase
        .from("studies")
        .update({ triage_status: "failed", triage_progress: 0 })
        .eq("id", studyId);
    } catch (writeErr) {
      console.error("[triage] could not record trigger failure", writeErr);
    }
  });
}

/**
 * Internal SKU bypass — direct triage start without going through the
 * paid select_sla_and_start_triage RPC.
 *
 * Mirrors the StudyUploadWizard's single-file path: marks the study as
 * uploaded with sla_selected_at set, leaves triage_status='pending' so
 * C-Plane owns the processing/completed/failed transitions, then fires
 * /process. NO token deduction. NO RPC. Used by InternalStudiesView's
 * upload handler and the wizard so both paths produce the same studies
 * row state.
 */
export async function startTriageInternal(
  studyId: string,
  sla: "TAT" | "STAT" = "TAT",
  uploadedFilePath?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const patch: Record<string, unknown> = {
      state: "uploaded",
      sla,
      sla_selected_at: new Date().toISOString(),
      triage_status: "pending",
      triage_progress: 0,
    };
    if (uploadedFilePath) patch.uploaded_file_path = uploadedFilePath;
    const { error } = await supabase.from("studies").update(patch).eq("id", studyId);
    if (error) return { success: false, error: error.message };
    triggerCPlaneProcess(studyId);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message ?? "unknown error" };
  }
}

export type SlaChoice = "TAT" | "STAT";

export type SlaRpcResult = {
  success: boolean;
  error?: string;
  tokens_deducted?: number;
  new_balance?: number;
};

/**
 * Deducts tokens and moves study into processing — then kicks C-Plane.
 * Must only run after the recording is on blob storage.
 */
export async function selectSlaAndStartPipeline(
  studyId: string,
  sla: SlaChoice,
): Promise<SlaRpcResult> {
  const { data, error } = await supabase.rpc("select_sla_and_start_triage", {
    p_study_id: studyId,
    p_sla: sla,
  });
  if (error) throw error;
  const result = data as SlaRpcResult;
  if (result?.success) {
    triggerCPlaneProcess(studyId);
  }
  return result;
}
