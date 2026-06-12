/**
 * useStudyComparison — single data-fetch hook for the Compared-to-prior surface.
 *
 * Reads the study_comparison_runs row for a given current_study_id, plus the
 * lite prior-study row that the comparison points at. Both queries are wired
 * through TanStack Query so the same data is shared by the report tab banner
 * and the inline ComparedToPrior surface without double-fetching.
 *
 * Defensive by design — no eligible prior (first study on file, vendor /
 * model gating, etc.) returns `{ priorStudyId: null }`, NOT an error.
 *
 * Polling: refetchInterval 30 s while the row exists but the diff_payload
 * is still being computed by the I-Plane finaliser. Stops once the payload
 * lands or the row settles into a terminal state.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/* ────────────────────────────────────────────────────────────────────────── */
/*  Types — mirror libs/score/compare.py output shape.                        */
/* ────────────────────────────────────────────────────────────────────────── */

export interface BiomarkerDelta {
  biomarker_kind: string;
  current_value: number;
  prior_value: number;
  delta_abs: number;
  delta_signed: number;
  percentile_rank: "p75+" | "p50-p75" | "below_p50" | string;
  tier: "change" | "noteworthy" | "noise" | string;
  reportable: boolean;
  caveat: string | null;
  threshold_source: string;
  p75: number;
}

export interface FindingChange {
  kind: string;
  state: "unchanged" | "new" | "resolved" | "changed" | string;
  current_value: unknown;
  prior_value: unknown;
  caveat?: string | null;
}

export interface ComparisonCaveat {
  kind: string;
  reason?: string;
  current?: string | Record<string, string>;
  prior?: string | Record<string, string>;
  finding_kind?: string;
  deprecated?: string;
}

/**
 * One row of study_comparison_runs. `diff_payload` is the JSONB column the
 * I-Plane finaliser writes; we flatten its contents into top-level fields
 * for the component to consume directly.
 */
export interface ComparisonRun {
  id: string;
  current_study_id: string;
  prior_study_id: string;
  computed_at: string;
  current_report_sha: string;
  prior_report_sha: string;
  biomarker_deltas: BiomarkerDelta[];
  finding_changes: FindingChange[];
  caveats: ComparisonCaveat[];
  suppressed: boolean;
  model_versions_used: Record<string, Record<string, string>>;
  /** Raw diff_payload column when present (newer schema). */
  diff_payload?: Record<string, unknown> | null;
  /** Lifecycle marker — "processing" => poll; "complete" / null => settled. */
  status?: string | null;
}

export interface PriorStudyMeta {
  id: string;
  created_at: string | null;
  state: string | null;
  meta: Record<string, unknown> | null;
}

export interface UseStudyComparisonResult {
  comparisonRun: ComparisonRun | null;
  priorStudyId: string | null;
  priorStudyMeta: PriorStudyMeta | null;
  /** True while either the comparison row or the prior study row is in flight. */
  loading: boolean;
  /** First non-null error from either query. Null when no prior exists (NOT an error). */
  error: Error | null;
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Hook                                                                       */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Fetch the comparison run + lite prior-study meta for a given current study.
 *
 * Returns `{ priorStudyId: null }` when no eligible prior exists — the
 * absence is a legitimate state, not an error. Callers should render an
 * honest "first study on file" empty state in that case.
 */
export function useStudyComparison(studyId: string | null | undefined): UseStudyComparisonResult {
  const run = useQuery<ComparisonRun | null>({
    queryKey: ["study_comparison_runs", "by-current", studyId],
    enabled: !!studyId,
    queryFn: async () => {
      // study_comparison_runs is keyed by current_study_id (one row per
      // study). If the I-Plane finaliser hasn't created the row yet
      // (e.g. report still drafting, vendor gate failed, no prior), we
      // return null — the caller treats that as "no prior".
      const { data, error } = await supabase
        .from("study_comparison_runs" as never)
        .select("*")
        .eq("current_study_id", studyId as string)
        .order("computed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as ComparisonRun | null;
    },
    // Poll every 30 s while the I-Plane finaliser is still computing the
    // diff. Stop polling once the row lands AND has a diff_payload OR a
    // terminal status. Idempotent — the query key keeps caches in sync.
    refetchInterval: (query) => {
      const row = query.state.data as ComparisonRun | null | undefined;
      if (!row) return false;
      if (row.status === "processing") return 30_000;
      const hasPayload =
        (row.diff_payload != null && Object.keys(row.diff_payload).length > 0) ||
        (Array.isArray(row.finding_changes) && row.finding_changes.length > 0) ||
        (Array.isArray(row.biomarker_deltas) && row.biomarker_deltas.length > 0);
      return hasPayload ? false : 30_000;
    },
    staleTime: 15_000,
  });

  const priorStudyId = run.data?.prior_study_id ?? null;

  const prior = useQuery<PriorStudyMeta | null>({
    queryKey: ["studies", "prior", priorStudyId],
    enabled: !!priorStudyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("studies")
        .select("id, created_at, state, meta")
        .eq("id", priorStudyId as string)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as PriorStudyMeta | null;
    },
    staleTime: 60_000,
  });

  return {
    comparisonRun: run.data ?? null,
    priorStudyId,
    priorStudyMeta: prior.data ?? null,
    loading: run.isLoading || (!!priorStudyId && prior.isLoading),
    error: (run.error as Error | null) ?? (prior.error as Error | null) ?? null,
  };
}
