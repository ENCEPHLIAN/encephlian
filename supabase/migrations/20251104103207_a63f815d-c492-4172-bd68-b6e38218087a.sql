-- Simplify withdrawal system by removing TDS
-- Update process_completed_withdrawal to remove TDS logic

CREATE OR REPLACE FUNCTION public.process_completed_withdrawal(p_withdrawal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
  v_gross_amount INTEGER;
BEGIN
  -- Get withdrawal details
  SELECT user_id, gross_amount_inr
  INTO v_user_id, v_gross_amount
  FROM withdrawal_requests
  WHERE id = p_withdrawal_id;
  
  -- Deduct from balance and unlock
  UPDATE earnings_wallets
  SET balance_inr = balance_inr - v_gross_amount,
      locked_amount_inr = locked_amount_inr - v_gross_amount
  WHERE user_id = v_user_id;
  
  RETURN jsonb_build_object('success', true);
END;
$function$;