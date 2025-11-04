import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Mock mode for testing without real Razorpay
const MOCK_MODE = Deno.env.get('RAZORPAY_MOCK_MODE') === 'true';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const { 
      amount_inr, 
      bank_account_id, 
      account_number, 
      ifsc, 
      account_holder_name,
      bank_name 
    } = await req.json();

    console.log('Initiating withdrawal:', { user_id: user.id, amount_inr, mock_mode: MOCK_MODE });

    // Validate minimum withdrawal
    if (amount_inr < 100) {
      throw new Error('Minimum withdrawal amount is ₹100');
    }

    // Simple SaaS fee calculation
    let tier = 'instant';
    let platformFee = 3;
    
    if (amount_inr <= 10000) {
      tier = 'instant';
      platformFee = 3 + Math.floor(amount_inr * 0.005);
    } else if (amount_inr <= 100000) {
      tier = 'standard';
      platformFee = 5;
    } else {
      tier = 'manual';
      platformFee = 10;
    }
    
    const netAmount = amount_inr - platformFee;
    const breakdown = {
      requested_amount: amount_inr,
      platform_fee: platformFee,
      net_amount: netAmount,
      tier: tier,
    };

    console.log('Breakdown calculated:', breakdown);

    // Lock the amount
    const { data: locked, error: lockError } = await supabase.rpc('lock_withdrawal_amount', {
      p_user_id: user.id,
      p_amount: amount_inr
    });

    if (lockError || !locked) {
      throw new Error('Failed to lock withdrawal amount. Insufficient balance.');
    }

    // Create withdrawal request
    const { data: withdrawal, error: withdrawalError } = await supabase
      .from('withdrawal_requests')
      .insert({
        user_id: user.id,
        amount_inr: amount_inr,
        gross_amount_inr: amount_inr,
        platform_fee_inr: breakdown.platform_fee,
        tds_amount_inr: 0,
        net_amount_inr: breakdown.net_amount,
        bank_account_number: account_number || '',
        bank_ifsc: ifsc || '',
        bank_account_holder: account_holder_name || '',
        bank_name: bank_name || '',
        tier: breakdown.tier,
        tds_deducted: false,
      })
      .select()
      .single();

    if (withdrawalError) {
      // Unlock amount on error
      await supabase.rpc('unlock_failed_withdrawal', { p_withdrawal_id: '' });
      throw withdrawalError;
    }

    console.log('Withdrawal request created:', withdrawal.id);

    // For instant and standard tiers, initiate payout
    if (breakdown.tier === 'instant' || breakdown.tier === 'standard') {
      if (MOCK_MODE) {
        // Mock payout for testing
        const mockPayoutId = `payout_mock_${Date.now()}`;
        console.log('MOCK MODE: Simulating payout', mockPayoutId);
        
        // Update withdrawal with mock payout ID
        await supabase
          .from('withdrawal_requests')
          .update({
            razorpay_payout_id: mockPayoutId,
            status: 'processing'
          })
          .eq('id', withdrawal.id);

        // Simulate webhook callback after 3 seconds
        setTimeout(async () => {
          console.log('MOCK MODE: Simulating webhook callback for', mockPayoutId);
          
          try {
            await fetch(`${supabaseUrl}/functions/v1/razorpay_payout_webhook`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-razorpay-signature': 'mock-signature'
              },
              body: JSON.stringify({
                event: 'payout.processed',
                payload: {
                  payout: {
                    entity: {
                      id: mockPayoutId,
                      status: 'processed',
                      reference_id: withdrawal.id
                    }
                  }
                }
              })
            });
          } catch (err) {
            console.error('Mock webhook callback failed:', err);
          }
        }, 3000);

        return new Response(
          JSON.stringify({
            success: true,
            withdrawal_id: withdrawal.id,
            razorpay_payout_id: mockPayoutId,
            status: 'processing',
            breakdown: breakdown,
            mock_mode: true,
            message: `[MOCK] Withdrawal initiated. Simulating ${breakdown.tier} payout.`,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else {
        // Real Razorpay payout
        const razorpayKeyId = Deno.env.get('RAZORPAY_KEY_ID')!;
        const razorpaySecret = Deno.env.get('RAZORPAY_KEY_SECRET')!;

        const mode = breakdown.tier === 'instant' ? 'IMPS' : 'NEFT';
        
        const payoutPayload = {
          account_number: Deno.env.get('RAZORPAY_ACCOUNT_NUMBER') || '1234567890',
          fund_account: {
            account_type: 'bank_account',
            bank_account: {
              name: account_holder_name,
              ifsc: ifsc,
              account_number: account_number,
            },
          },
          amount: breakdown.net_amount * 100, // Razorpay expects paise
          currency: 'INR',
          mode: mode,
          purpose: 'payout',
          queue_if_low_balance: true,
          reference_id: withdrawal.id,
          narration: 'EEG Report Commission Withdrawal',
        };

        console.log('Initiating Razorpay payout:', { mode, amount: breakdown.net_amount });

        const razorpayResponse = await fetch('https://api.razorpay.com/v1/payouts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Basic ' + btoa(`${razorpayKeyId}:${razorpaySecret}`),
          },
          body: JSON.stringify(payoutPayload),
        });

        if (!razorpayResponse.ok) {
          const errorData = await razorpayResponse.json();
          console.error('Razorpay payout failed:', errorData);
          
          // Mark withdrawal as failed and unlock amount
          await supabase
            .from('withdrawal_requests')
            .update({
              status: 'failed',
              failed_reason: errorData.error?.description || 'Payout initiation failed',
            })
            .eq('id', withdrawal.id);

          await supabase.rpc('unlock_failed_withdrawal', { p_withdrawal_id: withdrawal.id });

          throw new Error(errorData.error?.description || 'Payout initiation failed');
        }

        const payoutData = await razorpayResponse.json();
        console.log('Razorpay payout created:', payoutData.id);

        // Update withdrawal with payout ID and status
        await supabase
          .from('withdrawal_requests')
          .update({
            razorpay_payout_id: payoutData.id,
            status: 'processing',
          })
          .eq('id', withdrawal.id);

        return new Response(
          JSON.stringify({
            success: true,
            withdrawal_id: withdrawal.id,
            razorpay_payout_id: payoutData.id,
            status: 'processing',
            breakdown: breakdown,
            mock_mode: false,
            message: `Withdrawal initiated. Funds will be transferred via ${mode} within ${breakdown.tier === 'instant' ? '2 minutes' : '24 hours'}.`,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      // Manual tier - requires admin approval
      return new Response(
        JSON.stringify({
          success: true,
          withdrawal_id: withdrawal.id,
          status: 'pending',
          tier: 'manual',
          breakdown: breakdown,
          message: 'Withdrawal request submitted for manual review. Processing time: 2-3 business days.',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error: any) {
    console.error('Withdrawal error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
