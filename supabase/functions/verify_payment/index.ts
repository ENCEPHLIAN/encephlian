import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    // Authenticate user
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, tokens } = await req.json();

    console.log('Verifying payment:', { order_id: razorpay_order_id, payment_id: razorpay_payment_id });

    // Verify Razorpay signature
    const generatedSignature = await generateSignature(
      `${razorpay_order_id}|${razorpay_payment_id}`,
      razorpayKeySecret
    );

    if (generatedSignature !== razorpay_signature) {
      console.error('Signature verification failed');
      throw new Error('Invalid payment signature');
    }

    console.log('Signature verified successfully ✅');

    // Fetch payment record
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .select('*')
      .eq('order_id', razorpay_order_id)
      .single();

    if (paymentError || !payment) {
      console.error('Payment not found:', paymentError);
      throw new Error('Payment record not found');
    }

    // Check if already processed
    if (payment.status === 'completed') {
      console.log('Payment already processed, skipping');
      return new Response(
        JSON.stringify({ success: true, message: 'Payment already processed' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update payment record
    const { error: updateError } = await supabase
      .from('payments')
      .update({
        payment_id: razorpay_payment_id,
        status: 'completed',
        signature_valid: true,
      })
      .eq('order_id', razorpay_order_id);

    if (updateError) {
      console.error('Failed to update payment:', updateError);
      throw updateError;
    }

    console.log('Payment record updated to completed');

    // Credit wallet (also writes a wallet_transactions row via the DB
    // function — see 20260423010000_credit_wallet_ledger.sql).
    const { error: creditError } = await supabase.rpc('credit_wallet', {
      p_user_id: user.id,
      p_tokens: payment.credits_purchased,
      p_reason: `razorpay top-up · order ${razorpay_order_id}`,
    });

    if (creditError) {
      console.error('Failed to credit wallet:', creditError);
      throw creditError;
    }

    console.log(`Credited ${payment.credits_purchased} tokens to user wallet`);

    // Fetch updated wallet balance
    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .select('tokens')
      .eq('user_id', user.id)
      .single();

    if (walletError) {
      console.error('Failed to fetch wallet:', walletError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        tokens_credited: payment.credits_purchased,
        new_balance: wallet?.tokens || 0,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in verify_payment:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

async function generateSignature(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const messageData = encoder.encode(message);
  const signature = await crypto.subtle.sign('HMAC', key, messageData);
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
