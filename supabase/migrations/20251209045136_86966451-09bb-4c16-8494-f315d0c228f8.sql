-- =============================================
-- SLA SELECTION AND TRIAGE TOKEN DEDUCTION SYSTEM
-- =============================================

-- Add triage-related columns to studies table if not exists
ALTER TABLE studies ADD COLUMN IF NOT EXISTS triage_status text DEFAULT 'pending';
ALTER TABLE studies ADD COLUMN IF NOT EXISTS triage_progress integer DEFAULT 0;
ALTER TABLE studies ADD COLUMN IF NOT EXISTS triage_started_at timestamptz;
ALTER TABLE studies ADD COLUMN IF NOT EXISTS triage_completed_at timestamptz;
ALTER TABLE studies ADD COLUMN IF NOT EXISTS sla_selected_at timestamptz;
ALTER TABLE studies ADD COLUMN IF NOT EXISTS tokens_deducted integer DEFAULT 0;
ALTER TABLE studies ADD COLUMN IF NOT EXISTS refund_requested boolean DEFAULT false;
ALTER TABLE studies ADD COLUMN IF NOT EXISTS refund_reason text;
ALTER TABLE studies ADD COLUMN IF NOT EXISTS refund_processed_at timestamptz;

-- Create function for SLA selection with atomic token deduction
CREATE OR REPLACE FUNCTION select_sla_and_start_triage(
  p_study_id uuid,
  p_sla text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_study_owner uuid;
  v_current_tokens integer;
  v_tokens_required integer;
  v_new_balance integer;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  -- Validate SLA
  IF p_sla NOT IN ('TAT', 'STAT') THEN
    RAISE EXCEPTION 'Invalid SLA. Must be TAT or STAT';
  END IF;
  
  -- Get tokens required
  v_tokens_required := CASE WHEN p_sla = 'STAT' THEN 2 ELSE 1 END;
  
  -- Get study owner
  SELECT owner INTO v_study_owner FROM studies WHERE id = p_study_id;
  
  IF v_study_owner IS NULL THEN
    RAISE EXCEPTION 'Study not found';
  END IF;
  
  -- Only study owner can select SLA
  IF v_study_owner != v_user_id THEN
    RAISE EXCEPTION 'Only the study owner can select SLA';
  END IF;
  
  -- Get current token balance with lock
  SELECT tokens INTO v_current_tokens
  FROM wallets
  WHERE user_id = v_user_id
  FOR UPDATE;
  
  IF v_current_tokens IS NULL THEN
    -- Create wallet if not exists
    INSERT INTO wallets (user_id, tokens) VALUES (v_user_id, 0);
    v_current_tokens := 0;
  END IF;
  
  -- Check sufficient balance
  IF v_current_tokens < v_tokens_required THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'insufficient_tokens',
      'required', v_tokens_required,
      'current_balance', v_current_tokens
    );
  END IF;
  
  -- Deduct tokens
  v_new_balance := v_current_tokens - v_tokens_required;
  
  UPDATE wallets
  SET tokens = v_new_balance, updated_at = now()
  WHERE user_id = v_user_id;
  
  -- Log token transaction
  INSERT INTO wallet_transactions (user_id, amount, operation, balance_before, balance_after, reason)
  VALUES (v_user_id, v_tokens_required, 'deduct', v_current_tokens, v_new_balance, 
          'SLA selection: ' || p_sla || ' for study ' || p_study_id);
  
  -- Update study with SLA and start triage
  UPDATE studies
  SET sla = p_sla,
      triage_status = 'processing',
      triage_progress = 5,
      triage_started_at = now(),
      sla_selected_at = now(),
      tokens_deducted = v_tokens_required,
      state = 'parsed'
  WHERE id = p_study_id;
  
  -- Log review event
  INSERT INTO review_events (study_id, actor, event, payload)
  VALUES (p_study_id, v_user_id, 'sla_selected', jsonb_build_object(
    'sla', p_sla,
    'tokens_deducted', v_tokens_required,
    'new_balance', v_new_balance
  ));
  
  RETURN jsonb_build_object(
    'success', true,
    'sla', p_sla,
    'tokens_deducted', v_tokens_required,
    'new_balance', v_new_balance,
    'study_id', p_study_id
  );
