import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { toast } from "sonner";
import { Loader2, Building2, Pencil, Plus, Trash2, User, Coins } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
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

const SKU_STYLE: Record<string, string> = {
  internal: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  pilot:    "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  demo:     "bg-blue-500/10 text-blue-500",
};

const EMPTY_ONBOARD = {
  clinic_name: "", city: "", sku: "" as SkuTier | "",
  clinician_name: "", clinician_email: "", clinician_password: "",
  initial_tokens: 10,
};

export default function AdminClinics() {
  const queryClient = useQueryClient();
  const [editTarget, setEditTarget] = useState<ClinicRow | null>(null);
  const [editForm, setEditForm] = useState({ name: "", city: "", sku: "pilot" as SkuTier });
  const [onboardOpen, setOnboardOpen] = useState(false);
  const [onboardForm, setOnboardForm] = useState({ ...EMPTY_ONBOARD });
  const [deleteTarget, setDeleteTarget] = useState<ClinicRow | null>(null);

  const { data: clinics, isLoading } = useQuery<ClinicRow[]>({
    queryKey: ["admin-all-clinics"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_get_all_clinics");
      if (error) throw error;
      return data as ClinicRow[];
    },
  });

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
                  <tr key={c.id} className={cn("hover:bg-accent/20 transition-colors", !c.is_active && "opacity-50")}>
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
                    <td className="px-4 py-3">
                      <Switch
                        checked={c.is_active}
                        onCheckedChange={() => updateMutation.mutate({ clinicId: c.id, updates: { is_active: !c.is_active } })}
                      />
                    </td>
                    <td className="px-4 py-3">
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

      {/* Edit Dialog */}
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
                <SelectContent>
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

      {/* Onboard Dialog */}
      <Dialog open={onboardOpen} onOpenChange={setOnboardOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Onboard clinic</DialogTitle>
            <DialogDescription>Creates clinic + primary neurologist in one step.</DialogDescription>
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
                  <SelectContent>
                    {SKU_TIERS.map((t) => (
                      <SelectItem key={t} value={t}>
                        <Badge variant="secondary" className={cn("text-[10px]", SKU_STYLE[t])}>{SKU_LABELS[t]}</Badge>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Neurologist */}
            <div className="space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <User className="h-3.5 w-3.5" /> Primary Neurologist
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

      {/* Delete */}
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
