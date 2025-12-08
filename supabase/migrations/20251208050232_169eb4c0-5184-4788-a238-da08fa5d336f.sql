-- Drop existing functions first to change return types
DROP FUNCTION IF EXISTS public.admin_delete_user(uuid);
DROP FUNCTION IF EXISTS public.admin_create_user(text, text, text, app_role);
DROP FUNCTION IF EXISTS public.admin_grant_role(uuid, app_role, uuid);
DROP FUNCTION IF EXISTS public.admin_adjust_tokens(uuid, integer, text);

-- Add clinician to the enum if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'clinician' AND enumtypid = 'app_role'::regtype) THEN
    ALTER TYPE app_role ADD VALUE 'clinician';
  END IF;
END $$;

-- Create wallet_transactions table for activity tracking
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount integer NOT NULL,
  operation text NOT NULL CHECK (operation IN ('add', 'remove', 'set', 'purchase', 'deduct')),
  balance_before integer NOT NULL,
  balance_after integer NOT NULL,
  reason text,
  performed_by uuid,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on wallet_transactions
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own transactions" ON public.wallet_transactions;
DROP POLICY IF EXISTS "Admins can view all transactions" ON public.wallet_transactions;
DROP POLICY IF EXISTS "Admins can insert transactions" ON public.wallet_transactions;

-- RLS policies for wallet_transactions
CREATE POLICY "Users can view own transactions"
ON public.wallet_transactions FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Admins can view all transactions"
ON public.wallet_transactions FOR SELECT
USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'ops') OR has_role(auth.uid(), 'management'));

CREATE POLICY "Admins can insert transactions"
ON public.wallet_transactions FOR INSERT
WITH CHECK (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'ops') OR has_role(auth.uid(), 'management'));

