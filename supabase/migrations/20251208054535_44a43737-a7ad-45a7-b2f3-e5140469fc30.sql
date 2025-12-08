-- Update check_tfa_status to include management role
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
  v_needs_setup := (
    has_role(auth.uid(), 'super_admin'::app_role) 
    OR has_role(auth.uid(), 'ops'::app_role) 
    OR has_role(auth.uid(), 'management'::app_role)
  ) AND (v_is_enabled IS NULL OR v_is_enabled = false);

  RETURN jsonb_build_object(
    'is_enabled', COALESCE(v_is_enabled, false),
    'needs_setup', v_needs_setup
  );
END;
$$;

-- Update admin_setup_tfa to include management
CREATE OR REPLACE FUNCTION public.admin_setup_tfa(p_secret text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  -- Only admin/ops/management users need TFA
  IF NOT has_role(auth.uid(), 'super_admin'::app_role) 
     AND NOT has_role(auth.uid(), 'ops'::app_role) 
     AND NOT has_role(auth.uid(), 'management'::app_role) THEN
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