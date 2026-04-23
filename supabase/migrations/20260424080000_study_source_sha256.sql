-- Content-addressed recording identity (per clinic) + index for dedupe lookups.
-- Human-facing codes live in studies.reference (set by app / Edge on create).

ALTER TABLE public.studies
  ADD COLUMN IF NOT EXISTS source_content_sha256 text;

COMMENT ON COLUMN public.studies.source_content_sha256 IS
  'SHA-256 (hex) of raw uploaded recording bytes. Same bytes → same hash for idempotent dedupe within a clinic.';

CREATE INDEX IF NOT EXISTS idx_studies_clinic_source_sha
  ON public.studies (clinic_id, source_content_sha256)
  WHERE source_content_sha256 IS NOT NULL;
