-- Fix EEG Storage Bucket RLS Policies to enforce user path ownership
-- This prevents cross-user data access for medical EEG files

-- Drop the overly permissive SELECT policies
DROP POLICY IF EXISTS "Authenticated users can read from eeg-clean" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read from eeg-json" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read from eeg-preview" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read from eeg-raw" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read from eeg-reports" ON storage.objects;

-- Drop the overly permissive INSERT policies
DROP POLICY IF EXISTS "Authenticated users can upload to eeg-clean" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload to eeg-json" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload to eeg-preview" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload to eeg-raw" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload to eeg-reports" ON storage.objects;

-- Create secure SELECT policies with path ownership enforcement
CREATE POLICY "Users can read their own eeg-clean files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'eeg-clean' AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'management'::app_role)
  )
);

CREATE POLICY "Users can read their own eeg-json files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'eeg-json' AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'management'::app_role)
  )
);

CREATE POLICY "Users can read their own eeg-preview files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'eeg-preview' AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'management'::app_role)
  )
);

CREATE POLICY "Users can read their own eeg-raw files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'eeg-raw' AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'management'::app_role)
  )
);

CREATE POLICY "Users can read their own eeg-reports files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'eeg-reports' AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'management'::app_role)
  )
);

-- Create secure INSERT policies with path ownership enforcement
CREATE POLICY "Users can upload to their own eeg-clean folder"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'eeg-clean' AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'management'::app_role)
  )
);

CREATE POLICY "Users can upload to their own eeg-json folder"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'eeg-json' AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'management'::app_role)
  )
);

CREATE POLICY "Users can upload to their own eeg-preview folder"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'eeg-preview' AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'management'::app_role)
  )
);

CREATE POLICY "Users can upload to their own eeg-raw folder"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'eeg-raw' AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'management'::app_role)
  )
);

CREATE POLICY "Users can upload to their own eeg-reports folder"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'eeg-reports' AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'management'::app_role)
  )
);