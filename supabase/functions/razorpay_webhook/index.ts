import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { crypto } from "https://deno.land/std@0.190.0/crypto/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-razorpay-signature',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const razorpayKeySecret = Deno.env.get('RAZORPAY_KEY_SECRET')!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    const signature = req.headers.get('x-razorpay-signature');
    const body = await req.text();

    console.log('Received webhook signature:', signature?.substring(0, 10) + '...');
    console.log('Body length:', body.length);

    // Verify webhook signature using HMAC SHA256
    const encoder = new TextEncoder();
    const keyData = encoder.encode(razorpayKeySecret);
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

    if (signature !== expectedSignature) {
      console.error('Signature mismatch!');
      console.error('Received:', signature?.substring(0, 20));
      console.error('Expected:', expectedSignature.substring(0, 20));
      throw new Error('Invalid signature');
    }

    console.log('Signature verified successfully ✅');

    const event = JSON.parse(body);
    console.log('Webhook event:', event.event, 'for payment:', event.payload?.payment?.entity?.id);

    // Handle payment.captured event
    if (event.event === 'payment.captured') {
      const payment = event.payload.payment.entity;
      const orderId = payment.order_id;
      const paymentId = payment.id;

      console.log(`Processing payment ${paymentId} for order ${orderId}`);

      // Get payment record
      const { data: paymentRecord, error: fetchError } = await supabase
        .from('payments')
        .select('*')
        .eq('order_id', orderId)
        .single();

      if (fetchError || !paymentRecord) {
        console.error('Payment record not found:', fetchError);
        throw new Error('Payment record not found');
      }

      // Update payment status
      const { error: updateError } = await supabase
        .from('payments')
        .update({
          payment_id: paymentId,
          status: 'completed',
          signature_valid: true,
        })
        .eq('order_id', orderId);

      if (updateError) {
        console.error('Failed to update payment:', updateError);
        throw updateError;
      }

      // Credit the user's wallet
      const { error: creditError } = await supabase.rpc('credit_wallet', {
        p_user_id: paymentRecord.user_id,
        p_credits: paymentRecord.credits_purchased,
      });

      if (creditError) {
        console.error('Failed to credit wallet:', creditError);
        throw creditError;
      }

      console.log(`Credited ${paymentRecord.credits_purchased} credits to user ${paymentRecord.user_id}`);
    } else if (event.event === 'payment.failed') {
      const payment = event.payload.payment.entity;
      const orderId = payment.order_id;

      console.log(`Payment failed for order ${orderId}`);

      // Update payment status to failed
      const { error: updateError } = await supabase
        .from('payments')
        .update({
          payment_id: payment.id,
          status: 'failed',
          signature_valid: false,
        })
        .eq('order_id', orderId);

      if (updateError) {
        console.error('Failed to update payment status:', updateError);
      }
    }

    return new Response(
      JSON.stringify({ received: true }),
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
