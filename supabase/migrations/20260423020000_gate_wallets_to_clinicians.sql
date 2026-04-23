-- =============================================================================
-- 20260423020000_gate_wallets_to_clinicians.sql
--
-- INVARIANT: only clinician-class roles (neurologist, clinician, clinic_admin)
-- transact in tokens. super_admin and management MUST NOT have a wallet row,
-- cannot be credited/debited, and never show a numeric balance in the UI.
--
-- Why: tokens are a billable unit tied to clinical report signing. Admin
-- roles don't sign reports; giving them a wallet muddies the P&L, the
-- "users with tokens" KPI, and the wallet audit trail. Several grants /
-- compliance reviewers also ask "does ops have a shortcut to spend?" — the
-- cleanest answer is "the schema forbids it".
--
-- This migration:
--   1. Purges existing wallets / transactions / earnings_wallets rows for
--      admin-role users (all currently 0 tokens, verified before shipping).
--   2. Adds a BEFORE INSERT/UPDATE trigger on wallets that raises if the
--      user_id resolves to a super_admin or management role.
--   3. Adds an AFTER INSERT trigger on user_roles that cleans up any wallet
--      rows created for a user who is subsequently promoted to an admin
--      role. (handle_new_user runs before user_roles is populated, so we
--      can't stop the initial wallet insert there without risk.)
--   4. Hardens ensure_wallets() to skip admin-role users pre-emptively,
--      in case roles are assigned in the same transaction as the profile.
--   5. Hardens credit_wallet / debit_wallet / admin_adjust_tokens with an
--      explicit role guard so a misbehaving edge function can't re-create
--      a wallet row via INSERT ... ON CONFLICT.
--
-- Safe to re-run: all triggers/functions are CREATE OR REPLACE and the
-- cleanup is idempotent (rows already gone => DELETE is a no-op).
-- =============================================================================

-- ── 1. Purge existing admin wallets / transactions / earnings ──────────────
WITH admin_users AS (
  SELECT DISTINCT user_id
  FROM user_roles
  WHERE role IN ('super_admin', 'management')
)
DELETE FROM wallet_transactions
WHERE user_id IN (SELECT user_id FROM admin_users);

WITH admin_users AS (
  SELECT DISTINCT user_id
  FROM user_roles
  WHERE role IN ('super_admin', 'management')
)
DELETE FROM wallets
WHERE user_id IN (SELECT user_id FROM admin_users);

-- earnings_wallets is a separate table for clinician payout accrual; admins
-- shouldn't have those either.
DO $$
BEGIN
  IF to_regclass('public.earnings_wallets') IS NOT NULL THEN
    EXECUTE $del$
      WITH admin_users AS (
        SELECT DISTINCT user_id
        FROM user_roles
        WHERE role IN ('super_admin', 'management')
      )
      DELETE FROM earnings_wallets
      WHERE user_id IN (SELECT user_id FROM admin_users)
    $del$;
  END IF;
END $$;


-- ── 2. Helper: is this user an admin-class role ────────────────────────────
CREATE OR REPLACE FUNCTION public._user_is_admin_role(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = p_user_id
      AND role IN ('super_admin', 'management')
  );
$$;

COMMENT ON FUNCTION public._user_is_admin_role(uuid)
IS 'Internal guard used by wallet triggers; returns TRUE for super_admin '
   'or management. Not exposed via REST.';

REVOKE EXECUTE ON FUNCTION public._user_is_admin_role(uuid)
  FROM PUBLIC, anon, authenticated;


-- ── 3. Block wallet INSERT/UPDATE for admin-role users ─────────────────────
CREATE OR REPLACE FUNCTION public.trg_wallets_block_admin_roles()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public._user_is_admin_role(NEW.user_id) THEN
    RAISE EXCEPTION
      'wallets are clinician-only (user % has super_admin/management role)',
      NEW.user_id
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS wallets_block_admin_roles ON public.wallets;
CREATE TRIGGER wallets_block_admin_roles
BEFORE INSERT OR UPDATE ON public.wallets
FOR EACH ROW EXECUTE FUNCTION public.trg_wallets_block_admin_roles();


-- ── 4. Clean up if a user is promoted to an admin role later ───────────────
CREATE OR REPLACE FUNCTION public.trg_user_roles_drop_wallet_on_promote()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IN ('super_admin', 'management') THEN
    -- wallet_transactions FK cascades via ... no, it doesn't. So delete
    -- ledger rows first to avoid FK violations if they ever get added.
    DELETE FROM wallet_transactions WHERE user_id = NEW.user_id;
    DELETE FROM wallets WHERE user_id = NEW.user_id;
    IF to_regclass('public.earnings_wallets') IS NOT NULL THEN
      EXECUTE format('DELETE FROM earnings_wallets WHERE user_id = %L', NEW.user_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_roles_drop_wallet_on_promote ON public.user_roles;
CREATE TRIGGER user_roles_drop_wallet_on_promote
AFTER INSERT OR UPDATE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.trg_user_roles_drop_wallet_on_promote();


-- ── 5. Make ensure_wallets role-aware ──────────────────────────────────────
-- This trigger fires on profile insert. At that moment user_roles may or
-- may not be populated. If admin role is already present we skip; otherwise
-- we create the wallet and rely on the promote trigger above to clean up
-- later if they're promoted.
CREATE OR REPLACE FUNCTION public.ensure_wallets()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public._user_is_admin_role(NEW.id) THEN
    RETURN NEW;
  END IF;

  INSERT INTO wallets(user_id, tokens)
  VALUES (NEW.id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  IF to_regclass('public.earnings_wallets') IS NOT NULL THEN
    INSERT INTO earnings_wallets(user_id, balance_inr, total_earned_inr)
    VALUES (NEW.id, 0, 0)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;


-- ── 6. Harden credit_wallet to refuse admin users explicitly ───────────────
-- (Defense in depth — the wallets trigger would catch it, but an explicit
-- error message here is much clearer in edge-function logs.)
CREATE OR REPLACE FUNCTION public.credit_wallet(
  p_user_id uuid,
  p_tokens  integer,
  p_reason  text DEFAULT 'wallet top-up'
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
  IF p_tokens IS NULL OR p_tokens < 0 THEN
    RAISE EXCEPTION 'credit_wallet: p_tokens must be >= 0, got %', p_tokens;
  END IF;

  IF public._user_is_admin_role(p_user_id) THEN
    RAISE EXCEPTION
      'credit_wallet: refusing to credit admin-role user %', p_user_id
      USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(w.tokens, 0) INTO v_before
  FROM wallets w WHERE w.user_id = p_user_id;
  IF v_before IS NULL THEN v_before := 0; END IF;

  INSERT INTO wallets (user_id, tokens, updated_at)
  VALUES (p_user_id, p_tokens, now())
  ON CONFLICT (user_id) DO UPDATE
    SET tokens     = wallets.tokens + p_tokens,
        updated_at = now()
  RETURNING wallets.tokens INTO v_after;

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


-- ── 7. Same guard on debit_wallet (for symmetry / future-proofing) ─────────
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

  IF public._user_is_admin_role(p_user_id) THEN
    RAISE EXCEPTION
      'debit_wallet: admin-role user % has no wallet', p_user_id
      USING ERRCODE = 'P0001';
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


-- ── 8. Block admin_adjust_tokens on admin-role users ───────────────────────
-- We leave the function signature alone so the frontend doesn't need any
-- change, just refuse early.
DO $$
DECLARE
  v_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'admin_adjust_tokens'
      AND pronamespace = 'public'::regnamespace
  ) INTO v_exists;

  IF v_exists THEN
    -- Rewrite with the extra guard in place. Preserves existing behaviour
    -- for clinicians.
    EXECUTE $ddl$
      CREATE OR REPLACE FUNCTION public.admin_adjust_tokens(
        p_user_id uuid, p_amount integer, p_operation text
      )
      RETURNS jsonb
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $fn$
      DECLARE
        v_caller_id    uuid;
        v_old_balance  integer;
        v_new_balance  integer;
      BEGIN
        v_caller_id := auth.uid();

        IF NOT (
          has_role(v_caller_id, 'super_admin'::app_role)
          OR has_role(v_caller_id, 'management'::app_role)
        ) THEN
          RAISE EXCEPTION 'Forbidden: Admin access required';
        END IF;

        IF public._user_is_admin_role(p_user_id) THEN
          RAISE EXCEPTION
            'admin_adjust_tokens: target % has super_admin/management role — wallets are clinician-only',
            p_user_id
            USING ERRCODE = 'P0001';
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

        UPDATE wallets
           SET tokens = v_new_balance, updated_at = now()
         WHERE user_id = p_user_id;

        INSERT INTO wallet_transactions (
          user_id, amount, operation, balance_before, balance_after,
          performed_by, reason
        )
        VALUES (
          p_user_id, p_amount, p_operation, v_old_balance, v_new_balance,
          v_caller_id, 'Admin adjustment'
        );

        INSERT INTO audit_logs (user_id, event_type, event_data)
        VALUES (
          v_caller_id, 'tokens_adjusted',
          jsonb_build_object(
            'target_user', p_user_id,
            'operation',   p_operation,
            'amount',      p_amount,
            'old_balance', v_old_balance,
            'new_balance', v_new_balance
          )
        );

        RETURN jsonb_build_object(
          'success', true,
          'old_balance', v_old_balance,
          'new_balance', v_new_balance
        );
      END;
      $fn$;
    $ddl$;
  END IF;
END $$;
