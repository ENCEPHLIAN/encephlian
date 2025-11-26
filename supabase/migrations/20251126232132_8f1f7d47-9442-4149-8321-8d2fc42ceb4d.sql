-- Create storage buckets for the platform
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('eeg-uploads', 'eeg-uploads', false, 524288000, ARRAY['application/octet-stream', 'application/edf', 'application/x-edf']::text[]),
  ('notes', 'notes', false, 10485760, ARRAY['text/plain', 'text/markdown', 'application/json']::text[]),
  ('templates', 'templates', true, 10485760, ARRAY['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']::text[])
ON CONFLICT (id) DO NOTHING;

-- RLS policies for eeg-uploads bucket
CREATE POLICY "Users can upload their own EEG files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'eeg-uploads' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can view their own EEG files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'eeg-uploads' AND
  (auth.uid()::text = (storage.foldername(name))[1] OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'ops'::app_role))
);

CREATE POLICY "Users can delete their own EEG files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'eeg-uploads' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- RLS policies for notes bucket
CREATE POLICY "Users can upload their own notes"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'notes' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can view their own notes"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'notes' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own notes"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'notes' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update their own notes"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'notes' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- RLS policies for templates bucket (public read)
CREATE POLICY "Anyone can view templates"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'templates');

CREATE POLICY "Admins can upload templates"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'templates' AND
  (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'ops'::app_role))
);

CREATE POLICY "Admins can delete templates"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'templates' AND
  (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'ops'::app_role))
);

-- Add columns to studies table for AI drafts
ALTER TABLE studies ADD COLUMN IF NOT EXISTS ai_draft_json jsonb;
ALTER TABLE studies ADD COLUMN IF NOT EXISTS ai_draft_text text;

-- Create index for faster searches
CREATE INDEX IF NOT EXISTS idx_studies_state ON studies(state);
CREATE INDEX IF NOT EXISTS idx_studies_owner ON studies(owner);
CREATE INDEX IF NOT EXISTS idx_studies_created_at ON studies(created_at DESC);