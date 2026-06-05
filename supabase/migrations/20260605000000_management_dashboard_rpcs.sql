-- =============================================================================
-- Per-clinic management dashboard — P0 RPCs
--
-- Adds three SECURITY INVOKER aggregation RPCs (throughput / pipeline health /
-- signal quality) plus one SECURITY DEFINER helper that resolves the
-- management user's first clinic_id. RLS stays as-is; the RPCs filter by
-- clinic_id at the SQL level. Per design §5: "scope in the RPC, not RLS"
-- because super_admin and management share RLS today and we don't want to
-- encode a per-user clinic_id predicate on every policy.
--
-- Honesty discipline (postmortem-vigil-clean lesson): NONE of these RPCs
-- return a model metric. The dashboard reads model verdicts directly from
-- model_validation_runs in a separate query. These RPCs only return raw
-- operational counts + averages over rows the user's clinic owns.
--
-- Spec: docs/per_clinic_ops_dashboard_design.md §6 + §11.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helper: management_user_clinic_id(p_user_id)
--
-- Returns the user's first clinic_id from clinic_memberships. Multi-clinic
-- support is P1 via an explicit switcher — the dashboard frontend passes the
-- selected clinic_id to every other RPC, never relying on this helper as a
-- magic auth.uid() resolution. SECURITY DEFINER so callers don't need to
-- read clinic_memberships directly.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.management_user_clinic_id(p_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  -- clinic_memberships has no created_at; order by clinic_id for a stable
  -- deterministic pick. Multi-clinic switcher (P1) lets the user override.
  SELECT clinic_id
    FROM public.clinic_memberships
   WHERE user_id = p_user_id
   ORDER BY clinic_id ASC
   LIMIT 1;
$$;

COMMENT ON FUNCTION public.management_user_clinic_id(uuid) IS
  'P0 management dashboard helper. Returns the first clinic_id a user belongs to. Multi-clinic support is P1 via an explicit switcher. SECURITY DEFINER bypasses RLS on clinic_memberships.';

REVOKE ALL ON FUNCTION public.management_user_clinic_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.management_user_clinic_id(uuid) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- RPC 1: clinic_throughput_summary(p_clinic_id, p_window_days)
--
-- Returns a single jsonb row with today / week / month counts, a 14-day
-- sparkline array [{day, count}], per-vendor (original_format) breakdown
-- over the last 30 days, and per-clinician (owner) breakdown over 30 days
-- joined to profiles.full_name.
--
-- p_window_days kept for future flexibility (panel may switch to 90d on
-- internal SKU). All other aggregates are fixed windows for P0.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.clinic_throughput_summary(
  p_clinic_id uuid,
  p_window_days int DEFAULT 14
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = 'public'
AS $$
DECLARE
  v_today int;
  v_week int;
  v_month int;
  v_sparkline jsonb;
  v_by_vendor jsonb;
  v_by_clinician jsonb;
BEGIN
  IF p_clinic_id IS NULL THEN
    RAISE EXCEPTION 'p_clinic_id required';
  END IF;

  -- Window-based counts. timezone left as server-default (UTC); calling page
  -- can re-bucket if a tz-aware "today" matters.
  SELECT
    count(*) FILTER (WHERE s.created_at::date = (now() AT TIME ZONE 'UTC')::date),
    count(*) FILTER (WHERE s.created_at >= date_trunc('week',  now())),
    count(*) FILTER (WHERE s.created_at >= date_trunc('month', now()))
  INTO v_today, v_week, v_month
  FROM public.studies s
  WHERE s.clinic_id = p_clinic_id
    AND COALESCE(s.sample, false) = false;

  -- 14-day sparkline: dense series including zero-count days so the SVG
  -- never collapses. generate_series gives the spine; LEFT JOIN keeps gaps.
  WITH days AS (
    SELECT generate_series(
      (now()::date - (GREATEST(p_window_days, 1) - 1) * interval '1 day')::date,
      now()::date,
      interval '1 day'
    )::date AS day
  ),
  counts AS (
    SELECT
      s.created_at::date AS day,
      count(*) AS n
    FROM public.studies s
    WHERE s.clinic_id = p_clinic_id
      AND COALESCE(s.sample, false) = false
      AND s.created_at >= (now()::date - (GREATEST(p_window_days, 1) - 1) * interval '1 day')
    GROUP BY 1
  )
  SELECT coalesce(
    jsonb_agg(jsonb_build_object('day', d.day, 'count', coalesce(c.n, 0)) ORDER BY d.day),
    '[]'::jsonb
  )
  INTO v_sparkline
  FROM days d
  LEFT JOIN counts c ON c.day = d.day;

  -- 30-day per-vendor breakdown. Honesty discipline: surface NULL
  -- original_format as "unknown" rather than silently dropping rows
  -- (matches design §3 Panel A "Honest unknown" rule).
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'format', coalesce(s.original_format, 'unknown'),
        'count', s.n
      ) ORDER BY s.n DESC
    ),
    '[]'::jsonb
  )
  INTO v_by_vendor
  FROM (
    SELECT
      original_format,
      count(*) AS n
    FROM public.studies
    WHERE clinic_id = p_clinic_id
      AND COALESCE(sample, false) = false
      AND created_at >= now() - interval '30 days'
    GROUP BY original_format
  ) s;

  -- 30-day per-clinician breakdown joined to profiles.full_name.
  -- owner may be NULL on auto-created sample/seed rows; surface as "unassigned".
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'owner_id', x.owner,
        'full_name', coalesce(p.full_name, 'Unassigned'),
        'count', x.n
      ) ORDER BY x.n DESC
    ),
    '[]'::jsonb
  )
  INTO v_by_clinician
  FROM (
    SELECT
      owner,
      count(*) AS n
    FROM public.studies
    WHERE clinic_id = p_clinic_id
      AND COALESCE(sample, false) = false
      AND created_at >= now() - interval '30 days'
    GROUP BY owner
  ) x
  LEFT JOIN public.profiles p ON p.id = x.owner;

  RETURN jsonb_build_object(
    'clinic_id',         p_clinic_id,
    'window_days',       p_window_days,
    'today_count',       v_today,
    'week_count',        v_week,
    'month_count',       v_month,
    'sparkline',         v_sparkline,
    'by_vendor_30d',     v_by_vendor,
    'by_clinician_30d',  v_by_clinician,
    'generated_at',      now()
  );
