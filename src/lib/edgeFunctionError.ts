/**
 * Supabase Edge Functions invoked via `supabase.functions.invoke` often hide
 * the JSON error body behind a generic FunctionsHttpError. This helper digs
 * `error.context.text()` (when available) and falls back to `{ error }` in
 * the parsed `data` payload (some deployments return 200 with `{ error }`).
 */
export async function formatEdgeFunctionError(
  err: unknown,
  data?: unknown,
): Promise<string> {
  const base = err instanceof Error ? err.message : String(err);

  try {
    const ctx = (err as { context?: Response })?.context;
    if (ctx && typeof ctx.text === "function") {
      const body = await ctx.text();
      if (body?.trim()) {
        try {
          const j = JSON.parse(body) as { error?: string; message?: string };
          const inner = j.error || j.message;
          if (inner) return `${base} — ${inner}`;
        } catch {
          return `${base} — ${body.slice(0, 500)}`;
        }
      }
    }
  } catch {
    /* ignore */
  }

  if (data && typeof data === "object" && data !== null && "error" in data) {
    const e = (data as { error?: unknown }).error;
    if (typeof e === "string" && e.trim()) return e.trim();
  }

  return base;
}
