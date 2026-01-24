import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Loader2, Building2, Pencil, Plus, Trash2, Users, FileText, Coins, User, Mail, Phone } from "lucide-react";
import { format } from "date-fns";
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

const SKU_BADGE_STYLES: Record<SkuTier, { variant: "default" | "secondary" | "outline"; className?: string }> = {
  internal: { variant: "outline", className: "border-emerald-500/50 text-emerald-600 dark:text-emerald-400" },
  pilot: { variant: "secondary", className: "border-amber-500/50 text-amber-600 dark:text-amber-400" },
  demo: { variant: "default", className: "border-blue-500/50 text-blue-600 dark:text-blue-400" },
};

/**
 * AdminClinics - Value Unit Management
 * 
 * In the value unit model:
 * - 1 Clinic = 1 Neurologist (the value unit)
 * - Onboarding creates both clinic + clinician in one flow
 * - Simple, focused on getting clinics to triage EEGs
 */
export default function AdminClinics() {
  const queryClient = useQueryClient();
  const [editingClinic, setEditingClinic] = useState<ClinicRow | null>(null);
  const [formData, setFormData] = useState({ name: "", city: "", sku: "pilot" as SkuTier });
  const [showOnboardDialog, setShowOnboardDialog] = useState(false);
  const [deleteClinic, setDeleteClinic] = useState<ClinicRow | null>(null);

  // Unified onboarding form - creates clinic + neurologist together
  const [onboardForm, setOnboardForm] = useState({
    clinic_name: "",
    city: "",
    sku: "" as SkuTier | "", // Admin must explicitly choose SKU
    clinician_name: "",
    clinician_email: "",
    clinician_password: "",
    initial_tokens: 10,
  });

  // Fetch clinics
  const { data: clinics, isLoading } = useQuery<ClinicRow[]>({
    queryKey: ["admin-all-clinics"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_get_all_clinics");
      if (error) throw error;
      return data as ClinicRow[];
    },
  });

  // Update clinic mutation
  const updateClinicMutation = useMutation({
    mutationFn: async ({ clinicId, updates }: { clinicId: string; updates: Record<string, any> }) => {
      const { error } = await supabase.rpc("admin_update_clinic", {
        p_clinic_id: clinicId,
        p_updates: updates,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-all-clinics"] });
      toast.success("Clinic updated");
      setEditingClinic(null);
    },
    onError: (error: any) => toast.error(error.message),
  });

  // Onboard value unit - creates clinic + neurologist in one go
  const onboardMutation = useMutation({
    mutationFn: async (form: typeof onboardForm) => {
      const { data, error } = await supabase.functions.invoke("admin_onboard_value_unit", {
        body: {
          clinic_name: form.clinic_name,
          city: form.city,
          sku: form.sku, // Explicit SKU selection
          clinician_name: form.clinician_name,
          clinician_email: form.clinician_email,
          clinician_password: form.clinician_password,
          initial_tokens: form.initial_tokens,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-all-clinics"] });
      queryClient.invalidateQueries({ queryKey: ["admin-all-users"] });
      toast.success("Value unit onboarded successfully!");
      setShowOnboardDialog(false);
      setOnboardForm({
        clinic_name: "",
        city: "",
        sku: "",
        clinician_name: "",
        clinician_email: "",
        clinician_password: "",
        initial_tokens: 10,
      });
    },
    onError: (error: any) => toast.error(error.message),
  });

  // Delete clinic mutation
  const deleteClinicMutation = useMutation({
    mutationFn: async (clinicId: string) => {
      const { data, error } = await supabase.rpc("admin_delete_clinic", {
        p_clinic_id: clinicId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-all-clinics"] });
      toast.success("Clinic deleted");
      setDeleteClinic(null);
    },
    onError: (error: any) => toast.error(error.message),
  });

  const handleToggleActive = async (clinic: ClinicRow) => {
    await updateClinicMutation.mutateAsync({
      clinicId: clinic.id,
      updates: { is_active: !clinic.is_active },
    });
  };

  const handleEdit = (clinic: ClinicRow) => {
    setEditingClinic(clinic);
    setFormData({ name: clinic.name, city: clinic.city || "", sku: (clinic.sku as SkuTier) || "pilot" });
  };

  const handleSave = async () => {
    if (!editingClinic) return;
    await updateClinicMutation.mutateAsync({
      clinicId: editingClinic.id,
      updates: formData,
    });
  };

  // Summary stats
  const totalClinics = clinics?.length || 0;
  const totalUsers = clinics?.reduce((sum, c) => sum + (c.member_count || 0), 0) || 0;
  const totalStudies = clinics?.reduce((sum, c) => sum + (c.study_count || 0), 0) || 0;
  const skuBreakdown = clinics?.reduce((acc, c) => {
    const sku = c.sku || "pilot";
    acc[sku] = (acc[sku] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Value Units</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Each clinic = 1 neurologist. Onboard them together as a value unit.
          </p>
        </div>
        <Button onClick={() => setShowOnboardDialog(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          Onboard Clinic
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
                <Building2 className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-semibold">{totalClinics}</p>
                <p className="text-xs text-muted-foreground">Value Units</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
                <Users className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-semibold">{totalUsers}</p>
                <p className="text-xs text-muted-foreground">Clinicians</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
                <FileText className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-semibold">{totalStudies}</p>
                <p className="text-xs text-muted-foreground">Studies</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border">
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-2">
              {SKU_TIERS.map((tier) => (
                <div key={tier} className="flex items-center gap-1.5">
                  <Badge variant={SKU_BADGE_STYLES[tier].variant} className={cn("text-xs", SKU_BADGE_STYLES[tier].className)}>
                    {SKU_LABELS[tier]}
                  </Badge>
                  <span className="text-sm font-medium">{skuBreakdown[tier] || 0}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">All Clinics</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[200px]">Clinic</TableHead>
                <TableHead>City</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-center">Clinicians</TableHead>
                <TableHead className="text-center">Studies</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clinics?.map((clinic) => {
                const skuStyle = SKU_BADGE_STYLES[(clinic.sku as SkuTier) || "pilot"];
                return (
                  <TableRow key={clinic.id} className={cn(!clinic.is_active && "opacity-50")}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{clinic.name}</span>
                        {!clinic.is_active && (
                          <Badge variant="destructive" className="text-[10px]">
                            Disabled
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{clinic.city || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={skuStyle.variant} className={cn("text-xs", skuStyle.className)}>
                        {SKU_LABELS[(clinic.sku as SkuTier) || "pilot"]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">{clinic.member_count}</TableCell>
                    <TableCell className="text-center">{clinic.study_count}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {format(new Date(clinic.created_at), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={clinic.is_active}
                        onCheckedChange={() => handleToggleActive(clinic)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleEdit(clinic)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => setDeleteClinic(clinic)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {(!clinics || clinics.length === 0) && (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                    No value units yet. Onboard your first clinic to get started.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editingClinic} onOpenChange={(open) => !open && setEditingClinic(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Clinic</DialogTitle>
            <DialogDescription>Update clinic details and SKU tier.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Clinic Name</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-city">City</Label>
              <Input
                id="edit-city"
                value={formData.city}
                onChange={(e) => setFormData((prev) => ({ ...prev, city: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-sku">SKU Tier</Label>
              <Select
                value={formData.sku}
                onValueChange={(v) => setFormData((prev) => ({ ...prev, sku: v as SkuTier }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select SKU..." />
                </SelectTrigger>
                <SelectContent>
                  {SKU_TIERS.map((tier) => (
                    <SelectItem key={tier} value={tier}>
                      <div className="flex items-center gap-2">
                        <Badge variant={SKU_BADGE_STYLES[tier].variant} className={cn("text-xs", SKU_BADGE_STYLES[tier].className)}>
                          {SKU_LABELS[tier]}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {formData.sku === "internal" && "Internal: Full platform with all features (dev/ops)."}
                {formData.sku === "pilot" && "Pilot: Production value unit (Upload → Triage → Report)."}
                {formData.sku === "demo" && "Demo: Showcase mode with guided tutorials."}
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditingClinic(null)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={updateClinicMutation.isPending}>
              {updateClinicMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Onboard Value Unit Dialog */}
      <Dialog open={showOnboardDialog} onOpenChange={setShowOnboardDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Onboard Value Unit</DialogTitle>
            <DialogDescription>
              Create a clinic and its primary neurologist in one step. 
              They'll be ready to upload EEGs and run triage immediately.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {/* Clinic Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Building2 className="h-4 w-4" />
                Clinic Details
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="clinic-name">Clinic Name *</Label>
                  <Input
                    id="clinic-name"
                    value={onboardForm.clinic_name}
                    onChange={(e) => setOnboardForm((f) => ({ ...f, clinic_name: e.target.value }))}
                    placeholder="Magna Neurology"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="clinic-city">City</Label>
                  <Input
                    id="clinic-city"
                    value={onboardForm.city}
                    onChange={(e) => setOnboardForm((f) => ({ ...f, city: e.target.value }))}
                    placeholder="Mumbai"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="clinic-sku">SKU Tier *</Label>
                <Select
                  value={onboardForm.sku}
                  onValueChange={(v) => setOnboardForm((f) => ({ ...f, sku: v as SkuTier }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select SKU..." />
                  </SelectTrigger>
                  <SelectContent>
                    {SKU_TIERS.map((tier) => (
                      <SelectItem key={tier} value={tier}>
                        <div className="flex items-center gap-2">
                          <Badge variant={SKU_BADGE_STYLES[tier].variant} className={cn("text-xs", SKU_BADGE_STYLES[tier].className)}>
                            {SKU_LABELS[tier]}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Pilot = Production, Internal = Dev/Ops, Demo = Showcase
                </p>
              </div>
            </div>

            {/* Clinician Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <User className="h-4 w-4" />
                Primary Neurologist
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="clinician-name">Full Name *</Label>
                  <Input
                    id="clinician-name"
                    value={onboardForm.clinician_name}
                    onChange={(e) => setOnboardForm((f) => ({ ...f, clinician_name: e.target.value }))}
                    placeholder="Dr. Priya Sharma"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="clinician-email">Email *</Label>
                    <Input
                      id="clinician-email"
                      type="email"
                      value={onboardForm.clinician_email}
                      onChange={(e) => setOnboardForm((f) => ({ ...f, clinician_email: e.target.value }))}
                      placeholder="dr.sharma@clinic.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="clinician-password">Temp Password *</Label>
                    <Input
                      id="clinician-password"
                      type="password"
                      value={onboardForm.clinician_password}
                      onChange={(e) => setOnboardForm((f) => ({ ...f, clinician_password: e.target.value }))}
                      placeholder="••••••••"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Tokens Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Coins className="h-4 w-4" />
                Initial Setup
              </div>
              <div className="space-y-2">
                <Label htmlFor="initial-tokens">Starting Tokens</Label>
                <Input
                  id="initial-tokens"
                  type="number"
                  value={onboardForm.initial_tokens}
                  onChange={(e) => setOnboardForm((f) => ({ ...f, initial_tokens: parseInt(e.target.value) || 0 }))}
                  min={0}
                  className="w-32"
                />
                <p className="text-xs text-muted-foreground">
                  Tokens for initial EEG triage runs
                </p>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowOnboardDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => onboardMutation.mutate(onboardForm)}
              disabled={
                onboardMutation.isPending ||
                !onboardForm.clinic_name ||
                !onboardForm.sku ||
                !onboardForm.clinician_name ||
                !onboardForm.clinician_email ||
                !onboardForm.clinician_password
              }
            >
              {onboardMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Onboard Clinic
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteClinic} onOpenChange={(open) => !open && setDeleteClinic(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Clinic?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {deleteClinic?.name} and all associated data. 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteClinic && deleteClinicMutation.mutate(deleteClinic.id)}
            >
              {deleteClinicMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
