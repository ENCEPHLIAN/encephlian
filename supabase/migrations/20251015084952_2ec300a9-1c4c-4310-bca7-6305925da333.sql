-- Create withdrawal_requests table
CREATE TABLE withdrawal_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  amount_inr INTEGER NOT NULL,
  gross_amount_inr INTEGER NOT NULL,
  platform_fee_inr INTEGER NOT NULL DEFAULT 0,
  tds_amount_inr INTEGER NOT NULL DEFAULT 0,
  net_amount_inr INTEGER NOT NULL,
  
  bank_account_number TEXT NOT NULL,
  bank_ifsc TEXT NOT NULL,
  bank_account_holder TEXT NOT NULL,
  bank_name TEXT,
  
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  tier TEXT NOT NULL CHECK (tier IN ('instant', 'standard', 'manual')),
  razorpay_payout_id TEXT,
  
  tds_quarter TEXT,
  tds_deducted BOOLEAN DEFAULT false,
  form_16a_issued BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ,
  failed_reason TEXT,
  admin_notes TEXT
);

CREATE INDEX idx_withdrawal_user_status ON withdrawal_requests(user_id, status);
CREATE INDEX idx_withdrawal_created_at ON withdrawal_requests(created_at DESC);

-- Enable RLS
ALTER TABLE withdrawal_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own withdrawals"
ON withdrawal_requests FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can create own withdrawals"
ON withdrawal_requests FOR INSERT
WITH CHECK (user_id = auth.uid());

-- Create bank_accounts table
CREATE TABLE bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  account_number_encrypted TEXT NOT NULL,
  ifsc TEXT NOT NULL,
  account_holder_name TEXT NOT NULL,
  bank_name TEXT,
  
  is_verified BOOLEAN DEFAULT false,
  verified_at TIMESTAMPTZ,
  penny_drop_reference TEXT,
  
  is_primary BOOLEAN DEFAULT false,
  last_used_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(user_id, account_number_encrypted)
);

ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own bank accounts"
ON bank_accounts FOR ALL
USING (user_id = auth.uid());

-- Create tds_records table
CREATE TABLE tds_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  financial_year TEXT NOT NULL,
  quarter TEXT NOT NULL,
  
  total_earnings_inr INTEGER NOT NULL DEFAULT 0,
  total_tds_deducted_inr INTEGER NOT NULL DEFAULT 0,
  
  form_16a_url TEXT,
  form_26q_filed BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(user_id, financial_year, quarter)
);

ALTER TABLE tds_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own TDS records"
ON tds_records FOR SELECT
USING (user_id = auth.uid());

-- Update earnings_wallets table
ALTER TABLE earnings_wallets 
ADD COLUMN IF NOT EXISTS locked_amount_inr INTEGER NOT NULL DEFAULT 0;

-- Helper function to get current financial year
CREATE OR REPLACE FUNCTION get_current_fy()
RETURNS TEXT AS $$
DECLARE
  current_year INTEGER;
  current_month INTEGER;
BEGIN
  current_year := EXTRACT(YEAR FROM CURRENT_DATE);
  current_month := EXTRACT(MONTH FROM CURRENT_DATE);
  
  IF current_month >= 4 THEN
    RETURN 'FY' || current_year || '-' || (current_year + 1);
  ELSE
    RETURN 'FY' || (current_year - 1) || '-' || current_year;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- Helper function to get current quarter
CREATE OR REPLACE FUNCTION get_current_quarter()
RETURNS TEXT AS $$
DECLARE
  current_month INTEGER;
BEGIN
  current_month := EXTRACT(MONTH FROM CURRENT_DATE);
  
  IF current_month >= 4 AND current_month <= 6 THEN
    RETURN 'Q1';
  ELSIF current_month >= 7 AND current_month <= 9 THEN
    RETURN 'Q2';
  ELSIF current_month >= 10 AND current_month <= 12 THEN
    RETURN 'Q3';
  ELSE
    RETURN 'Q4';
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to calculate withdrawal breakdown
CREATE OR REPLACE FUNCTION calculate_withdrawal_breakdown(
  p_user_id UUID,
  p_requested_amount INTEGER
) RETURNS JSONB AS $$
DECLARE
  v_balance INTEGER;
  v_locked INTEGER;
  v_ytd_earnings INTEGER;
  v_tds_amount INTEGER := 0;
  v_platform_fee INTEGER;
  v_net_amount INTEGER;
  v_tier TEXT;
