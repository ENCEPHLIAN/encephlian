import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ArrowLeft, Building2, User, Coins, Eye, EyeOff, Loader2, Sparkles,
  CheckCircle2, XCircle, Copy, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Sku = "pilot" | "internal";

interface ProvisionResult {
  ok: true;
  request_id: string;
  clinic: { id: string; name: string; sku: string };
  clinician: { id: string; email: string; name: string };
  tokens: number;
}

interface ProvisionFailure {
  ok: false;
  step: string;
  error: string;
  code: string | null;
  request_id: string;
}

const SKU_DESCRIPTIONS: Record<Sku, { title: string; description: string; badge: string }> = {
  pilot: {
    title: "Pilot",
    description:
      "Production-grade access for real clinics. Read-API proxied, payments enabled, focused clinical navigation.",
    badge: "ships to clinics",
  },
  internal: {
    title: "Internal",
    description:
      "Full platform with diagnostics, direct API access, and every admin/dev surface. Use for our own engineering or controlled demos.",
    badge: "dev / ops only",
  },
};

function makePassword(length = 16): string {
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => charset[b % charset.length]).join("");
}

function passwordStrength(pw: string): { label: string; score: number; color: string } {
  if (pw.length === 0) return { label: "—", score: 0, color: "bg-muted" };
  if (pw.length < 8) return { label: "too short", score: 1, color: "bg-red-500" };
  let score = 1;
  if (/[A-Z]/.test(pw)) score++;
  if (/[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (pw.length >= 12) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const labels = ["weak", "weak", "fair", "ok", "strong", "very strong"];
  const colors = ["bg-red-500", "bg-red-500", "bg-amber-500", "bg-amber-500", "bg-emerald-500", "bg-emerald-500"];
  return { label: labels[Math.min(score, 5)], score, color: colors[Math.min(score, 5)] };
}

function CopyChip({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="group inline-flex items-center gap-1.5 rounded border border-border/60 bg-muted/30 px-2 py-1 text-left font-mono text-[11px] hover:bg-muted/60"
    >
      <span className="text-muted-foreground text-[10px] tracking-wide uppercase">{label}</span>
      <span>{value}</span>
      {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3 opacity-40 group-hover:opacity-100" />}
    </button>
  );
}

const EMPTY_FORM = {
  clinic_name: "",
  city: "",
  sku: "pilot" as Sku,
  clinician_name: "",
  clinician_email: "",
  clinician_password: "",
  initial_tokens: 10,
};

export default function AdminClinicNew() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [showPassword, setShowPassword] = useState(false);
  const [result, setResult] = useState<ProvisionResult | null>(null);

  const emailValid = useMemo(
    () => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.clinician_email),
    [form.clinician_email],
  );
  const strength = useMemo(() => passwordStrength(form.clinician_password), [form.clinician_password]);

  // ── Debounced availability checks ─────────────────────────────────────────
  const [debouncedEmail, setDebouncedEmail] = useState(form.clinician_email);
  const [debouncedName, setDebouncedName] = useState(form.clinic_name);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedEmail(form.clinician_email), 400);
    return () => clearTimeout(t);
  }, [form.clinician_email]);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedName(form.clinic_name), 400);
    return () => clearTimeout(t);
  }, [form.clinic_name]);

  const emailCheck = useQuery({
    queryKey: ["email-available", debouncedEmail],
    enabled: emailValid && debouncedEmail.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", debouncedEmail.toLowerCase())
        .maybeSingle();
      if (error) throw error;
      return { available: !data };
    },
    staleTime: 30_000,
  });

  const clinicNameCheck = useQuery({
    queryKey: ["clinic-name-available", debouncedName.trim()],
    enabled: debouncedName.trim().length > 1,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clinics")
        .select("id")
        .ilike("name", debouncedName.trim())
        .maybeSingle();
      if (error) throw error;
      return { available: !data };
    },
    staleTime: 30_000,
  });

  const provision = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("admin_provision_clinic", { body: form });

      const extract = (p: any): ProvisionFailure | null => {
        if (!p) return null;
        if (p.ok === false || p.error) {
          return {
            ok: false,
            step: p.step ?? "unknown",
            error: p.error ?? "Provisioning failed",
            code: p.code ?? null,
            request_id: p.request_id ?? "unknown",
          };
        }
        return null;
      };

      const fromData = extract(data);
      if (fromData) throw fromData;

      if (error) {
        const ctx = (error as any).context;
        try {
          let parsed: any = ctx;
          if (typeof ctx === "string") parsed = JSON.parse(ctx);
          else if (ctx && typeof ctx.text === "function") parsed = JSON.parse(await ctx.text());
          const fromCtx = extract(parsed);
          if (fromCtx) throw fromCtx;
        } catch (parseErr) {
          if (parseErr && typeof parseErr === "object" && "ok" in parseErr) throw parseErr;
        }
        throw {
          ok: false, step: "transport", error: error.message,
          code: null, request_id: "unknown",
        } as ProvisionFailure;
      }
      return data as ProvisionResult;
    },
    onSuccess: (r) => {
      setResult(r);
      toast.success(`Clinic provisioned — ${r.clinic.name}`, { description: r.request_id });
    },
    onError: (f: ProvisionFailure) => {
      toast.error(`[${f.step}] ${f.error}`, {
        description: `request_id ${f.request_id}`,
        duration: 12_000,
      });
    },
  });

  const blockers: string[] = [];
  if (!form.clinic_name.trim()) blockers.push("Clinic name");
  if (clinicNameCheck.data && !clinicNameCheck.data.available) blockers.push("Clinic name taken");
  if (!form.clinician_name.trim()) blockers.push("Clinician name");
  if (!form.clinician_email) blockers.push("Email");
  else if (!emailValid) blockers.push("Email invalid");
  else if (emailCheck.data && !emailCheck.data.available) blockers.push("Email taken");
  if (!form.clinician_password) blockers.push("Password");
  else if (strength.score < 3) blockers.push("Password weak");
  if (form.initial_tokens < 0) blockers.push("Token count negative");
  const ready = blockers.length === 0 && !provision.isPending;

  // ── Result view ──────────────────────────────────────────────────────────
  if (result) {
    return (
      <div className="max-w-3xl space-y-6 pb-12">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Clinic provisioned</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              All seven rows landed atomically · request_id {result.request_id}
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] tracking-wide uppercase text-muted-foreground">Clinic</p>
              <p className="text-sm font-medium mt-0.5">{result.clinic.name}</p>
              <p className="text-[11px] text-muted-foreground capitalize mt-0.5">{result.clinic.sku} tier</p>
            </div>
            <div>
              <p className="text-[10px] tracking-wide uppercase text-muted-foreground">Primary clinician</p>
              <p className="text-sm font-medium mt-0.5">{result.clinician.name}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{result.clinician.email}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-2 border-t border-emerald-500/20">
            <CopyChip label="clinic.id" value={result.clinic.id} />
            <CopyChip label="clinician.id" value={result.clinician.id} />
            <CopyChip label="wallet" value={`${result.tokens} tokens`} />
            <CopyChip label="login" value={`${window.location.origin}/`} />
          </div>
        </div>

        <div className="rounded-lg border border-border/60 p-5 space-y-2 text-xs text-muted-foreground">
          <p className="font-semibold text-foreground text-sm">Send to the clinician</p>
          <p>1. Login URL — <span className="font-mono">{window.location.origin}/</span></p>
          <p>2. Email — <span className="font-mono">{result.clinician.email}</span></p>
          <p>3. Temporary password — share via secure channel; ask them to change on first login.</p>
          <p>4. Initial token balance — <span className="font-mono">{result.tokens}</span></p>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setResult(null);
              setForm({ ...EMPTY_FORM });
            }}
          >
            Provision another
          </Button>
          <Button onClick={() => navigate("/admin/clinics")}>
            Back to clinics
          </Button>
        </div>
      </div>
    );
  }

  // ── Form view ────────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl pb-12">
      <div className="flex items-center gap-3 mb-6">
        <Link
          to="/admin/clinics"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Clinics
        </Link>
        <span className="text-muted-foreground/40">/</span>
        <span className="text-xs">Provision new</span>
      </div>

      <div className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight">Provision a clinic</h1>
        <p className="text-xs text-muted-foreground mt-1">
          One atomic operation: clinic + primary clinician account + role + clinic membership +
          wallet top-up + ledger entry + audit log entry. Either all seven land or none do.
        </p>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); if (ready) provision.mutate(); }}
        className="grid grid-cols-1 lg:grid-cols-[1fr,300px] gap-8"
      >
        <div className="space-y-8">
          {/* Section 1 — Clinic */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold tracking-tight">Clinic</h2>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="clinic_name" className="text-xs flex items-center justify-between">
                  <span>Name *</span>
                  {clinicNameCheck.isFetching && (
                    <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
                      <Loader2 className="h-2.5 w-2.5 animate-spin" /> checking
                    </span>
                  )}
                  {!clinicNameCheck.isFetching && clinicNameCheck.data && (
                    clinicNameCheck.data.available
                      ? <span className="text-[10px] text-emerald-500 inline-flex items-center gap-1">
                          <Check className="h-2.5 w-2.5" /> available
                        </span>
                      : <span className="text-[10px] text-red-500">already exists</span>
                  )}
                </Label>
                <Input
                  id="clinic_name"
                  value={form.clinic_name}
                  onChange={(e) => setForm((f) => ({ ...f, clinic_name: e.target.value }))}
                  placeholder="Magna Neurology"
                  className={cn(
                    "mt-1.5 h-9",
                    clinicNameCheck.data && !clinicNameCheck.data.available && "border-red-500/60",
                  )}
                  autoFocus
                />
              </div>
              <div>
                <Label htmlFor="city" className="text-xs">City</Label>
                <Input
                  id="city"
                  value={form.city}
                  onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                  placeholder="Hyderabad"
                  className="mt-1.5 h-9"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">Tier *</Label>
              <div className="grid grid-cols-2 gap-3 mt-1.5">
                {(["pilot", "internal"] as Sku[]).map((sku) => {
                  const meta = SKU_DESCRIPTIONS[sku];
                  const active = form.sku === sku;
                  return (
                    <button
                      key={sku}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, sku }))}
                      className={cn(
                        "rounded-lg border p-4 text-left transition-all",
                        active
                          ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                          : "border-border/60 hover:border-border hover:bg-accent/30",
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold">{meta.title}</p>
                        <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                          {meta.badge}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
                        {meta.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Section 2 — Primary clinician */}
          <section className="space-y-4 pt-2 border-t border-border/40">
            <div className="flex items-center gap-2 pt-4">
              <User className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold tracking-tight">Primary clinician</h2>
            </div>

            <div>
              <Label htmlFor="clinician_name" className="text-xs">Full name *</Label>
              <Input
                id="clinician_name"
                value={form.clinician_name}
                onChange={(e) => setForm((f) => ({ ...f, clinician_name: e.target.value }))}
                placeholder="Dr. Priya Sharma"
                className="mt-1.5 h-9"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="clinician_email" className="text-xs flex items-center justify-between">
                  <span>Email *</span>
                  {emailValid && emailCheck.isFetching && (
                    <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
                      <Loader2 className="h-2.5 w-2.5 animate-spin" /> checking
                    </span>
                  )}
                  {emailValid && !emailCheck.isFetching && emailCheck.data && (
                    emailCheck.data.available
                      ? <span className="text-[10px] text-emerald-500 inline-flex items-center gap-1">
                          <Check className="h-2.5 w-2.5" /> available
                        </span>
                      : <span className="text-[10px] text-red-500">already in use</span>
                  )}
                </Label>
                <Input
                  id="clinician_email"
                  type="email"
                  value={form.clinician_email}
                  onChange={(e) => setForm((f) => ({ ...f, clinician_email: e.target.value.toLowerCase().trim() }))}
                  placeholder="priya@magnaneuro.in"
                  className={cn(
                    "mt-1.5 h-9",
                    form.clinician_email.length > 0 && !emailValid && "border-red-500/60 focus-visible:ring-red-500/30",
                    emailCheck.data && !emailCheck.data.available && "border-red-500/60",
                  )}
                />
                {form.clinician_email.length > 0 && !emailValid && (
                  <p className="mt-1 text-[10px] text-red-500">Not a valid email</p>
                )}
              </div>
              <div>
                <Label htmlFor="clinician_password" className="text-xs flex items-center justify-between">
                  <span>Temporary password *</span>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, clinician_password: makePassword(16) }))}
                    className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
                  >
                    <Sparkles className="h-2.5 w-2.5" />
                    Generate strong
                  </button>
                </Label>
                <div className="relative mt-1.5">
                  <Input
                    id="clinician_password"
                    type={showPassword ? "text" : "password"}
                    value={form.clinician_password}
                    onChange={(e) => setForm((f) => ({ ...f, clinician_password: e.target.value }))}
                    className="h-9 pr-9 font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
                {form.clinician_password.length > 0 && (
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn("h-full transition-all", strength.color)}
                        style={{ width: `${(strength.score / 6) * 100}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground w-20 text-right">{strength.label}</span>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Section 3 — Wallet */}
          <section className="space-y-4 pt-2 border-t border-border/40">
            <div className="flex items-center gap-2 pt-4">
              <Coins className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold tracking-tight">Initial wallet</h2>
            </div>

            <div>
              <Label htmlFor="initial_tokens" className="text-xs">Starting tokens</Label>
              <div className="flex items-center gap-3 mt-1.5">
                <Input
                  id="initial_tokens"
                  type="number"
                  min={0}
                  value={form.initial_tokens}
                  onChange={(e) => setForm((f) => ({ ...f, initial_tokens: parseInt(e.target.value) || 0 }))}
                  className="h-9 w-32 font-mono"
                />
                <p className="text-[11px] text-muted-foreground">
                  Recorded in <span className="font-mono">wallet_transactions</span> as{" "}
                  <span className="font-mono">grant_initial</span>. Use 10 for pilots, higher for paid contracts.
                </p>
              </div>
            </div>
          </section>
        </div>

        {/* Right rail — live summary */}
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-lg border border-border/60 p-5 space-y-4">
            <p className="text-[10px] tracking-wide uppercase text-muted-foreground font-semibold">Summary</p>

            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Clinic</span>
                <span className="font-medium truncate ml-2 max-w-[160px]" title={form.clinic_name}>
                  {form.clinic_name || <em className="text-muted-foreground/60 font-normal">unset</em>}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">City</span>
                <span className="font-medium truncate ml-2 max-w-[160px]">
                  {form.city || <em className="text-muted-foreground/60 font-normal">—</em>}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Tier</span>
                <Badge variant="secondary" className="text-[10px] h-4 px-1.5 capitalize">{form.sku}</Badge>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Clinician</span>
                <span className="font-medium truncate ml-2 max-w-[160px]" title={form.clinician_name}>
                  {form.clinician_name || <em className="text-muted-foreground/60 font-normal">unset</em>}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Email</span>
                <span className="font-medium truncate ml-2 max-w-[180px]" title={form.clinician_email}>
                  {form.clinician_email
                    ? <span className={cn(emailValid ? "text-foreground" : "text-red-500")}>{form.clinician_email}</span>
                    : <em className="text-muted-foreground/60 font-normal">unset</em>}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Password</span>
                <span className={cn("font-medium", strength.score >= 3 ? "text-foreground" : "text-amber-600")}>
                  {form.clinician_password.length > 0 ? strength.label : <em className="text-muted-foreground/60 font-normal">unset</em>}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Tokens</span>
                <span className="font-mono font-medium">{form.initial_tokens}</span>
              </div>
            </div>

            <div className="pt-3 border-t border-border/40 space-y-2">
              <p className="text-[10px] tracking-wide uppercase text-muted-foreground font-semibold">On submit</p>
              <ul className="text-[11px] text-muted-foreground space-y-1 leading-relaxed">
                <li>· auth.users INSERT</li>
                <li>· profiles row (role=clinician)</li>
                <li>· user_roles row (scoped to clinic)</li>
                <li>· clinic_memberships row</li>
                <li>· wallets top-up + ledger entry</li>
                <li>· audit_logs event (clinic_provisioned)</li>
              </ul>
            </div>

            <Button type="submit" className="w-full" disabled={!ready}>
              {provision.isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                  Provisioning…
                </>
              ) : (
                "Provision clinic"
              )}
            </Button>

            {!ready && blockers.length > 0 && !provision.isPending && (
              <div className="text-[10px] text-muted-foreground">
                <p className="font-semibold">Waiting on:</p>
                <ul className="mt-1 space-y-0.5">
                  {blockers.map((b) => (
                    <li key={b} className="opacity-80">· {b}</li>
                  ))}
                </ul>
              </div>
            )}

            {provision.isError && (
              <div className="flex items-start gap-2 rounded border border-red-500/30 bg-red-500/5 p-2.5 text-[11px]">
                <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
                <div className="text-red-500">
                  <p className="font-medium">[{(provision.error as ProvisionFailure)?.step ?? "error"}]</p>
                  <p className="opacity-90 mt-0.5">{(provision.error as ProvisionFailure)?.error}</p>
                  <p className="font-mono text-[10px] mt-1 opacity-70">
                    {(provision.error as ProvisionFailure)?.request_id}
                  </p>
                </div>
              </div>
            )}
          </div>
        </aside>
      </form>
    </div>
  );
}
