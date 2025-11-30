-- RLS policies for admin user creation and management
-- Allow admins to view all user roles
CREATE POLICY "Admins can view all user roles"
ON user_roles
FOR SELECT
USING (
  has_role(auth.uid(), 'super_admin'::app_role) OR 
  has_role(auth.uid(), 'ops'::app_role)
);

-- Security definer function to create admin user
CREATE OR REPLACE FUNCTION public.admin_create_user(
  p_email TEXT,
  p_password TEXT,
  p_full_name TEXT,
  p_role app_role
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Verify caller is admin
  IF NOT has_role(auth.uid(), 'super_admin'::app_role) AND NOT has_role(auth.uid(), 'ops'::app_role) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  -- Return instructions for edge function
  RETURN jsonb_build_object(
    'success', false,
    'message', 'This function must be called via edge function with service role'
  );
END;
$$;

-- Security definer function to delete/revoke admin access
CREATE OR REPLACE FUNCTION public.admin_revoke_role(
  p_user_id UUID,
  p_role app_role
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

  -- Cannot revoke own super_admin role
  IF p_user_id = auth.uid() AND p_role = 'super_admin'::app_role THEN
    RAISE EXCEPTION 'Cannot revoke your own super_admin role';
  END IF;

  DELETE FROM user_roles
  WHERE user_id = p_user_id AND role = p_role;

  -- Log audit event
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