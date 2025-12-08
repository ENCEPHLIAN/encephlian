-- Update admin_get_all_wallets to only return clinician wallets (exclude management/super_admin)
CREATE OR REPLACE FUNCTION public.admin_get_all_wallets()
 RETURNS TABLE(user_id uuid, email text, full_name text, tokens integer, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'ops') OR has_role(auth.uid(), 'management')) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  -- Only return wallets for clinician users (exclude management and super_admin)
  RETURN QUERY
  SELECT 
    w.user_id,
    p.email,
    p.full_name,
    w.tokens,
    w.updated_at
  FROM wallets w
  JOIN profiles p ON p.id = w.user_id
  WHERE NOT EXISTS (
    SELECT 1 FROM user_roles ur 
    WHERE ur.user_id = w.user_id AND ur.role IN ('super_admin', 'management', 'ops')
  )
  ORDER BY w.updated_at DESC;
END;
$function$;