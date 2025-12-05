-- Create canonical_eeg_records table for ENCEPHLIAN_EEG_v1 schema
CREATE TABLE public.canonical_eeg_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL UNIQUE REFERENCES public.studies(id) ON DELETE CASCADE,
  schema_version text NOT NULL DEFAULT 'ENCEPHLIAN_EEG_v1',
  canonical_json jsonb NOT NULL,
  tensor_path text NOT NULL,
  native_sampling_hz real,
  sfreq_model real,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX canonical_eeg_records_study_id_idx ON public.canonical_eeg_records(study_id);

-- Enable RLS
ALTER TABLE public.canonical_eeg_records ENABLE ROW LEVEL SECURITY;

-- RLS Policies matching studies table logic
-- SELECT: same as studies_scope - sample studies, owner, clinic members, admins
CREATE POLICY "canonical_eeg_scope" ON public.canonical_eeg_records
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM studies s
    WHERE s.id = canonical_eeg_records.study_id
    AND (
      s.sample = true
      OR s.owner = auth.uid()
      OR EXISTS (SELECT 1 FROM my_memberships m WHERE m.clinic_id = s.clinic_id)
      OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'ops'))
    )
  )
);

-- INSERT: owner or admin
CREATE POLICY "canonical_eeg_insert" ON public.canonical_eeg_records
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM studies s
    WHERE s.id = canonical_eeg_records.study_id
    AND (
      s.owner = auth.uid()
      OR has_role(auth.uid(), 'super_admin'::app_role)
      OR has_role(auth.uid(), 'ops'::app_role)
    )
  )
);

-- UPDATE: owner or admin
CREATE POLICY "canonical_eeg_update" ON public.canonical_eeg_records
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM studies s
    WHERE s.id = canonical_eeg_records.study_id
    AND (
      s.owner = auth.uid()
      OR has_role(auth.uid(), 'super_admin'::app_role)
      OR has_role(auth.uid(), 'ops'::app_role)
    )
  )
);

-- DELETE: admin only
CREATE POLICY "canonical_eeg_delete" ON public.canonical_eeg_records
FOR DELETE USING (
  has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'ops'::app_role)
);