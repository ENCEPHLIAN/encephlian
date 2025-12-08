-- Add is_disabled column to profiles for user suspension
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_disabled boolean DEFAULT false;

-- Create index for faster disabled user checks
CREATE INDEX IF NOT EXISTS idx_profiles_is_disabled ON public.profiles(is_disabled) WHERE is_disabled = true;

-- Update RLS policy to prevent disabled users from accessing data
-- First drop existing policies that might conflict
DROP POLICY IF EXISTS "Disabled users blocked" ON public.profiles;

-- Create policy to block disabled users from reading their own profile
CREATE POLICY "Disabled users blocked from select"
ON public.profiles
FOR SELECT
USING (
  NOT is_disabled OR 
  id = auth.uid() OR
  has_role(auth.uid(), 'super_admin'::app_role) OR 
  has_role(auth.uid(), 'ops'::app_role)
);

-- Function to grant role (prevents super_admin assignment from UI)
CREATE OR REPLACE FUNCTION public.admin_grant_role(
  p_user_id uuid,
  p_role app_role,
  p_clinic_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify caller is admin
  IF NOT has_role(auth.uid(), 'super_admin'::app_role) AND NOT has_role(auth.uid(), 'ops'::app_role) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  -- Prevent assigning super_admin from UI
  IF p_role = 'super_admin'::app_role THEN
    RAISE EXCEPTION 'super_admin role can only be assigned via SQL';
  END IF;

  -- Insert or update role
  INSERT INTO user_roles (user_id, role, clinic_id)
  VALUES (p_user_id, p_role, p_clinic_id)
  ON CONFLICT (user_id, role) DO UPDATE
  SET clinic_id = COALESCE(p_clinic_id, user_roles.clinic_id);

  -- Log audit event
  INSERT INTO audit_logs (user_id, event_type, event_data)
  VALUES (
    auth.uid(),
    'user_role_granted',
    jsonb_build_object(
      'target_user_id', p_user_id,
      'role', p_role,
      'clinic_id', p_clinic_id
    )
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Function to suspend/unsuspend user
CREATE OR REPLACE FUNCTION public.admin_suspend_user(
  p_user_id uuid,
  p_suspend boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify caller is admin
  IF NOT has_role(auth.uid(), 'super_admin'::app_role) AND NOT has_role(auth.uid(), 'ops'::app_role) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  -- Cannot suspend yourself
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot suspend your own account';
  END IF;

  -- Update profile
  UPDATE profiles
  SET is_disabled = p_suspend
  WHERE id = p_user_id;

  -- Log audit event
  INSERT INTO audit_logs (user_id, event_type, event_data)
  VALUES (
    auth.uid(),
    CASE WHEN p_suspend THEN 'user_suspended' ELSE 'user_unsuspended' END,
    jsonb_build_object('target_user_id', p_user_id)
  );

  RETURN jsonb_build_object('success', true, 'is_disabled', p_suspend);
END;
$$;

-- Function to manage clinic membership
CREATE OR REPLACE FUNCTION public.admin_manage_clinic_membership(
  p_user_id uuid,
  p_clinic_id uuid,
  p_action text, -- 'assign' or 'unassign'
  p_role text DEFAULT 'neurologist'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify caller is admin
  IF NOT has_role(auth.uid(), 'super_admin'::app_role) AND NOT has_role(auth.uid(), 'ops'::app_role) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  IF p_action = 'assign' THEN
    INSERT INTO clinic_memberships (user_id, clinic_id, role)
    VALUES (p_user_id, p_clinic_id, p_role)
    ON CONFLICT (clinic_id, user_id) DO UPDATE
    SET role = p_role;
  ELSIF p_action = 'unassign' THEN
    DELETE FROM clinic_memberships
    WHERE user_id = p_user_id AND clinic_id = p_clinic_id;
  ELSE
    RAISE EXCEPTION 'Invalid action: must be assign or unassign';
  END IF;

  -- Log audit event
  INSERT INTO audit_logs (user_id, event_type, event_data)
  VALUES (
    auth.uid(),
    'user_clinic_' || p_action,
    jsonb_build_object(
      'target_user_id', p_user_id,
      'clinic_id', p_clinic_id,
      'role', p_role
    )
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Function to create a new clinic
CREATE OR REPLACE FUNCTION public.admin_create_clinic(
  p_name text,
  p_city text DEFAULT NULL,
  p_admin_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid;
BEGIN
  -- Verify caller is admin
  IF NOT has_role(auth.uid(), 'super_admin'::app_role) AND NOT has_role(auth.uid(), 'ops'::app_role) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  -- Create clinic
  INSERT INTO clinics (name, city)
  VALUES (p_name, p_city)
  RETURNING id INTO v_clinic_id;

  -- Assign admin if provided
  IF p_admin_user_id IS NOT NULL THEN
    INSERT INTO clinic_memberships (user_id, clinic_id, role)
    VALUES (p_admin_user_id, v_clinic_id, 'admin');
    
    -- Grant clinic_admin role
    INSERT INTO user_roles (user_id, role, clinic_id)
    VALUES (p_admin_user_id, 'clinic_admin'::app_role, v_clinic_id)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  -- Log audit event
  INSERT INTO audit_logs (user_id, event_type, event_data)
  VALUES (
    auth.uid(),
    'clinic_created',
    jsonb_build_object(
      'clinic_id', v_clinic_id,
      'name', p_name,
      'city', p_city,
      'admin_user_id', p_admin_user_id
    )
  );

  RETURN jsonb_build_object('success', true, 'clinic_id', v_clinic_id);
END;
$$;

-- Function to delete a test clinic (only if no real studies)
CREATE OR REPLACE FUNCTION public.admin_delete_clinic(
  p_clinic_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_study_count integer;
  v_clinic_name text;
BEGIN
  -- Verify caller is admin
  IF NOT has_role(auth.uid(), 'super_admin'::app_role) AND NOT has_role(auth.uid(), 'ops'::app_role) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  -- Get clinic name
  SELECT name INTO v_clinic_name FROM clinics WHERE id = p_clinic_id;
  IF v_clinic_name IS NULL THEN
    RAISE EXCEPTION 'Clinic not found';
  END IF;

  -- Count non-sample studies
  SELECT COUNT(*) INTO v_study_count
  FROM studies
  WHERE clinic_id = p_clinic_id AND (sample IS NULL OR sample = false);

  IF v_study_count > 0 THEN
    RAISE EXCEPTION 'Cannot delete clinic with % real studies. Only clinics with test/sample studies can be deleted.', v_study_count;
  END IF;

  -- Delete sample studies first
  DELETE FROM studies WHERE clinic_id = p_clinic_id AND sample = true;

  -- Delete clinic memberships
  DELETE FROM clinic_memberships WHERE clinic_id = p_clinic_id;

  -- Delete user_roles with this clinic
  DELETE FROM user_roles WHERE clinic_id = p_clinic_id;

  -- Delete clinic
  DELETE FROM clinics WHERE id = p_clinic_id;

  -- Log audit event
  INSERT INTO audit_logs (user_id, event_type, event_data)
  VALUES (
    auth.uid(),
    'clinic_deleted',
    jsonb_build_object(
      'clinic_id', p_clinic_id,
      'clinic_name', v_clinic_name
    )
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Function to get all users with their roles and clinic info (for admin)
CREATE OR REPLACE FUNCTION public.admin_get_all_users()
RETURNS TABLE (
  id uuid,
  email text,
  full_name text,
  profile_role text,
  is_disabled boolean,
  created_at timestamptz,
  app_roles jsonb,
  clinics jsonb,
  tokens integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'ops'::app_role)) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

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
END;
$$;

-- Function to scan for test/sample files
CREATE OR REPLACE FUNCTION public.admin_scan_test_files()
RETURNS TABLE (
  file_id uuid,
  study_id uuid,
  file_path text,
  file_kind text,
  clinic_name text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'ops'::app_role)) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  RETURN QUERY
  SELECT 
    sf.id as file_id,
    sf.study_id,
    sf.path as file_path,
    sf.kind as file_kind,
    c.name as clinic_name,
    sf.created_at
  FROM study_files sf
  JOIN studies s ON s.id = sf.study_id
  JOIN clinics c ON c.id = s.clinic_id
  WHERE 
    lower(sf.path) LIKE '%sample%' OR
    lower(sf.path) LIKE '%demo%' OR
    lower(sf.path) LIKE '%test%' OR
    lower(sf.path) LIKE '%example%' OR
    s.sample = true
  ORDER BY sf.created_at DESC;
END;
$$;

-- Function to delete test files
CREATE OR REPLACE FUNCTION public.admin_delete_test_files(p_file_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_count integer := 0;
  v_file_paths text[];
BEGIN
  IF NOT (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'ops'::app_role)) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  -- Get file paths for audit log
  SELECT array_agg(path) INTO v_file_paths
  FROM study_files
  WHERE id = ANY(p_file_ids);

  -- Delete files from study_files table
  DELETE FROM study_files WHERE id = ANY(p_file_ids);
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  -- Log audit event
  INSERT INTO audit_logs (user_id, event_type, event_data)
  VALUES (
    auth.uid(),
    'cleanup_deleted_files',
    jsonb_build_object(
      'file_ids', p_file_ids,
      'file_paths', v_file_paths,
      'deleted_count', v_deleted_count
    )
  );

  RETURN jsonb_build_object('success', true, 'deleted_count', v_deleted_count);
END;
$$;

-- Get recent audit logs for admin dashboard
CREATE OR REPLACE FUNCTION public.admin_get_recent_audit_logs(p_limit integer DEFAULT 50)
RETURNS TABLE (
  id uuid,
  actor_id uuid,
  actor_email text,
  event_type text,
  event_data jsonb,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'ops'::app_role)) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

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
END;
$$;