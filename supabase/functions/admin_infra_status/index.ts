// =============================================================================
// admin_infra_status — super_admin-only cockpit proxy
//
// Purpose:
//   Single edge function that fan-outs to the operational tenants we care
//   about and returns one normalised status object per provider. The frontend
//   at /admin/infra renders these as tiles so the founder can see billing,
//   deploy, payment, and DB state without switching consoles.
//
// Security:
//   * Requires an authenticated Supabase JWT.
//   * Caller MUST be super_admin in user_roles. Plain 'management' is NOT
//     enough — infra cost data and deploy history leak commercial posture.
//   * All provider credentials live in Supabase secrets; they never reach
//     the browser. The frontend only ever sees sanitised status payloads.
//
// Providers (partial wire, rest scaffolded):
//   * razorpay : REST v1 via Basic auth; returns balance + last N payments.
//   * supabase : local service-role client; returns row counts + storage.
//   * azure    : OAuth2 client_credentials → Management API (cost + RGs).
//                Requires: AZURE_SUBSCRIPTION_ID, AZURE_TENANT_ID,
//                          AZURE_SP_CLIENT_ID, AZURE_SP_CLIENT_SECRET.
//   * vercel   : REST v6; requires VERCEL_TOKEN (+ optional VERCEL_TEAM_ID,
//                VERCEL_PROJECT_ID).
//
// If a provider's secrets are missing we return { configured: false,
// required_env: [...] } so the tile can render a 'Configure' CTA instead
// of an error.
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

type ProviderStatus = {
  configured: boolean;
  ok?: boolean;
  required_env?: string[];
  error?: string;
  data?: Record<string, unknown>;
  fetched_at: string;
};

const now = () => new Date().toISOString();

// ──────────────────────────────────────────────────────────────── Razorpay ──
async function razorpayStatus(): Promise<ProviderStatus> {
  const keyId = Deno.env.get('RAZORPAY_KEY_ID');
  const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET');
  if (!keyId || !keySecret) {
    return {
      configured: false,
      required_env: ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET'],
      fetched_at: now(),
    };
  }
  try {
    const basic = btoa(`${keyId}:${keySecret}`);
    const res = await fetch(
      'https://api.razorpay.com/v1/payments?count=10',
      { headers: { Authorization: `Basic ${basic}` } },
    );
    if (!res.ok) {
      const body = await res.text();
      return {
        configured: true,
        ok: false,
        error: `Razorpay ${res.status}: ${body.slice(0, 200)}`,
        fetched_at: now(),
      };
    }
    const j = await res.json();
    const items: Array<Record<string, unknown>> = j.items ?? [];
    const summary = {
      count: j.count ?? items.length,
      captured: items.filter((p) => p.status === 'captured').length,
      failed: items.filter((p) => p.status === 'failed').length,
      refunded: items.filter((p) => (p.status as string)?.startsWith('refund')).length,
      last_10: items.map((p) => ({
        id: p.id,
        amount: p.amount,
        currency: p.currency,
        status: p.status,
        created_at: p.created_at,
        email: p.email,
        method: p.method,
      })),
      mode: keyId.startsWith('rzp_test_') ? 'test' : 'live',
    };
    return { configured: true, ok: true, data: summary, fetched_at: now() };
  } catch (e) {
    return {
      configured: true,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      fetched_at: now(),
    };
  }
}

// ─────────────────────────────────────────────────────────────── Supabase ──
async function supabaseStatus(admin: ReturnType<typeof createClient>): Promise<ProviderStatus> {
  try {
    const [profiles, clinics, studies, payments, auditLogs] = await Promise.all([
      admin.from('profiles').select('id', { count: 'exact', head: true }),
      admin.from('clinics').select('id', { count: 'exact', head: true }),
      admin.from('studies').select('id', { count: 'exact', head: true }),
      admin.from('payments').select('id', { count: 'exact', head: true }),
      admin.from('audit_logs').select('id', { count: 'exact', head: true }),
    ]);
    const { data: buckets } = await admin.storage.listBuckets();
    return {
      configured: true,
      ok: true,
      data: {
        url: Deno.env.get('SUPABASE_URL') ?? null,
        counts: {
          profiles: profiles.count ?? 0,
          clinics: clinics.count ?? 0,
          studies: studies.count ?? 0,
          payments: payments.count ?? 0,
          audit_logs: auditLogs.count ?? 0,
        },
        storage_buckets: (buckets ?? []).map((b) => ({
          id: b.id,
          name: b.name,
          public: b.public,
        })),
      },
      fetched_at: now(),
    };
  } catch (e) {
    return {
      configured: true,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      fetched_at: now(),
    };
  }
}

