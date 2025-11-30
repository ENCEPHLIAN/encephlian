-- Admin CRM: RLS policies and security definer functions

-- 1. Ensure has_role function exists (already present, but adding for completeness)
-- This function already exists in the schema

-- 2. Create security definer function for admin token management
CREATE OR REPLACE FUNCTION public.admin_adjust_tokens(
  p_user_id UUID,
  p_amount INTEGER,
  p_operation TEXT -- 'add' or 'remove'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_tokens INTEGER;
  v_new_balance INTEGER;
BEGIN
  -- Verify caller is admin
  IF NOT has_role(auth.uid(), 'super_admin'::app_role) AND NOT has_role(auth.uid(), 'ops'::app_role) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  -- Get current balance
  SELECT tokens INTO v_current_tokens
  FROM wallets
  WHERE user_id = p_user_id;

  IF v_current_tokens IS NULL THEN
    -- Create wallet if it doesn't exist
    INSERT INTO wallets (user_id, tokens)
    VALUES (p_user_id, 0)
    RETURNING tokens INTO v_current_tokens;
  END IF;

  -- Calculate new balance
  IF p_operation = 'add' THEN
    v_new_balance := v_current_tokens + p_amount;
  ELSIF p_operation = 'remove' THEN
    v_new_balance := GREATEST(0, v_current_tokens - p_amount);
  ELSE
    RAISE EXCEPTION 'Invalid operation: must be add or remove';
  END IF;

  -- Update wallet
  UPDATE wallets
  SET tokens = v_new_balance,
      updated_at = NOW()
  WHERE user_id = p_user_id;

  -- Log audit event
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

-- 3. Create security definer function for admin to update support ticket status
CREATE OR REPLACE FUNCTION public.admin_update_ticket_status(
  p_ticket_id UUID,
  p_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify caller is admin
  IF NOT has_role(auth.uid(), 'super_admin'::app_role) AND NOT has_role(auth.uid(), 'ops'::app_role) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  -- Validate status
  IF p_status NOT IN ('open', 'in_progress', 'resolved', 'closed') THEN
    RAISE EXCEPTION 'Invalid status: must be open, in_progress, resolved, or closed';
  END IF;

  -- Update ticket
  UPDATE support_tickets
  SET status = p_status,
      updated_at = NOW()
  WHERE id = p_ticket_id;

  -- Log audit event
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

-- 4. Create security definer function for admin to update user profile
CREATE OR REPLACE FUNCTION public.admin_update_profile(
  p_user_id UUID,
  p_updates JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_field TEXT;
  v_value TEXT;
BEGIN
  -- Verify caller is admin
  IF NOT has_role(auth.uid(), 'super_admin'::app_role) AND NOT has_role(auth.uid(), 'ops'::app_role) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  -- Update allowed fields
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

  -- Log audit event
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

-- 5. Grant execute permissions to authenticated users (RLS will handle admin check)
GRANT EXECUTE ON FUNCTION public.admin_adjust_tokens TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_ticket_status TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_profile TO authenticated;