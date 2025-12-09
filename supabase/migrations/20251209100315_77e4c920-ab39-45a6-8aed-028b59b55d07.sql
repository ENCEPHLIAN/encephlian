
-- Drop the old check constraint and add proper values
ALTER TABLE public.studies DROP CONSTRAINT IF EXISTS studies_state_check;

-- Add updated check constraint with all needed states
ALTER TABLE public.studies ADD CONSTRAINT studies_state_check 
  CHECK (state IN ('uploaded', 'parsed', 'preprocessed', 'processing', 'in_review', 'completed', 'signed', 'rejected', 'refunded'));

-- Fix the select_sla_and_start_triage function to use correct state values
CREATE OR REPLACE FUNCTION public.select_sla_and_start_triage(p_study_id uuid, p_sla text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
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
  
  -- Update study with SLA and start triage - use 'processing' state which is now valid
  UPDATE studies
  SET sla = p_sla,
      triage_status = 'processing',
      triage_progress = 5,
      triage_started_at = now(),
      sla_selected_at = now(),
      tokens_deducted = v_tokens_required,
      state = 'processing'
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
