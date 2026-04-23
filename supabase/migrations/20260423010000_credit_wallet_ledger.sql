-- =============================================================================
-- 20260423010000_credit_wallet_ledger.sql
--
-- BUG: credit_wallet() updated wallets.tokens but never wrote a
-- wallet_transactions row. Result: every token top-up (Razorpay purchase,
-- admin grant via credit_wallet) silently skipped the ledger, which made
-- the "Recent Activity" widget on /app/wallet only ever show deductions.
-- From the clinic's perspective their top-up vanished — which is exactly
-- why the internal SKU wallet "felt dead" end-to-end.
--
-- FIX: rewrite credit_wallet so it
--   1. upserts the wallet row,
--   2. re-reads the pre/post balance, and
--   3. inserts a 'add' transaction row with a caller-supplied reason.
-- Also add a symmetric debit_wallet() for future SLA / report flows that
-- currently hand-roll their own wallet_transactions inserts.
--
-- Backwards compatible: existing callers that pass only (p_user_id, p_tokens)
-- still work; the reason column just defaults to NULL (we fill in
-- 'manual credit' so the audit trail is never empty).
-- =============================================================================

-- Drop previous 2-arg signature so we can extend cleanly.
DROP FUNCTION IF EXISTS public.credit_wallet(uuid, integer);

CREATE OR REPLACE FUNCTION public.credit_wallet(
  p_user_id uuid,
  p_tokens  integer,
  p_reason  text DEFAULT 'wallet top-up'
)
RETURNS integer  -- returns new balance so callers don't need a second SELECT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before integer := 0;
  v_after  integer := 0;
BEGIN
  IF p_tokens IS NULL OR p_tokens < 0 THEN
    RAISE EXCEPTION 'credit_wallet: p_tokens must be >= 0, got %', p_tokens;
  END IF;

  -- Current balance (0 if wallet row doesn't exist yet).
  SELECT COALESCE(w.tokens, 0)
    INTO v_before
  FROM wallets w
  WHERE w.user_id = p_user_id;

  IF v_before IS NULL THEN
    v_before := 0;
  END IF;

  INSERT INTO wallets (user_id, tokens, updated_at)
  VALUES (p_user_id, p_tokens, now())
  ON CONFLICT (user_id) DO UPDATE
    SET tokens     = wallets.tokens + p_tokens,
        updated_at = now()
  RETURNING wallets.tokens INTO v_after;

  -- Only write a ledger row when there's actual movement.
  IF p_tokens > 0 THEN
    INSERT INTO wallet_transactions (
      user_id, amount, operation, balance_before, balance_after,
      reason, performed_by
    )
    VALUES (
      p_user_id, p_tokens, 'add', v_before, v_after,
      p_reason, auth.uid()
    );
  END IF;

  RETURN v_after;
END;
$$;

COMMENT ON FUNCTION public.credit_wallet(uuid, integer, text)
IS 'Atomically credits tokens to a wallet AND writes a matching '
   'wallet_transactions row. Safe to call from edge functions with '
   'service-role (auth.uid() is NULL there; performed_by will be NULL).';


-- Symmetric debit helper, used by any future SLA/billing path that wants
-- a single atomic call instead of the 2-step pattern that's open-coded
-- in consume_credit_and_sign et al.
CREATE OR REPLACE FUNCTION public.debit_wallet(
  p_user_id uuid,
  p_tokens  integer,
  p_reason  text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before integer := 0;
  v_after  integer := 0;
BEGIN
  IF p_tokens IS NULL OR p_tokens <= 0 THEN
    RAISE EXCEPTION 'debit_wallet: p_tokens must be > 0, got %', p_tokens;
  END IF;

  SELECT tokens INTO v_before FROM wallets WHERE user_id = p_user_id FOR UPDATE;

  IF v_before IS NULL THEN
    RAISE EXCEPTION 'debit_wallet: no wallet for user %', p_user_id;
  END IF;

  IF v_before < p_tokens THEN
    RAISE EXCEPTION 'debit_wallet: insufficient balance (have %, need %)',
      v_before, p_tokens
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE wallets
     SET tokens     = tokens - p_tokens,
         updated_at = now()
   WHERE user_id = p_user_id
   RETURNING tokens INTO v_after;

  INSERT INTO wallet_transactions (
    user_id, amount, operation, balance_before, balance_after,
    reason, performed_by
  )
  VALUES (
    p_user_id, p_tokens, 'deduct', v_before, v_after,
    p_reason, auth.uid()
  );

  RETURN v_after;
END;
$$;

COMMENT ON FUNCTION public.debit_wallet(uuid, integer, text)
IS 'Atomically debits tokens and writes a ledger row. Raises P0001 '
   'on insufficient balance.';

-- Grant execute to authenticated so clinicians can call debit_wallet via
-- RPC for in-app SLA selections if we ever move that logic server-side.
-- credit_wallet stays service-role only (no REST exposure) because token
-- minting must go through create_order + verify_payment.
GRANT EXECUTE ON FUNCTION public.debit_wallet(uuid, integer, text)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.credit_wallet(uuid, integer, text)
  FROM PUBLIC, anon, authenticated;
