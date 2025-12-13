-- Clean up RLS policies that reference removed 'ops' role
-- These policies check for 'admin', 'ops' in profiles.role which is the old pattern
-- Update them to use the has_role() function with current roles: super_admin, management

-- Drop and recreate clinics_scope policy
DROP POLICY IF EXISTS "clinics_scope" ON public.clinics;
CREATE POLICY "clinics_scope" ON public.clinics
FOR SELECT
USING (
  (EXISTS (
    SELECT 1 FROM clinic_memberships cm
    WHERE cm.user_id = auth.uid() AND cm.clinic_id = clinics.id
  ))
  OR has_role(auth.uid(), 'super_admin'::app_role)
  OR has_role(auth.uid(), 'management'::app_role)
);

-- Drop and recreate canonical_eeg_scope policy
DROP POLICY IF EXISTS "canonical_eeg_scope" ON public.canonical_eeg_records;
CREATE POLICY "canonical_eeg_scope" ON public.canonical_eeg_records
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM studies s
    WHERE s.id = canonical_eeg_records.study_id
    AND (
      s.sample = true
      OR s.owner = auth.uid()
      OR EXISTS (
        SELECT 1 FROM clinic_memberships cm
        WHERE cm.user_id = auth.uid() AND cm.clinic_id = s.clinic_id
      )
      OR has_role(auth.uid(), 'super_admin'::app_role)
      OR has_role(auth.uid(), 'management'::app_role)
    )
  )
);

-- Drop and recreate drafts_scope policy
DROP POLICY IF EXISTS "drafts_scope" ON public.ai_drafts;
CREATE POLICY "drafts_scope" ON public.ai_drafts
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM studies s
    WHERE s.id = ai_drafts.study_id
    AND (
      EXISTS (
        SELECT 1 FROM clinic_memberships cm
        WHERE cm.user_id = auth.uid() AND cm.clinic_id = s.clinic_id
      )
      OR has_role(auth.uid(), 'super_admin'::app_role)
      OR has_role(auth.uid(), 'management'::app_role)
    )
  )
);

-- Drop and recreate markers_scope policy
DROP POLICY IF EXISTS "markers_scope" ON public.eeg_markers;
CREATE POLICY "markers_scope" ON public.eeg_markers
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM studies s
    WHERE s.id = eeg_markers.study_id
    AND (
      s.sample = true
      OR s.owner = auth.uid()
      OR EXISTS (
        SELECT 1 FROM clinic_memberships cm
        WHERE cm.user_id = auth.uid() AND cm.clinic_id = s.clinic_id
      )
      OR has_role(auth.uid(), 'super_admin'::app_role)
      OR has_role(auth.uid(), 'management'::app_role)
    )
  )
);

-- Drop and recreate events_scope policy
DROP POLICY IF EXISTS "events_scope" ON public.review_events;
CREATE POLICY "events_scope" ON public.review_events
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM studies s
    WHERE s.id = review_events.study_id
    AND (
      EXISTS (
        SELECT 1 FROM clinic_memberships cm
        WHERE cm.user_id = auth.uid() AND cm.clinic_id = s.clinic_id
      )
      OR has_role(auth.uid(), 'super_admin'::app_role)
      OR has_role(auth.uid(), 'management'::app_role)
    )
  )
  OR has_role(auth.uid(), 'super_admin'::app_role)
  OR has_role(auth.uid(), 'management'::app_role)
);

-- Drop and recreate payments_scope policy
DROP POLICY IF EXISTS "payments_scope" ON public.payments;
CREATE POLICY "payments_scope" ON public.payments
FOR SELECT
USING (
  user_id = auth.uid()
  OR has_role(auth.uid(), 'super_admin'::app_role)
  OR has_role(auth.uid(), 'management'::app_role)
);

-- Update cm_admin policies to remove 'ops' reference
DROP POLICY IF EXISTS "cm_admin_view" ON public.clinic_memberships;
CREATE POLICY "cm_admin_view" ON public.clinic_memberships
FOR SELECT
USING (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR has_role(auth.uid(), 'management'::app_role)
);

DROP POLICY IF EXISTS "cm_admin_insert" ON public.clinic_memberships;
CREATE POLICY "cm_admin_insert" ON public.clinic_memberships
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR has_role(auth.uid(), 'management'::app_role)
);

DROP POLICY IF EXISTS "cm_admin_update" ON public.clinic_memberships;
CREATE POLICY "cm_admin_update" ON public.clinic_memberships
FOR UPDATE
USING (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR has_role(auth.uid(), 'management'::app_role)
);

DROP POLICY IF EXISTS "cm_admin_delete" ON public.clinic_memberships;
CREATE POLICY "cm_admin_delete" ON public.clinic_memberships
FOR DELETE
USING (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR has_role(auth.uid(), 'management'::app_role)
);

-- Drop and recreate reports_scope to use proper role checking
DROP POLICY IF EXISTS "reports_scope" ON public.reports;
CREATE POLICY "reports_scope" ON public.reports
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM studies s
    WHERE s.id = reports.study_id
    AND (
      EXISTS (
        SELECT 1 FROM clinic_memberships cm
        WHERE cm.user_id = auth.uid() AND cm.clinic_id = s.clinic_id
      )
      OR has_role(auth.uid(), 'super_admin'::app_role)
      OR has_role(auth.uid(), 'management'::app_role)
    )
  )
);