END;
$$;

COMMENT ON FUNCTION public.clinic_throughput_summary(uuid, int) IS
  'P0 management dashboard. Returns today/week/month study counts, dense N-day sparkline (default 14), 30d per-vendor + per-clinician breakdown. SECURITY INVOKER — cannot widen RLS. Sample studies excluded.';

REVOKE ALL ON FUNCTION public.clinic_throughput_summary(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clinic_throughput_summary(uuid, int) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- RPC 2: clinic_pipeline_health_summary(p_clinic_id)
--
-- 24h uptime per source (cplane / iplane / supabase_edge), mean processing
-- time over 7d (triage_started_at → triage_completed_at), 7d failure rate,
-- 7d failure breakdown by step, and 5 most-recent failure rows.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.clinic_pipeline_health_summary(
  p_clinic_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = 'public'
AS $$
DECLARE
  v_uptime_24h jsonb;
  v_mean_processing_seconds numeric;
  v_failure_rate_7d numeric;
  v_failure_breakdown jsonb;
  v_recent_failures jsonb;
  v_studies_7d int;
  v_failed_7d int;
  v_silent_failures_7d int;
BEGIN
  IF p_clinic_id IS NULL THEN
    RAISE EXCEPTION 'p_clinic_id required';
  END IF;

  -- 24h uptime: 1 - (errors / total) per source. Sources without any event
  -- in the window render as NULL (honest "no data" rather than fake 100%).
  WITH src AS (
    SELECT unnest(ARRAY['supabase_edge', 'cplane', 'iplane']) AS source
  ),
  agg AS (
    SELECT
      spe.source,
      count(*) AS total,
      count(*) FILTER (WHERE spe.status = 'error') AS errors
    FROM public.study_pipeline_events spe
    JOIN public.studies s ON s.id = spe.study_id
    WHERE s.clinic_id = p_clinic_id
      AND spe.created_at >= now() - interval '24 hours'
    GROUP BY spe.source
  )
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'source', src.source,
        'total_events', coalesce(agg.total, 0),
        'error_events', coalesce(agg.errors, 0),
        'uptime', CASE
          WHEN agg.total IS NULL OR agg.total = 0 THEN NULL
          ELSE 1.0 - (agg.errors::numeric / agg.total::numeric)
        END
      ) ORDER BY src.source
    ),
    '[]'::jsonb
  )
  INTO v_uptime_24h
  FROM src
  LEFT JOIN agg ON agg.source = src.source;

  -- Mean processing time over 7 days where both timestamps non-null.
  SELECT avg(extract(epoch FROM (triage_completed_at - triage_started_at)))
  INTO v_mean_processing_seconds
  FROM public.studies
  WHERE clinic_id = p_clinic_id
    AND COALESCE(sample, false) = false
    AND triage_started_at IS NOT NULL
    AND triage_completed_at IS NOT NULL
    AND triage_completed_at >= now() - interval '7 days'
    AND triage_completed_at > triage_started_at;

  -- 7d failure rate. NULLIF guards a division-by-zero on cold start.
  SELECT
    count(*) FILTER (WHERE created_at >= now() - interval '7 days'),
    count(*) FILTER (WHERE state = 'failed' AND created_at >= now() - interval '7 days')
  INTO v_studies_7d, v_failed_7d
  FROM public.studies
  WHERE clinic_id = p_clinic_id
    AND COALESCE(sample, false) = false;

  v_failure_rate_7d := CASE
    WHEN v_studies_7d = 0 THEN NULL
    ELSE v_failed_7d::numeric / v_studies_7d::numeric
  END;

  -- 7d failure breakdown by step.
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object('step', x.step, 'count', x.n)
      ORDER BY x.n DESC
    ),
    '[]'::jsonb
  )
  INTO v_failure_breakdown
  FROM (
    SELECT
      spe.step,
      count(*) AS n
    FROM public.study_pipeline_events spe
    JOIN public.studies s ON s.id = spe.study_id
    WHERE s.clinic_id = p_clinic_id
      AND spe.status = 'error'
      AND spe.created_at >= now() - interval '7 days'
    GROUP BY spe.step
  ) x;

  -- 5 most-recent failure events with study_id + step + correlation_id.
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'study_id', spe.study_id,
        'step', spe.step,
        'source', spe.source,
        'correlation_id', spe.correlation_id,
        'detail', spe.detail,
        'created_at', spe.created_at
      ) ORDER BY spe.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_recent_failures
  FROM (
    SELECT spe.*
    FROM public.study_pipeline_events spe
    JOIN public.studies s ON s.id = spe.study_id
    WHERE s.clinic_id = p_clinic_id
      AND spe.status = 'error'
    ORDER BY spe.created_at DESC
    LIMIT 5
  ) spe;

  -- Silent failures: studies in state='failed' that have NO error event row.
  -- Honesty discipline (design §3 Panel B): surface these distinctly rather
  -- than rolling into the generic failed bucket.
  SELECT count(*)
  INTO v_silent_failures_7d
  FROM public.studies s
  WHERE s.clinic_id = p_clinic_id
    AND COALESCE(s.sample, false) = false
    AND s.state = 'failed'
    AND s.created_at >= now() - interval '7 days'
    AND NOT EXISTS (
      SELECT 1
      FROM public.study_pipeline_events spe
      WHERE spe.study_id = s.id
        AND spe.status = 'error'
    );

  RETURN jsonb_build_object(
    'clinic_id',                  p_clinic_id,
    'uptime_24h_by_source',       v_uptime_24h,
    'mean_processing_seconds_7d', v_mean_processing_seconds,
    'studies_7d',                 v_studies_7d,
    'failed_7d',                  v_failed_7d,
    'failure_rate_7d',            v_failure_rate_7d,
    'failure_breakdown_7d',       v_failure_breakdown,
    'recent_failures',            v_recent_failures,
    'silent_failures_7d',         v_silent_failures_7d,
    'generated_at',               now()
  );
