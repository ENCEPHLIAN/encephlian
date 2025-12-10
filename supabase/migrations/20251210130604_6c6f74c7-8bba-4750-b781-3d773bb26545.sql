-- Fix studies_state_check constraint to include 'awaiting_sla'
ALTER TABLE public.studies DROP CONSTRAINT IF EXISTS studies_state_check;
ALTER TABLE public.studies ADD CONSTRAINT studies_state_check 
  CHECK (state IN ('uploaded', 'awaiting_sla', 'processing', 'completed', 'signed', 'cancelled', 'failed'));

-- Ensure study_files RLS allows management to insert
DROP POLICY IF EXISTS "files_insert" ON public.study_files;
CREATE POLICY "files_insert" ON public.study_files
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM studies s
    WHERE s.id = study_files.study_id 
    AND (s.owner = auth.uid() OR has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'management'))
  )
);

-- Ensure study_files RLS allows management to select
DROP POLICY IF EXISTS "files_scope" ON public.study_files;
CREATE POLICY "files_scope" ON public.study_files
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM studies s
    WHERE s.id = study_files.study_id 
    AND (
      s.sample = true 
      OR s.owner = auth.uid() 
      OR EXISTS (SELECT 1 FROM my_memberships m WHERE m.clinic_id = s.clinic_id)
      OR has_role(auth.uid(), 'super_admin')
      OR has_role(auth.uid(), 'management')
    )
  )
);

-- Allow management to update study_files
DROP POLICY IF EXISTS "files_update_admin" ON public.study_files;
CREATE POLICY "files_update_admin" ON public.study_files
FOR UPDATE USING (
  has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'management')
);

-- Allow management to delete study_files
DROP POLICY IF EXISTS "files_delete_admin" ON public.study_files;
CREATE POLICY "files_delete_admin" ON public.study_files
FOR DELETE USING (
  has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'management')
);