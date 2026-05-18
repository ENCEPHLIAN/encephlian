import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

/**
 * admin_provision_clinic
 *
 * Provisions a new clinic + its primary clinician as one atomic operation.
 *
 *   1. Verify caller (JWT) has super_admin or management role.
 *   2. Generate (or accept) a request_id for end-to-end correlation.
 *   3. Create the auth.users row via Supabase Auth admin API.
 *      - handle_new_user trigger inserts profiles row.
 *      - ensure_wallets trigger inserts a 0-token wallet.
 *   4. Call admin_provision_clinic_resources RPC inside one Postgres txn:
 *      clinic → profile.role → user_roles → clinic_memberships →
 *      wallet top-up → wallet_transactions ledger → audit_logs entry.
 *   5. If RPC raises: delete the auth.users row (FK cascades clean up
 *      profile + the 0-token wallet).
 *
 * Returns { ok, clinic, clinician, tokens, request_id } on success.
 * Returns { ok: false, step, error, request_id, code? } on failure —
 * `step` lets the operator see exactly where it broke.
 */

type FailStep =
  | 'auth_get_user'
  | 'auth_missing'
  | 'role_check'
  | 'forbidden'
  | 'parse_body'
  | 'validate_required'
  | 'validate_sku'
  | 'check_existing_profile'
  | 'email_exists'
  | 'user_create'
  | 'provision_rpc'
  | 'rpc_returned_no_row'
  | 'unhandled';

function makeRequestId(): string {
  // Short, log-friendly correlation ID. Not crypto-sensitive.
  // Format: prov_<8 hex>
  const arr = new Uint8Array(4);
  crypto.getRandomValues(arr);
  return 'prov_' + Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

function fail(
  step: FailStep,
  status: number,
  detail: string,
  requestId: string,
  raw?: unknown,
  code?: string,
) {
  console.error(`[provision ${requestId}] FAIL at ${step}: ${detail}`, raw ?? '');
  return new Response(
    JSON.stringify({
      ok: false,
      step,
      error: detail,
      code: code ?? null,
      request_id: requestId,
    }),
    {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    },
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const requestId = req.headers.get('x-request-id') ?? makeRequestId();

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // ── 1. Verify caller ───────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace('Bearer ', '').trim();

    if (!token) {
      return fail('auth_missing', 401, 'Unauthorized: no bearer token', requestId);
    }

    const { data: { user }, error: getUserErr } = await supabaseAdmin.auth.getUser(token);
    if (getUserErr) {
      return fail('auth_get_user', 401, `Token verification failed: ${getUserErr.message}`, requestId, getUserErr);
    }
    const callerId = user?.id ?? null;
    const callerEmail = user?.email ?? null;
    if (!callerId) {
      return fail('auth_missing', 401, 'Unauthorized: token did not resolve to a user', requestId);
    }

    const { data: roleRows, error: roleErr } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', callerId)
      .in('role', ['super_admin', 'management']);
    if (roleErr) {
      return fail('role_check', 500, `Failed to read caller roles: ${roleErr.message}`, requestId, roleErr);
    }
    if (!roleRows || roleRows.length === 0) {
      return fail(
        'forbidden',
        403,
        `Forbidden: ${callerEmail ?? callerId} has no super_admin or management role`,
        requestId,
      );
    }
    console.log(`[provision ${requestId}] caller=${callerEmail} role=${roleRows.map((r) => r.role).join(',')}`);

    // ── 2. Parse + validate body ───────────────────────────────────────────
    let body: any;
    try {
      body = await req.json();
    } catch (e) {
      return fail('parse_body', 400, 'Body is not valid JSON', requestId, e);
    }

    const {
      clinic_name,
      city,
      sku = 'pilot',
      clinician_name,
      clinician_email,
      clinician_password,
      initial_tokens = 10,
    } = body ?? {};

    if (!clinic_name || !clinician_name || !clinician_email || !clinician_password) {
      return fail(
        'validate_required',
        400,
        'Missing required fields: clinic_name, clinician_name, clinician_email, clinician_password',
        requestId,
      );
    }

    if (sku !== 'internal' && sku !== 'pilot') {
      return fail('validate_sku', 400, `Invalid SKU: ${sku}. Must be internal or pilot`, requestId);
    }

    console.log(`[provision ${requestId}] body ok: clinic=${clinic_name} sku=${sku} email=${clinician_email}`);

    // ── 3. Pre-flight: email already exists? ───────────────────────────────
    const { data: existingProfile, error: existingErr } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', clinician_email.toLowerCase())
      .maybeSingle();
    if (existingErr) {
      return fail('check_existing_profile', 500, `Could not check existing profile: ${existingErr.message}`, requestId, existingErr);
    }
    if (existingProfile) {
      return fail('email_exists', 409, `User with email ${clinician_email} already exists`, requestId);
    }

    // ── 4. Create auth user (triggers handle_new_user + ensure_wallets) ────
    const { data: created, error: userError } = await supabaseAdmin.auth.admin.createUser({
      email: clinician_email,
      password: clinician_password,
      email_confirm: true,
      user_metadata: { full_name: clinician_name, request_id: requestId },
    });

    if (userError || !created?.user?.id) {
      return fail(
        'user_create',
        500,
        `Failed to create auth user: ${userError?.message ?? 'no user returned'}`,
        requestId,
        userError,
        (userError as any)?.code ?? null,
      );
    }
    const newUserId = created.user.id;
    console.log(`[provision ${requestId}] created auth user ${newUserId}`);

    // ── 5. Atomic RPC ──────────────────────────────────────────────────────
    const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc(
      'admin_provision_clinic_resources',
      {
        p_actor_id: callerId,
        p_new_user_id: newUserId,
        p_clinic_name: clinic_name,
        p_city: city ?? null,
        p_sku: sku,
        p_clinician_name: clinician_name,
        p_clinician_email: clinician_email,
        p_initial_tokens: initial_tokens,
        p_request_id: requestId,
      },
    );

    if (rpcError) {
      console.error(`[provision ${requestId}] RPC failed, rolling back auth user`, rpcError);
      try {
        await supabaseAdmin.auth.admin.deleteUser(newUserId);
      } catch (delErr) {
        console.error(`[provision ${requestId}] auth user rollback FAILED for ${newUserId}`, delErr);
      }
      return fail(
        'provision_rpc',
        500,
        `Provisioning RPC failed: ${rpcError.message}`,
        requestId,
        rpcError,
        (rpcError as any).code ?? null,
      );
    }

    if (!rpcResult) {
      try {
        await supabaseAdmin.auth.admin.deleteUser(newUserId);
      } catch (delErr) {
        console.error(`[provision ${requestId}] auth user rollback failed for ${newUserId}`, delErr);
      }
      return fail('rpc_returned_no_row', 500, 'Provisioning RPC returned no result', requestId);
    }

    console.log(`[provision ${requestId}] SUCCESS clinic=${rpcResult.clinic_id} clinician=${newUserId}`);

    return new Response(
      JSON.stringify({
        ok: true,
        request_id: requestId,
        clinic: {
          id: rpcResult.clinic_id,
          name: clinic_name,
          sku,
        },
        clinician: {
          id: newUserId,
          email: clinician_email,
          name: clinician_name,
        },
        tokens: rpcResult.tokens,
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'x-request-id': requestId,
        },
      },
    );
  } catch (error) {
    console.error(`[provision ${requestId}] unhandled error`, error);
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    return fail('unhandled', 500, message, requestId, error);
  }
});
