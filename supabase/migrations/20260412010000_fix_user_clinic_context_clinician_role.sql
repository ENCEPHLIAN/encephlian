-- Fix user_clinic_context view to include 'clinician' role.
-- Originally the view only matched 'neurologist' (old role name).
-- admin_onboard_value_unit creates users with role 'clinician' (added Dec 2025).
-- Result: all pilot users created via the onboarding function had clinicId = null,
-- causing uploads to fail with "No clinic assigned" error.

-- DROP and recreate because CREATE OR REPLACE VIEW cannot change column structure
DROP VIEW IF EXISTS public.user_clinic_context;

CREATE VIEW public.user_clinic_context AS
SELECT
  ur.user_id,
  ur.role,
  c.id as clinic_id,
  c.name as clinic_name,
  c.brand_name,
  c.logo_url,
  c.primary_color,
  c.secondary_color
FROM public.user_roles ur
JOIN public.clinics c ON c.id = ur.clinic_id
WHERE ur.role IN ('neurologist', 'clinician');

-- Re-grant access (CREATE OR REPLACE may drop existing grants)
GRANT SELECT ON public.user_clinic_context TO authenticated;
