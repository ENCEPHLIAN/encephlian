-- Create or replace the update_updated_at function if it doesn't exist
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create EEG markers table for annotating findings
CREATE TABLE public.eeg_markers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  study_id UUID NOT NULL REFERENCES public.studies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  timestamp_sec NUMERIC(10,3) NOT NULL,
  marker_type TEXT NOT NULL CHECK (marker_type IN ('spike', 'seizure', 'artifact', 'sleep_stage', 'event', 'annotation')),
  label TEXT,
  channel TEXT,
  duration_sec NUMERIC(10,3),
  severity TEXT CHECK (severity IN ('mild', 'moderate', 'severe') OR severity IS NULL),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.eeg_markers ENABLE ROW LEVEL SECURITY;

-- Users can view markers for studies they have access to
CREATE POLICY "markers_scope" ON public.eeg_markers
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM studies s
    WHERE s.id = eeg_markers.study_id
    AND (
      EXISTS (SELECT 1 FROM my_memberships m WHERE m.clinic_id = s.clinic_id)
      OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'ops'))
    )
  )
);

-- Users can insert markers for studies they own
CREATE POLICY "markers_insert" ON public.eeg_markers
FOR INSERT WITH CHECK (
  user_id = auth.uid() AND
  EXISTS (
    SELECT 1 FROM studies s
    WHERE s.id = eeg_markers.study_id
    AND (
      s.owner = auth.uid()
      OR EXISTS (SELECT 1 FROM my_memberships m WHERE m.clinic_id = s.clinic_id)
    )
  )
);

-- Users can update their own markers
CREATE POLICY "markers_update" ON public.eeg_markers
FOR UPDATE USING (user_id = auth.uid());

-- Users can delete their own markers
CREATE POLICY "markers_delete" ON public.eeg_markers
FOR DELETE USING (user_id = auth.uid());

-- Create index for performance
CREATE INDEX idx_eeg_markers_study_id ON public.eeg_markers(study_id);
CREATE INDEX idx_eeg_markers_timestamp ON public.eeg_markers(study_id, timestamp_sec);

-- Add trigger for updated_at
CREATE TRIGGER update_eeg_markers_updated_at
BEFORE UPDATE ON public.eeg_markers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();