// =============================================================================
// AdminInfra — super_admin operations cockpit
//
// One page that aggregates the four backing tenants we actually pay for:
//   • Razorpay  (payments)
//   • Supabase  (database, storage, auth)
//   • Azure     (compute + blob + monitoring, where most $$ lives)
//   • Vercel    (frontend deploys)
//
// All data is fetched through the `admin_infra_status` edge function so
// provider credentials never touch the browser. The edge function is
// super_admin-gated; management role is blocked at the DB layer.
// =============================================================================

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUserSession } from "@/contexts/UserSessionContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import {
  Loader2,
  RefreshCw,
  CreditCard,
  Database,
  Cloud,
  Rocket,
  CheckCircle2,
  XCircle,
  Settings2,
  Shield,
  AlertTriangle,
} from "lucide-react";

type ProviderStatus = {
  configured: boolean;
  ok?: boolean;
  required_env?: string[];
  error?: string;
  data?: Record<string, any>;
  fetched_at: string;
};

type InfraResponse = {
  providers: {
    razorpay: ProviderStatus;
    supabase: ProviderStatus;
    azure: ProviderStatus;
    vercel: ProviderStatus;
  };
  fetched_at: string;
};

function StatusPill({ s }: { s: ProviderStatus }) {
  if (!s.configured) {
    return (
      <Badge variant="outline" className="text-[10px] gap-1 border-muted-foreground/30">
        <Settings2 className="h-3 w-3" />
        Not configured
      </Badge>
    );
  }
  if (s.ok) {
    return (
      <Badge
        variant="secondary"
        className="text-[10px] gap-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
      >
        <CheckCircle2 className="h-3 w-3" />
        Healthy
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className="text-[10px] gap-1">
      <XCircle className="h-3 w-3" />
      Error
    </Badge>
  );
}

function RequiredEnvBlock({ s }: { s: ProviderStatus }) {
  if (s.configured || !s.required_env?.length) return null;
  return (
    <div className="mt-3 rounded-md border border-dashed border-amber-500/30 bg-amber-500/5 p-3 text-xs">
      <p className="font-medium text-amber-700 dark:text-amber-400 mb-1">
        To enable this tile, set the following secrets in the Supabase dashboard:
      </p>
      <div className="font-mono flex flex-wrap gap-1">
        {s.required_env.map((k) => (
          <span
            key={k}
            className="px-1.5 py-0.5 rounded bg-background border border-border/60 text-[10px]"
          >
            {k}
          </span>
        ))}
      </div>
    </div>
  );
}

function ErrorBlock({ s }: { s: ProviderStatus }) {
  if (!s.error) return null;
  return (
    <Alert variant="destructive" className="mt-3">
      <AlertTriangle className="h-3.5 w-3.5" />
      <AlertTitle className="text-xs">Provider error</AlertTitle>
      <AlertDescription className="font-mono text-[10px] whitespace-pre-wrap break-all">
        {s.error}
      </AlertDescription>
    </Alert>
  );
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 text-xs py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-right truncate max-w-[240px]">{value}</span>
    </div>
  );
}

