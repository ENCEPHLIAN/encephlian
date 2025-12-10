-- Fix 1: Drop and recreate the SLA check constraint to allow 'pending' for new uploads
ALTER TABLE public.studies DROP CONSTRAINT IF EXISTS studies_sla_check;
ALTER TABLE public.studies ADD CONSTRAINT studies_sla_check CHECK (sla IN ('TAT', 'STAT', 'pending'));

-- Fix 2: Update admin_push_eeg_to_user to use correct authorization (super_admin or management only)
CREATE OR REPLACE FUNCTION public.admin_push_eeg_to_user(p_user_id uuid, p_clinic_id uuid, p_file_path text, p_meta jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_study_id uuid;
  v_caller_id uuid := auth.uid();
BEGIN
  -- Check caller is super_admin or management
  IF NOT (
    has_role(v_caller_id, 'super_admin'::app_role) OR 
    has_role(v_caller_id, 'management'::app_role)
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Only super_admin or management can push EEG files';
  END IF;

  -- Create study with awaiting_sla state and pending SLA
  INSERT INTO public.studies (
    owner,
    clinic_id,
    uploaded_file_path,
    meta,
    state,
    triage_status,
    sla
  ) VALUES (
    p_user_id,
    p_clinic_id,
    p_file_path,
    p_meta,
    'awaiting_sla',
    'pending',
    'pending'
  )
  RETURNING id INTO v_study_id;

  -- Create corresponding study_files record
  INSERT INTO public.study_files (
    study_id,
    kind,
    path
  ) VALUES (
    v_study_id,
    'raw',
    p_file_path
  );

  -- Log audit event
  INSERT INTO public.audit_logs (user_id, event_type, event_data)
  VALUES (
    v_caller_id,
    'admin_push_eeg',
    jsonb_build_object(
      'study_id', v_study_id,
      'target_user_id', p_user_id,
      'clinic_id', p_clinic_id,
      'file_path', p_file_path
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'study_id', v_study_id
  );
END;
$function$;

-- Fix 3: Update admin_get_all_wallets to show ONLY clinician users (exclude super_admin and management)
CREATE OR REPLACE FUNCTION public.admin_get_all_wallets()
RETURNS TABLE(user_id uuid, full_name text, email text, tokens integer, updated_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role)) THEN 
    RAISE EXCEPTION 'Unauthorized: Admin access required'; 
  END IF;
  
  -- Return only clinician wallets (exclude super_admin and management users)
  RETURN QUERY 
  SELECT w.user_id, p.full_name, p.email, w.tokens, w.updated_at 
  FROM wallets w 
  JOIN profiles p ON p.id = w.user_id
  WHERE NOT EXISTS (
    SELECT 1 FROM user_roles ur 
    WHERE ur.user_id = w.user_id 
    AND ur.role IN ('super_admin'::app_role, 'management'::app_role)
  )
  ORDER BY w.updated_at DESC;
END;
$function$;

-- Fix 4: Update admin_get_all_users to properly filter based on caller role
CREATE OR REPLACE FUNCTION public.admin_get_all_users()
RETURNS TABLE(id uuid, email text, full_name text, profile_role text, is_disabled boolean, created_at timestamp with time zone, app_roles jsonb, clinics jsonb, tokens integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role)) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  -- Super_admin sees everyone including management (but not other super_admins for safety)
  IF has_role(auth.uid(), 'super_admin'::app_role) THEN
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
    -- Management cannot see super_admin users (invisibility constraint)
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
      WHERE ur.user_id = p.id AND ur.role = 'super_admin'::app_role
    )
    ORDER BY p.created_at DESC;
  END IF;
END;
$function$;