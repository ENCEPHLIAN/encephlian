/** Append-only study pipeline timeline (see migration study_pipeline_events). */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type PipelineStatus = "ok" | "error" | "skipped" | "info";

type ServiceClient = ReturnType<typeof createClient>;

export async function insertPipelineEvent(
  supabase: ServiceClient,
  params: {
    study_id: string;
    step: string;
    status: PipelineStatus;
    source: "supabase_edge" | "admin_ui";
    detail?: Record<string, unknown>;
    correlation_id?: string | null;
  },
): Promise<void> {
  const { error } = await supabase.from("study_pipeline_events").insert({
    study_id: params.study_id,
    step: params.step,
    status: params.status,
    source: params.source,
    detail: params.detail ?? {},
    correlation_id: params.correlation_id ?? null,
  });
  if (error) console.error("[pipeline_event]", params.step, error.message);
}