// ────────────────────────────────────────────────────────────────── Azure ──
async function azureStatus(): Promise<ProviderStatus> {
  const required = [
    'AZURE_SUBSCRIPTION_ID',
    'AZURE_TENANT_ID',
    'AZURE_SP_CLIENT_ID',
    'AZURE_SP_CLIENT_SECRET',
  ];
  const missing = required.filter((k) => !Deno.env.get(k));
  if (missing.length > 0) {
    return { configured: false, required_env: missing, fetched_at: now() };
  }
  try {
    const tenant = Deno.env.get('AZURE_TENANT_ID')!;
    const clientId = Deno.env.get('AZURE_SP_CLIENT_ID')!;
    const clientSecret = Deno.env.get('AZURE_SP_CLIENT_SECRET')!;
    const subscription = Deno.env.get('AZURE_SUBSCRIPTION_ID')!;

    const tokenRes = await fetch(
      `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret,
          scope: 'https://management.azure.com/.default',
        }),
      },
    );
    if (!tokenRes.ok) {
      const t = await tokenRes.text();
      return {
        configured: true,
        ok: false,
        error: `azure token ${tokenRes.status}: ${t.slice(0, 200)}`,
        fetched_at: now(),
      };
    }
    const { access_token } = await tokenRes.json();

    const [rgRes, subRes, credRes, costRes] = await Promise.all([
      fetch(
        `https://management.azure.com/subscriptions/${subscription}/resourcegroups?api-version=2022-09-01`,
        { headers: { Authorization: `Bearer ${access_token}` } },
      ),
      fetch(
        `https://management.azure.com/subscriptions/${subscription}?api-version=2022-12-01`,
        { headers: { Authorization: `Bearer ${access_token}` } },
      ),
      fetch(
        `https://management.azure.com/subscriptions/${subscription}/providers/Microsoft.Consumption/credits?api-version=2021-10-30`,
        { headers: { Authorization: `Bearer ${access_token}` } },
      ),
      fetch(
        `https://management.azure.com/subscriptions/${subscription}/providers/Microsoft.CostManagement/query?api-version=2023-03-01`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: 'ActualCost',
            timeframe: 'MonthToDate',
            dataset: {
              granularity: 'None',
              aggregation: {
                totalCost: { name: 'PreTaxCost', function: 'Sum' },
              },
            },
          }),
        },
      ),
    ]);

    const resourceGroups = rgRes.ok
      ? ((await rgRes.json()).value as Array<{ name: string; location: string }>)
      : [];
    const subInfo = subRes.ok ? await subRes.json() : null;

    const creditBalances: Array<{
      name: string | null;
      amount: number;
      currency: string | null;
    }> = [];
    if (credRes.ok) {
      try {
        const cj = (await credRes.json()) as {
          value?: Array<{
            name?: string;
            properties?: {
              balanceSummary?: {
                currentBalance?: { amount?: number; currency?: string };
              };
            };
          }>;
        };
        for (const v of cj.value ?? []) {
          const cur = v?.properties?.balanceSummary?.currentBalance;
          if (cur && typeof cur.amount === 'number') {
            creditBalances.push({
              name: v?.name ?? null,
              amount: cur.amount,
              currency: cur.currency ?? null,
            });
          }
        }
      } catch {
        /* ignore malformed credits payload */
      }
    }

    let month_to_date_cost: number | null = null;
    let month_to_date_currency: string | null = null;
    let cost_query_error: string | null = null;
    if (costRes.ok) {
      try {
        const qj = (await costRes.json()) as {
          properties?: { rows?: number[][]; columns?: Array<{ name: string }> };
        };
        const rows = qj.properties?.rows;
        const cols = qj.properties?.columns;
        if (rows?.length && cols?.length) {
          const idx = cols.findIndex((c) =>
            /cost|pretax/i.test(String(c.name ?? ''))
          );
          const col = idx >= 0 ? idx : 0;
          const cell = rows[0]?.[col];
          const n =
            typeof cell === 'number' ? cell : parseFloat(String(cell ?? ''));
          if (Number.isFinite(n)) month_to_date_cost = n;
          const curCol = cols.findIndex((c) =>
            /currency/i.test(String(c.name ?? ''))
          );
          if (curCol >= 0 && rows[0]?.[curCol] != null) {
            month_to_date_currency = String(rows[0][curCol]);
          }
        }
      } catch {
        cost_query_error = 'cost response parse failed';
      }
    } else {
      const t = await costRes.text().catch(() => '');
      cost_query_error = `cost query ${costRes.status}: ${t.slice(0, 160)}`;
    }

    return {
      configured: true,
      ok: true,
      data: {
        subscription_id: subscription,
        display_name: subInfo?.displayName ?? null,
        state: subInfo?.state ?? null,
        resource_groups: resourceGroups.map((rg) => ({
          name: rg.name,
          location: rg.location,
        })),
        credits: creditBalances,
        credits_http_status: credRes.status,
        month_to_date_cost,
        month_to_date_currency,
        cost_query_error,
        note:
          'Grant the service principal Cost Management Reader on the subscription to populate MTD cost. ' +
          'Prepaid credits appear when Microsoft.Consumption/credits applies to your offer (e.g. credits, some EA scenarios).',
      },
      fetched_at: now(),
    };
  } catch (e) {
    return {
      configured: true,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      fetched_at: now(),
    };
  }
}

