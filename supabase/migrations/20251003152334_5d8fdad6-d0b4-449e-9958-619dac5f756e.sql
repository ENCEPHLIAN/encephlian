-- Fix infinite recursion in profiles RLS policy
DROP POLICY IF EXISTS "profiles_self_admin" ON profiles;
DROP POLICY IF EXISTS "wallet_scope" ON wallets;

-- Simpler profile access policy without recursion
CREATE POLICY "profiles_self_admin" ON profiles
FOR SELECT
USING (
  id = auth.uid() OR 
  role IN ('admin', 'ops')
);

-- Fixed wallet policy without recursion through profiles
CREATE POLICY "wallet_scope" ON wallets
FOR SELECT
USING (user_id = auth.uid());

-- Add earnings wallet for neurologists
CREATE TABLE IF NOT EXISTS earnings_wallets (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance_inr INTEGER NOT NULL DEFAULT 0,
  total_earned_inr INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE earnings_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "earnings_wallet_owner" ON earnings_wallets
FOR ALL
USING (user_id = auth.uid());

-- Update wallets table to use tokens instead of credits
ALTER TABLE wallets RENAME COLUMN credits TO tokens;

-- Add commission tracking
CREATE TABLE IF NOT EXISTS commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  neurologist_id UUID NOT NULL REFERENCES auth.users(id),
  report_id UUID NOT NULL REFERENCES reports(id),
  sla TEXT NOT NULL CHECK (sla IN ('TAT', 'STAT')),
  commission_rate DECIMAL(5,2) NOT NULL,
  amount_inr INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "commissions_own" ON commissions
FOR ALL
USING (neurologist_id = auth.uid());

-- Update credit_wallet function to work with tokens
DROP FUNCTION IF EXISTS credit_wallet(UUID, INTEGER);
CREATE FUNCTION credit_wallet(p_user_id UUID, p_tokens INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO wallets (user_id, tokens, updated_at)
  VALUES (p_user_id, p_tokens, NOW())
  ON CONFLICT (user_id) DO UPDATE
  SET tokens = wallets.tokens + p_tokens,
      updated_at = NOW();
END;
$$;

-- Update consume_credit_and_sign to handle tokens and commissions
DROP FUNCTION IF EXISTS consume_credit_and_sign(UUID, UUID, INTEGER, JSONB);
CREATE FUNCTION consume_credit_and_sign(
  p_user_id UUID,
  p_study_id UUID,
  p_cost INTEGER,
  p_content JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_tokens INT;
  v_report_id UUID;
  v_sla TEXT;
  v_commission_rate DECIMAL(5,2);
  v_commission_amount INT;
BEGIN
  -- Get study SLA
  SELECT sla INTO v_sla FROM studies WHERE id = p_study_id;
  
  -- Calculate commission: TAT = 3%, STAT = 5%
  v_commission_rate := CASE WHEN v_sla = 'STAT' THEN 5.00 ELSE 3.00 END;
  v_commission_amount := FLOOR((p_cost * 200 * v_commission_rate) / 100);

  -- Check tokens
  SELECT tokens INTO v_current_tokens
  FROM wallets
  WHERE user_id = (SELECT owner FROM studies WHERE id = p_study_id)
  FOR UPDATE;

  IF v_current_tokens IS NULL OR v_current_tokens < p_cost THEN
    RAISE EXCEPTION 'Insufficient tokens. Required: %, Available: %', p_cost, COALESCE(v_current_tokens, 0);
  END IF;

  -- Deduct tokens
  UPDATE wallets
  SET tokens = tokens - p_cost,
      updated_at = NOW()
  WHERE user_id = (SELECT owner FROM studies WHERE id = p_study_id);

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
$$;

-- Ensure wallets exist trigger
CREATE OR REPLACE FUNCTION ensure_wallets()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO wallets(user_id, tokens) VALUES (NEW.id, 0)
  ON CONFLICT (user_id) DO NOTHING;
  
  INSERT INTO earnings_wallets(user_id, balance_inr, total_earned_inr) 
  VALUES (NEW.id, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_wallet ON profiles;
CREATE TRIGGER ensure_wallet
AFTER INSERT ON profiles
FOR EACH ROW
EXECUTE FUNCTION ensure_wallets();