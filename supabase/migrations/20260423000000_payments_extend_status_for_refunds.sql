-- =============================================================================
-- Extend payments.status to allow refund lifecycle values
--
-- Motivation:
--   razorpay_webhook now handles refund.created / refund.processed /
--   refund.failed events and marks the payments row accordingly. The existing
--   CHECK constraint only allowed ('created','paid','failed','completed') and
--   would reject the new values.
--
--   We intentionally do NOT auto-claw-back tokens from the user's wallet on
--   refund — that is a human decision handled via the admin wallet page. This
--   migration only widens the allowed status values; it does not touch data.
--
-- Safety:
--   * Backwards-compatible: all existing rows retain their current status.
--   * The previous constraint name is dropped if present.
--   * 'attempted' is added so payment.failed can distinguish a user who
--     opened the modal but never completed vs. one whose card actually failed.
-- =============================================================================

ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_status_check;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_status_check
  CHECK (status IN (
    'created',
    'attempted',
    'paid',
    'completed',
    'failed',
    'refunded',
    'refund_failed'
  ));

COMMENT ON COLUMN public.payments.status IS
  'Razorpay payment lifecycle. Transitions: created → (attempted) → completed | failed → (refunded | refund_failed). Driven by verify_payment (synchronous) and razorpay_webhook (async). Only Ops changes status manually via admin page.';
