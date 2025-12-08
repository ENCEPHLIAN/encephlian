-- Add 'management' to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'management';

-- Update admin_delete_clinic to allow deleting clinics with sample studies (delete those first)
CREATE OR REPLACE FUNCTION public.admin_delete_clinic(p_clinic_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_clinic_name text;
BEGIN
  -- Verify caller is admin
  IF NOT has_role(auth.uid(), 'super_admin'::app_role) AND NOT has_role(auth.uid(), 'ops'::app_role) AND NOT has_role(auth.uid(), 'management'::app_role) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  -- Get clinic name
  SELECT name INTO v_clinic_name FROM clinics WHERE id = p_clinic_id;
  IF v_clinic_name IS NULL THEN
    RAISE EXCEPTION 'Clinic not found';
  END IF;

  -- Delete all study files first
  DELETE FROM study_files WHERE study_id IN (SELECT id FROM studies WHERE clinic_id = p_clinic_id);
  
  -- Delete all studies
  DELETE FROM studies WHERE clinic_id = p_clinic_id;

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

-- Update has_role to include management
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Update admin_grant_role to prevent management from creating management/super_admin users
CREATE OR REPLACE FUNCTION public.admin_grant_role(p_user_id uuid, p_role app_role, p_clinic_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Verify caller is admin
  IF NOT has_role(auth.uid(), 'super_admin'::app_role) 
     AND NOT has_role(auth.uid(), 'ops'::app_role) 
     AND NOT has_role(auth.uid(), 'management'::app_role) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  -- Prevent assigning super_admin from UI
  IF p_role = 'super_admin'::app_role THEN
    RAISE EXCEPTION 'super_admin role can only be assigned via SQL';
  END IF;

  -- Management users cannot create other management or ops users
  IF has_role(auth.uid(), 'management'::app_role) 
     AND NOT has_role(auth.uid(), 'super_admin'::app_role)
     AND (p_role = 'management'::app_role OR p_role = 'ops'::app_role) THEN
    RAISE EXCEPTION 'Management users cannot assign management or ops roles';
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

-- Update other admin functions to recognize management role
CREATE OR REPLACE FUNCTION public.admin_suspend_user(p_user_id uuid, p_suspend boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin'::app_role) 
     AND NOT has_role(auth.uid(), 'ops'::app_role) 
     AND NOT has_role(auth.uid(), 'management'::app_role) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot suspend your own account';
  END IF;

  UPDATE profiles
  SET is_disabled = p_suspend
  WHERE id = p_user_id;

  INSERT INTO audit_logs (user_id, event_type, event_data)
  VALUES (
    auth.uid(),
    CASE WHEN p_suspend THEN 'user_suspended' ELSE 'user_unsuspended' END,
    jsonb_build_object('target_user_id', p_user_id)
  );

  RETURN jsonb_build_object('success', true, 'is_disabled', p_suspend);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_adjust_tokens(p_user_id uuid, p_amount integer, p_operation text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_current_tokens INTEGER;
  v_new_balance INTEGER;
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin'::app_role) 
     AND NOT has_role(auth.uid(), 'ops'::app_role)
     AND NOT has_role(auth.uid(), 'management'::app_role) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  SELECT tokens INTO v_current_tokens
  FROM wallets
  WHERE user_id = p_user_id;

  IF v_current_tokens IS NULL THEN
    INSERT INTO wallets (user_id, tokens)
    VALUES (p_user_id, 0)
    RETURNING tokens INTO v_current_tokens;
  END IF;

  IF p_operation = 'add' THEN
    v_new_balance := v_current_tokens + p_amount;
  ELSIF p_operation = 'remove' THEN
    v_new_balance := GREATEST(0, v_current_tokens - p_amount);
  ELSIF p_operation = 'set' THEN
    v_new_balance := GREATEST(0, p_amount);
  ELSE
    RAISE EXCEPTION 'Invalid operation: must be add, remove, or set';
  END IF;

  UPDATE wallets
  SET tokens = v_new_balance,
      updated_at = NOW()
  WHERE user_id = p_user_id;

  INSERT INTO audit_logs (user_id, event_type, event_data)
  VALUES (
    auth.uid(),
    'admin_token_adjustment',
    jsonb_build_object(
      'target_user_id', p_user_id,
      'operation', p_operation,
      'amount', p_amount,
      'old_balance', v_current_tokens,
      'new_balance', v_new_balance
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'old_balance', v_current_tokens,
    'new_balance', v_new_balance
  );
END;
$$;

-- Update admin_delete_user
CREATE OR REPLACE FUNCTION public.admin_delete_user(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_email TEXT;
  v_is_super_admin BOOLEAN;
  v_is_management BOOLEAN;
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin'::app_role) 
     AND NOT has_role(auth.uid(), 'ops'::app_role)
     AND NOT has_role(auth.uid(), 'management'::app_role) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot delete your own account';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = p_user_id AND role = 'super_admin'::app_role
  ) INTO v_is_super_admin;

  IF v_is_super_admin THEN
    RAISE EXCEPTION 'Cannot delete super_admin users';
  END IF;

  -- Management users cannot delete other management users
  SELECT EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = p_user_id AND role = 'management'::app_role
  ) INTO v_is_management;
  
  IF v_is_management AND has_role(auth.uid(), 'management'::app_role) AND NOT has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Management users cannot delete other management users';
  END IF;

  SELECT email INTO v_user_email FROM profiles WHERE id = p_user_id;

  IF v_user_email IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- Delete all related data
  DELETE FROM notes WHERE user_id = p_user_id;
  DELETE FROM wallets WHERE user_id = p_user_id;
  DELETE FROM earnings_wallets WHERE user_id = p_user_id;
  DELETE FROM bank_accounts WHERE user_id = p_user_id;
  DELETE FROM withdrawal_requests WHERE user_id = p_user_id;
  DELETE FROM tds_records WHERE user_id = p_user_id;
  DELETE FROM clinic_memberships WHERE user_id = p_user_id;
  DELETE FROM user_roles WHERE user_id = p_user_id;
  DELETE FROM eeg_markers WHERE user_id = p_user_id;
  DELETE FROM support_tickets WHERE user_id = p_user_id;
  DELETE FROM tfa_secrets WHERE user_id = p_user_id;
  DELETE FROM profiles WHERE id = p_user_id;

  INSERT INTO audit_logs (user_id, event_type, event_data)
  VALUES (
    auth.uid(),
    'user_deleted',
    jsonb_build_object(
      'deleted_user_id', p_user_id,
      'deleted_user_email', v_user_email
    )
  );

  RETURN jsonb_build_object('success', true, 'deleted_email', v_user_email);
END;
$$;

-- Update all other admin functions to include management role
CREATE OR REPLACE FUNCTION public.admin_update_profile(p_user_id uuid, p_updates jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin'::app_role) 
     AND NOT has_role(auth.uid(), 'ops'::app_role)
     AND NOT has_role(auth.uid(), 'management'::app_role) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  UPDATE profiles
  SET
    full_name = COALESCE(p_updates->>'full_name', full_name),
    phone_number = COALESCE(p_updates->>'phone_number', phone_number),
    department = COALESCE(p_updates->>'department', department),
    hospital_affiliation = COALESCE(p_updates->>'hospital_affiliation', hospital_affiliation),
    credentials = COALESCE(p_updates->>'credentials', credentials),
    specialization = COALESCE(p_updates->>'specialization', specialization),
    medical_license_number = COALESCE(p_updates->>'medical_license_number', medical_license_number),
    company_name = COALESCE(p_updates->>'company_name', company_name)
  WHERE id = p_user_id;

  INSERT INTO audit_logs (user_id, event_type, event_data)
  VALUES (
    auth.uid(),
    'admin_profile_update',
    jsonb_build_object(
      'target_user_id', p_user_id,
      'updates', p_updates
    )
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_revoke_role(p_user_id uuid, p_role app_role)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin'::app_role) 
     AND NOT has_role(auth.uid(), 'ops'::app_role)
     AND NOT has_role(auth.uid(), 'management'::app_role) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  IF p_user_id = auth.uid() AND p_role = 'super_admin'::app_role THEN
    RAISE EXCEPTION 'Cannot revoke your own super_admin role';
  END IF;

  -- Management cannot revoke management/ops/super_admin roles
  IF has_role(auth.uid(), 'management'::app_role) 
     AND NOT has_role(auth.uid(), 'super_admin'::app_role)
     AND (p_role = 'management'::app_role OR p_role = 'ops'::app_role OR p_role = 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Management users cannot revoke management, ops, or super_admin roles';
  END IF;

  DELETE FROM user_roles
  WHERE user_id = p_user_id AND role = p_role;

  INSERT INTO audit_logs (user_id, event_type, event_data)
  VALUES (
    auth.uid(),
    'admin_role_revoked',
    jsonb_build_object(
      'target_user_id', p_user_id,
      'role', p_role
    )
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_manage_clinic_membership(p_user_id uuid, p_clinic_id uuid, p_action text, p_role text DEFAULT 'neurologist')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin'::app_role) 
     AND NOT has_role(auth.uid(), 'ops'::app_role)
     AND NOT has_role(auth.uid(), 'management'::app_role) THEN
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

CREATE OR REPLACE FUNCTION public.admin_create_clinic(p_name text, p_city text DEFAULT NULL, p_admin_user_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_clinic_id uuid;
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin'::app_role) 
     AND NOT has_role(auth.uid(), 'ops'::app_role)
     AND NOT has_role(auth.uid(), 'management'::app_role) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  INSERT INTO clinics (name, city)
  VALUES (p_name, p_city)
  RETURNING id INTO v_clinic_id;

  IF p_admin_user_id IS NOT NULL THEN
    INSERT INTO clinic_memberships (user_id, clinic_id, role)
    VALUES (p_admin_user_id, v_clinic_id, 'admin');
  END IF;

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

CREATE OR REPLACE FUNCTION public.admin_update_clinic(p_clinic_id uuid, p_updates jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin'::app_role) 
     AND NOT has_role(auth.uid(), 'ops'::app_role)
     AND NOT has_role(auth.uid(), 'management'::app_role) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  UPDATE clinics
  SET
    is_active = COALESCE((p_updates->>'is_active')::boolean, is_active),
    name = COALESCE(p_updates->>'name', name),
    city = COALESCE(p_updates->>'city', city)
  WHERE id = p_clinic_id;

  INSERT INTO audit_logs (user_id, event_type, event_data)
  VALUES (
    auth.uid(),
    'admin_clinic_update',
    jsonb_build_object(
      'clinic_id', p_clinic_id,
      'updates', p_updates
    )
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_all_users()
RETURNS TABLE(id uuid, email text, full_name text, profile_role text, is_disabled boolean, created_at timestamp with time zone, app_roles jsonb, clinics jsonb, tokens integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'ops'::app_role) OR has_role(auth.uid(), 'management'::app_role)) THEN
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

CREATE OR REPLACE FUNCTION public.admin_get_all_clinics()
RETURNS TABLE(id uuid, name text, city text, is_active boolean, created_at timestamp with time zone, study_count bigint, member_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
    (SELECT COUNT(*) FROM clinic_memberships cm WHERE cm.clinic_id = c.id) as member_count
  FROM clinics c
  ORDER BY c.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_all_studies()
RETURNS SETOF studies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'ops'::app_role) OR has_role(auth.uid(), 'management'::app_role)) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;
  
  RETURN QUERY SELECT * FROM studies ORDER BY created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_study(p_study_id uuid, p_updates jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'ops'::app_role) OR has_role(auth.uid(), 'management'::app_role)) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  UPDATE studies
  SET
    report_locked = COALESCE((p_updates->>'report_locked')::boolean, report_locked),
    state = COALESCE(p_updates->>'state', state),
    sla = COALESCE(p_updates->>'sla', sla)
  WHERE id = p_study_id;

  INSERT INTO audit_logs (user_id, event_type, event_data)
  VALUES (
    auth.uid(),
    'admin_study_update',
    jsonb_build_object(
      'study_id', p_study_id,
      'updates', p_updates
    )
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_log_event(p_study_id uuid, p_event text, p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'ops'::app_role) OR has_role(auth.uid(), 'management'::app_role)) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  INSERT INTO review_events (study_id, actor, event, payload)
  VALUES (p_study_id, auth.uid(), p_event, p_payload);

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_stats jsonb;
BEGIN
  IF NOT (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'ops'::app_role) OR has_role(auth.uid(), 'management'::app_role)) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  SELECT jsonb_build_object(
    'total_clinics', (SELECT COUNT(*) FROM clinics),
    'total_studies', (SELECT COUNT(*) FROM studies),
    'studies_by_state', (
      SELECT jsonb_object_agg(COALESCE(state, 'unknown'), cnt)
      FROM (SELECT state, COUNT(*) as cnt FROM studies GROUP BY state) sub
    ),
    'total_tokens_sold', (SELECT COALESCE(SUM(credits_purchased), 0) FROM payments WHERE status = 'captured'),
    'total_tokens_consumed', (SELECT COALESCE(SUM(c.amount_inr / 200), 0) FROM commissions c),
    'active_users', (SELECT COUNT(DISTINCT user_id) FROM wallets WHERE updated_at > NOW() - INTERVAL '30 days')
  ) INTO v_stats;

  RETURN v_stats;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_ticket_status(p_ticket_id uuid, p_status text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin'::app_role) 
     AND NOT has_role(auth.uid(), 'ops'::app_role)
     AND NOT has_role(auth.uid(), 'management'::app_role) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  IF p_status NOT IN ('open', 'in_progress', 'resolved', 'closed') THEN
    RAISE EXCEPTION 'Invalid status: must be open, in_progress, resolved, or closed';
  END IF;

  UPDATE support_tickets
  SET status = p_status,
      updated_at = NOW()
  WHERE id = p_ticket_id;

  INSERT INTO audit_logs (user_id, event_type, event_data)
  VALUES (
    auth.uid(),
    'admin_ticket_update',
    jsonb_build_object(
      'ticket_id', p_ticket_id,
      'new_status', p_status
    )
  );

  RETURN jsonb_build_object('success', true, 'status', p_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_scan_test_files()
RETURNS TABLE(file_id uuid, study_id uuid, file_path text, file_kind text, clinic_name text, created_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'ops'::app_role) OR has_role(auth.uid(), 'management'::app_role)) THEN
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

CREATE OR REPLACE FUNCTION public.admin_delete_test_files(p_file_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_deleted_count integer := 0;
  v_file_paths text[];
BEGIN
  IF NOT (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'ops'::app_role) OR has_role(auth.uid(), 'management'::app_role)) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  SELECT array_agg(path) INTO v_file_paths
  FROM study_files
  WHERE id = ANY(p_file_ids);

  DELETE FROM study_files WHERE id = ANY(p_file_ids);
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

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

CREATE OR REPLACE FUNCTION public.admin_get_recent_audit_logs(p_limit integer DEFAULT 50)
RETURNS TABLE(id uuid, actor_id uuid, actor_email text, event_type text, event_data jsonb, created_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'ops'::app_role) OR has_role(auth.uid(), 'management'::app_role)) THEN
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

CREATE OR REPLACE FUNCTION public.admin_reset_user_tfa(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin'::app_role) 
     AND NOT has_role(auth.uid(), 'ops'::app_role)
     AND NOT has_role(auth.uid(), 'management'::app_role) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  DELETE FROM tfa_secrets WHERE user_id = p_user_id;

  INSERT INTO audit_logs (user_id, event_type, event_data)
  VALUES (
    auth.uid(),
    'tfa_reset',
    jsonb_build_object('target_user_id', p_user_id)
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.check_tfa_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_enabled boolean;
  v_needs_setup boolean;
BEGIN
  SELECT is_enabled INTO v_is_enabled
  FROM tfa_secrets
  WHERE user_id = auth.uid();

  -- Admin/ops/management users need TFA
  v_needs_setup := (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'ops'::app_role) OR has_role(auth.uid(), 'management'::app_role)) AND (v_is_enabled IS NULL OR v_is_enabled = false);

  RETURN jsonb_build_object(
    'is_enabled', COALESCE(v_is_enabled, false),
    'needs_setup', v_needs_setup
  );
END;
$$;