-- Restore user_clinic_context to correct state:
-- 1. Include sku column (dropped by previous migration)
-- 2. Filter by clinician/neurologist roles
-- 3. Re-apply security_invoker = true (lost when view was recreated)

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
  AND ur.clinic_id IS NOT NULL;

ALTER VIEW public.user_clinic_context SET (security_invoker = true);

GRANT SELECT ON public.user_clinic_context TO authenticated;
