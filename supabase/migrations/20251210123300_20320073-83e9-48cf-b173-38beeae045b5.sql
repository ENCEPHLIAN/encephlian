
-- Fix clinics RLS to include management role
DROP POLICY IF EXISTS admin_full_access_clinics ON public.clinics;

CREATE POLICY admin_full_access_clinics ON public.clinics
FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'super_admin'::app_role) OR 
  has_role(auth.uid(), 'ops'::app_role) OR 
  has_role(auth.uid(), 'management'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'super_admin'::app_role) OR 
  has_role(auth.uid(), 'ops'::app_role) OR 
  has_role(auth.uid(), 'management'::app_role)
);