// ───────────────────────────────────────────────────────────────── Vercel ──
async function vercelStatus(): Promise<ProviderStatus> {
  const token = Deno.env.get('VERCEL_TOKEN');
  if (!token) {
    return {
      configured: false,
      required_env: ['VERCEL_TOKEN', 'VERCEL_PROJECT_ID?', 'VERCEL_TEAM_ID?'],
      fetched_at: now(),
    };
  }
  try {
    const teamId = Deno.env.get('VERCEL_TEAM_ID');
    const projectId = Deno.env.get('VERCEL_PROJECT_ID');
    const qs = new URLSearchParams();
    if (teamId) qs.set('teamId', teamId);
    if (projectId) qs.set('projectId', projectId);
    qs.set('limit', '10');
    const res = await fetch(
      `https://api.vercel.com/v6/deployments?${qs.toString()}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) {
      const t = await res.text();
      return {
        configured: true,
        ok: false,
        error: `vercel ${res.status}: ${t.slice(0, 200)}`,
        fetched_at: now(),
      };
    }
    const j = await res.json();
    return {
      configured: true,
      ok: true,
      data: {
        project_id: projectId ?? null,
        team_id: teamId ?? null,
        deployments: (j.deployments ?? []).map((d: Record<string, unknown>) => ({
          uid: d.uid,
          url: d.url,
          state: d.state,
          created: d.created,
          target: d.target,
          creator: (d.creator as Record<string, unknown>)?.username ?? null,
          meta: {
            commit: (d.meta as Record<string, unknown>)?.githubCommitSha ?? null,
            branch: (d.meta as Record<string, unknown>)?.githubCommitRef ?? null,
          },
        })),
      },
      fetched_at: now(),
    };
  } catch (e) {
    return {
      configured: true,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      fetched_at: now(),
    };
  }
}

// ─────────────────────────────────────────────────────────────── handler ──
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        ...corsHeaders,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      },
    });
  }

  try {
    // We accept both GET (no-body probe) and POST (explicit invoke) so that
    // supabase-js `functions.invoke(..., { method })` works regardless of
    // what the SDK decides to do with an empty body.
    const authz = req.headers.get('Authorization');
    const apikey = req.headers.get('apikey');
    if (!authz) {
      console.warn('admin_infra_status: missing Authorization header', {
        method: req.method,
        hasApikey: !!apikey,
      });
      return new Response(
        JSON.stringify({
          error: 'Unauthorized',
          reason: 'missing_authorization_header',
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    // Strip any accidental "Bearer Bearer " double prefix.
    const rawToken = authz.replace(/^Bearer\s+/i, '').trim();
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';

    // If the caller sent the anon key as Bearer (i.e. no session), bail early
    // with a clear message instead of a generic 401.
    if (rawToken === anonKey) {
      console.warn('admin_infra_status: anon key sent as Bearer (no session)');
      return new Response(
        JSON.stringify({
          error: 'Unauthorized',
          reason: 'anon_key_not_user_session',
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${rawToken}` } },
    });

    const { data: userData, error: userErr } = await userClient.auth.getUser(
      rawToken,
    );
    if (userErr || !userData?.user) {
      console.warn('admin_infra_status: auth.getUser failed', {
        err: userErr?.message,
        tokenPrefix: rawToken.slice(0, 12) + '…',
      });
      return new Response(
        JSON.stringify({
          error: 'Unauthorized',
          reason: userErr?.message ?? 'auth_get_user_null',
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }
    const user = userData.user;

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Infrastructure cockpit is super_admin only. 'management' can view
    // users/clinics but must not see cost, deploy, or payment gateway keys
    // (even indirectly via error strings from misconfigured providers).
    const { data: roles } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'super_admin');

    if (!roles || roles.length === 0) {
      console.warn('admin_infra_status: caller is not super_admin', {
        userId: user.id,
        email: user.email,
      });
      return new Response(
        JSON.stringify({
          error: 'Forbidden: super_admin access required',
          user_id: user.id,
          email: user.email,
        }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const [razorpay, supa, azure, vercel] = await Promise.all([
      razorpayStatus(),
      supabaseStatus(admin),
      azureStatus(),
      vercelStatus(),
    ]);

    return new Response(
      JSON.stringify({
        providers: { razorpay, supabase: supa, azure, vercel },
        fetched_at: now(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
