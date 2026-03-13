
-- ============================================================
-- FIX: Replace all my_memberships view references in RLS
-- with direct clinic_memberships table joins to prevent
-- infinite recursion that freezes the platform.
-- ============================================================

-- 1. studies_insert: replace my_memberships with clinic_memberships
DROP POLICY IF EXISTS "studies_insert" ON public.studies;
CREATE POLICY "studies_insert" ON public.studies
  FOR INSERT TO authenticated
  WITH CHECK (
    (auth.uid() IS NOT NULL)
    AND (owner = auth.uid())
    AND (EXISTS (
      SELECT 1 FROM public.clinic_memberships cm
      WHERE cm.user_id = auth.uid() AND cm.clinic_id = studies.clinic_id
    ))
  );

-- 2. study_files.files_scope: replace my_memberships with clinic_memberships
DROP POLICY IF EXISTS "files_scope" ON public.study_files;
CREATE POLICY "files_scope" ON public.study_files
  FOR SELECT TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.studies s
      WHERE s.id = study_files.study_id
        AND (
          s.sample = true
          OR s.owner = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.clinic_memberships cm
            WHERE cm.user_id = auth.uid() AND cm.clinic_id = s.clinic_id
          )
          OR has_role(auth.uid(), 'super_admin'::app_role)
          OR has_role(auth.uid(), 'management'::app_role)
        )
    )
  );

-- 3. eeg_markers.markers_insert: replace my_memberships with clinic_memberships
DROP POLICY IF EXISTS "markers_insert" ON public.eeg_markers;
CREATE POLICY "markers_insert" ON public.eeg_markers
  FOR INSERT TO public
  WITH CHECK (
    (user_id = auth.uid())
    AND (EXISTS (
      SELECT 1 FROM public.studies s
      WHERE s.id = eeg_markers.study_id
        AND (
          s.owner = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.clinic_memberships cm
            WHERE cm.user_id = auth.uid() AND cm.clinic_id = s.clinic_id
          )
        )
    ))
  );

-- 4. report_attachments: replace my_memberships with clinic_memberships + add admin access
DROP POLICY IF EXISTS "report_attachments_own_clinic" ON public.report_attachments;
CREATE POLICY "report_attachments_own_clinic" ON public.report_attachments
  FOR ALL TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.studies s
      WHERE s.id = report_attachments.study_id
        AND (
          s.owner = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.clinic_memberships cm
            WHERE cm.user_id = auth.uid() AND cm.clinic_id = s.clinic_id
          )
          OR has_role(auth.uid(), 'super_admin'::app_role)
          OR has_role(auth.uid(), 'management'::app_role)
        )
    )
  )
