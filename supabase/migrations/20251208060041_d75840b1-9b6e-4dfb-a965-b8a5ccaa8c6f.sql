-- Create admin_get_all_wallets function that hides super_admin from management users
CREATE OR REPLACE FUNCTION public.admin_get_all_wallets()
RETURNS TABLE(
  user_id uuid,
  email text,
  full_name text,
  tokens integer,
  updated_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'ops') OR has_role(auth.uid(), 'management')) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  -- Super_admin sees everyone
  IF has_role(auth.uid(), 'super_admin') THEN
    RETURN QUERY
    SELECT 
      w.user_id,
      p.email,
      p.full_name,
      w.tokens,
      w.updated_at
    FROM wallets w
    JOIN profiles p ON p.id = w.user_id
    ORDER BY w.updated_at DESC;
  ELSE
    -- Management/ops cannot see super_admin users
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
      WHERE ur.user_id = w.user_id AND ur.role = 'super_admin'
    )
    ORDER BY w.updated_at DESC;
  END IF;
END;
$function$;

-- Update admin_get_all_users to hide super_admin from management users
CREATE OR REPLACE FUNCTION public.admin_get_all_users()
RETURNS TABLE(
  id uuid,
  email text,
  full_name text,
  profile_role text,
  is_disabled boolean,
  created_at timestamp with time zone,
  app_roles jsonb,
  clinics jsonb,
  tokens integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'ops') OR has_role(auth.uid(), 'management')) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  -- Super_admin sees everyone
  IF has_role(auth.uid(), 'super_admin') THEN
    RETURN QUERY
    SELECT 
      p.id,
      p.email,
      p.full_name,
      p.role as profile_role,
      COALESCE(p.is_disabled, false) as is_disabled,
      p.created_at,
      COALESCE(
        (SELECT jsonb_agg(jsonb_build_object('role', ur.role, 'clinic_id', ur.clinic_id))
         FROM user_roles ur WHERE ur.user_id = p.id),
        '[]'::jsonb
      ) as app_roles,
      COALESCE(
        (SELECT jsonb_agg(jsonb_build_object('clinic_id', cm.clinic_id, 'role', cm.role, 'clinic_name', c.name))
         FROM clinic_memberships cm
         JOIN clinics c ON c.id = cm.clinic_id
         WHERE cm.user_id = p.id),
        '[]'::jsonb
      ) as clinics,
      COALESCE(w.tokens, 0) as tokens
    FROM profiles p
    LEFT JOIN wallets w ON w.user_id = p.id
    ORDER BY p.created_at DESC;
  ELSE
    -- Management/ops cannot see super_admin users
    RETURN QUERY
    SELECT 
      p.id,
      p.email,
      p.full_name,
      p.role as profile_role,
      COALESCE(p.is_disabled, false) as is_disabled,
      p.created_at,
      COALESCE(
        (SELECT jsonb_agg(jsonb_build_object('role', ur.role, 'clinic_id', ur.clinic_id))
         FROM user_roles ur WHERE ur.user_id = p.id),
        '[]'::jsonb
      ) as app_roles,
      COALESCE(
        (SELECT jsonb_agg(jsonb_build_object('clinic_id', cm.clinic_id, 'role', cm.role, 'clinic_name', c.name))
         FROM clinic_memberships cm
         JOIN clinics c ON c.id = cm.clinic_id
         WHERE cm.user_id = p.id),
        '[]'::jsonb
      ) as clinics,
      COALESCE(w.tokens, 0) as tokens
    FROM profiles p
    LEFT JOIN wallets w ON w.user_id = p.id
    WHERE NOT EXISTS (
      SELECT 1 FROM user_roles ur 
      WHERE ur.user_id = p.id AND ur.role = 'super_admin'
    )
    ORDER BY p.created_at DESC;
  END IF;
END;
$function$;

-- Update admin_get_recent_audit_logs to hide super_admin actions from management users
CREATE OR REPLACE FUNCTION public.admin_get_recent_audit_logs(p_limit integer DEFAULT 50)
RETURNS TABLE(
  id uuid,
  actor_id uuid,
  actor_email text,
  event_type text,
  event_data jsonb,
  created_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'ops') OR has_role(auth.uid(), 'management')) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  -- Super_admin sees all logs
  IF has_role(auth.uid(), 'super_admin') THEN
    RETURN QUERY
    SELECT 
      al.id,
      al.user_id as actor_id,
      p.email as actor_email,
      al.event_type,
      al.event_data,
      al.created_at
    FROM audit_logs al
    LEFT JOIN profiles p ON p.id = al.user_id
    ORDER BY al.created_at DESC
    LIMIT p_limit;
  ELSE
    -- Management/ops cannot see super_admin actions or actions targeting super_admin
    RETURN QUERY
    SELECT 
      al.id,
      al.user_id as actor_id,
      p.email as actor_email,
      al.event_type,
      al.event_data,
      al.created_at
    FROM audit_logs al
    LEFT JOIN profiles p ON p.id = al.user_id
    WHERE NOT EXISTS (
      SELECT 1 FROM user_roles ur 
      WHERE ur.user_id = al.user_id AND ur.role = 'super_admin'
    )
    AND NOT (
      al.event_data->>'target_user_id' IS NOT NULL 
      AND EXISTS (
        SELECT 1 FROM user_roles ur 
        WHERE ur.user_id = (al.event_data->>'target_user_id')::uuid AND ur.role = 'super_admin'
      )
    )
    ORDER BY al.created_at DESC
    LIMIT p_limit;
  END IF;
END;
$function$;