BEGIN
  -- Get current balance
  SELECT balance_inr, locked_amount_inr 
  INTO v_balance, v_locked
  FROM earnings_wallets
  WHERE user_id = p_user_id;
  
  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'Wallet not found';
  END IF;
  
  IF (v_balance - v_locked) < p_requested_amount THEN
    RAISE EXCEPTION 'Insufficient balance. Available: %', (v_balance - v_locked);
  END IF;
  
  -- Get YTD earnings
  SELECT COALESCE(SUM(total_earnings_inr), 0)
  INTO v_ytd_earnings
  FROM tds_records
  WHERE user_id = p_user_id
    AND financial_year = get_current_fy();
  
  -- Calculate TDS (10% if YTD + current > ₹30,000)
  IF (v_ytd_earnings + p_requested_amount) > 30000 THEN
    v_tds_amount := FLOOR(p_requested_amount * 0.10);
  END IF;
  
  -- Determine tier and platform fee
  IF p_requested_amount <= 10000 THEN
    v_tier := 'instant';
    v_platform_fee := 3 + FLOOR(p_requested_amount * 0.005);
  ELSIF p_requested_amount <= 100000 THEN
    v_tier := 'standard';
    v_platform_fee := 5;
  ELSE
    v_tier := 'manual';
    v_platform_fee := 10;
  END IF;
  
  v_net_amount := p_requested_amount - v_tds_amount - v_platform_fee;
  
  RETURN jsonb_build_object(
    'requested_amount', p_requested_amount,
    'tds_amount', v_tds_amount,
    'platform_fee', v_platform_fee,
    'net_amount', v_net_amount,
    'tier', v_tier,
    'available_balance', v_balance - v_locked
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Function to lock withdrawal amount
CREATE OR REPLACE FUNCTION lock_withdrawal_amount(
  p_user_id UUID,
  p_amount INTEGER
) RETURNS BOOLEAN AS $$
BEGIN
  UPDATE earnings_wallets
  SET locked_amount_inr = locked_amount_inr + p_amount
  WHERE user_id = p_user_id
    AND (balance_inr - locked_amount_inr) >= p_amount;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Function to process completed withdrawal
CREATE OR REPLACE FUNCTION process_completed_withdrawal(
  p_withdrawal_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_gross_amount INTEGER;
  v_tds_amount INTEGER;
  v_fy TEXT;
  v_quarter TEXT;
BEGIN
  -- Get withdrawal details
  SELECT user_id, gross_amount_inr, tds_amount_inr
  INTO v_user_id, v_gross_amount, v_tds_amount
  FROM withdrawal_requests
  WHERE id = p_withdrawal_id;
  
  -- Deduct from balance and unlock
  UPDATE earnings_wallets
  SET balance_inr = balance_inr - v_gross_amount,
      locked_amount_inr = locked_amount_inr - v_gross_amount
  WHERE user_id = v_user_id;
  
  -- Update TDS records
  v_fy := get_current_fy();
  v_quarter := get_current_quarter();
  
  INSERT INTO tds_records (user_id, financial_year, quarter, total_earnings_inr, total_tds_deducted_inr)
  VALUES (v_user_id, v_fy, v_quarter, v_gross_amount, v_tds_amount)
  ON CONFLICT (user_id, financial_year, quarter) 
  DO UPDATE SET
    total_earnings_inr = tds_records.total_earnings_inr + v_gross_amount,
    total_tds_deducted_inr = tds_records.total_tds_deducted_inr + v_tds_amount,
    updated_at = now();
  
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Function to unlock failed withdrawal
CREATE OR REPLACE FUNCTION unlock_failed_withdrawal(
  p_withdrawal_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_gross_amount INTEGER;
BEGIN
  SELECT user_id, gross_amount_inr
  INTO v_user_id, v_gross_amount
  FROM withdrawal_requests
  WHERE id = p_withdrawal_id;
  
  UPDATE earnings_wallets
  SET locked_amount_inr = locked_amount_inr - v_gross_amount
  WHERE user_id = v_user_id;
  
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;