-- Recreate admin_delete_user
CREATE FUNCTION public.admin_delete_user(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_email text;
  v_caller_id uuid;
BEGIN
  v_caller_id := auth.uid();
  
  IF NOT (has_role(v_caller_id, 'super_admin') OR has_role(v_caller_id, 'ops') OR has_role(v_caller_id, 'management')) THEN
    RAISE EXCEPTION 'Forbidden: Admin access required';
  END IF;
  
  IF has_role(p_user_id, 'super_admin') THEN
    RAISE EXCEPTION 'Cannot delete super_admin users';
  END IF;
  
  SELECT email INTO v_deleted_email FROM profiles WHERE id = p_user_id;
  
  DELETE FROM wallet_transactions WHERE user_id = p_user_id;
  DELETE FROM wallets WHERE user_id = p_user_id;
  DELETE FROM earnings_wallets WHERE user_id = p_user_id;
  DELETE FROM bank_accounts WHERE user_id = p_user_id;
  DELETE FROM tfa_secrets WHERE user_id = p_user_id;
  DELETE FROM notes WHERE user_id = p_user_id;
  DELETE FROM support_tickets WHERE user_id = p_user_id;
  DELETE FROM eeg_markers WHERE user_id = p_user_id;
  DELETE FROM clinic_memberships WHERE user_id = p_user_id;
  DELETE FROM user_roles WHERE user_id = p_user_id;
  DELETE FROM payments WHERE user_id = p_user_id;
  DELETE FROM withdrawal_requests WHERE user_id = p_user_id;
  DELETE FROM tds_records WHERE user_id = p_user_id;
  DELETE FROM commissions WHERE neurologist_id = p_user_id;
  
  DELETE FROM study_files WHERE study_id IN (SELECT id FROM studies WHERE owner = p_user_id);
  DELETE FROM reports WHERE study_id IN (SELECT id FROM studies WHERE owner = p_user_id);
  DELETE FROM ai_drafts WHERE study_id IN (SELECT id FROM studies WHERE owner = p_user_id);
  DELETE FROM canonical_eeg_records WHERE study_id IN (SELECT id FROM studies WHERE owner = p_user_id);
  DELETE FROM review_events WHERE study_id IN (SELECT id FROM studies WHERE owner = p_user_id);
  DELETE FROM report_attachments WHERE study_id IN (SELECT id FROM studies WHERE owner = p_user_id);
  DELETE FROM studies WHERE owner = p_user_id;
  
  DELETE FROM profiles WHERE id = p_user_id;
  DELETE FROM auth.users WHERE id = p_user_id;
  
  INSERT INTO audit_logs (user_id, event_type, event_data)
  VALUES (v_caller_id, 'user_deleted', jsonb_build_object('deleted_user_id', p_user_id, 'deleted_email', v_deleted_email));
  
  RETURN jsonb_build_object('success', true, 'deleted_email', v_deleted_email);
END;
$$;

-- Recreate admin_create_user (validation only - actual creation in edge function)
CREATE FUNCTION public.admin_create_user(
  p_email text,
  p_password text,
  p_full_name text,
  p_role app_role
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid;
BEGIN
  v_caller_id := auth.uid();
  
  IF NOT (has_role(v_caller_id, 'super_admin') OR has_role(v_caller_id, 'ops') OR has_role(v_caller_id, 'management')) THEN
    RAISE EXCEPTION 'Forbidden: Admin access required';
  END IF;
  
  IF has_role(v_caller_id, 'management') AND NOT has_role(v_caller_id, 'super_admin') THEN
    IF p_role IN ('management', 'super_admin', 'ops') THEN
      RAISE EXCEPTION 'Management users cannot create system-level roles';
    END IF;
  END IF;
  
  RETURN jsonb_build_object('validated', true, 'email', p_email, 'role', p_role);
END;
$$;

-- Recreate admin_grant_role
CREATE FUNCTION public.admin_grant_role(
  p_user_id uuid,
  p_role app_role,
  p_clinic_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid;
BEGIN
  v_caller_id := auth.uid();
  
  IF NOT (has_role(v_caller_id, 'super_admin') OR has_role(v_caller_id, 'ops') OR has_role(v_caller_id, 'management')) THEN
    RAISE EXCEPTION 'Forbidden: Admin access required';
  END IF;
  
  IF has_role(v_caller_id, 'management') AND NOT has_role(v_caller_id, 'super_admin') THEN
    IF p_role IN ('management', 'super_admin', 'ops') THEN
      RAISE EXCEPTION 'Management users cannot grant system-level roles';
    END IF;
  END IF;
  
  INSERT INTO user_roles (user_id, role, clinic_id)
  VALUES (p_user_id, p_role, p_clinic_id)
  ON CONFLICT (user_id, role) DO NOTHING;
  
  INSERT INTO audit_logs (user_id, event_type, event_data)
  VALUES (v_caller_id, 'role_granted', jsonb_build_object('target_user', p_user_id, 'role', p_role::text, 'clinic_id', p_clinic_id));
  
  RETURN jsonb_build_object('success', true);
END;
$$;

-- Recreate admin_adjust_tokens with transaction logging
CREATE FUNCTION public.admin_adjust_tokens(
  p_user_id uuid,
  p_amount integer,
  p_operation text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid;
  v_old_balance integer;
  v_new_balance integer;
BEGIN
  v_caller_id := auth.uid();
  
  IF NOT (has_role(v_caller_id, 'super_admin') OR has_role(v_caller_id, 'ops') OR has_role(v_caller_id, 'management')) THEN
    RAISE EXCEPTION 'Forbidden: Admin access required';
  END IF;
  
  SELECT tokens INTO v_old_balance FROM wallets WHERE user_id = p_user_id;
  
  IF v_old_balance IS NULL THEN
    INSERT INTO wallets (user_id, tokens) VALUES (p_user_id, 0);
    v_old_balance := 0;
  END IF;
  
  IF p_operation = 'add' THEN
    v_new_balance := v_old_balance + p_amount;
  ELSIF p_operation = 'remove' THEN
    v_new_balance := GREATEST(0, v_old_balance - p_amount);
  ELSIF p_operation = 'set' THEN
    v_new_balance := GREATEST(0, p_amount);
  ELSE
    RAISE EXCEPTION 'Invalid operation: %', p_operation;
  END IF;
  
  UPDATE wallets SET tokens = v_new_balance, updated_at = now() WHERE user_id = p_user_id;
  
  INSERT INTO wallet_transactions (user_id, amount, operation, balance_before, balance_after, performed_by, reason)
  VALUES (p_user_id, p_amount, p_operation, v_old_balance, v_new_balance, v_caller_id, 'Admin adjustment');
  
  INSERT INTO audit_logs (user_id, event_type, event_data)
  VALUES (v_caller_id, 'tokens_adjusted', jsonb_build_object(
    'target_user', p_user_id,
    'operation', p_operation,
    'amount', p_amount,
    'old_balance', v_old_balance,
    'new_balance', v_new_balance
  ));
  
  RETURN jsonb_build_object('success', true, 'old_balance', v_old_balance, 'new_balance', v_new_balance);
END;
$$;