// ── Tiles ────────────────────────────────────────────────────────────────
function RazorpayTile({ s }: { s: ProviderStatus }) {
  const d = s.data;
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-muted-foreground" />
          Razorpay
          {d?.mode && (
            <Badge
              variant="outline"
              className="text-[9px] h-4 px-1.5 uppercase tracking-wider"
            >
              {d.mode}
            </Badge>
          )}
        </CardTitle>
        <StatusPill s={s} />
      </CardHeader>
      <CardContent className="space-y-1">
        <RequiredEnvBlock s={s} />
        <ErrorBlock s={s} />
        {d && (
          <>
            <KV label="Last 10 payments" value={d.count ?? 0} />
            <KV label="Captured" value={d.captured ?? 0} />
            <KV label="Failed" value={d.failed ?? 0} />
            <KV label="Refunded" value={d.refunded ?? 0} />
            {Array.isArray(d.last_10) && d.last_10.length > 0 && (
              <div className="mt-3 border-t border-border/40 pt-2 space-y-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Recent
                </p>
                {d.last_10.slice(0, 5).map((p: any) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between text-[11px] font-mono"
                  >
                    <span className="text-muted-foreground truncate">
                      {p.id.slice(0, 14)}
                    </span>
                    <span>
                      ₹{(p.amount / 100).toFixed(2)}{" "}
                      <Badge variant="secondary" className="h-3 text-[9px] px-1 ml-1">
                        {p.status}
                      </Badge>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function SupabaseTile({ s }: { s: ProviderStatus }) {
  const d = s.data;
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Database className="h-4 w-4 text-muted-foreground" />
          Supabase
        </CardTitle>
        <StatusPill s={s} />
      </CardHeader>
      <CardContent className="space-y-1">
        <ErrorBlock s={s} />
        {d?.counts && (
          <>
            <KV label="Profiles" value={d.counts.profiles} />
            <KV label="Clinics" value={d.counts.clinics} />
            <KV label="Studies" value={d.counts.studies} />
            <KV label="Payments" value={d.counts.payments} />
            <KV label="Audit logs" value={d.counts.audit_logs} />
          </>
        )}
        {Array.isArray(d?.storage_buckets) && (
          <div className="mt-3 border-t border-border/40 pt-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
              Storage buckets ({d.storage_buckets.length})
            </p>
            <div className="flex flex-wrap gap-1">
              {d.storage_buckets.map((b: any) => (
                <Badge
                  key={b.id}
                  variant="outline"
                  className="font-mono text-[10px] h-4 px-1.5"
                >
                  {b.name}
                  {b.public && <span className="ml-1 opacity-50">· public</span>}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AzureTile({ s }: { s: ProviderStatus }) {
  const d = s.data;
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Cloud className="h-4 w-4 text-muted-foreground" />
          Azure
        </CardTitle>
        <StatusPill s={s} />
      </CardHeader>
      <CardContent className="space-y-1">
        <RequiredEnvBlock s={s} />
        <ErrorBlock s={s} />
        {d && (
          <>
            <KV
              label="Subscription"
              value={
                <>
                  {d.display_name ?? "—"}{" "}
                  {d.state && (
                    <Badge variant="secondary" className="h-3 text-[9px] px-1 ml-1">
                      {d.state}
                    </Badge>
                  )}
                </>
              }
            />
            <KV
              label="ID"
              value={
                <span className="text-[10px] opacity-70">
                  {(d.subscription_id ?? "").slice(0, 8)}…
                </span>
              }
            />
            {typeof d.month_to_date_cost === "number" &&
              Number.isFinite(d.month_to_date_cost) && (
                <KV
                  label="MTD cost (pre-tax)"
                  value={
                    <span>
                      {d.month_to_date_currency
                        ? `${d.month_to_date_currency} `
                        : ""}
                      {d.month_to_date_cost.toFixed(2)}
                    </span>
                  }
                />
              )}
            {d.cost_query_error && (
              <KV label="Cost query" value={<span className="text-amber-600">{d.cost_query_error}</span>} />
            )}
            {Array.isArray(d.credits) && d.credits.length > 0 && (
              <div className="mt-2 rounded-md border border-border/50 bg-muted/20 p-2 space-y-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Azure credits (remaining)
                </p>
                {d.credits.map((c: any, i: number) => (
                  <div key={i} className="flex justify-between text-[11px] font-mono gap-2">
                    <span className="truncate text-muted-foreground" title={c.name ?? ""}>
                      {(c.name ?? "Balance").replace(/^.*\//, "").slice(0, 28)}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {c.currency ? `${c.currency} ` : ""}
                      {typeof c.amount === "number" ? c.amount.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—"}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {Array.isArray(d.credits) &&
              d.credits.length === 0 &&
              typeof d.credits_http_status === "number" &&
              d.credits_http_status !== 200 && (
                <KV
                  label="Credits API"
                  value={
                    <span className="text-muted-foreground">
                      HTTP {d.credits_http_status}
                      {d.credits_http_status === 404
                        ? " — not exposed for this subscription type"
                        : ""}
                    </span>
                  }
                />
              )}
            {Array.isArray(d.resource_groups) && (
              <div className="mt-3 border-t border-border/40 pt-2">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                  Resource groups ({d.resource_groups.length})
                </p>
                <div className="flex flex-wrap gap-1">
                  {d.resource_groups.map((rg: any) => (
                    <Badge
                      key={rg.name}
                      variant="outline"
                      className="font-mono text-[10px] h-4 px-1.5"
                    >
                      {rg.name}
                      <span className="ml-1 opacity-50">· {rg.location}</span>
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {d.note && (
              <p className="mt-3 text-[10px] text-muted-foreground/70 italic">{d.note}</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function VercelTile({ s }: { s: ProviderStatus }) {
  const d = s.data;
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Rocket className="h-4 w-4 text-muted-foreground" />
          Vercel
        </CardTitle>
        <StatusPill s={s} />
      </CardHeader>
      <CardContent className="space-y-1">
        <RequiredEnvBlock s={s} />
        <ErrorBlock s={s} />
        {Array.isArray(d?.deployments) && (
          <div className="mt-1 space-y-1.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Recent deploys
            </p>
            {d.deployments.slice(0, 6).map((dep: any) => {
              const stateColor =
                dep.state === "READY"
                  ? "text-emerald-500"
                  : dep.state === "ERROR"
                    ? "text-red-500"
                    : "text-amber-500";
              return (
                <a
                  key={dep.uid}
                  href={`https://${dep.url}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between text-[11px] font-mono hover:underline"
                >
                  <span className="truncate max-w-[200px] text-muted-foreground">
                    {dep.meta?.branch ?? dep.target ?? "—"} ·{" "}
                    {(dep.meta?.commit ?? "").slice(0, 7) || dep.uid.slice(0, 7)}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className={stateColor}>{dep.state}</span>
                    <span className="text-muted-foreground/50">
                      {formatDistanceToNow(new Date(dep.created), { addSuffix: true })}
                    </span>
                  </span>
                </a>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────
export default function AdminInfra() {
  const { user, roles, isLoading: sessionLoading } = useUserSession();
  const isSuperAdmin = roles.includes("super_admin");

  const [data, setData] = useState<InfraResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      // Use POST (default) so supabase-js attaches the session JWT + body
      // reliably. The edge function treats GET/POST the same.
      const { data: res, error: fnErr } = await supabase.functions.invoke(
        "admin_infra_status",
        { body: {} },
      );
      if (fnErr) {
        // supabase-js wraps FunctionsHttpError; dig the actual response body
        // so the user sees 'anon_key_not_user_session' etc. instead of the
        // generic 'non-2xx status code'.
        let detail = fnErr.message ?? "Edge function error";
        try {
          const ctx = (fnErr as any).context as Response | undefined;
          if (ctx && typeof ctx.text === "function") {
            const body = await ctx.text();
            if (body) detail = `${detail} — ${body}`;
          }
        } catch {
          /* swallow */
        }
        throw new Error(detail);
      }
      setData(res as InfraResponse);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load infrastructure status");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!sessionLoading && isSuperAdmin) {
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionLoading, isSuperAdmin]);

  if (sessionLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="max-w-2xl">
        <Alert variant="destructive">
          <Shield className="h-4 w-4" />
          <AlertTitle>super_admin access required</AlertTitle>
          <AlertDescription>
            This page proxies cost, deploy, and payment-gateway data and is
            restricted to the <code>super_admin</code> role. Signed in as{" "}
            <span className="font-mono">{user?.email}</span> with roles{" "}
            <span className="font-mono">[{roles.join(", ") || "none"}]</span>.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight">Infrastructure</h1>
            <Badge
              variant="secondary"
              className="h-5 text-[10px] bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20"
            >
              super_admin
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Aggregated status from Razorpay, Supabase, Azure, and Vercel.
            {data && (
              <>
                {" "}· Last refresh{" "}
                {formatDistanceToNow(new Date(data.fetched_at), { addSuffix: true })}
              </>
            )}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          )}
          Refresh
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertTitle>Failed to load infra status</AlertTitle>
          <AlertDescription className="font-mono text-xs whitespace-pre-wrap">
            {error}
          </AlertDescription>
        </Alert>
      )}

      {loading && !data ? (
        <div className="grid md:grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : data ? (
        <div className="grid md:grid-cols-2 gap-4">
          <RazorpayTile s={data.providers.razorpay} />
          <SupabaseTile s={data.providers.supabase} />
          <AzureTile s={data.providers.azure} />
          <VercelTile s={data.providers.vercel} />
        </div>
      ) : null}

      <div className="rounded-lg border border-border/60 p-4 text-xs text-muted-foreground space-y-2">
        <p className="font-medium text-foreground">What this page does NOT do</p>
        <p>
          No shell access, no arbitrary Azure-CLI — browsers can't safely host a
          shell on a tenant you own. For ad-hoc investigation use{" "}
          <code className="font-mono">az</code> locally; this cockpit is for{" "}
          <em>read-only</em> observability of credit burn, deploy health, and
          payment flow.
        </p>
        <p>
          Write operations (retrying a failed deploy, triggering a Cost Management
          export, etc.) will land as explicit buttons behind an additional
          2FA challenge. See TRACK.md → tranche I for the full roadmap.
        </p>
      </div>
    </div>
  );
}
