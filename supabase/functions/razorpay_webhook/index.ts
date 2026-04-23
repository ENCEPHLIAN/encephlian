import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { crypto } from "https://deno.land/std@0.190.0/crypto/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-razorpay-signature',
};

const PILOT_SUB_BONUS_TOKENS = 10;

/** First successful subscription charge → bonus tokens (idempotent by payment id). Matches verify_pilot_subscription. */
async function maybeCreditPilotSubscriptionFromWebhook(
  supabase: ReturnType<typeof createClient>,
  paymentId: string | undefined,
  subscriptionId: string | undefined,
  source: string,
) {
  if (!paymentId || !subscriptionId) {
    console.log(`${source}: pilot subscription skip — missing payment_id or subscription_id`);
    return;
  }

  const { data: subRow, error: subErr } = await supabase
    .from("pilot_subscriptions")
    .select("id, user_id, status")
    .eq("razorpay_subscription_id", subscriptionId)
    .maybeSingle();

  if (subErr || !subRow) {
    console.log(`${source}: no pilot_subscriptions for subscription ${subscriptionId}`);
    return;
  }

  const { data: existing } = await supabase
    .from("pilot_subscription_charges")
    .select("razorpay_payment_id")
    .eq("razorpay_payment_id", paymentId)
    .maybeSingle();

  if (existing) {
    console.log(`${source}: payment ${paymentId} already recorded (idempotent)`);
    return;
  }

  const { count, error: cntErr } = await supabase
    .from("pilot_subscription_charges")
    .select("razorpay_payment_id", { count: "exact", head: true })
    .eq("razorpay_subscription_id", subscriptionId);

  if (cntErr) {
    console.error(`${source}: count pilot_subscription_charges failed`, cntErr);
    return;
  }

  const priorCharges = count ?? 0;
  if (priorCharges > 0) {
    console.log(
      `${source}: subscription ${subscriptionId} already had a credited charge — renewal, no bonus`,
    );
    return;
  }

  const { error: insErr } = await supabase.from("pilot_subscription_charges").insert({
    razorpay_payment_id: paymentId,
    user_id: subRow.user_id,
    razorpay_subscription_id: subscriptionId,
    tokens_credited: PILOT_SUB_BONUS_TOKENS,
  });

  if (insErr) {
    console.error(`${source}: insert pilot_subscription_charges`, insErr);
    return;
  }

  const { error: credErr } = await supabase.rpc("credit_wallet", {
    p_user_id: subRow.user_id,
    p_tokens: PILOT_SUB_BONUS_TOKENS,
    p_reason: `Pilot plan · webhook ${source} · ${paymentId}`,
  });

  if (credErr) {
    console.error(`${source}: credit_wallet failed`, credErr);
    throw credErr;
  }

  await supabase
    .from("pilot_subscriptions")
    .update({ status: "active", updated_at: new Date().toISOString() })
    .eq("id", subRow.id);

  console.log(
    `${source}: pilot subscription first charge — credited ${PILOT_SUB_BONUS_TOKENS} tokens to ${subRow.user_id}`,
  );
}

