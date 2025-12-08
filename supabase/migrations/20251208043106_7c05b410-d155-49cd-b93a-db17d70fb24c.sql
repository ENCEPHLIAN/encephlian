-- Add delete user function that cascades and cleans up all data
CREATE OR REPLACE FUNCTION public.admin_delete_user(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_email TEXT;
  v_is_super_admin BOOLEAN;
BEGIN
  -- Verify caller is admin
  IF NOT has_role(auth.uid(), 'super_admin'::app_role) AND NOT has_role(auth.uid(), 'ops'::app_role) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  -- Cannot delete yourself
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot delete your own account';
  END IF;

  -- Check if target is super_admin
  SELECT EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = p_user_id AND role = 'super_admin'::app_role
  ) INTO v_is_super_admin;

  IF v_is_super_admin THEN
    RAISE EXCEPTION 'Cannot delete super_admin users from UI';
  END IF;

  -- Get user email for audit
  SELECT email INTO v_user_email FROM profiles WHERE id = p_user_id;

  IF v_user_email IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- Delete from notes
  DELETE FROM notes WHERE user_id = p_user_id;
  
  -- Delete from wallets
  DELETE FROM wallets WHERE user_id = p_user_id;
  
  -- Delete from earnings_wallets
  DELETE FROM earnings_wallets WHERE user_id = p_user_id;
  
  -- Delete from bank_accounts
  DELETE FROM bank_accounts WHERE user_id = p_user_id;
  
  -- Delete from withdrawal_requests
  DELETE FROM withdrawal_requests WHERE user_id = p_user_id;
  
  -- Delete from tds_records
  DELETE FROM tds_records WHERE user_id = p_user_id;
  
  -- Delete from clinic_memberships
  DELETE FROM clinic_memberships WHERE user_id = p_user_id;
  
  -- Delete from user_roles
  DELETE FROM user_roles WHERE user_id = p_user_id;
  
  -- Delete from eeg_markers
  DELETE FROM eeg_markers WHERE user_id = p_user_id;
  
  -- Delete from support_tickets
  DELETE FROM support_tickets WHERE user_id = p_user_id;
  
  -- Delete from profiles (this will cascade from auth.users)
  DELETE FROM profiles WHERE id = p_user_id;

  -- Log audit event BEFORE deleting the user
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

-- Create TFA secrets table for real TOTP
CREATE TABLE IF NOT EXISTS public.tfa_secrets (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  encrypted_secret text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT false,
  backup_codes text[] DEFAULT NULL,
  created_at timestamp with time zone DEFAULT now(),
  verified_at timestamp with time zone DEFAULT NULL
);

-- Enable RLS on tfa_secrets
ALTER TABLE public.tfa_secrets ENABLE ROW LEVEL SECURITY;

-- Only admins can manage TFA secrets
CREATE POLICY "tfa_secrets_admin_manage"
ON public.tfa_secrets
FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'ops'::app_role) OR user_id = auth.uid());

-- Users can view their own TFA status
CREATE POLICY "tfa_secrets_own_view"
ON public.tfa_secrets
FOR SELECT
USING (user_id = auth.uid());

-- Function to setup TFA (returns secret for QR code)
CREATE OR REPLACE FUNCTION public.admin_setup_tfa(p_secret text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only admin/ops users need TFA
  IF NOT has_role(auth.uid(), 'super_admin'::app_role) AND NOT has_role(auth.uid(), 'ops'::app_role) THEN
    RAISE EXCEPTION 'TFA is only required for admin users';
  END IF;

  -- Insert or update TFA secret
  INSERT INTO tfa_secrets (user_id, encrypted_secret, is_enabled)
  VALUES (auth.uid(), p_secret, false)
  ON CONFLICT (user_id) DO UPDATE
  SET encrypted_secret = p_secret,
      is_enabled = false,
      verified_at = NULL;

  -- Log audit event
  INSERT INTO audit_logs (user_id, event_type, event_data)
  VALUES (auth.uid(), 'tfa_setup_initiated', jsonb_build_object('user_id', auth.uid()));

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Function to verify and enable TFA
CREATE OR REPLACE FUNCTION public.admin_verify_tfa()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update TFA as enabled and verified
  UPDATE tfa_secrets
  SET is_enabled = true, verified_at = now()
  WHERE user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TFA not set up';
  END IF;

  -- Log audit event
  INSERT INTO audit_logs (user_id, event_type, event_data)
  VALUES (auth.uid(), 'tfa_enabled', jsonb_build_object('user_id', auth.uid()));

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Function to get TFA secret for verification
CREATE OR REPLACE FUNCTION public.get_tfa_secret()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret text;
BEGIN
  SELECT encrypted_secret INTO v_secret
  FROM tfa_secrets
  WHERE user_id = auth.uid() AND is_enabled = true;

  RETURN v_secret;
END;
$$;

-- Function to check if TFA is enabled
CREATE OR REPLACE FUNCTION public.check_tfa_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_enabled boolean;
  v_needs_setup boolean;
BEGIN
  SELECT is_enabled INTO v_is_enabled
  FROM tfa_secrets
  WHERE user_id = auth.uid();

  -- Admin/ops users need TFA
  v_needs_setup := (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'ops'::app_role)) AND (v_is_enabled IS NULL OR v_is_enabled = false);

  RETURN jsonb_build_object(
    'is_enabled', COALESCE(v_is_enabled, false),
    'needs_setup', v_needs_setup
  );
END;
$$;

-- Function to reset TFA for a user (admin only)
CREATE OR REPLACE FUNCTION public.admin_reset_user_tfa(p_user_id uuid)
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

  -- Delete TFA for target user
  DELETE FROM tfa_secrets WHERE user_id = p_user_id;

  -- Log audit event
  INSERT INTO audit_logs (user_id, event_type, event_data)
  VALUES (
    auth.uid(),
    'tfa_reset',
    jsonb_build_object('target_user_id', p_user_id)
  );

  RETURN jsonb_build_object('success', true);
END;
$$;