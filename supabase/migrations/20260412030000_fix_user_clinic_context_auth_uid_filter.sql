-- Fix user_clinic_context view:
-- Using security_invoker caused the clinics JOIN to fail for users not in clinic_memberships
-- (clinics RLS requires membership to SELECT). Instead, bypass RLS (security definer default)
-- and filter by auth.uid() directly — this is secure and membership-independent.

DROP VIEW IF EXISTS public.user_clinic_context;

CREATE VIEW public.user_clinic_context AS
SELECT
  ur.user_id,
  ur.role,
  c.id AS clinic_id,
  c.name AS clinic_name,
  c.brand_name,
  c.logo_url,
  c.primary_color,
  c.secondary_color,
  c.sku
FROM public.user_roles ur
JOIN public.clinics c ON c.id = ur.clinic_id
WHERE ur.role IN ('neurologist', 'clinician')
  AND ur.clinic_id IS NOT NULL
  AND ur.user_id = auth.uid();

GRANT SELECT ON public.user_clinic_context TO authenticated;
