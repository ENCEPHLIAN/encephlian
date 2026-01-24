-- Update user_clinic_context view to include SKU field
DROP VIEW IF EXISTS public.user_clinic_context;

CREATE VIEW public.user_clinic_context AS
SELECT 
    ur.user_id,
    ur.role,
    ur.clinic_id,
    c.name AS clinic_name,
    c.brand_name,
    c.logo_url,
    c.primary_color,
    c.secondary_color,
    c.sku
FROM user_roles ur
JOIN clinics c ON c.id = ur.clinic_id
WHERE ur.clinic_id IS NOT NULL;