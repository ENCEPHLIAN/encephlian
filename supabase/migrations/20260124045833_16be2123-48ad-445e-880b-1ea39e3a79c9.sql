-- Update admin_get_all_clinics to include SKU field
DROP FUNCTION IF EXISTS public.admin_get_all_clinics();

CREATE OR REPLACE FUNCTION public.admin_get_all_clinics()
RETURNS TABLE(
  id uuid,
  name text,
  city text,
  is_active boolean,
  created_at timestamptz,
  study_count bigint,
  member_count bigint,
  sku text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'ops'::app_role) OR has_role(auth.uid(), 'management'::app_role)) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  RETURN QUERY
  SELECT 
    c.id,
    c.name,
    c.city,
    c.is_active,
    c.created_at,
    (SELECT COUNT(*) FROM studies s WHERE s.clinic_id = c.id) as study_count,
    (SELECT COUNT(*) FROM clinic_memberships cm WHERE cm.clinic_id = c.id) as member_count,
    c.sku
  FROM clinics c
  ORDER BY c.created_at DESC;
END;
$$;