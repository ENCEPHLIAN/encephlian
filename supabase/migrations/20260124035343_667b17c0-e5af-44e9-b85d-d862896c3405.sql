-- Create study_reports table for admin-generated triage reports
CREATE TABLE IF NOT EXISTS public.study_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid REFERENCES public.studies(id) ON DELETE CASCADE NOT NULL,
  run_id text,
  content jsonb NOT NULL DEFAULT '{}',
  report_html text,
  created_at timestamptz DEFAULT now(),
  created_by uuid
);

-- Enable RLS
ALTER TABLE public.study_reports ENABLE ROW LEVEL SECURITY;

-- Admin-only access
CREATE POLICY "admin_study_reports_all" ON public.study_reports
  FOR ALL USING (
    has_role(auth.uid(), 'super_admin'::app_role) OR 
    has_role(auth.uid(), 'management'::app_role)
  );

-- Add comment
COMMENT ON TABLE public.study_reports IS 'Admin-generated triage reports (distinct from signed clinical reports)';