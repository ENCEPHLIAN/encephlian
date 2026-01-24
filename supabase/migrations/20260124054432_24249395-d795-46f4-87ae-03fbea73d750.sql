-- Remove stale ops-role reference (ops was removed platform-wide)
CREATE OR REPLACE FUNCTION public.admin_get_clinics_for_dropdown()
RETURNS TABLE(id uuid, name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'management'::app_role)
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  RETURN QUERY
  SELECT c.id, c.name
  FROM clinics c
  WHERE c.is_active = true
  ORDER BY c.name;
END;
$$;