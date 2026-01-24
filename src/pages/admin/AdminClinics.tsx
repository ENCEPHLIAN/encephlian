import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Loader2, Building2, Pencil, Plus, Trash2, Users, FileText } from "lucide-react";
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

type UserOption = {
  id: string;
  email: string;
  full_name: string | null;
};

const SKU_BADGE_STYLES: Record<SkuTier, { variant: "default" | "secondary" | "outline"; className?: string }> = {
  internal: { variant: "outline", className: "border-blue-500/50 text-blue-600 dark:text-blue-400" },
  pilot: { variant: "secondary" },
  prod: { variant: "default" },
};


export default function AdminClinics() {
  const queryClient = useQueryClient();
  const [editingClinic, setEditingClinic] = useState<ClinicRow | null>(null);
  const [formData, setFormData] = useState({ name: "", city: "", sku: "pilot" as SkuTier });
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [deleteClinic, setDeleteClinic] = useState<ClinicRow | null>(null);

  const [createForm, setCreateForm] = useState({
    name: "",
    city: "",
    admin_user_id: "",
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

  // Fetch users for admin selection
  const { data: users } = useQuery<UserOption[]>({
    queryKey: ["admin-users-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .order("email");
      if (error) throw error;
      return data;
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

  // Create clinic mutation
  const createClinicMutation = useMutation({
    mutationFn: async (form: typeof createForm) => {
      const { data, error } = await supabase.rpc("admin_create_clinic", {
        p_name: form.name,
        p_city: form.city || null,
        p_admin_user_id: form.admin_user_id || null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-all-clinics"] });
      toast.success("Clinic created");
      setShowCreateDialog(false);
      setCreateForm({ name: "", city: "", admin_user_id: "" });
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
          <h1 className="text-xl font-semibold tracking-tight">Clinics</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage value units and their SKU tiers
          </p>
        </div>
        <Button size="sm" onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          New Clinic
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="dashboard-card--neutral">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-accent/50 flex items-center justify-center">
                <Building2 className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-semibold">{totalClinics}</p>
                <p className="text-xs text-muted-foreground">Total Clinics</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="dashboard-card--info">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-accent/50 flex items-center justify-center">
                <Users className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-semibold">{totalUsers}</p>
                <p className="text-xs text-muted-foreground">Total Users</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="dashboard-card--success">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-accent/50 flex items-center justify-center">
                <FileText className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-semibold">{totalStudies}</p>
                <p className="text-xs text-muted-foreground">Total Studies</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="dashboard-card--warning">
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
                <TableHead className="w-[200px]">Name</TableHead>
                <TableHead>City</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-center">Users</TableHead>
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
                    No clinics found. Create your first clinic to get started.
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
                {formData.sku === "internal" && "Full access for internal testing and development."}
                {formData.sku === "pilot" && "Limited features, proxy-only API access. Best for paid pilots."}
                {formData.sku === "prod" && "Full production access with all features enabled."}
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

      {/* Create Clinic Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Clinic</DialogTitle>
            <DialogDescription>Add a new value unit to the platform. Default SKU is Pilot.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="create-name">Clinic Name</Label>
              <Input
                id="create-name"
                value={createForm.name}
                onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Magna Neurology"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-city">City</Label>
              <Input
                id="create-city"
                value={createForm.city}
                onChange={(e) => setCreateForm((f) => ({ ...f, city: e.target.value }))}
                placeholder="Mumbai"
              />
            </div>
            <div className="space-y-2">
              <Label>Assign Clinician (optional)</Label>
              <Select
                value={createForm.admin_user_id}
                onValueChange={(v) => setCreateForm((f) => ({ ...f, admin_user_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select clinician..." />
                </SelectTrigger>
                <SelectContent>
                  {users?.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.full_name || user.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createClinicMutation.mutate(createForm)}
              disabled={createClinicMutation.isPending || !createForm.name}
            >
              {createClinicMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteClinic} onOpenChange={(open) => !open && setDeleteClinic(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Clinic?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deleteClinic?.name}", all studies ({deleteClinic?.study_count}), 
              and all associated memberships. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteClinic && deleteClinicMutation.mutate(deleteClinic.id)}
            >
              {deleteClinicMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete Clinic
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