function extractSubscriptionPaymentIds(
  eventName: string,
  payload: Record<string, unknown>,
): { subscriptionId?: string; paymentId?: string } {
  const p = payload as Record<string, Record<string, Record<string, string>>>;
  if (eventName === "subscription.charged" || eventName === "subscription.authenticated") {
    const pay = p?.payment?.entity;
    const sub = p?.subscription?.entity;
    return { subscriptionId: sub?.id, paymentId: pay?.id };
  }
  if (eventName === "invoice.paid") {
    const inv = p?.invoice?.entity;
    return { subscriptionId: inv?.subscription_id, paymentId: inv?.payment_id };
  }
  return {};
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    // Prefer a dedicated webhook secret (Razorpay Dashboard → Webhooks → Secret).
    // Fall back to the API key-secret for backwards compatibility with older deployments.
    const webhookSecret =
      Deno.env.get('RAZORPAY_WEBHOOK_SECRET') ||
      Deno.env.get('RAZORPAY_KEY_SECRET')!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    const signature = req.headers.get('x-razorpay-signature');
    const body = await req.text();

    console.log('Received webhook signature:', signature?.substring(0, 10) + '...');
    console.log('Body length:', body.length);

    // Verify webhook signature using HMAC SHA256
    const encoder = new TextEncoder();
    const keyData = encoder.encode(webhookSecret);
    const key = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signatureBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
    const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    console.log('Expected signature:', expectedSignature.substring(0, 10) + '...');

    const sigNorm = (signature || '').trim().toLowerCase();
    const expNorm = expectedSignature.trim().toLowerCase();
    if (!sigNorm || sigNorm.length !== expNorm.length || sigNorm !== expNorm) {
      console.error('Signature mismatch!');
      console.error('Received:', signature?.substring(0, 20));
      console.error('Expected:', expectedSignature.substring(0, 20));
      throw new Error('Invalid signature');
    }

    console.log('Signature verified successfully ✅');

    const event = JSON.parse(body);
    const eventName: string = event.event || "unknown";
    console.log(
      `Webhook event: ${eventName}`,
      `payment: ${event.payload?.payment?.entity?.id ?? "-"}`,
      `order: ${event.payload?.order?.entity?.id ?? event.payload?.payment?.entity?.order_id ?? "-"}`,
    );

    // ── Handlers ──────────────────────────────────────────────────────────
    // We acknowledge every event (200 OK) so Razorpay does not retry.
    // Only events that mutate wallet/payment state do DB work; everything
    // else is logged for ops visibility.

    if (eventName === "payment.captured" || eventName === "order.paid") {
      // order.paid fires after the capture is booked; treated identically
      // to payment.captured for safety-net reconciliation.
      const entity =
        eventName === "payment.captured"
          ? event.payload.payment.entity
          : event.payload.payment?.entity ?? {};
      const orderId = entity.order_id;
      const paymentId = entity.id;

      if (!orderId) {
        console.error(`${eventName}: missing order_id in payload`);
      } else {
        const { data: paymentRecord, error: fetchError } = await supabase
          .from("payments")
          .select("*")
          .eq("order_id", orderId)
          .single();

        if (fetchError || !paymentRecord) {
          console.error(`${eventName}: payment record not found for order ${orderId}`, fetchError);
        } else if (paymentRecord.status === "completed") {
          // Already credited (by verify_payment or an earlier webhook delivery).
          // This is the common case: Razorpay delivers webhooks even after the
          // frontend-triggered verify_payment has already credited the wallet.
          console.log(`${eventName}: order ${orderId} already completed, skipping (idempotent)`);
        } else if (paymentRecord.status === "refunded") {
          console.log(`${eventName}: order ${orderId} already refunded, skipping`);
        } else {
          const { error: updateError } = await supabase
            .from("payments")
            .update({
              payment_id: paymentId,
              status: "completed",
              signature_valid: true,
            })
            .eq("order_id", orderId)
            .eq("status", "created"); // only flip from created → completed

          if (updateError) {
            console.error(`${eventName}: failed to update payment ${orderId}:`, updateError);
            throw updateError;
          }

          const { error: creditError } = await supabase.rpc("credit_wallet", {
            p_user_id: paymentRecord.user_id,
            p_tokens: paymentRecord.credits_purchased,
            p_reason: `razorpay webhook · ${eventName} · order ${orderId}`,
          });

          if (creditError) {
            console.error(`${eventName}: failed to credit wallet for ${orderId}:`, creditError);
            throw creditError;
          }

          console.log(
            `${eventName}: credited ${paymentRecord.credits_purchased} tokens to user ${paymentRecord.user_id} (order ${orderId})`,
          );
        }
      }
    } else if (eventName === "payment.failed") {
      const entity = event.payload.payment.entity;
      const orderId = entity.order_id;

      const { error: updateError } = await supabase
        .from("payments")
        .update({
          payment_id: entity.id,
          status: "failed",
          signature_valid: false,
        })
        .eq("order_id", orderId)
        .in("status", ["created", "attempted"]);

      if (updateError) {
        console.error(`payment.failed: failed to update ${orderId}:`, updateError);
      } else {
        console.log(`payment.failed: marked order ${orderId} as failed`);
      }
    } else if (
      eventName === "refund.created" ||
      eventName === "refund.processed" ||
      eventName === "refund.failed"
    ) {
      // A refund happened at Razorpay (merchant-initiated or dispute outcome).
      // We flag the payment row so Ops can reconcile. We do NOT auto-debit the
      // user's token wallet here — tokens may already have been consumed to
      // sign reports; the business decision on clawback is human-driven via
      // the admin wallet page.
      const entity = event.payload.refund?.entity ?? {};
      const paymentId = entity.payment_id;
      const refundId = entity.id;
      const refundStatus = entity.status ?? "created";

      if (paymentId) {
        const newStatus = eventName === "refund.failed" ? "refund_failed" : "refunded";
        const { error: updErr } = await supabase
          .from("payments")
          .update({ status: newStatus })
          .eq("payment_id", paymentId);

        if (updErr) {
          console.error(`${eventName}: failed to mark payment ${paymentId} as ${newStatus}:`, updErr);
        } else {
          console.log(
            `${eventName}: marked payment ${paymentId} as ${newStatus} (refund_id=${refundId}, status=${refundStatus}) — ops must decide on token clawback`,
          );
        }
      } else {
        console.warn(`${eventName}: refund payload missing payment_id; skipping`);
      }
    } else if (
      eventName === "subscription.charged" ||
      eventName === "subscription.authenticated" ||
      eventName === "invoice.paid"
    ) {
      const { subscriptionId, paymentId } = extractSubscriptionPaymentIds(
        eventName,
        (event.payload || {}) as Record<string, unknown>,
      );
      await maybeCreditPilotSubscriptionFromWebhook(supabase, paymentId, subscriptionId, eventName);
    } else if (
      eventName.startsWith("payment.dispute.") ||
      eventName.startsWith("payment.downtime.")
    ) {
      // Disputes and downtime windows: log-only. A pilot at 140 reports/month
      // does not justify a dispute pipeline yet; Ops sees these via Supabase
      // function logs + Razorpay dashboard.
      console.warn(`${eventName}: logged for ops (no automatic handling)`, {
        payment_id: event.payload?.payment?.entity?.id,
        dispute_id: event.payload?.dispute?.entity?.id,
        downtime_id: event.payload?.downtime?.entity?.id,
      });
    } else {
      // order.notification.*, invoice.*, settlement.*, fund_account.*, payout.*,
      // account.*, payment_link.* → acknowledged but not actioned.
      console.log(`${eventName}: acknowledged, no handler`);
    }

    return new Response(
      JSON.stringify({ received: true, event: eventName }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in razorpay_webhook:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
