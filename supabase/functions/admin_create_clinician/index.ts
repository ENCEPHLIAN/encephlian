import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

/**
 * admin_create_clinician
 *
 * Attaches a NEW clinician to an EXISTING clinic atomically.
 * Sibling of admin_provision_clinic, which creates clinic + clinician together.
 *
 *   1. Verify caller has super_admin or management.
 *   2. Generate or accept x-request-id.
 *   3. Create the auth.users row (handle_new_user trigger inserts profile,
 *      ensure_wallets trigger inserts 0-token wallet).
 *   4. Call admin_provision_clinician_for_clinic RPC inside one Postgres txn.
 *   5. If RPC fails: rollback the auth.users row.
 *
 * Returns { ok, clinic, clinician, tokens, request_id } on success.
 * Returns { ok: false, step, error, code, request_id } on failure.
 */

type FailStep =
  | 'auth_get_user'
  | 'auth_missing'
  | 'role_check'
  | 'forbidden'
  | 'parse_body'
  | 'validate_required'
  | 'validate_clinic'
  | 'check_existing_profile'
  | 'email_exists'
  | 'user_create'
  | 'provision_rpc'
  | 'rpc_returned_no_row'
  | 'unhandled';

function makeRequestId(): string {
  const arr = new Uint8Array(4);
  crypto.getRandomValues(arr);
  return 'cli_' + Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

function fail(step: FailStep, status: number, detail: string, requestId: string, raw?: unknown, code?: string) {
  console.error(`[create-clinician ${requestId}] FAIL at ${step}: ${detail}`, raw ?? '');
  return new Response(
    JSON.stringify({ ok: false, step, error: detail, code: code ?? null, request_id: requestId }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const requestId = req.headers.get('x-request-id') ?? makeRequestId();

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) return fail('auth_missing', 401, 'Unauthorized: no bearer token', requestId);

    const { data: { user }, error: getUserErr } = await supabaseAdmin.auth.getUser(token);
    if (getUserErr) return fail('auth_get_user', 401, `Token verification failed: ${getUserErr.message}`, requestId, getUserErr);
    const callerId = user?.id ?? null;
    const callerEmail = user?.email ?? null;
    if (!callerId) return fail('auth_missing', 401, 'Unauthorized: token did not resolve to a user', requestId);

    const { data: roleRows, error: roleErr } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', callerId)
      .in('role', ['super_admin', 'management']);
    if (roleErr) return fail('role_check', 500, `Failed to read caller roles: ${roleErr.message}`, requestId, roleErr);
    if (!roleRows || roleRows.length === 0) {
      return fail('forbidden', 403, `Forbidden: ${callerEmail ?? callerId} has no super_admin or management role`, requestId);
    }
    console.log(`[create-clinician ${requestId}] caller=${callerEmail} role=${roleRows.map((r) => r.role).join(',')}`);

    let body: any;
    try {
      body = await req.json();
    } catch (e) {
      return fail('parse_body', 400, 'Body is not valid JSON', requestId, e);
    }

    const {
      clinic_id,
      clinician_name,
      clinician_email,
      clinician_password,
      initial_tokens = 10,
    } = body ?? {};

    if (!clinic_id || !clinician_name || !clinician_email || !clinician_password) {
      return fail('validate_required', 400,
        'Missing required fields: clinic_id, clinician_name, clinician_email, clinician_password',
        requestId);
    }

    // Pre-check the clinic exists and is active so we fail fast before auth user create.
    const { data: clinic, error: clinicErr } = await supabaseAdmin
      .from('clinics')
      .select('id, name, sku, is_active')
      .eq('id', clinic_id)
      .maybeSingle();
    if (clinicErr) return fail('validate_clinic', 500, `Could not load clinic: ${clinicErr.message}`, requestId, clinicErr);
    if (!clinic || !clinic.is_active) {
      return fail('validate_clinic', 404, `Clinic ${clinic_id} not found or inactive`, requestId);
    }
    console.log(`[create-clinician ${requestId}] target clinic ${clinic.name} (${clinic.sku})`);

    const { data: existingProfile, error: existingErr } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', clinician_email.toLowerCase())
      .maybeSingle();
    if (existingErr) return fail('check_existing_profile', 500, `Could not check existing profile: ${existingErr.message}`, requestId, existingErr);
    if (existingProfile) return fail('email_exists', 409, `User with email ${clinician_email} already exists`, requestId);

    const { data: created, error: userError } = await supabaseAdmin.auth.admin.createUser({
      email: clinician_email,
      password: clinician_password,
      email_confirm: true,
      user_metadata: { full_name: clinician_name, request_id: requestId, clinic_id },
    });
    if (userError || !created?.user?.id) {
      return fail('user_create', 500,
        `Failed to create auth user: ${userError?.message ?? 'no user returned'}`,
        requestId, userError, (userError as any)?.code ?? null);
    }
    const newUserId = created.user.id;
    console.log(`[create-clinician ${requestId}] created auth user ${newUserId}`);

    const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc(
      'admin_provision_clinician_for_clinic',
      {
        p_actor_id: callerId,
        p_new_user_id: newUserId,
        p_clinic_id: clinic_id,
        p_clinician_name: clinician_name,
        p_clinician_email: clinician_email,
        p_initial_tokens: initial_tokens,
        p_request_id: requestId,
      },
    );

    if (rpcError) {
      console.error(`[create-clinician ${requestId}] RPC failed, rolling back auth user`, rpcError);
      try { await supabaseAdmin.auth.admin.deleteUser(newUserId); }
      catch (delErr) { console.error(`[create-clinician ${requestId}] auth user rollback FAILED for ${newUserId}`, delErr); }
      return fail('provision_rpc', 500, `Provisioning RPC failed: ${rpcError.message}`, requestId, rpcError, (rpcError as any).code ?? null);
    }
    if (!rpcResult) {
      try { await supabaseAdmin.auth.admin.deleteUser(newUserId); }
      catch (delErr) { console.error(`[create-clinician ${requestId}] auth user rollback failed for ${newUserId}`, delErr); }
      return fail('rpc_returned_no_row', 500, 'Provisioning RPC returned no result', requestId);
    }

    console.log(`[create-clinician ${requestId}] SUCCESS clinic=${rpcResult.clinic_id} clinician=${newUserId}`);

    return new Response(
      JSON.stringify({
        ok: true,
        request_id: requestId,
        clinic: { id: clinic.id, name: clinic.name, sku: clinic.sku },
        clinician: { id: newUserId, email: clinician_email, name: clinician_name },
        tokens: rpcResult.tokens,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json', 'x-request-id': requestId } },
    );
  } catch (error) {
    console.error(`[create-clinician ${requestId}] unhandled error`, error);
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    return fail('unhandled', 500, message, requestId, error);
  }
});
