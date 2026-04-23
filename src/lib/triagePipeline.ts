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
  }).catch((e) => console.warn("[triage] C-Plane trigger failed:", e));
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
