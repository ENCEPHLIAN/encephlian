import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Loader2, Building2, Pencil, Plus, Trash2, User, Coins, Copy, Check,
  ExternalLink, Minus,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { cn } from "@/lib/utils";
import { SKU_LABELS, SKU_TIERS, SkuTier } from "@/shared/skuPolicy";

type ClinicRow = {
  id: string;
  name: string;
  city: string | null;
  is_active: boolean;
  created_at: string;
  study_count: number;
  member_count: number;
  sku: string;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  is_disabled: boolean | null;
  role?: string | null;
};

type StudyRow = {
  id: string;
  clinic_id: string;
  owner: string;
  state: string | null;
  meta: any;
  created_at: string;
};

type WalletRow = {
  tokens: number;
  updated_at: string | null;
};

const SKU_STYLE: Record<string, string> = {
  internal: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  pilot:    "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  demo:     "bg-blue-500/10 text-blue-500",
};

const STATE_STYLE: Record<string, string> = {
  awaiting_sla: "bg-muted/50 text-muted-foreground",
  pending:      "bg-muted/50 text-muted-foreground",
  uploaded:     "bg-blue-500/10 text-blue-500",
  processing:   "bg-amber-500/10 text-amber-500",
  ai_draft:     "bg-violet-500/10 text-violet-500",
  complete:     "bg-emerald-500/10 text-emerald-500",
  signed:       "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  failed:       "bg-red-500/10 text-red-500",
};

const ROLE_STYLE: Record<string, string> = {
  admin:     "bg-red-500/10 text-red-500",
  clinician: "bg-violet-500/10 text-violet-500",
  viewer:    "bg-muted/50 text-muted-foreground",
};

const EMPTY_ONBOARD = {
  clinic_name: "", city: "", sku: "" as SkuTier | "",
  clinician_name: "", clinician_email: "", clinician_password: "",
  initial_tokens: 10,
};

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button
      onClick={handleCopy}
      className="ml-1.5 inline-flex items-center text-muted-foreground hover:text-foreground transition-colors"
      title="Copy"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

