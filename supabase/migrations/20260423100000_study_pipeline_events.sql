-- =============================================================================
-- Study pipeline events — append-only operational log (explainability / ops)
--
-- Goal: nothing "silent" between upload and report. Each stage writes a row
-- with step + status + JSON detail. Service role inserts from Edge / C-Plane
-- / I-Plane; clinicians read via RLS aligned with studies visibility.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.study_pipeline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL REFERENCES public.studies (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  step text NOT NULL,
  status text NOT NULL,
  source text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id text,
  CONSTRAINT study_pipeline_events_status_check
    CHECK (status IN ('ok', 'error', 'skipped', 'info')),
  CONSTRAINT study_pipeline_events_source_check
    CHECK (source IN ('supabase_edge', 'cplane', 'iplane', 'admin_ui'))
);

CREATE INDEX IF NOT EXISTS idx_study_pipeline_events_study_created
  ON public.study_pipeline_events (study_id, created_at DESC);

COMMENT ON TABLE public.study_pipeline_events IS
  'Append-only EEG pipeline timeline (Edge → C-Plane → I-Plane). For UI explainability and admin forensics; not a substitute for audit_logs.';

ALTER TABLE public.study_pipeline_events ENABLE ROW LEVEL SECURITY;

-- Authenticated users who can see the parent study can read its pipeline rows.
CREATE POLICY study_pipeline_events_select
  ON public.study_pipeline_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.studies s
      WHERE s.id = study_pipeline_events.study_id
        AND (
          s.sample IS TRUE
          OR s.owner = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.clinic_memberships cm
            WHERE cm.user_id = auth.uid()
              AND cm.clinic_id = s.clinic_id
          )
          OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
          OR public.has_role(auth.uid(), 'management'::public.app_role)
        )
    )
  );

-- Inserts are performed with the service role key from Edge / C-Plane / I-Plane
-- (bypasses RLS). No INSERT policy for end users.
