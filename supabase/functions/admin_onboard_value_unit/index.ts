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
// Helper: typed error response with the exact failing step. The frontend
// surfaces `step` so a clinician/admin knows what to retry.
function fail(step: string, status: number, detail: string, raw?: unknown) {
  console.error(`[onboard] FAIL at ${step}: ${detail}`, raw ?? '');
  return new Response(JSON.stringify({
    error: detail,
    step,
    ok: false,
  }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace('Bearer ', '').trim();

    let callerId: string | null = null;
    let callerEmail: string | null = null;
    if (token) {
      const { data: { user }, error: getUserErr } = await supabaseAdmin.auth.getUser(token);
      if (getUserErr) {
        return fail('auth_get_user', 401, `Failed to verify token: ${getUserErr.message}`, getUserErr);
      }
      callerId = user?.id ?? null;
      callerEmail = user?.email ?? null;
    }

    if (!callerId) {
      return fail('auth_missing', 401, 'Unauthorized: no valid bearer token');
    }

    // Verify caller has admin role
    const { data: roleCheck, error: roleErr } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', callerId)
      .in('role', ['super_admin', 'management']);
    if (roleErr) {
      return fail('role_check', 500, `Failed to read caller roles: ${roleErr.message}`, roleErr);
    }
    if (!roleCheck || roleCheck.length === 0) {
      return fail('forbidden', 403,
        `Forbidden: caller ${callerEmail ?? callerId} has no super_admin or management role`);
    }
    console.log(`[onboard] caller ${callerEmail} authorised as ${roleCheck.map(r => r.role).join(',')}`);

    const { 
      clinic_name, 
      city, 
      sku = 'pilot', // Accept explicit SKU, default to pilot only if not provided
      clinician_name, 
      clinician_email, 
      clinician_password,
      initial_tokens = 10 
    } = await req.json();

    if (!clinic_name || !clinician_name || !clinician_email || !clinician_password) {
      return fail('validate_required', 400,
        'Missing required fields: clinic_name, clinician_name, clinician_email, clinician_password');
    }

    const validSkus = ['internal', 'pilot'];
    if (!validSkus.includes(sku)) {
      return fail('validate_sku', 400,
        `Invalid SKU: ${sku}. Must be one of: ${validSkus.join(', ')}`);
    }

    console.log('[onboard] starting value unit:', { clinic_name, clinician_email, sku });

    // STEP 1: Check if email already exists in profiles
    const { data: existingProfile, error: existingProfileErr } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', clinician_email.toLowerCase())
      .maybeSingle();

    if (existingProfileErr) {
      return fail('check_existing_profile', 500,
        `Failed to check existing profile: ${existingProfileErr.message}`, existingProfileErr);
    }

    if (existingProfile) {
      return fail('email_exists', 400,
        `User with email ${clinician_email} already exists`);
    }

    // STEP 2: Create the clinic
    const { data: clinic, error: clinicError } = await supabaseAdmin
      .from('clinics')
      .insert({
        name: clinic_name,
        city: city || null,
        sku: sku,
        is_active: true,
      })
      .select()
      .single();

    if (clinicError || !clinic) {
      return fail('clinic_insert', 500,
        `Failed to create clinic: ${clinicError?.message ?? 'no row returned'}`, clinicError);
    }

    console.log('[onboard] created clinic:', clinic.id);

    // STEP 3: Create the auth user
    const { data: newUser, error: userError } = await supabaseAdmin.auth.admin.createUser({
      email: clinician_email,
      password: clinician_password,
      email_confirm: true,
      user_metadata: { full_name: clinician_name },
    });

    if (userError || !newUser?.user?.id) {
      await supabaseAdmin.from('clinics').delete().eq('id', clinic.id);
      return fail('user_create', 500,
        `Failed to create auth user: ${userError?.message ?? 'no user returned'}`, userError);
    }

    const userId = newUser.user.id;
    console.log('[onboard] created auth user:', userId);

    // Wait for handle_new_user trigger to create the profile row
    await new Promise(resolve => setTimeout(resolve, 250));

    // Cascade rollback helper: delete auth user (cascades to profile via trigger)
    // and the clinic we created. Used on any failure after step 3.
    const rollbackAll = async (reason: string) => {
      console.error(`[onboard] rolling back: ${reason}`);
      try { await supabaseAdmin.auth.admin.deleteUser(userId); }
      catch (e) { console.error('[onboard] rollback user delete failed:', e); }
      try { await supabaseAdmin.from('clinics').delete().eq('id', clinic.id); }
      catch (e) { console.error('[onboard] rollback clinic delete failed:', e); }
    };

    // STEP 4: Update profile with full name + role
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        full_name: clinician_name,
        role: 'clinician',
      })
      .eq('id', userId);

    if (profileError) {
      await rollbackAll(`profile_update: ${profileError.message}`);
      return fail('profile_update', 500,
        `Failed to update profile: ${profileError.message}`, profileError);
    }

    // STEP 5: Assign clinician role
    const { error: roleInsertError } = await supabaseAdmin
      .from('user_roles')
      .insert({
        user_id: userId,
        role: 'clinician',
        clinic_id: clinic.id,
      });

    if (roleInsertError) {
      await rollbackAll(`role_insert: ${roleInsertError.message}`);
      return fail('role_insert', 500,
        `Failed to assign clinician role: ${roleInsertError.message}`, roleInsertError);
    }

    // STEP 6: Create clinic membership
    // NOTE: clinic_memberships.role is constrained to ('clinician', 'admin') in DB.
    // The value-unit model uses clinician for the primary neurologist account.
    const { error: membershipError } = await supabaseAdmin
      .from('clinic_memberships')
      .insert({
        user_id: userId,
        clinic_id: clinic.id,
        role: 'clinician',
      });

    if (membershipError) {
      await rollbackAll(`membership_insert: ${membershipError.message}`);
      return fail('membership_insert', 500,
        `Failed to create clinic membership: ${membershipError.message}`, membershipError);
    }

    // STEP 7: Create wallet with initial tokens
    const { error: walletError } = await supabaseAdmin
      .from('wallets')
      .upsert({
        user_id: userId,
        tokens: initial_tokens,
      }, { onConflict: 'user_id' });

    if (walletError) {
      await rollbackAll(`wallet_upsert: ${walletError.message}`);
      return fail('wallet_upsert', 500,
        `Failed to create wallet: ${walletError.message}`, walletError);
    }

    // STEP 8: Audit event. The value unit is complete by this point — if the
    // audit insert fails we log loudly but do NOT roll back (onboarding succeeded;
    // the operator should fix the audit table rather than lose the user).
    const { error: auditError } = await supabaseAdmin.from('audit_logs').insert({
      user_id: callerId,
      event_type: 'value_unit_onboarded',
      event_data: {
        clinic_id: clinic.id,
        clinic_name: clinic_name,
        clinician_id: userId,
        clinician_email: clinician_email,
        initial_tokens: initial_tokens,
        sku: sku,
      },
    });

    if (auditError) {
      console.error('[onboard] WARN: audit log failed but onboarding succeeded:', auditError);
    }

    console.log('[onboard] SUCCESS:', { clinic_id: clinic.id, user_id: userId, sku });

    return new Response(JSON.stringify({
      ok: true,
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
      audit_warning: auditError ? auditError.message : null,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    // Catch truly unexpected errors (programming bugs, network failures).
    // Anything inside the try body that we expect to fail should already use fail().
    console.error('[onboard] unhandled error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An error occurred';
    return fail('unhandled', 500, errorMessage, error);
  }
});