export default function AdminClinics() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editTarget, setEditTarget] = useState<ClinicRow | null>(null);
  const [editForm, setEditForm] = useState({ name: "", city: "", sku: "pilot" as SkuTier });
  const [onboardOpen, setOnboardOpen] = useState(false);
  const [onboardForm, setOnboardForm] = useState({ ...EMPTY_ONBOARD });
  const [deleteTarget, setDeleteTarget] = useState<ClinicRow | null>(null);
  const [selectedClinic, setSelectedClinic] = useState<ClinicRow | null>(null);

  // Wallet adjust state (inside sheet)
  const [walletAdjustForm, setWalletAdjustForm] = useState({
    amount: "",
    operation: "add" as "add" | "remove" | "set",
  });

  // ── Main clinics query ────────────────────────────────────────────────────
  const { data: clinics, isLoading } = useQuery<ClinicRow[]>({
    queryKey: ["admin-all-clinics"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_get_all_clinics");
      if (error) throw error;
      return data as ClinicRow[];
    },
  });

  // ── Sheet sub-queries ─────────────────────────────────────────────────────
  const { data: sheetUsers, isLoading: usersLoading } = useQuery<ProfileRow[]>({
    queryKey: ["admin-clinic-users", selectedClinic?.id],
    enabled: !!selectedClinic,
    queryFn: async () => {
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, is_disabled")
        .eq("clinic_id", selectedClinic!.id);
      if (error) throw error;

      // Fetch roles for these users
      const userIds = (profiles || []).map((p) => p.id);
      if (userIds.length === 0) return [];
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", userIds);
      const roleMap = new Map((roles || []).map((r: any) => [r.user_id, r.role]));
      return (profiles || []).map((p) => ({
        ...p,
        role: roleMap.get(p.id) ?? null,
      })) as ProfileRow[];
    },
  });

  const { data: sheetStudies, isLoading: studiesLoading } = useQuery<StudyRow[]>({
    queryKey: ["admin-clinic-studies", selectedClinic?.id],
    enabled: !!selectedClinic,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_get_all_studies");
      if (error) throw error;
      return ((data as any[]) || []).filter(
        (s) => s.clinic_id === selectedClinic!.id,
      ) as StudyRow[];
    },
  });

  const { data: sheetWallet, isLoading: walletLoading } = useQuery<WalletRow | null>({
    queryKey: ["admin-clinic-wallet", selectedClinic?.id],
    enabled: !!selectedClinic,
    queryFn: async () => {
      // Try clinic-level wallet first
      const { data, error } = await supabase
        .from("wallets")
        .select("tokens, updated_at")
        .eq("clinic_id", selectedClinic!.id)
        .maybeSingle();
      if (error) throw error;
      if (data) return data as WalletRow;

      // Fall back: find the primary user wallet (first user in clinic)
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id")
        .eq("clinic_id", selectedClinic!.id)
        .limit(1);
      if (!profiles || profiles.length === 0) return null;
      const primaryUserId = profiles[0].id;
      const { data: userWallet, error: wErr } = await supabase
        .from("wallets")
        .select("tokens, updated_at")
        .eq("user_id", primaryUserId)
        .maybeSingle();
      if (wErr) throw wErr;
      return (userWallet as WalletRow) ?? null;
    },
  });

  // Derive the wallet adjust target (first user id for per-user fallback)
  const { data: clinicPrimaryUserId } = useQuery<string | null>({
    queryKey: ["admin-clinic-primary-user", selectedClinic?.id],
    enabled: !!selectedClinic,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id")
        .eq("clinic_id", selectedClinic!.id)
        .limit(1);
      return data?.[0]?.id ?? null;
    },
  });

  // ── Mutations ─────────────────────────────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: async ({ clinicId, updates }: { clinicId: string; updates: Record<string, any> }) => {
      const { error } = await supabase.rpc("admin_update_clinic", { p_clinic_id: clinicId, p_updates: updates });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-all-clinics"] });
      toast.success("Saved");
      setEditTarget(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const onboardMutation = useMutation({
    mutationFn: async (form: typeof onboardForm) => {
      const { data, error } = await supabase.functions.invoke("admin_onboard_value_unit", { body: form });
      if (data?.error) throw new Error(data.error);
      if (error) {
        const ctx = (error as any).context;
        try { const p = JSON.parse(typeof ctx === "string" ? ctx : "{}"); if (p?.error) throw new Error(p.error); } catch (_) {}
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-all-clinics"] });
      queryClient.invalidateQueries({ queryKey: ["admin-all-users"] });
      toast.success("Clinic onboarded");
      setOnboardOpen(false);
      setOnboardForm({ ...EMPTY_ONBOARD });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (clinicId: string) => {
      const { error } = await supabase.rpc("admin_delete_clinic", { p_clinic_id: clinicId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-all-clinics"] });
      toast.success("Clinic deleted");
      setDeleteTarget(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const walletAdjustMutation = useMutation({
    mutationFn: async ({ userId, amount, operation }: { userId: string; amount: number; operation: string }) => {
      const { data, error } = await supabase.rpc("admin_adjust_tokens", {
        p_user_id: userId,
        p_amount: amount,
        p_operation: operation,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["admin-clinic-wallet", selectedClinic?.id] });
      toast.success(`Tokens updated: ${data?.old_balance} → ${data?.new_balance}`);
      setWalletAdjustForm({ amount: "", operation: "add" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleWalletAdjust = () => {
    if (!clinicPrimaryUserId) {
      toast.error("No user found for this clinic");
      return;
    }
    const amount = parseInt(walletAdjustForm.amount);
    if (isNaN(amount) || amount < 0) {
      toast.error("Enter a valid amount");
      return;
    }
    walletAdjustMutation.mutate({
      userId: clinicPrimaryUserId,
      amount,
      operation: walletAdjustForm.operation,
    });
  };

  return (
    <div className="space-y-4 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Clinics</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {clinics?.length ?? 0} value units ·{" "}
            {clinics?.reduce((s, c) => s + (c.study_count || 0), 0) ?? 0} studies total
          </p>
        </div>
        <Button size="sm" onClick={() => setOnboardOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Onboard clinic
        </Button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="rounded-lg border border-border/60 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40 bg-muted/30">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Clinic</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">SKU</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Members</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Studies</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Created</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Active</th>
                <th className="px-4 py-2.5 w-20" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {clinics && clinics.length > 0 ? (
                clinics.map((c) => (
                  <tr
                    key={c.id}
                    className={cn(
                      "hover:bg-accent/20 transition-colors cursor-pointer",
                      !c.is_active && "opacity-50",
                    )}
                    onClick={() => setSelectedClinic(c)}
                  >
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium">{c.name}</span>
                      {c.city && <span className="ml-2 text-xs text-muted-foreground">{c.city}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary" className={cn("text-[10px] h-4 px-1.5", SKU_STYLE[c.sku] || SKU_STYLE.pilot)}>
                        {SKU_LABELS[(c.sku as SkuTier)] || c.sku}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-xs text-muted-foreground">{c.member_count}</td>
                    <td className="px-4 py-3 tabular-nums text-xs text-muted-foreground">{c.study_count}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <Switch
                        checked={c.is_active}
                        onCheckedChange={() => updateMutation.mutate({ clinicId: c.id, updates: { is_active: !c.is_active } })}
                      />
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => { setEditTarget(c); setEditForm({ name: c.name, city: c.city || "", sku: (c.sku as SkuTier) || "pilot" }); }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setDeleteTarget(c)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-xs text-muted-foreground">
                    No clinics yet. Onboard your first clinic to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Clinic Detail Sheet ─────────────────────────────────────────── */}
      <Sheet open={!!selectedClinic} onOpenChange={(o) => !o && setSelectedClinic(null)}>
        <SheetContent className="w-[500px] sm:w-[600px] overflow-y-auto">
          {selectedClinic && (
            <>
              <SheetHeader className="mb-4">
                <SheetTitle className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  {selectedClinic.name}
                </SheetTitle>
                <div className="flex items-center gap-2 mt-1">
                  <Badge
                    variant="secondary"
                    className={cn("text-[10px] h-4 px-1.5", SKU_STYLE[selectedClinic.sku] || SKU_STYLE.pilot)}
                  >
                    {SKU_LABELS[(selectedClinic.sku as SkuTier)] || selectedClinic.sku}
                  </Badge>
                  {!selectedClinic.is_active && (
                    <Badge variant="secondary" className="text-[10px] h-4 px-1.5 bg-muted/50 text-muted-foreground">
                      inactive
                    </Badge>
                  )}
                </div>
              </SheetHeader>

              <Tabs defaultValue="overview">
                <TabsList className="w-full grid grid-cols-4">
                  <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
                  <TabsTrigger value="users" className="text-xs">Users</TabsTrigger>
                  <TabsTrigger value="studies" className="text-xs">Studies</TabsTrigger>
                  <TabsTrigger value="wallet" className="text-xs">Wallet</TabsTrigger>
                </TabsList>

                {/* ── Overview ─────────────────────────────────────────── */}
                <TabsContent value="overview" className="mt-4 space-y-3">
                  <div className="rounded-lg border border-border/60 overflow-hidden">
                    <table className="w-full text-sm">
                      <tbody className="divide-y divide-border/40">
                        <tr className="bg-muted/30">
                          <td className="px-3 py-2.5 text-xs text-muted-foreground w-32">Name</td>
                          <td className="px-3 py-2.5 text-xs font-medium">{selectedClinic.name}</td>
                        </tr>
                        <tr>
                          <td className="px-3 py-2.5 text-xs text-muted-foreground">City</td>
                          <td className="px-3 py-2.5 text-xs">{selectedClinic.city || "—"}</td>
                        </tr>
                        <tr className="bg-muted/30">
                          <td className="px-3 py-2.5 text-xs text-muted-foreground">SKU</td>
                          <td className="px-3 py-2.5">
                            <Badge variant="secondary" className={cn("text-[10px] h-4 px-1.5", SKU_STYLE[selectedClinic.sku] || SKU_STYLE.pilot)}>
                              {SKU_LABELS[(selectedClinic.sku as SkuTier)] || selectedClinic.sku}
                            </Badge>
                          </td>
                        </tr>
                        <tr>
                          <td className="px-3 py-2.5 text-xs text-muted-foreground">Active</td>
                          <td className="px-3 py-2.5">
                            <Switch
                              checked={selectedClinic.is_active}
                              onCheckedChange={() =>
                                updateMutation.mutate({
                                  clinicId: selectedClinic.id,
                                  updates: { is_active: !selectedClinic.is_active },
                                })
                              }
                            />
                          </td>
                        </tr>
                        <tr className="bg-muted/30">
                          <td className="px-3 py-2.5 text-xs text-muted-foreground">Members</td>
                          <td className="px-3 py-2.5 text-xs tabular-nums">{selectedClinic.member_count}</td>
                        </tr>
                        <tr>
                          <td className="px-3 py-2.5 text-xs text-muted-foreground">Studies</td>
                          <td className="px-3 py-2.5 text-xs tabular-nums">{selectedClinic.study_count}</td>
                        </tr>
                        <tr className="bg-muted/30">
                          <td className="px-3 py-2.5 text-xs text-muted-foreground">Created</td>
                          <td className="px-3 py-2.5 text-xs">
                            {format(new Date(selectedClinic.created_at), "MMM d, yyyy")}
                          </td>
                        </tr>
                        <tr>
                          <td className="px-3 py-2.5 text-xs text-muted-foreground">Clinic ID</td>
                          <td className="px-3 py-2.5">
                            <span className="font-mono text-[11px] text-muted-foreground">
                              {selectedClinic.id}
                            </span>
                            <CopyButton value={selectedClinic.id} />
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </TabsContent>

                {/* ── Users ────────────────────────────────────────────── */}
                <TabsContent value="users" className="mt-4 space-y-3">
                  {usersLoading ? (
                    <div className="flex items-center justify-center h-24">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : sheetUsers && sheetUsers.length > 0 ? (
                    <div className="rounded-lg border border-border/60 overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border/40 bg-muted/30">
                            <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Name</th>
                            <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Email</th>
                            <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Role</th>
                            <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/40">
                          {sheetUsers.map((u) => (
                            <tr key={u.id} className="hover:bg-accent/20 transition-colors">
                              <td className="px-3 py-2.5 text-xs font-medium">{u.full_name || "—"}</td>
                              <td className="px-3 py-2.5 text-xs text-muted-foreground">{u.email || "—"}</td>
                              <td className="px-3 py-2.5">
                                {u.role ? (
                                  <Badge
                                    variant="secondary"
                                    className={cn("text-[10px] h-4 px-1.5", ROLE_STYLE[u.role] || "bg-muted/50 text-muted-foreground")}
                                  >
                                    {u.role}
                                  </Badge>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </td>
                              <td className="px-3 py-2.5">
                                {u.is_disabled ? (
                                  <Badge variant="secondary" className="text-[10px] h-4 px-1.5 bg-red-500/10 text-red-500">
                                    disabled
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-[10px] h-4 px-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                                    active
                                  </Badge>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-8">No users in this clinic.</p>
                  )}
                </TabsContent>

                {/* ── Studies ──────────────────────────────────────────── */}
                <TabsContent value="studies" className="mt-4 space-y-3">
                  {studiesLoading ? (
                    <div className="flex items-center justify-center h-24">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : sheetStudies && sheetStudies.length > 0 ? (
                    <div className="rounded-lg border border-border/60 overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border/40 bg-muted/30">
                            <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Study ID</th>
                            <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Patient</th>
                            <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">State</th>
                            <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Created</th>
                            <th className="px-3 py-2 w-8" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/40">
                          {sheetStudies.map((s) => (
                            <tr
                              key={s.id}
                              className="hover:bg-accent/20 transition-colors cursor-pointer"
                              onClick={() => navigate(`/admin/studies/${s.id}`)}
                            >
                              <td className="px-3 py-2.5">
                                <span className="font-mono text-[11px] text-muted-foreground">
                                  {s.id.slice(0, 8)}…
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-xs">
                                {s.meta?.patient_id || s.meta?.patientId || "—"}
                              </td>
                              <td className="px-3 py-2.5">
                                {s.state ? (
                                  <Badge
                                    variant="secondary"
                                    className={cn("text-[10px] h-4 px-1.5", STATE_STYLE[s.state] || "bg-muted/50 text-muted-foreground")}
                                  >
                                    {s.state}
                                  </Badge>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-xs text-muted-foreground">
                                {formatDistanceToNow(new Date(s.created_at), { addSuffix: true })}
                              </td>
                              <td className="px-3 py-2.5">
                                <ExternalLink className="h-3 w-3 text-muted-foreground" />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-8">No studies for this clinic.</p>
                  )}
                </TabsContent>

                {/* ── Wallet ───────────────────────────────────────────── */}
                <TabsContent value="wallet" className="mt-4 space-y-3">
                  {walletLoading ? (
                    <div className="flex items-center justify-center h-24">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <>
                      {/* Balance display */}
                      <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Coins className="h-4 w-4 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">Current balance</span>
                        </div>
                        <div className="text-right">
                          <span className="text-lg font-mono font-semibold tabular-nums">
                            {sheetWallet?.tokens ?? 0}
                          </span>
                          <span className="text-xs text-muted-foreground ml-1">tokens</span>
                          {sheetWallet?.updated_at && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              updated {formatDistanceToNow(new Date(sheetWallet.updated_at), { addSuffix: true })}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Adjust inline */}
                      <div className="rounded-lg border border-border/60 p-3 space-y-3">
                        <p className="text-xs font-medium">Adjust tokens</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs">Operation</Label>
                            <Select
                              value={walletAdjustForm.operation}
                              onValueChange={(v) =>
                                setWalletAdjustForm((f) => ({ ...f, operation: v as any }))
                              }
                            >
                              <SelectTrigger className="mt-1 h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent position="popper" sideOffset={4}>
                                <SelectItem value="add">
                                  <div className="flex items-center gap-1.5 text-xs">
                                    <Plus className="h-3 w-3 text-emerald-500" /> Add
                                  </div>
                                </SelectItem>
                                <SelectItem value="remove">
                                  <div className="flex items-center gap-1.5 text-xs">
                                    <Minus className="h-3 w-3 text-red-500" /> Remove
                                  </div>
                                </SelectItem>
                                <SelectItem value="set">
                                  <div className="flex items-center gap-1.5 text-xs">
                                    <Coins className="h-3 w-3" /> Set to
                                  </div>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-xs">Amount</Label>
                            <Input
                              type="number"
                              min="0"
                              value={walletAdjustForm.amount}
                              onChange={(e) => setWalletAdjustForm((f) => ({ ...f, amount: e.target.value }))}
                              placeholder="0"
                              className="mt-1 h-8 text-sm font-mono"
                            />
                          </div>
                        </div>
                        <div className="flex justify-end">
                          <Button
                            size="sm"
                            disabled={walletAdjustMutation.isPending || !walletAdjustForm.amount}
                            onClick={handleWalletAdjust}
                          >
                            {walletAdjustMutation.isPending && (
                              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                            )}
                            Apply
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </TabsContent>
              </Tabs>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Edit Dialog ──────────────────────────────────────────────────── */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit clinic</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Name</Label>
              <Input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} className="mt-1 h-8" />
            </div>
            <div>
              <Label className="text-xs">City</Label>
              <Input value={editForm.city} onChange={(e) => setEditForm((f) => ({ ...f, city: e.target.value }))} className="mt-1 h-8" placeholder="Mumbai" />
            </div>
            <div>
              <Label className="text-xs">SKU</Label>
              <Select value={editForm.sku} onValueChange={(v) => setEditForm((f) => ({ ...f, sku: v as SkuTier }))}>
                <SelectTrigger className="mt-1 h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" sideOffset={4}>
                  {SKU_TIERS.map((t) => (
                    <SelectItem key={t} value={t}>
                      <Badge variant="secondary" className={cn("text-[10px]", SKU_STYLE[t])}>{SKU_LABELS[t]}</Badge>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button
              size="sm"
              disabled={updateMutation.isPending}
              onClick={() => editTarget && updateMutation.mutate({ clinicId: editTarget.id, updates: editForm })}
            >
              {updateMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Onboard Dialog ───────────────────────────────────────────────── */}
      <Dialog open={onboardOpen} onOpenChange={setOnboardOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Onboard clinic</DialogTitle>
            <DialogDescription>Creates clinic + primary clinician in one step.</DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2">
            {/* Clinic */}
            <div className="space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Building2 className="h-3.5 w-3.5" /> Clinic
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Name *</Label>
                  <Input
                    value={onboardForm.clinic_name}
                    onChange={(e) => setOnboardForm((f) => ({ ...f, clinic_name: e.target.value }))}
                    placeholder="Magna Neurology"
                    className="mt-1 h-8 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">City</Label>
                  <Input
                    value={onboardForm.city}
                    onChange={(e) => setOnboardForm((f) => ({ ...f, city: e.target.value }))}
                    placeholder="Mumbai"
                    className="mt-1 h-8 text-sm"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">SKU *</Label>
                <Select value={onboardForm.sku} onValueChange={(v) => setOnboardForm((f) => ({ ...f, sku: v as SkuTier }))}>
                  <SelectTrigger className="mt-1 h-8 text-sm">
                    <SelectValue placeholder="Select tier…" />
                  </SelectTrigger>
                  <SelectContent position="popper" sideOffset={4}>
                    {SKU_TIERS.map((t) => (
                      <SelectItem key={t} value={t}>
                        <Badge variant="secondary" className={cn("text-[10px]", SKU_STYLE[t])}>{SKU_LABELS[t]}</Badge>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Primary Clinician */}
            <div className="space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <User className="h-3.5 w-3.5" /> Primary Clinician
              </div>
              <div>
                <Label className="text-xs">Full name *</Label>
                <Input
                  value={onboardForm.clinician_name}
                  onChange={(e) => setOnboardForm((f) => ({ ...f, clinician_name: e.target.value }))}
                  placeholder="Dr. Priya Sharma"
                  className="mt-1 h-8 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Email *</Label>
                  <Input
                    type="email"
                    value={onboardForm.clinician_email}
                    onChange={(e) => setOnboardForm((f) => ({ ...f, clinician_email: e.target.value }))}
                    placeholder="dr@clinic.com"
                    className="mt-1 h-8 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">Temp password *</Label>
                  <Input
                    type="password"
                    value={onboardForm.clinician_password}
                    onChange={(e) => setOnboardForm((f) => ({ ...f, clinician_password: e.target.value }))}
                    placeholder="••••••••"
                    className="mt-1 h-8 text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Tokens */}
            <div className="space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Coins className="h-3.5 w-3.5" /> Starting tokens
              </div>
              <Input
                type="number"
                value={onboardForm.initial_tokens}
                onChange={(e) => setOnboardForm((f) => ({ ...f, initial_tokens: parseInt(e.target.value) || 0 }))}
                min={0}
                className="w-24 h-8 text-sm font-mono"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setOnboardOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              disabled={
                onboardMutation.isPending ||
                !onboardForm.clinic_name || !onboardForm.sku ||
                !onboardForm.clinician_name || !onboardForm.clinician_email || !onboardForm.clinician_password
              }
              onClick={() => onboardMutation.mutate(onboardForm)}
            >
              {onboardMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Onboard
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete Alert ─────────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete clinic?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteTarget?.name}</strong> and all associated data will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
