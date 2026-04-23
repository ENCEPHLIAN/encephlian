-- Pilot recurring access (Razorpay Subscriptions). Rows created by edge; users read own.

CREATE TABLE IF NOT EXISTS public.pilot_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'authenticated', 'active', 'halted', 'cancelled', 'completed', 'charged')),
  razorpay_subscription_id text UNIQUE,
  razorpay_plan_id text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pilot_subscriptions_user ON public.pilot_subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_pilot_subscriptions_razorpay ON public.pilot_subscriptions (razorpay_subscription_id);

ALTER TABLE public.pilot_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pilot_subscriptions_select_own" ON public.pilot_subscriptions;
CREATE POLICY "pilot_subscriptions_select_own"
  ON public.pilot_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.pilot_subscriptions IS 'Pilot clinic recurring billing; edge functions insert/update with service role.';

-- Idempotency for subscription invoice → token credit (one row per Razorpay payment id)
CREATE TABLE IF NOT EXISTS public.pilot_subscription_charges (
  razorpay_payment_id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  razorpay_subscription_id text NOT NULL,
  tokens_credited integer NOT NULL DEFAULT 10,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pilot_subscription_charges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pilot_subscription_charges_select_own" ON public.pilot_subscription_charges;
CREATE POLICY "pilot_subscription_charges_select_own"
  ON public.pilot_subscription_charges FOR SELECT
  USING (auth.uid() = user_id);
