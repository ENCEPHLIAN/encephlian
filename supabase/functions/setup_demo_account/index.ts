import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import { corsHeaders } from '../_shared/cors.ts';

const DEMO_EMAIL = 'demo@encephlian.com';
const DEMO_PASSWORD = 'Demo@2024!Secure';
const DEMO_USER_ID = '20000000-0000-0000-0000-000000000001';
const CLINIC_ID = '8050150c-05ac-47a0-8322-0dc8abb436b7'; // Magna Neurology

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Create admin client using service role key
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Check if demo user already exists
    const { data: existingUser } = await supabaseAdmin.auth.admin.listUsers();
    const demoExists = existingUser?.users?.some(u => u.email === DEMO_EMAIL);

    if (demoExists) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Demo account already exists',
          credentials: { email: DEMO_EMAIL, password: DEMO_PASSWORD }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create auth user
    const { data: newUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: {
        full_name: 'Dr. Demo User'
      }
    });

    if (authError) throw authError;

    const userId = newUser.user.id;

    // Create user role - use clinician (not neurologist)
    await supabaseAdmin.from('user_roles').insert({
      user_id: userId,
      role: 'clinician',
      clinic_id: CLINIC_ID
    });

    // Create clinic membership
    await supabaseAdmin.from('clinic_memberships').insert({
      user_id: userId,
      clinic_id: CLINIC_ID,
      role: 'clinician'
    });

    // Create wallets
    await supabaseAdmin.from('wallets').insert({
      user_id: userId,
      tokens: 200
    });

    await supabaseAdmin.from('earnings_wallets').insert({
      user_id: userId,
      balance_inr: 1200,
      total_earned_inr: 1800
    });

    // Create bank account
    await supabaseAdmin.from('bank_accounts').insert({
      user_id: userId,
      account_number_encrypted: 'DEMO1234567890',
      ifsc: 'SBIN0001234',
      account_holder_name: 'Dr. Demo User',
      bank_name: 'State Bank of India',
      is_verified: true,
      is_primary: true,
      verified_at: new Date().toISOString()
    });

    // Create 5 studies
    const studies = [
      {
        id: '10000000-0000-0000-0000-000000000001',
        clinic_id: CLINIC_ID,
        owner: userId,
        duration_min: 30,
        srate_hz: 256,
        indication: 'Seizure evaluation',
        sla: 'TAT',
        state: 'uploaded',
        montage: '10-20',
        reference: 'average',
        meta: { patient_age: 45, patient_gender: 'M' },
        created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
      },
      {
        id: '10000000-0000-0000-0000-000000000002',
        clinic_id: CLINIC_ID,
        owner: userId,
        duration_min: 45,
        srate_hz: 256,
        indication: 'Headache evaluation',
        sla: 'TAT',
        state: 'ai_draft',
        montage: '10-20',
        reference: 'average',
        meta: { patient_age: 32, patient_gender: 'F' },
        created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: '10000000-0000-0000-0000-000000000003',
        clinic_id: CLINIC_ID,
        owner: userId,
        duration_min: 60,
        srate_hz: 256,
        indication: 'Encephalopathy',
        sla: 'TAT',
        state: 'in_review',
        montage: '10-20',
        reference: 'average',
        meta: { patient_age: 67, patient_gender: 'M' },
        created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: '10000000-0000-0000-0000-000000000004',
        clinic_id: CLINIC_ID,
        owner: userId,
        duration_min: 30,
        srate_hz: 256,
        indication: 'Syncope',
        sla: 'TAT',
        state: 'signed',
        montage: '10-20',
        reference: 'average',
        meta: { patient_age: 54, patient_gender: 'F' },
        created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: '10000000-0000-0000-0000-000000000005',
        clinic_id: CLINIC_ID,
        owner: userId,
        duration_min: 20,
        srate_hz: 256,
        indication: 'Status epilepticus',
        sla: 'STAT',
        state: 'uploaded',
        montage: '10-20',
        reference: 'average',
        meta: { patient_age: 28, patient_gender: 'M' },
        created_at: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()
      }
    ];

    await supabaseAdmin.from('studies').insert(studies);

    // Link studies to EEG files
    const studyFiles = studies.map(s => ({
      study_id: s.id,
      kind: 'raw_eeg',
      path: 'sample-eeg/S094R10.edf',
      size_bytes: 2457600
    }));

    await supabaseAdmin.from('study_files').insert(studyFiles);

    // Add EEG markers for Study 3
    await supabaseAdmin.from('eeg_markers').insert([
      {
        study_id: '10000000-0000-0000-0000-000000000003',
        user_id: userId,
        timestamp_sec: 2.5,
        duration_sec: 0.5,
        marker_type: 'spike',
        label: 'Sharp wave',
        channel: 'F7',
        severity: 'moderate',
        notes: 'Left temporal sharp wave'
      },
      {
        study_id: '10000000-0000-0000-0000-000000000003',
        user_id: userId,
        timestamp_sec: 10.2,
        duration_sec: 1.0,
        marker_type: 'artifact',
        label: 'Movement artifact',
        channel: 'all',
        notes: 'Patient movement'
      },
      {
        study_id: '10000000-0000-0000-0000-000000000003',
        user_id: userId,
        timestamp_sec: 15.8,
        marker_type: 'annotation',
        label: 'Eyes closed',
        notes: 'Patient instructed to close eyes'
      }
    ]);

    // Add AI draft for Study 2
    await supabaseAdmin.from('ai_drafts').insert({
      study_id: '10000000-0000-0000-0000-000000000002',
      model: 'placeholder-v1',
      version: '1.0',
      draft: {
        clinical_history: 'Headache evaluation',
        medications: 'None reported',
        background: 'Normal background activity with good organization',
        findings: 'No epileptiform discharges observed',
        impression: 'Normal EEG study',
        recommendations: 'Clinical correlation recommended'
      }
    });

    // Add signed report for Study 4
    const { data: report } = await supabaseAdmin.from('reports').insert({
      study_id: '10000000-0000-0000-0000-000000000004',
      interpreter: userId,
      status: 'signed',
      signed_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
      content: {
        clinical_history: 'Syncope',
        medications: 'None reported',
        background: 'Normal background activity',
        findings: 'No epileptiform discharges',
        impression: 'Normal EEG study',
        recommendations: 'Clinical correlation recommended'
      }
    }).select().single();

    // Add commission for Study 4
    if (report) {
      await supabaseAdmin.from('commissions').insert({
        neurologist_id: userId,
        report_id: report.id,
        sla: 'TAT',
        commission_rate: 3.00,
        amount_inr: 600
      });
    }

    // Add payment history
    await supabaseAdmin.from('payments').insert([
      {
        user_id: userId,
        amount_inr: 5000,
        credits_purchased: 25,
        status: 'captured',
        provider: 'razorpay',
        order_id: 'demo_order_1',
        payment_id: 'demo_pay_1',
        signature_valid: true,
        created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        user_id: userId,
        amount_inr: 10000,
        credits_purchased: 50,
        status: 'captured',
        provider: 'razorpay',
        order_id: 'demo_order_2',
        payment_id: 'demo_pay_2',
        signature_valid: true,
        created_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString()
      }
    ]);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Demo account created successfully',
        credentials: {
          email: DEMO_EMAIL,
          password: DEMO_PASSWORD
        },
        data: {
          user_id: userId,
          studies: studies.length,
          wallet_tokens: 200,
          earnings_balance: 1200
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error setting up demo account:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
