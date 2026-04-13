-- Storage RLS policies for eeg-raw bucket were missing — no authenticated user could upload.
-- Applied directly to live DB on 2026-04-12.

CREATE POLICY "eeg_raw_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'eeg-raw');

CREATE POLICY "eeg_raw_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'eeg-raw');

CREATE POLICY "eeg_raw_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'eeg-raw');
