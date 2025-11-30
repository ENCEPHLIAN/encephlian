import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, Edit, Search } from "lucide-react";
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

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>User Accounts</CardTitle>
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-64"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Full Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Tokens</TableHead>
                <TableHead>Studies</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers?.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-mono text-xs">{user.email}</TableCell>
                  <TableCell>{user.full_name || "—"}</TableCell>
                  <TableCell>
                    <span className="px-2 py-1 rounded text-xs bg-muted">
                      {user.role}
                    </span>
                  </TableCell>
                  <TableCell>{user.wallets?.[0]?.tokens || 0}</TableCell>
                  <TableCell>{user.studies?.[0]?.count || 0}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {user.created_at ? format(new Date(user.created_at), "MMM d, yyyy") : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(user)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl">
                        <DialogHeader>
                          <DialogTitle>Edit User Profile</DialogTitle>
                        </DialogHeader>
                        <div className="grid grid-cols-2 gap-4 py-4">
                          <div className="space-y-2">
                            <Label>Full Name</Label>
                            <Input
                              value={formData.full_name}
                              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
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
