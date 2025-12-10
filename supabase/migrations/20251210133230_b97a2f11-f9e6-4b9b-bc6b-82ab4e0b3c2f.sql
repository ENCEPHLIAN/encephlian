-- Fix study_files_kind_check constraint to include 'raw' and 'bdf'
ALTER TABLE public.study_files DROP CONSTRAINT IF EXISTS study_files_kind_check;

ALTER TABLE public.study_files ADD CONSTRAINT study_files_kind_check 
CHECK (kind = ANY (ARRAY['edf'::text, 'bdf'::text, 'nwb'::text, 'preview'::text, 'pdf'::text, 'json'::text, 'artifact_log'::text, 'raw'::text]));