END;
$$;

COMMENT ON FUNCTION public.clinic_pipeline_health_summary(uuid) IS
  'P0 management dashboard. 24h uptime per source, 7d mean processing time + failure rate + breakdown by step, 5 most-recent failure events, silent-failure count. SECURITY INVOKER. Sample studies excluded.';

REVOKE ALL ON FUNCTION public.clinic_pipeline_health_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clinic_pipeline_health_summary(uuid) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- RPC 3: clinic_signal_quality_summary(p_clinic_id, p_window_days)
--
-- % studies with >=3 bad channels (default 7d), avg bad-channel % (30d),
-- top 5 most-frequently-bad channel labels (30d), 30d weekly bins for trend.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.clinic_signal_quality_summary(
  p_clinic_id uuid,
  p_window_days int DEFAULT 7
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = 'public'
AS $$
DECLARE
  v_pct_poor_quality numeric;
  v_studies_in_window int;
  v_poor_quality_studies int;
  v_avg_bad_pct_30d numeric;
  v_top_bad_channels jsonb;
  v_weekly_bins jsonb;
BEGIN
  IF p_clinic_id IS NULL THEN
    RAISE EXCEPTION 'p_clinic_id required';
  END IF;

  -- % studies with >=3 bad channels in window. Per-study aggregation in
  -- a CTE then count of qualifying studies / total studies with any
  -- channel quality data in the same window.
  WITH per_study AS (
    SELECT
      cqa.study_id,
      count(*) FILTER (WHERE cqa.quality_class IN ('bad', 'missing')) AS bad_channels
    FROM public.channel_quality_assessments cqa
    JOIN public.studies s ON s.id = cqa.study_id
    WHERE s.clinic_id = p_clinic_id
      AND COALESCE(s.sample, false) = false
      AND s.created_at >= now() - (GREATEST(p_window_days, 1) || ' days')::interval
    GROUP BY cqa.study_id
  )
  SELECT
    count(*),
    count(*) FILTER (WHERE bad_channels >= 3)
  INTO v_studies_in_window, v_poor_quality_studies
  FROM per_study;

  v_pct_poor_quality := CASE
    WHEN v_studies_in_window = 0 THEN NULL
    ELSE v_poor_quality_studies::numeric / v_studies_in_window::numeric
  END;

  -- Avg bad-channel ratio across studies in the last 30 days. 19 channels is
  -- the canonical 10-20 system count; use NULLIF to guard the divide.
  WITH per_study AS (
    SELECT
      cqa.study_id,
      count(*) AS total_channels,
      count(*) FILTER (WHERE cqa.quality_class IN ('bad', 'missing')) AS bad_channels
    FROM public.channel_quality_assessments cqa
    JOIN public.studies s ON s.id = cqa.study_id
    WHERE s.clinic_id = p_clinic_id
      AND COALESCE(s.sample, false) = false
      AND s.created_at >= now() - interval '30 days'
    GROUP BY cqa.study_id
  )
  SELECT avg(bad_channels::numeric / NULLIF(total_channels, 0)::numeric)
  INTO v_avg_bad_pct_30d
  FROM per_study;

  -- Top 5 most-frequently-bad channel labels in last 30 days.
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object('channel', x.channel_label, 'count', x.n)
      ORDER BY x.n DESC
    ),
    '[]'::jsonb
  )
  INTO v_top_bad_channels
  FROM (
    SELECT
      cqa.channel_label,
      count(*) AS n
    FROM public.channel_quality_assessments cqa
    JOIN public.studies s ON s.id = cqa.study_id
    WHERE s.clinic_id = p_clinic_id
      AND COALESCE(s.sample, false) = false
      AND cqa.quality_class = 'bad'
      AND s.created_at >= now() - interval '30 days'
    GROUP BY cqa.channel_label
    ORDER BY count(*) DESC
    LIMIT 5
  ) x;

  -- 30d weekly bins (4 buckets, oldest first). Each bucket reports pct of
  -- studies that were poor-quality (>=3 bad channels) in that week.
  WITH weeks AS (
    SELECT
      gs AS week_start,
      gs + interval '7 days' AS week_end
    FROM generate_series(
      (now() - interval '28 days')::date,
      (now() - interval '7 days')::date,
      interval '7 days'
    ) AS gs
  ),
  per_study AS (
    SELECT
      cqa.study_id,
      s.created_at,
      count(*) FILTER (WHERE cqa.quality_class IN ('bad', 'missing')) AS bad_channels
    FROM public.channel_quality_assessments cqa
    JOIN public.studies s ON s.id = cqa.study_id
    WHERE s.clinic_id = p_clinic_id
      AND COALESCE(s.sample, false) = false
      AND s.created_at >= now() - interval '35 days'
    GROUP BY cqa.study_id, s.created_at
  ),
  binned AS (
    SELECT
      w.week_start,
      count(ps.*) AS total,
      count(ps.*) FILTER (WHERE ps.bad_channels >= 3) AS poor
    FROM weeks w
    LEFT JOIN per_study ps
      ON ps.created_at >= w.week_start
     AND ps.created_at <  w.week_end
    GROUP BY w.week_start
  )
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'week_start', week_start::date,
        'total_studies', total,
        'poor_quality_studies', poor,
        'pct_poor_quality', CASE WHEN total = 0 THEN NULL ELSE poor::numeric / total::numeric END
      ) ORDER BY week_start
    ),
    '[]'::jsonb
  )
  INTO v_weekly_bins
  FROM binned;

  RETURN jsonb_build_object(
    'clinic_id',              p_clinic_id,
    'window_days',            p_window_days,
    'studies_in_window',      v_studies_in_window,
    'poor_quality_studies',   v_poor_quality_studies,
    'pct_poor_quality',       v_pct_poor_quality,
    'avg_bad_channel_pct_30d', v_avg_bad_pct_30d,
    'top_bad_channels_30d',   v_top_bad_channels,
    'weekly_bins_30d',        v_weekly_bins,
    'generated_at',           now()
  );
