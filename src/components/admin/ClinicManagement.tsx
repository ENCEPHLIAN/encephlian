import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, Building2, Plus } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { format } from "date-fns";

export default function ClinicManagement() {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    brand_name: "",
    city: "",
    state: "",
    country: "IN",
    tz: "Asia/Kolkata",
  });
  const queryClient = useQueryClient();

  const { data: clinics, isLoading } = useQuery({
    queryKey: ["admin-clinics"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clinics")
        .select(`
          *,
          studies(count),
          clinic_memberships(count)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const createClinicMutation = useMutation({
    mutationFn: async (clinic: typeof formData) => {
      const { data, error } = await supabase
        .from("clinics")
        .insert([clinic])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Clinic created successfully");
      queryClient.invalidateQueries({ queryKey: ["admin-clinics"] });
      setOpen(false);
      setFormData({
        name: "",
        brand_name: "",
        city: "",
        state: "",
        country: "IN",
        tz: "Asia/Kolkata",
      });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to create clinic");
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Clinic Management
          </CardTitle>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create Clinic
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Create New Clinic</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Clinic Name *</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Magna Neurology Clinic"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Brand Name</Label>
                  <Input
                    value={formData.brand_name}
                    onChange={(e) => setFormData({ ...formData, brand_name: e.target.value })}
                    placeholder="Magna Neurology"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>City</Label>
                    <Input
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      placeholder="Mumbai"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>State</Label>
                    <Input
                      value={formData.state}
                      onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                      placeholder="Maharashtra"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Timezone</Label>
                  <Input
                    value={formData.tz}
                    onChange={(e) => setFormData({ ...formData, tz: e.target.value })}
                    placeholder="Asia/Kolkata"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => createClinicMutation.mutate(formData)}
                  disabled={createClinicMutation.isPending || !formData.name}
                >
                  {createClinicMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Create Clinic
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Clinic Name</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Members</TableHead>
                <TableHead>Studies</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clinics?.map((clinic) => (
                <TableRow key={clinic.id}>
                  <TableCell className="font-medium">{clinic.name}</TableCell>
                  <TableCell>{clinic.brand_name || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {[clinic.city, clinic.state].filter(Boolean).join(", ") || "—"}
                  </TableCell>
                  <TableCell>{clinic.clinic_memberships?.[0]?.count || 0}</TableCell>
                  <TableCell>{clinic.studies?.[0]?.count || 0}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {clinic.created_at ? format(new Date(clinic.created_at), "MMM d, yyyy") : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
