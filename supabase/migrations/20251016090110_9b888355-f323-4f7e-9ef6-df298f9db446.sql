-- Grant super_admin role to your account (with check to avoid duplicates)
INSERT INTO user_roles (user_id, role)
SELECT 'f1b8a438-7229-4873-b1dc-d1803be5db62', 'super_admin'
WHERE NOT EXISTS (
  SELECT 1 FROM user_roles 
  WHERE user_id = 'f1b8a438-7229-4873-b1dc-d1803be5db62' 
  AND role = 'super_admin'
);

-- Add performance indexes
CREATE INDEX IF NOT EXISTS idx_studies_clinic_id ON studies(clinic_id);
CREATE INDEX IF NOT EXISTS idx_studies_state ON studies(state);
CREATE INDEX IF NOT EXISTS idx_studies_created_at ON studies(created_at);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);

-- Create clinic-logos storage bucket
INSERT INTO storage.buckets (id, name, public)
SELECT 'clinic-logos', 'clinic-logos', true
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'clinic-logos');

-- RLS for clinic-logos: Only admins can upload
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'objects' 
    AND policyname = 'admin_upload_clinic_logos'
  ) THEN
    CREATE POLICY "admin_upload_clinic_logos" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'clinic-logos' AND
      (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'ops'))
    );
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'objects' 
    AND policyname = 'public_view_clinic_logos'
  ) THEN
    CREATE POLICY "public_view_clinic_logos" ON storage.objects
    FOR SELECT TO public
    USING (bucket_id = 'clinic-logos');
  END IF;
END $$;

-- Admin RLS policies
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'clinics' 
    AND policyname = 'admin_full_access_clinics'
  ) THEN
    CREATE POLICY "admin_full_access_clinics" ON clinics
    FOR ALL TO authenticated
    USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'ops'))
    WITH CHECK (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'ops'));
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'studies' 
    AND policyname = 'admin_full_access_studies'
  ) THEN
    CREATE POLICY "admin_full_access_studies" ON studies
    FOR ALL TO authenticated
    USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'ops'))
    WITH CHECK (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'ops'));
  END IF;
END $$;

-- Create sample AI drafts for testing report signing flow
INSERT INTO ai_drafts (study_id, draft, model, version)
SELECT 
  s.id,
  jsonb_build_object(
    'background_activity', 'Normal posterior dominant rhythm at 9-10 Hz with good modulation and reactivity to eye opening.',
    'sleep_architecture', 'Drowsiness and light sleep stages observed with normal vertex waves and sleep spindles.',
    'abnormalities', 'No focal slowing or epileptiform discharges detected.',
    'impression', 'Normal EEG study with no epileptiform activity.',
    'clinical_correlates', 'Findings do not support a diagnosis of epilepsy. Clinical correlation recommended.'
  ),
  'gemini-2.5-flash',
  '1.0'
FROM studies s
WHERE s.state = 'uploaded'
AND NOT EXISTS (SELECT 1 FROM ai_drafts ad WHERE ad.study_id = s.id)
LIMIT 10;