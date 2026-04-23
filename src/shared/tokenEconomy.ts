/**
 * Central token & INR economics for E-plane.
 * Must stay aligned with `supabase/functions/create_order/index.ts` PRICING.
 */

export const TOKEN_TOPUP_PACKAGES = [
  { tokens: 10, priceInr: 1500, popular: false },
  { tokens: 25, priceInr: 3499, popular: true },
  { tokens: 50, priceInr: 6499, popular: false },
  { tokens: 100, priceInr: 11999, popular: false },
] as const;

/** Razorpay product id for pilot clinic access (subscription-style one-time bill). */
export const PILOT_ACCESS_PRODUCT_ID = "pilot_access" as const;

/** Pilot: platform access fee + bonus tokens (invoice via Razorpay + receipt email). */
export const PILOT_ACCESS_SUBSCRIPTION = {
  productId: PILOT_ACCESS_PRODUCT_ID,
  amountInr: 3000,
  bonusTokens: 10,
  title: "Pilot access",
  subtitle: "One-time subscription checkout · Razorpay invoice",
  bullets: [
    "Covers pilot clinic access to the triage workflow",
    "10 bonus tokens credited to this wallet immediately",
    "Use tokens for Standard (1) or Priority (2) triage per study",
  ],
} as const;

/** Tokens charged when SLA is selected (`select_sla_and_start_triage`) — not on sign. */
export function triageTokensForSla(sla: string | null | undefined): number {
  if (!sla) return 1;
  return sla.toUpperCase() === "STAT" ? 2 : 1;
}

export function studyTriageIsPaid(row: {
  tokens_deducted?: number | null;
  sla_selected_at?: string | null;
}): boolean {
  return (row.tokens_deducted ?? 0) > 0 || !!row.sla_selected_at;
}
