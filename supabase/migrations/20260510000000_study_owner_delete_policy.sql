-- Allow study owners to delete their own studies.
-- Previously only admins could delete (Admins can delete studies policy),
-- which caused silent failures for regular users clicking Delete Study.
CREATE POLICY "Owners can delete their own studies"
  ON public.studies
  FOR DELETE
  TO authenticated
  USING (owner = auth.uid());
