-- Add study fields for Read API integration
ALTER TABLE public.studies
  ADD COLUMN IF NOT EXISTS study_key text,
  ADD COLUMN IF NOT EXISTS storage_backend text DEFAULT 'supabase',
  ADD COLUMN IF NOT EXISTS storage_ref text,
  ADD COLUMN IF NOT EXISTS latest_run_id text;

-- Create unique index on (clinic_id, study_key) for tenant-scoped uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS idx_studies_clinic_study_key 
  ON public.studies(clinic_id, study_key) 
  WHERE study_key IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.studies.study_key IS 'Unique key within clinic for Read API lookup (e.g., TUH_CANON_001)';
COMMENT ON COLUMN public.studies.storage_backend IS 'Storage type: supabase, local, azure_blob';
COMMENT ON COLUMN public.studies.storage_ref IS 'Reference path in storage backend';
COMMENT ON COLUMN public.studies.latest_run_id IS 'Latest inference run ID from Read API';