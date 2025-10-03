-- Drop all existing policies first
DROP POLICY IF EXISTS "profiles_self_admin" ON profiles;
DROP POLICY IF EXISTS "profiles_update_self" ON profiles;
DROP POLICY IF EXISTS "clinics_scope" ON clinics;
DROP POLICY IF EXISTS "clinics_insert_admin" ON clinics;
DROP POLICY IF EXISTS "cm_scope" ON clinic_memberships;
DROP POLICY IF EXISTS "cm_insert_admin" ON clinic_memberships;
DROP POLICY IF EXISTS "studies_scope" ON studies;
DROP POLICY IF EXISTS "studies_insert" ON studies;
DROP POLICY IF EXISTS "studies_update" ON studies;
DROP POLICY IF EXISTS "files_scope" ON study_files;
DROP POLICY IF EXISTS "files_insert" ON study_files;
DROP POLICY IF EXISTS "drafts_scope" ON ai_drafts;
DROP POLICY IF EXISTS "drafts_insert" ON ai_drafts;
DROP POLICY IF EXISTS "reports_scope" ON reports;
DROP POLICY IF EXISTS "reports_write" ON reports;
DROP POLICY IF EXISTS "reports_update" ON reports;
DROP POLICY IF EXISTS "wallet_scope" ON wallets;
DROP POLICY IF EXISTS "wallet_update" ON wallets;
DROP POLICY IF EXISTS "wallet_insert" ON wallets;
DROP POLICY IF EXISTS "payments_scope" ON payments;
DROP POLICY IF EXISTS "payments_insert" ON payments;
DROP POLICY IF EXISTS "events_scope" ON review_events;
DROP POLICY IF EXISTS "Authenticated users can upload to eeg-raw" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read from eeg-raw" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload to eeg-clean" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read from eeg-clean" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload to eeg-reports" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read from eeg-reports" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload to eeg-json" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read from eeg-json" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload to eeg-preview" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read from eeg-preview" ON storage.objects;

-- Now create all RLS policies fresh
CREATE POLICY "profiles_self_admin" ON profiles
FOR SELECT USING (
  id = auth.uid() 
  OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','ops'))
);

CREATE POLICY "profiles_update_self" ON profiles
FOR UPDATE USING (id = auth.uid());

CREATE POLICY "clinics_scope" ON clinics
FOR SELECT USING (
  EXISTS (SELECT 1 FROM my_memberships m WHERE m.clinic_id = clinics.id)
  OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','ops'))
);

CREATE POLICY "clinics_insert_admin" ON clinics
FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','ops'))
);

CREATE POLICY "cm_scope" ON clinic_memberships
FOR SELECT USING (
  clinic_memberships.user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','ops'))
);

CREATE POLICY "cm_insert_admin" ON clinic_memberships
FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','ops'))
);

CREATE POLICY "studies_scope" ON studies
FOR SELECT USING (
  EXISTS (SELECT 1 FROM my_memberships m WHERE m.clinic_id = studies.clinic_id)
  OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','ops'))
);

CREATE POLICY "studies_insert" ON studies
FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM my_memberships m WHERE m.clinic_id = studies.clinic_id)
  AND owner = auth.uid()
);

CREATE POLICY "studies_update" ON studies
FOR UPDATE USING (
  owner = auth.uid()
  OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','ops'))
);

CREATE POLICY "files_scope" ON study_files
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM studies s 
    WHERE s.id = study_files.study_id
    AND (
      EXISTS (SELECT 1 FROM my_memberships m WHERE m.clinic_id = s.clinic_id)
      OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','ops'))
    )
  )
);

CREATE POLICY "files_insert" ON study_files
FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM studies s WHERE s.id = study_files.study_id AND s.owner = auth.uid())
);

CREATE POLICY "drafts_scope" ON ai_drafts
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM studies s 
    WHERE s.id = ai_drafts.study_id
    AND (
      EXISTS (SELECT 1 FROM my_memberships m WHERE m.clinic_id = s.clinic_id)
      OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','ops'))
    )
  )
);

CREATE POLICY "drafts_insert" ON ai_drafts
FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM studies s WHERE s.id = ai_drafts.study_id AND s.owner = auth.uid())
);

CREATE POLICY "reports_scope" ON reports
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM studies s 
    WHERE s.id = reports.study_id
    AND (
      EXISTS (SELECT 1 FROM my_memberships m WHERE m.clinic_id = s.clinic_id)
      OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','ops'))
    )
  )
);

CREATE POLICY "reports_write" ON reports
FOR INSERT WITH CHECK (interpreter = auth.uid());

CREATE POLICY "reports_update" ON reports
FOR UPDATE USING (interpreter = auth.uid());

CREATE POLICY "wallet_scope" ON wallets
FOR SELECT USING (
  user_id = auth.uid() 
  OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','ops'))
);

CREATE POLICY "wallet_update" ON wallets
FOR UPDATE USING (
  user_id = auth.uid() 
  OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','ops'))
);

CREATE POLICY "wallet_insert" ON wallets
FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "payments_scope" ON payments
FOR SELECT USING (
  user_id = auth.uid() 
  OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','ops'))
);

CREATE POLICY "payments_insert" ON payments
FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "events_scope" ON review_events
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM studies s 
    WHERE s.id = review_events.study_id
    AND (
      EXISTS (SELECT 1 FROM my_memberships m WHERE m.clinic_id = s.clinic_id)
      OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','ops'))
    )
  )
  OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','ops'))
);

CREATE POLICY "Authenticated users can upload to eeg-raw"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'eeg-raw' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can read from eeg-raw"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'eeg-raw' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can upload to eeg-clean"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'eeg-clean' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can read from eeg-clean"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'eeg-clean' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can upload to eeg-reports"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'eeg-reports' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can read from eeg-reports"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'eeg-reports' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can upload to eeg-json"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'eeg-json' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can read from eeg-json"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'eeg-json' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can upload to eeg-preview"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'eeg-preview' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can read from eeg-preview"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'eeg-preview' AND auth.uid() IS NOT NULL);