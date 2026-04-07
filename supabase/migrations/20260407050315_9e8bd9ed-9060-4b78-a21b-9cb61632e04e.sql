
-- Authenticated users can upload their own study files
CREATE POLICY "eeg_raw_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'eeg-raw');

-- Authenticated users can read files (viewer fallback)
CREATE POLICY "eeg_raw_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'eeg-raw');
