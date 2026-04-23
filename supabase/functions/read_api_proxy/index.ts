import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { insertPipelineEvent } from "../_shared/pipeline_log.ts";
import { extractStudyIdFromReadApiTail, isReadApiChunkBinPath } from "../_shared/read_api_path.ts";

const EXPOSE_HEADERS = [
  "x-eeg-content-sha256",
  "x-eeg-server-ms",
  "x-eeg-dtype",
  "x-eeg-nchannels",
  "x-eeg-length",
  "x-eeg-channel-count",
  "x-eeg-samples-per-channel",
  "x-correlation-id",
].join(", ");

function trimSlashes(s: string): string {
  return (s || "").trim().replace(/\/+$/, "");
}

function getReadApiBase(): string {
  const base = trimSlashes(Deno.env.get("VITE_ENCEPH_READ_API_BASE") || "");
  if (!base) throw new Error("Missing VITE_ENCEPH_READ_API_BASE secret");
  return base;
}

function getReadApiKey(): string {
  return (Deno.env.get("VITE_ENCEPH_READ_API_KEY") || "").trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        ...corsHeaders,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Expose-Headers": EXPOSE_HEADERS,
      },
    });
  }

  try {
    if (req.method !== "GET" && req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const base = getReadApiBase();
    const apiKey = getReadApiKey();
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing VITE_ENCEPH_READ_API_KEY secret" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const u = new URL(req.url);
    const marker = "/read_api_proxy";
    const idx = u.pathname.indexOf(marker);
    const tail = idx >= 0 ? u.pathname.slice(idx + marker.length) : "/";

    const targetUrl = `${base}${tail || "/"}${u.search}`;

    const headers = new Headers();
    headers.set("x-api-key", apiKey);

    const accept = req.headers.get("accept");
    if (accept) headers.set("accept", accept);

    const contentType = req.headers.get("content-type");
    if (contentType) headers.set("content-type", contentType);

    // Handle request body for POST
    let body: BodyInit | null = null;
    if (req.method === "POST") {
      body = await req.text();
    }

    const studyId = extractStudyIdFromReadApiTail(tail);
    const isChunk = isReadApiChunkBinPath(tail);
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const svcKey = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
    const serviceClient = studyId && svcKey ? createClient(supabaseUrl, svcKey) : null;
    const correlationId = crypto.randomUUID();
    const t0 = performance.now();

    if (serviceClient && studyId && !isChunk) {
      await insertPipelineEvent(serviceClient, {
        study_id: studyId,
        step: "edge.read_api_proxy.request",
        status: "info",
        source: "supabase_edge",
        correlation_id: correlationId,
        detail: { method: req.method, path_tail: tail.slice(0, 500) },
      });
    }

    const upstream = await fetch(targetUrl, { 
      method: req.method, 
      headers,
      body: req.method === "POST" ? body : undefined,
    });

    const upstreamMs = Math.round(performance.now() - t0);

    if (serviceClient && studyId) {
      if (upstream.status >= 400) {
        const prev = await upstream.clone().text().catch(() => "");
        await insertPipelineEvent(serviceClient, {
          study_id: studyId,
          step: "edge.read_api_proxy.upstream_error",
          status: "error",
          source: "supabase_edge",
          correlation_id: correlationId,
          detail: {
            http_status: upstream.status,
            upstream_ms: upstreamMs,
            path_tail: tail.slice(0, 500),
            body_preview: prev.slice(0, 800),
          },
        });
      } else if (!isChunk) {
        await insertPipelineEvent(serviceClient, {
          study_id: studyId,
          step: "edge.read_api_proxy.upstream_ok",
          status: "ok",
          source: "supabase_edge",
          correlation_id: correlationId,
          detail: {
            http_status: upstream.status,
            upstream_ms: upstreamMs,
            path_tail: tail.slice(0, 500),
          },
        });
      }
    }

    const outHeaders = new Headers(upstream.headers);
    // Ensure CORS + header visibility for diagnostics UI
    Object.entries(corsHeaders).forEach(([k, v]) => outHeaders.set(k, v));
    outHeaders.set("Access-Control-Expose-Headers", EXPOSE_HEADERS);
    if (studyId) outHeaders.set("X-Correlation-Id", correlationId);

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: outHeaders,
    });
  } catch (error) {
    console.error("read_api_proxy error", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
