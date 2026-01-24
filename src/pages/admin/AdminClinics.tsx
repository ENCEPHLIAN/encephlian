import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
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
import { Loader2, Building2, Edit, Plus, Trash2 } from "lucide-react";
import { format } from "date-fns";
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-mono font-bold tracking-tight">Clinics</h1>
          <p className="text-sm text-muted-foreground font-mono">
            Manage clinic accounts and provisioning
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Clinic
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-mono">Clinic Name</TableHead>
                <TableHead className="font-mono">City</TableHead>
                <TableHead className="font-mono">SKU</TableHead>
                <TableHead className="font-mono">Studies</TableHead>
                <TableHead className="font-mono">Members</TableHead>
                <TableHead className="font-mono">Created</TableHead>
                <TableHead className="font-mono">Active</TableHead>
                <TableHead className="font-mono"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clinics?.map((clinic) => (
                <TableRow key={clinic.id} className={!clinic.is_active ? "opacity-50" : ""}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span className="font-mono text-sm">{clinic.name}</span>
                      {!clinic.is_active && (
                        <Badge variant="destructive" className="text-xs">
                          Disabled
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {clinic.city || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant={clinic.sku === 'internal' ? 'default' : clinic.sku === 'prod' ? 'secondary' : 'outline'}
                      className="font-mono text-xs"
                    >
                      {SKU_LABELS[clinic.sku as SkuTier] || clinic.sku}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-mono text-xs">
                      {clinic.study_count}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-xs">
                      {clinic.member_count}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
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
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => setDeleteClinic(clinic)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {(!clinics || clinics.length === 0) && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No clinics found
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
            <DialogTitle className="font-mono">Edit Clinic</DialogTitle>
            <DialogDescription>Update clinic information</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Clinic Name</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label>City</Label>
              <Input
                value={formData.city}
                onChange={(e) => setFormData((prev) => ({ ...prev, city: e.target.value }))}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label>SKU Tier</Label>
              <Select
                value={formData.sku}
                onValueChange={(v) => setFormData((prev) => ({ ...prev, sku: v as SkuTier }))}
              >
                <SelectTrigger className="font-mono">
                  <SelectValue placeholder="Select SKU..." />
                </SelectTrigger>
                <SelectContent>
                  {SKU_TIERS.map((tier) => (
                    <SelectItem key={tier} value={tier} className="font-mono">
                      {SKU_LABELS[tier]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setEditingClinic(null)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={updateClinicMutation.isPending}>
                {updateClinicMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Clinic Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-mono">Create New Clinic</DialogTitle>
            <DialogDescription>Add a new clinic to the platform</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Clinic Name</Label>
              <Input
                value={createForm.name}
                onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label>City</Label>
              <Input
                value={createForm.city}
                onChange={(e) => setCreateForm((f) => ({ ...f, city: e.target.value }))}
                className="font-mono"
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
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => createClinicMutation.mutate(createForm)}
                disabled={createClinicMutation.isPending || !createForm.name}
              >
                {createClinicMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create Clinic
              </Button>
            </div>
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
