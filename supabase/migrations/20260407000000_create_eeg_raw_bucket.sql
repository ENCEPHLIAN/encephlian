-- Create eeg-raw storage bucket for direct browser uploads
-- Files identified by study UUID — no guessable paths
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'eeg-raw',
  'eeg-raw',
  false,
  2147483648, -- 2 GB limit
  ARRAY['application/octet-stream', 'application/x-edf', 'application/x-bdf']
)
ON CONFLICT (id) DO NOTHING;

-- Authenticated users can upload their own study files
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'eeg_raw_upload' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "eeg_raw_upload" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'eeg-raw');
  END IF;
END $$;

-- Authenticated users can read files (viewer fallback)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'eeg_raw_read' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "eeg_raw_read" ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id = 'eeg-raw');
  END IF;
END $$;
