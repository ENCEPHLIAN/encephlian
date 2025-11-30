import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, Users, Search, Edit } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { format } from "date-fns";

export default function UserManagement() {
  const [searchQuery, setSearchQuery] = useState("");
  const [editingUser, setEditingUser] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});
  const queryClient = useQueryClient();

  const { data: users, isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select(`
          *,
          wallets(tokens),
          studies(count)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    }
  });

  const updateProfileMutation = useMutation({
    mutationFn: async ({ userId, updates }: { userId: string; updates: any }) => {
      const { data, error } = await supabase.rpc("admin_update_profile", {
        p_user_id: userId,
        p_updates: updates
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("User profile updated");
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setEditingUser(null);
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update profile");
    }
  });

  const filteredUsers = users?.filter(user =>
    user.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.full_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleEdit = (user: any) => {
    setEditingUser(user);
    setFormData({
      full_name: user.full_name || "",
      phone_number: user.phone_number || "",
      department: user.department || "",
      hospital_affiliation: user.hospital_affiliation || "",
      credentials: user.credentials || "",
      specialization: user.specialization || "",
      medical_license_number: user.medical_license_number || "",
      company_name: user.company_name || ""
    });
  };

  const handleSave = () => {
    if (!editingUser) return;
    updateProfileMutation.mutate({
      userId: editingUser.id,
      updates: formData
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserFullName, setNewUserFullName] = useState("");
  const [newUserRole, setNewUserRole] = useState<"neurologist" | "clinic_admin">("neurologist");

  const createUserMutation = useMutation({
    mutationFn: async (userData: { email: string; password: string; full_name: string; role: string }) => {
      const { data, error } = await supabase.functions.invoke("admin_create_user", {
        body: {
          email: userData.email,
          password: userData.password,
          full_name: userData.full_name,
          role: userData.role,
          is_admin: false,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("PaaS user created successfully");
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setIsCreateOpen(false);
      setNewUserEmail("");
      setNewUserPassword("");
      setNewUserFullName("");
      setNewUserRole("neurologist");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to create user");
    }
  });

  const handleCreateUser = () => {
    if (!newUserEmail || !newUserPassword || !newUserRole) {
      toast.error("Please fill in all required fields");
      return;
    }

    createUserMutation.mutate({
      email: newUserEmail,
      password: newUserPassword,
      full_name: newUserFullName || newUserEmail,
      role: newUserRole,
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base uppercase tracking-wide">User Accounts</CardTitle>
          <div className="flex items-center gap-2">
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="text-xs h-8">
                  <Users className="mr-1.5 h-3.5 w-3.5" />
                  Create User
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="text-base">Create PaaS User Account</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 py-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Email *</Label>
                    <Input
                      type="email"
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                      placeholder="user@hospital.com"
                      className="text-xs h-8"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Password *</Label>
                    <Input
                      type="password"
                      value={newUserPassword}
                      onChange={(e) => setNewUserPassword(e.target.value)}
                      placeholder="Minimum 6 characters"
                      className="text-xs h-8"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Full Name</Label>
                    <Input
                      value={newUserFullName}
                      onChange={(e) => setNewUserFullName(e.target.value)}
                      placeholder="Optional"
                      className="text-xs h-8"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Role *</Label>
                    <select
                      value={newUserRole}
                      onChange={(e) => setNewUserRole(e.target.value as "neurologist" | "clinic_admin")}
                      className="w-full h-8 px-3 text-xs rounded-md border border-input bg-background"
                    >
                      <option value="neurologist">Neurologist</option>
                      <option value="clinic_admin">Clinic Admin</option>
                    </select>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setIsCreateOpen(false)} className="text-xs h-8">
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleCreateUser}
                    disabled={createUserMutation.isPending}
                    className="text-xs h-8"
                  >
                    {createUserMutation.isPending && (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    )}
                    Create User
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-56 text-xs h-8"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-3">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow className="text-xs">
                <TableHead className="h-8 text-xs">Email</TableHead>
                <TableHead className="h-8 text-xs">Full Name</TableHead>
                <TableHead className="h-8 text-xs">Role</TableHead>
                <TableHead className="h-8 text-xs">Tokens</TableHead>
                <TableHead className="h-8 text-xs">Studies</TableHead>
                <TableHead className="h-8 text-xs">Created</TableHead>
                <TableHead className="text-right h-8 text-xs">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers?.map((user) => (
                <TableRow key={user.id} className="text-xs h-10">
                  <TableCell className="font-mono text-[10px] py-2">{user.email}</TableCell>
                  <TableCell className="text-xs py-2">{user.full_name || "—"}</TableCell>
                  <TableCell className="py-2">
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-muted uppercase">
                      {user.role}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs py-2 font-medium">{user.wallets?.[0]?.tokens || 0}</TableCell>
                  <TableCell className="text-xs py-2">{user.studies?.[0]?.count || 0}</TableCell>
                  <TableCell className="text-[10px] text-muted-foreground py-2">
                    {user.created_at ? format(new Date(user.created_at), "MMM d, yyyy") : "—"}
                  </TableCell>
                  <TableCell className="text-right py-2">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(user)}
                          className="h-7 px-2"
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl">
                        <DialogHeader>
                          <DialogTitle className="text-base">Edit User Profile</DialogTitle>
                        </DialogHeader>
                        <div className="grid grid-cols-2 gap-3 py-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs">Full Name</Label>
                            <Input
                              value={formData.full_name}
                              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                              className="text-xs h-8"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Phone Number</Label>
                            <Input
                              value={formData.phone_number}
                              onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Department</Label>
                            <Input
                              value={formData.department}
                              onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Hospital Affiliation</Label>
                            <Input
                              value={formData.hospital_affiliation}
                              onChange={(e) => setFormData({ ...formData, hospital_affiliation: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Credentials</Label>
                            <Input
                              value={formData.credentials}
                              onChange={(e) => setFormData({ ...formData, credentials: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Specialization</Label>
                            <Input
                              value={formData.specialization}
                              onChange={(e) => setFormData({ ...formData, specialization: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Medical License</Label>
                            <Input
                              value={formData.medical_license_number}
                              onChange={(e) => setFormData({ ...formData, medical_license_number: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Company Name</Label>
                            <Input
                              value={formData.company_name}
                              onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                            />
                          </div>
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            onClick={() => setEditingUser(null)}
                          >
                            Cancel
                          </Button>
                          <Button
                            onClick={handleSave}
                            disabled={updateProfileMutation.isPending}
                          >
                            {updateProfileMutation.isPending && (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            )}
                            Save Changes
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
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
