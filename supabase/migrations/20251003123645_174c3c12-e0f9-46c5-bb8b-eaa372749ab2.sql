-- Fix the my_memberships view - make it a regular view, not security definer
DROP VIEW IF EXISTS my_memberships CASCADE;

CREATE VIEW my_memberships AS
  SELECT cm.clinic_id, cm.role AS clinic_role
  FROM clinic_memberships cm
  WHERE cm.user_id = auth.uid();

-- Recreate policies that depended on this view
DROP POLICY IF EXISTS "clinics_scope" ON clinics;
DROP POLICY IF EXISTS "studies_scope" ON studies;
DROP POLICY IF EXISTS "studies_insert" ON studies;
DROP POLICY IF EXISTS "files_scope" ON study_files;
DROP POLICY IF EXISTS "drafts_scope" ON ai_drafts;
DROP POLICY IF EXISTS "reports_scope" ON reports;
DROP POLICY IF EXISTS "events_scope" ON review_events;

-- Recreate clinics scope policy
CREATE POLICY "clinics_scope" ON clinics
FOR SELECT USING (
  EXISTS (SELECT 1 FROM my_memberships m WHERE m.clinic_id = clinics.id)
  OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','ops'))
);

-- Recreate studies policies
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

-- Recreate files scope policy
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

-- Recreate drafts scope policy
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

-- Recreate reports scope policy
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

-- Recreate events scope policy
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