END;
$$;

-- Create function for token refund
CREATE OR REPLACE FUNCTION request_token_refund(
  p_study_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_study_owner uuid;
  v_tokens_deducted integer;
  v_current_tokens integer;
  v_new_balance integer;
  v_refund_already boolean;
  v_triage_completed_at timestamptz;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  -- Get study details
  SELECT owner, tokens_deducted, refund_requested, triage_completed_at
  INTO v_study_owner, v_tokens_deducted, v_refund_already, v_triage_completed_at
  FROM studies WHERE id = p_study_id;
  
  IF v_study_owner IS NULL THEN
    RAISE EXCEPTION 'Study not found';
  END IF;
  
  IF v_study_owner != v_user_id THEN
    RAISE EXCEPTION 'Only the study owner can request refund';
  END IF;
  
  IF v_refund_already = true THEN
    RAISE EXCEPTION 'Refund already requested for this study';
  END IF;
  
  IF v_tokens_deducted IS NULL OR v_tokens_deducted = 0 THEN
    RAISE EXCEPTION 'No tokens were deducted for this study';
  END IF;
  
  -- Check 48 hour window
  IF v_triage_completed_at IS NOT NULL AND v_triage_completed_at < now() - interval '48 hours' THEN
    RAISE EXCEPTION 'Refund window has expired (48 hours)';
  END IF;
  
  -- Get current balance
  SELECT tokens INTO v_current_tokens FROM wallets WHERE user_id = v_user_id;
  v_new_balance := COALESCE(v_current_tokens, 0) + v_tokens_deducted;
  
  -- Credit tokens back
  UPDATE wallets
  SET tokens = v_new_balance, updated_at = now()
  WHERE user_id = v_user_id;
  
  -- Log transaction
  INSERT INTO wallet_transactions (user_id, amount, operation, balance_before, balance_after, reason)
  VALUES (v_user_id, v_tokens_deducted, 'refund', COALESCE(v_current_tokens, 0), v_new_balance,
          'Refund for study ' || p_study_id || COALESCE(': ' || p_reason, ''));
  
  -- Update study
  UPDATE studies
  SET refund_requested = true,
      refund_reason = p_reason,
      refund_processed_at = now()
  WHERE id = p_study_id;
  
  -- Log event
  INSERT INTO review_events (study_id, actor, event, payload)
  VALUES (p_study_id, v_user_id, 'refund_requested', jsonb_build_object(
    'tokens_refunded', v_tokens_deducted,
    'reason', p_reason,
    'new_balance', v_new_balance
  ));
  
  RETURN jsonb_build_object(
    'success', true,
    'tokens_refunded', v_tokens_deducted,
    'new_balance', v_new_balance
  );
END;
$$;

-- Admin function to push file to user for SLA selection
CREATE OR REPLACE FUNCTION admin_push_eeg_to_user(
  p_user_id uuid,
  p_clinic_id uuid,
  p_file_path text,
  p_meta jsonb DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller_id uuid;
  v_study_id uuid;
BEGIN
  v_caller_id := auth.uid();
  
  IF NOT (has_role(v_caller_id, 'super_admin') OR has_role(v_caller_id, 'ops') OR has_role(v_caller_id, 'management')) THEN
    RAISE EXCEPTION 'Forbidden: Admin access required';
  END IF;
  
  -- Create study for user
  INSERT INTO studies (
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
    'uploaded',
    'awaiting_sla',
    'TAT'
  )
  RETURNING id INTO v_study_id;
  
  -- Log audit
  INSERT INTO audit_logs (user_id, event_type, event_data)
  VALUES (v_caller_id, 'admin_push_eeg', jsonb_build_object(
    'target_user', p_user_id,
    'clinic_id', p_clinic_id,
    'study_id', v_study_id,
    'file_path', p_file_path
  ));
  
  RETURN jsonb_build_object(
    'success', true,
    'study_id', v_study_id
  );
END;
$$;

-- Enable realtime for studies triage updates
ALTER PUBLICATION supabase_realtime ADD TABLE studies;