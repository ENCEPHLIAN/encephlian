import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

/**
 * Streams raw EDF/BDF bytes to the browser without the client calling Azure Blob
 * directly (storage CORS often blocks that → "Failed to fetch").
 *
 * Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, CPLANE_URL (C-Plane base URL, no trailing slash).
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const u = new URL(req.url);
    const studyId = u.searchParams.get('study_id')?.trim();
    if (!studyId) {
      return new Response(JSON.stringify({ error: 'missing study_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authz = req.headers.get('Authorization') ?? '';
    const rawToken = authz.replace(/^Bearer\s+/i, '').trim();
    if (!rawToken) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${rawToken}` } },
    });
    const { data: ud, error: ue } = await userClient.auth.getUser(rawToken);
    if (ue || !ud?.user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized', detail: ue?.message ?? null }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const cplane = (Deno.env.get('CPLANE_URL') ?? Deno.env.get('CPLANE_INTERNAL_URL') ?? '')
      .replace(/\/+$/, '');
    if (!cplane) {
      return new Response(
        JSON.stringify({
          error: 'CPLANE_URL not configured',
          hint: 'Set CPLANE_URL in Supabase Edge Function secrets to your C-Plane base URL.',
        }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const tokenRes = await fetch(
      `${cplane}/read-token/${encodeURIComponent(studyId)}`,
    );
    if (!tokenRes.ok) {
      const t = await tokenRes.text().catch(() => '');
      return new Response(
        JSON.stringify({
          error: 'read-token failed',
          status: tokenRes.status,
          detail: t.slice(0, 400),
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const j = (await tokenRes.json()) as { sas_url?: string };
    if (!j?.sas_url) {
      return new Response(JSON.stringify({ error: 'invalid read-token response' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const blobRes = await fetch(j.sas_url);
    if (!blobRes.ok || !blobRes.body) {
      const t = await blobRes.text().catch(() => '');
      return new Response(
        JSON.stringify({
          error: 'blob fetch failed',
          status: blobRes.status,
          detail: t.slice(0, 200),
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const out = new Headers(corsHeaders);
    out.set('Content-Type', 'application/octet-stream');
    const cl = blobRes.headers.get('Content-Length');
    if (cl) out.set('Content-Length', cl);

    return new Response(blobRes.body, { status: 200, headers: out });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
