import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";

export default function PaaSUserManagement() {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    full_name: "",
    clinic_id: "",
    phone_number: "",
    credentials: "",
    specialization: "",
    medical_license_number: "",
  });
  const queryClient = useQueryClient();

  const { data: paasUsers, isLoading } = useQuery({
    queryKey: ["paas-users"],
    queryFn: async () => {
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("*")
        .eq("role", "neurologist")
        .order("created_at", { ascending: false });

      if (rolesError) throw rolesError;

      const userIds = roles?.map(r => r.user_id) || [];
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select(`
          *,
          wallets(tokens),
          studies(count)
        `)
        .in("id", userIds);

      if (profilesError) throw profilesError;

      const { data: clinics, error: clinicsError } = await supabase
        .from("clinics")
        .select("id, name");

      if (clinicsError) throw clinicsError;

      return roles?.map(role => ({
        ...role,
        profile: profiles?.find(p => p.id === role.user_id),
        clinic: clinics?.find(c => c.id === role.clinic_id),
      }));
    },
  });

  const { data: clinics } = useQuery({
    queryKey: ["admin-clinics-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clinics")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const createPaaSUserMutation = useMutation({
    mutationFn: async (userData: typeof formData) => {
      const { data, error } = await supabase.functions.invoke("admin_create_user", {
        body: {
          ...userData,
          role: "neurologist",
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("PaaS user created successfully");
      queryClient.invalidateQueries({ queryKey: ["paas-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setOpen(false);
      setFormData({
        email: "",
        password: "",
        full_name: "",
        clinic_id: "",
        phone_number: "",
        credentials: "",
        specialization: "",
        medical_license_number: "",
      });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to create user");
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
            <Users className="h-5 w-5" />
            PaaS User Accounts (Neurologists)
          </CardTitle>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="h-4 w-4 mr-2" />
                Create PaaS User
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create New PaaS User Account</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-4 py-4">
                <div className="space-y-2">
                  <Label>Email *</Label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="neurologist@clinic.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Password *</Label>
                  <Input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="Min 6 characters"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Full Name *</Label>
                  <Input
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    placeholder="Dr. John Doe"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Phone Number</Label>
                  <Input
                    value={formData.phone_number}
                    onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                    placeholder="+91 98765 43210"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Clinic *</Label>
                  <Select
                    value={formData.clinic_id}
                    onValueChange={(value) => setFormData({ ...formData, clinic_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select clinic" />
                    </SelectTrigger>
                    <SelectContent>
                      {clinics?.map((clinic) => (
                        <SelectItem key={clinic.id} value={clinic.id}>
                          {clinic.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Credentials</Label>
                  <Input
                    value={formData.credentials}
                    onChange={(e) => setFormData({ ...formData, credentials: e.target.value })}
                    placeholder="MD, DNB"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Specialization</Label>
                  <Input
                    value={formData.specialization}
                    onChange={(e) => setFormData({ ...formData, specialization: e.target.value })}
                    placeholder="Neurology"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Medical License Number</Label>
                  <Input
                    value={formData.medical_license_number}
                    onChange={(e) => setFormData({ ...formData, medical_license_number: e.target.value })}
                    placeholder="MH/1234/5678"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => createPaaSUserMutation.mutate(formData)}
                  disabled={createPaaSUserMutation.isPending || !formData.email || !formData.password || !formData.full_name || !formData.clinic_id}
                >
                  {createPaaSUserMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Create User
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
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Clinic</TableHead>
                <TableHead>Credentials</TableHead>
                <TableHead>Tokens</TableHead>
                <TableHead>Studies</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paasUsers?.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">
                    {user.profile?.full_name || "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {user.profile?.email}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{user.clinic?.name || "—"}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {user.profile?.credentials || "—"}
                  </TableCell>
                  <TableCell>{user.profile?.wallets?.[0]?.tokens || 0}</TableCell>
                  <TableCell>{user.profile?.studies?.[0]?.count || 0}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
