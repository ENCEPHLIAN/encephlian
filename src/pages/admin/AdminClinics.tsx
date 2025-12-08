import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Building2, Edit } from "lucide-react";
import { format } from "date-fns";

type ClinicRow = {
  id: string;
  name: string;
  city: string | null;
  is_active: boolean;
  created_at: string;
  study_count: number;
  member_count: number;
};

export default function AdminClinics() {
  const queryClient = useQueryClient();
  const [editingClinic, setEditingClinic] = useState<ClinicRow | null>(null);
  const [formData, setFormData] = useState({ name: "", city: "" });

  const { data: clinics, isLoading } = useQuery<ClinicRow[]>({
    queryKey: ["admin-all-clinics"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_get_all_clinics");
      if (error) throw error;
      return data as ClinicRow[];
    },
  });

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

  const handleToggleActive = async (clinic: ClinicRow) => {
    await updateClinicMutation.mutateAsync({
      clinicId: clinic.id,
      updates: { is_active: !clinic.is_active },
    });
  };

  const handleEdit = (clinic: ClinicRow) => {
    setEditingClinic(clinic);
    setFormData({ name: clinic.name, city: clinic.city || "" });
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
      <div>
        <h1 className="text-2xl font-mono font-bold tracking-tight">Clinics</h1>
        <p className="text-sm text-muted-foreground font-mono">
          Manage clinic accounts and settings
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-mono">Clinic Name</TableHead>
                <TableHead className="font-mono">City</TableHead>
                <TableHead className="font-mono">Studies</TableHead>
                <TableHead className="font-mono">Members</TableHead>
                <TableHead className="font-mono">Created</TableHead>
                <TableHead className="font-mono">Active</TableHead>
                <TableHead className="font-mono"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clinics?.map((clinic) => (
                <TableRow key={clinic.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span className="font-mono text-sm">{clinic.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {clinic.city || "—"}
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
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleEdit(clinic)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {(!clinics || clinics.length === 0) && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
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
    </div>
  );
}
