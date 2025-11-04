import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createHmac } from 'https://deno.land/std@0.177.0/node/crypto.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-razorpay-signature',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const razorpaySecret = Deno.env.get('RAZORPAY_KEY_SECRET')!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify webhook signature
    const signature = req.headers.get('x-razorpay-signature');
    const body = await req.text();

    if (signature) {
      const expectedSignature = createHmac('sha256', razorpaySecret)
        .update(body)
        .digest('hex');

      if (signature !== expectedSignature) {
        console.error('Invalid webhook signature');
        throw new Error('Invalid signature');
      }
    }

    const event = JSON.parse(body);
    console.log('Razorpay payout webhook received:', event.event);

    const payoutId = event.payload?.payout?.entity?.id;
    const status = event.payload?.payout?.entity?.status;
    const referenceId = event.payload?.payout?.entity?.reference_id;

    if (!payoutId || !referenceId) {
      throw new Error('Missing payout details in webhook');
    }

    console.log('Processing payout:', { payoutId, status, referenceId });

    // Get withdrawal request
    const { data: withdrawal, error: fetchError } = await supabase
      .from('withdrawal_requests')
      .select('*')
      .eq('id', referenceId)
      .single();

    if (fetchError || !withdrawal) {
      console.error('Withdrawal not found:', referenceId);
      throw new Error('Withdrawal request not found');
    }

    // Handle different payout statuses
    if (status === 'processed') {
      // Update withdrawal status to completed
      await supabase
        .from('withdrawal_requests')
        .update({
          status: 'completed',
          processed_at: new Date().toISOString(),
        })
        .eq('id', withdrawal.id);

      // Deduct from balance and unlock
      const grossAmount = withdrawal.gross_amount_inr || withdrawal.amount_inr;
      await supabase.rpc('process_completed_withdrawal', {
        p_withdrawal_id: withdrawal.id,
      });

      console.log('Withdrawal completed:', withdrawal.id);

      // TODO: Send email notification to user
      // await sendEmailNotification(withdrawal.user_id, 'withdrawal_completed', {...});

    } else if (status === 'failed' || status === 'cancelled' || status === 'rejected') {
      console.log('Payout failed:', status);

      const failureReason = event.payload?.payout?.entity?.failure_reason || 'Unknown error';

      // Update withdrawal status to failed
      await supabase
        .from('withdrawal_requests')
        .update({
          status: 'failed',
          failed_reason: failureReason,
          processed_at: new Date().toISOString(),
        })
        .eq('id', withdrawal.id);

      // Unlock the amount back to wallet
      await supabase.rpc('unlock_failed_withdrawal', {
        p_withdrawal_id: withdrawal.id,
      });

      console.log('Amount unlocked for failed withdrawal:', withdrawal.id);

      // TODO: Send email notification to user
      // await sendEmailNotification(withdrawal.user_id, 'withdrawal_failed', {...});

    } else if (status === 'processing' || status === 'queued') {
      // Update status to processing
      await supabase
        .from('withdrawal_requests')
        .update({
          status: 'processing',
        })
        .eq('id', withdrawal.id);

      console.log('Withdrawal status updated to processing:', withdrawal.id);
    }

    return new Response(
      JSON.stringify({ success: true, event: event.event }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Webhook processing error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
