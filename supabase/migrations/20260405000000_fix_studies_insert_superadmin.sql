-- ============================================================
-- FIX: Allow super_admin and management to insert studies
-- without requiring a clinic_memberships entry.
-- Previously, studies_insert required clinic_memberships
-- for ALL users — but admins manage studies across clinics
-- and should not need to be clinic members.
-- ============================================================

DROP POLICY IF EXISTS "studies_insert" ON public.studies;

CREATE POLICY "studies_insert" ON public.studies
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND owner = auth.uid()
    AND (
      -- Admins can insert into any clinic they manage
      has_role(auth.uid(), 'super_admin'::app_role)
      OR has_role(auth.uid(), 'management'::app_role)
      -- Clinicians must be members of the target clinic
      OR EXISTS (
        SELECT 1 FROM public.clinic_memberships cm
        WHERE cm.user_id = auth.uid() AND cm.clinic_id = studies.clinic_id
      )
    )
  );

-- Also allow super_admin/management to update any study
DROP POLICY IF EXISTS "studies_update" ON public.studies;

CREATE POLICY "studies_update" ON public.studies
  FOR UPDATE TO authenticated
  USING (
    owner = auth.uid()
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'management'::app_role)
  );
