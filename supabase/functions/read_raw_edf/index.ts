import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { insertPipelineEvent } from '../_shared/pipeline_log.ts';

/**
 * Streams raw EDF/BDF bytes to the browser without the client calling Azure Blob
 * directly (storage CORS often blocks that → "Failed to fetch").
 *
 * Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (pipeline_events),
 *   CPLANE_URL (C-Plane base URL, no trailing slash).
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

    const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const serviceClient = svcKey
      ? createClient(supabaseUrl, svcKey)
      : null;
    const correlationId = crypto.randomUUID();
    const t0 = performance.now();

    if (serviceClient) {
      await insertPipelineEvent(serviceClient, {
        study_id: studyId,
        step: 'edge.read_raw_edf.start',
        status: 'info',
        source: 'supabase_edge',
        correlation_id: correlationId,
        detail: { user_id: ud.user.id },
      });
    }

    const cplane = (Deno.env.get('CPLANE_URL') ?? Deno.env.get('CPLANE_INTERNAL_URL') ?? '')
      .replace(/\/+$/, '');
    if (!cplane) {
      if (serviceClient) {
        await insertPipelineEvent(serviceClient, {
          study_id: studyId,
          step: 'edge.read_raw_edf.config_error',
          status: 'error',
          source: 'supabase_edge',
          correlation_id: correlationId,
          detail: { message: 'CPLANE_URL not configured' },
        });
      }
      return new Response(
        JSON.stringify({
          error: 'CPLANE_URL not configured',
          hint: 'Set CPLANE_URL in Supabase Edge Function secrets to your C-Plane base URL.',
          correlation_id: correlationId,
        }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const tToken0 = performance.now();
    const tokenRes = await fetch(
      `${cplane}/read-token/${encodeURIComponent(studyId)}`,
    );
    const readTokenMs = Math.round(performance.now() - tToken0);
    if (!tokenRes.ok) {
      const t = await tokenRes.text().catch(() => '');
      if (serviceClient) {
        await insertPipelineEvent(serviceClient, {
          study_id: studyId,
          step: 'edge.read_raw_edf.read_token_failed',
          status: 'error',
          source: 'supabase_edge',
          correlation_id: correlationId,
          detail: { http_status: tokenRes.status, read_token_ms: readTokenMs, body_preview: t.slice(0, 400) },
        });
      }
      return new Response(
        JSON.stringify({
          error: 'read-token failed',
          status: tokenRes.status,
          detail: t.slice(0, 400),
          correlation_id: correlationId,
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const j = (await tokenRes.json()) as { sas_url?: string };
    if (!j?.sas_url) {
      if (serviceClient) {
        await insertPipelineEvent(serviceClient, {
          study_id: studyId,
          step: 'edge.read_raw_edf.read_token_invalid',
          status: 'error',
          source: 'supabase_edge',
          correlation_id: correlationId,
          detail: { read_token_ms: readTokenMs },
        });
      }
      return new Response(
        JSON.stringify({ error: 'invalid read-token response', correlation_id: correlationId }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const tBlob0 = performance.now();
    const blobRes = await fetch(j.sas_url);
    const blobHeadMs = Math.round(performance.now() - tBlob0);
    if (!blobRes.ok || !blobRes.body) {
      const t = await blobRes.text().catch(() => '');
      if (serviceClient) {
        await insertPipelineEvent(serviceClient, {
          study_id: studyId,
          step: 'edge.read_raw_edf.blob_failed',
          status: 'error',
          source: 'supabase_edge',
          correlation_id: correlationId,
          detail: {
            http_status: blobRes.status,
            read_token_ms: readTokenMs,
            blob_head_ms: blobHeadMs,
            body_preview: t.slice(0, 200),
          },
        });
      }
      return new Response(
        JSON.stringify({
          error: 'blob fetch failed',
          status: blobRes.status,
          detail: t.slice(0, 200),
          correlation_id: correlationId,
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (serviceClient) {
      await insertPipelineEvent(serviceClient, {
        study_id: studyId,
        step: 'edge.read_raw_edf.stream_ready',
        status: 'ok',
        source: 'supabase_edge',
        correlation_id: correlationId,
        detail: {
          read_token_ms: readTokenMs,
          blob_head_ms: blobHeadMs,
          total_ms: Math.round(performance.now() - t0),
          content_length: blobRes.headers.get('Content-Length'),
        },
      });
    }

    const out = new Headers(corsHeaders);
    out.set('Content-Type', 'application/octet-stream');
    const cl = blobRes.headers.get('Content-Length');
    if (cl) out.set('Content-Length', cl);
    out.set('X-Correlation-Id', correlationId);

    return new Response(blobRes.body, { status: 200, headers: out });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