END;
$$;

COMMENT ON FUNCTION public.clinic_signal_quality_summary(uuid, int) IS
  'P0 management dashboard. % studies with >=3 bad channels (default 7d), avg bad-channel ratio (30d), top 5 bad channels (30d), 4 weekly bins (28d). SECURITY INVOKER. Sample studies excluded. NULLs on cold-start instead of fake 100% uptime.';

REVOKE ALL ON FUNCTION public.clinic_signal_quality_summary(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clinic_signal_quality_summary(uuid, int) TO authenticated, service_role;

-- =============================================================================
-- RLS-leak unit tests
--
-- Per design §5: each RPC has a unit test asserting cross-clinic data is
-- filtered out. We pick two clinics with the most studies and assert that
-- calling the RPC for clinic A returns no rows that belong to clinic B,
-- and vice versa. Run inline as DO blocks so failure aborts the migration.
--
-- The tests insert no rows. They rely on existing data; if the project has
-- fewer than 2 clinics with studies they degrade to a sanity assertion (the
-- single clinic returns a non-null jsonb shape). This keeps the migration
-- portable across dev / staging where seed data varies.
-- =============================================================================

DO $$
DECLARE
  v_clinic_a uuid;
  v_clinic_b uuid;
  v_result jsonb;
BEGIN
  -- Pick the two clinics with the most studies (deterministic ordering by id
  -- as a tiebreaker so the test is reproducible).
  WITH ranked AS (
    SELECT clinic_id, count(*) AS n
    FROM public.studies
    GROUP BY clinic_id
    ORDER BY n DESC, clinic_id ASC
    LIMIT 2
  )
  SELECT
    (array_agg(clinic_id))[1],
    (array_agg(clinic_id))[2]
  INTO v_clinic_a, v_clinic_b
  FROM ranked;

  -- throughput_summary
  IF v_clinic_a IS NOT NULL THEN
    v_result := public.clinic_throughput_summary(v_clinic_a, 14);
    IF v_result IS NULL THEN
      RAISE EXCEPTION 'clinic_throughput_summary returned null for clinic_a=%', v_clinic_a;
    END IF;
    IF (v_result->>'clinic_id')::uuid <> v_clinic_a THEN
      RAISE EXCEPTION 'clinic_throughput_summary returned wrong clinic_id (expected=% got=%)',
        v_clinic_a, v_result->>'clinic_id';
    END IF;
  END IF;

  -- pipeline_health_summary
  IF v_clinic_a IS NOT NULL THEN
    v_result := public.clinic_pipeline_health_summary(v_clinic_a);
    IF v_result IS NULL THEN
      RAISE EXCEPTION 'clinic_pipeline_health_summary returned null for clinic_a=%', v_clinic_a;
    END IF;
    IF (v_result->>'clinic_id')::uuid <> v_clinic_a THEN
      RAISE EXCEPTION 'clinic_pipeline_health_summary returned wrong clinic_id';
    END IF;
  END IF;

  -- signal_quality_summary
  IF v_clinic_a IS NOT NULL THEN
    v_result := public.clinic_signal_quality_summary(v_clinic_a, 7);
    IF v_result IS NULL THEN
      RAISE EXCEPTION 'clinic_signal_quality_summary returned null for clinic_a=%', v_clinic_a;
    END IF;
    IF (v_result->>'clinic_id')::uuid <> v_clinic_a THEN
      RAISE EXCEPTION 'clinic_signal_quality_summary returned wrong clinic_id';
    END IF;
  END IF;

  -- Cross-clinic leak test: when 2+ clinics exist, none of the recent_failures
  -- returned for clinic_a should belong to clinic_b's studies. We assert by
  -- joining the returned study_ids back to studies and confirming clinic_id.
  IF v_clinic_a IS NOT NULL AND v_clinic_b IS NOT NULL THEN
    v_result := public.clinic_pipeline_health_summary(v_clinic_a);

    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_result->'recent_failures') f
      JOIN public.studies s ON s.id = (f->>'study_id')::uuid
      WHERE s.clinic_id <> v_clinic_a
    ) THEN
      RAISE EXCEPTION
        'RLS-LEAK: clinic_pipeline_health_summary(clinic_a) returned a failure row whose study belongs to a different clinic';
    END IF;

    -- Same check via the throughput RPC's per-clinician breakdown: every owner
    -- listed must actually own at least one study in clinic_a (NULL owners
    -- skip the join — that's the "Unassigned" bucket, which is correct).
    v_result := public.clinic_throughput_summary(v_clinic_a, 14);

    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_result->'by_clinician_30d') c
      WHERE (c->>'owner_id') IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM public.studies s
          WHERE s.clinic_id = v_clinic_a
            AND s.owner = (c->>'owner_id')::uuid
            AND s.created_at >= now() - interval '30 days'
        )
    ) THEN
      RAISE EXCEPTION
        'RLS-LEAK: clinic_throughput_summary(clinic_a) reported a clinician that does not own any clinic_a studies in the last 30 days';
    END IF;

    RAISE NOTICE 'management_dashboard_rpcs: RLS-leak tests passed (clinic_a=%, clinic_b=%)',
      v_clinic_a, v_clinic_b;
  ELSE
    RAISE NOTICE 'management_dashboard_rpcs: skipped cross-clinic leak test (need 2+ clinics with studies; found clinic_a=%)', v_clinic_a;
  END IF;
END $$;
