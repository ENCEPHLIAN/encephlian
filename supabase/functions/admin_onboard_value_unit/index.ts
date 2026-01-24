import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

/**
 * admin_onboard_value_unit
 * 
 * Creates a complete value unit in one atomic operation:
 * 1. Creates the clinic (defaults to 'pilot' SKU)
 * 2. Creates the neurologist user
 * 3. Assigns clinician role + clinic membership
 * 4. Creates wallet with initial tokens
 * 
 * This ensures the value unit (clinic + neurologist) is always consistent.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Verify caller is admin
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { data: { user: caller } } = await supabaseClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create admin client for privileged operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verify caller has admin role
    const { data: roleCheck } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', caller.id)
      .in('role', ['super_admin', 'management']);

    if (!roleCheck || roleCheck.length === 0) {
      return new Response(JSON.stringify({ error: 'Forbidden: Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { 
      clinic_name, 
      city, 
      sku = 'pilot', // Accept explicit SKU, default to pilot only if not provided
      clinician_name, 
      clinician_email, 
      clinician_password,
      initial_tokens = 10 
    } = await req.json();

    // Validate required fields
    if (!clinic_name || !clinician_name || !clinician_email || !clinician_password) {
      return new Response(JSON.stringify({ 
        error: 'Missing required fields: clinic_name, clinician_name, clinician_email, clinician_password' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate SKU (only pilot and internal, no demo)
    const validSkus = ['internal', 'pilot'];
    if (!validSkus.includes(sku)) {
      return new Response(JSON.stringify({ 
        error: `Invalid SKU: ${sku}. Must be one of: ${validSkus.join(', ')}` 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Onboarding value unit:', { clinic_name, clinician_email, sku });

    // STEP 1: Check if email already exists
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', clinician_email.toLowerCase())
      .maybeSingle();

    if (existingProfile) {
      return new Response(JSON.stringify({ 
        error: `User with email ${clinician_email} already exists` 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // STEP 2: Create the clinic
    const { data: clinic, error: clinicError } = await supabaseAdmin
      .from('clinics')
      .insert({
        name: clinic_name,
        city: city || null,
        sku: sku, // Use explicitly selected SKU
        is_active: true,
      })
      .select()
      .single();

    if (clinicError) {
      console.error('Error creating clinic:', clinicError);
      throw new Error(`Failed to create clinic: ${clinicError.message}`);
    }

    console.log('Created clinic:', clinic.id);

    // STEP 3: Create the auth user
    const { data: newUser, error: userError } = await supabaseAdmin.auth.admin.createUser({
      email: clinician_email,
      password: clinician_password,
      email_confirm: true,
      user_metadata: { full_name: clinician_name },
    });

    if (userError) {
      // Rollback: delete the clinic we just created
      await supabaseAdmin.from('clinics').delete().eq('id', clinic.id);
      console.error('Error creating user:', userError);
      throw new Error(`Failed to create user: ${userError.message}`);
    }

    const userId = newUser.user.id;
    console.log('Created user:', userId);

    // Wait for trigger to create profile
    await new Promise(resolve => setTimeout(resolve, 150));

    // STEP 4: Update profile with full name
    await supabaseAdmin
      .from('profiles')
      .update({ 
        full_name: clinician_name,
        role: 'clinician'
      })
      .eq('id', userId);

    // STEP 5: Assign clinician role
    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .insert({
        user_id: userId,
        role: 'clinician',
        clinic_id: clinic.id,
      });

    if (roleError) {
      console.error('Error assigning role:', roleError);
      // Continue - not fatal
    }

    // STEP 6: Create clinic membership
    const { error: membershipError } = await supabaseAdmin
      .from('clinic_memberships')
      .insert({
        user_id: userId,
        clinic_id: clinic.id,
        role: 'neurologist',
      });

    if (membershipError) {
      console.error('Error creating membership:', membershipError);
      // Continue - not fatal
    }

    // STEP 7: Create wallet with initial tokens
    const { error: walletError } = await supabaseAdmin
      .from('wallets')
      .upsert({
        user_id: userId,
        tokens: initial_tokens,
      }, { onConflict: 'user_id' });

    if (walletError) {
      console.error('Error creating wallet:', walletError);
      // Continue - not fatal
    }

    // STEP 8: Log the audit event
    await supabaseAdmin.from('audit_logs').insert({
      user_id: caller.id,
      event_type: 'value_unit_onboarded',
      event_data: {
        clinic_id: clinic.id,
        clinic_name: clinic_name,
        clinician_id: userId,
        clinician_email: clinician_email,
        initial_tokens: initial_tokens,
      },
    });

    return new Response(JSON.stringify({
      success: true,
      clinic: {
        id: clinic.id,
        name: clinic.name,
      },
      clinician: {
        id: userId,
        email: clinician_email,
        name: clinician_name,
      },
      tokens: initial_tokens,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Onboard value unit error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An error occurred';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
