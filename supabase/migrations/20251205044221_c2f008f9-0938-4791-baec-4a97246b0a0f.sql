-- Add authorization check to consume_credit_and_sign function
CREATE OR REPLACE FUNCTION public.consume_credit_and_sign(p_user_id uuid, p_study_id uuid, p_cost integer, p_content jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_current_tokens INT;
  v_report_id UUID;
  v_sla TEXT;
  v_commission_rate DECIMAL(5,2);
  v_commission_amount INT;
  v_study_owner UUID;
  v_study_clinic_id UUID;
BEGIN
  -- Get study owner and clinic for authorization check
  SELECT owner, clinic_id INTO v_study_owner, v_study_clinic_id 
  FROM studies WHERE id = p_study_id;
  
  IF v_study_owner IS NULL THEN
    RAISE EXCEPTION 'Study not found';
  END IF;

  -- Authorization check: caller must own the study, be an admin, or be in the study's clinic
  IF NOT (
    v_study_owner = p_user_id
    OR has_role(p_user_id, 'super_admin'::app_role)
    OR has_role(p_user_id, 'ops'::app_role)
    OR EXISTS (
      SELECT 1 FROM clinic_memberships cm
      WHERE cm.clinic_id = v_study_clinic_id AND cm.user_id = p_user_id
    )
  ) THEN
    RAISE EXCEPTION 'Unauthorized: User does not have access to this study';
  END IF;

  -- Get study SLA
  SELECT sla INTO v_sla FROM studies WHERE id = p_study_id;
  
  -- Calculate commission: TAT = 3%, STAT = 5%
  v_commission_rate := CASE WHEN v_sla = 'STAT' THEN 5.00 ELSE 3.00 END;
  v_commission_amount := FLOOR((p_cost * 200 * v_commission_rate) / 100);

  -- Check tokens from study owner's wallet
  SELECT tokens INTO v_current_tokens
  FROM wallets
  WHERE user_id = v_study_owner
  FOR UPDATE;

  IF v_current_tokens IS NULL OR v_current_tokens < p_cost THEN
    RAISE EXCEPTION 'Insufficient tokens. Required: %, Available: %', p_cost, COALESCE(v_current_tokens, 0);
  END IF;

  -- Deduct tokens from study owner's wallet
  UPDATE wallets
  SET tokens = tokens - p_cost,
      updated_at = NOW()
  WHERE user_id = v_study_owner;

  -- Insert or update report
  INSERT INTO reports (study_id, interpreter, status, content, signed_at)
  VALUES (p_study_id, p_user_id, 'signed', p_content, NOW())
  ON CONFLICT (study_id) DO UPDATE
  SET interpreter = p_user_id,
      status = 'signed',
      content = p_content,
      signed_at = NOW()
  RETURNING id INTO v_report_id;

  -- Update study state
  UPDATE studies SET state = 'signed' WHERE id = p_study_id;

  -- Add commission to neurologist's earnings wallet
  INSERT INTO earnings_wallets (user_id, balance_inr, total_earned_inr, updated_at)
  VALUES (p_user_id, v_commission_amount, v_commission_amount, NOW())
  ON CONFLICT (user_id) DO UPDATE
  SET balance_inr = earnings_wallets.balance_inr + v_commission_amount,
      total_earned_inr = earnings_wallets.total_earned_inr + v_commission_amount,
      updated_at = NOW();

  -- Record commission
  INSERT INTO commissions (neurologist_id, report_id, sla, commission_rate, amount_inr)
  VALUES (p_user_id, v_report_id, v_sla, v_commission_rate, v_commission_amount);

  -- Log event
  INSERT INTO review_events (study_id, actor, event, payload)
  VALUES (p_study_id, p_user_id, 'sign', jsonb_build_object(
    'tokens_deducted', p_cost,
    'report_id', v_report_id,
    'commission_earned', v_commission_amount
  ));

  RETURN jsonb_build_object(
    'success', true,
    'report_id', v_report_id,
    'tokens_remaining', v_current_tokens - p_cost,
    'commission_earned', v_commission_amount
  );
END;
$function$;