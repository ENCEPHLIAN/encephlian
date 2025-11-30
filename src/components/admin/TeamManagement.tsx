import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, UserPlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

export default function TeamManagement() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"ops" | "super_admin">("ops");
  const queryClient = useQueryClient();

  const { data: admins, isLoading } = useQuery({
    queryKey: ["admin-team"],
    queryFn: async () => {
      // First get all admin role entries
      const { data: roleData, error: roleError } = await supabase
        .from("user_roles")
        .select("*")
        .in("role", ["super_admin", "ops"])
        .order("created_at", { ascending: false });

      if (roleError) throw roleError;

      // Then get profile info for each user
      const userIds = roleData?.map(r => r.user_id) || [];
      if (userIds.length === 0) return [];

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .in("id", userIds);

      if (profileError) throw profileError;

      // Merge the data
      return roleData.map(role => ({
        ...role,
        profile: profileData?.find(p => p.id === role.user_id)
      }));
    }
  });

  const createAdminMutation = useMutation({
    mutationFn: async (userData: { email: string; password: string; full_name: string; role: string }) => {
      const { data, error } = await supabase.functions.invoke("admin_create_user", {
        body: {
          email: userData.email,
          password: userData.password,
          full_name: userData.full_name,
          role: userData.role,
          is_admin: true,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("Admin user created successfully");
      queryClient.invalidateQueries({ queryKey: ["admin-team"] });
      setIsCreateOpen(false);
      setEmail("");
      setPassword("");
      setFullName("");
      setRole("ops");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to create admin user");
    }
  });

  const revokeRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: "ops" | "super_admin" }) => {
      const { data, error } = await supabase.rpc("admin_revoke_role", {
        p_user_id: userId,
        p_role: role
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Admin role revoked");
      queryClient.invalidateQueries({ queryKey: ["admin-team"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to revoke role");
    }
  });

  const handleCreate = () => {
    if (!email || !password || !role) {
      toast.error("Please fill in all required fields");
      return;
    }

    createAdminMutation.mutate({
      email,
      password,
      full_name: fullName || email,
      role,
    });
  };

  const handleRevoke = (userId: string, role: "ops" | "super_admin") => {
    if (!confirm(`Are you sure you want to revoke ${role} access for this user?`)) {
      return;
    }
    revokeRoleMutation.mutate({ userId, role });
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
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base uppercase tracking-wide">Admin Team</CardTitle>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="text-xs h-8">
                <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                Add Admin
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="text-base">Create Admin Account</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Email *</Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@encephlian.cloud"
                    className="text-xs h-8"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Password *</Label>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    className="text-xs h-8"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Full Name</Label>
                  <Input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Optional"
                    className="text-xs h-8"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Role *</Label>
                  <Select value={role} onValueChange={(val) => setRole(val as "ops" | "super_admin")}>
                    <SelectTrigger className="text-xs h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ops">Operations (ops)</SelectItem>
                      <SelectItem value="super_admin">Super Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsCreateOpen(false)} className="text-xs h-8">
                  Cancel
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={createAdminMutation.isPending}
                  className="text-xs h-8"
                >
                  {createAdminMutation.isPending && (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  )}
                  Create Admin
                </Button>
              </div>
            </DialogContent>
          </Dialog>
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
                <TableHead className="h-8 text-xs">Added</TableHead>
                <TableHead className="text-right h-8 text-xs">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {admins?.map((admin) => (
                <TableRow key={admin.id} className="text-xs h-10">
                  <TableCell className="font-mono text-[10px] py-2">
                    {admin.profile?.email || "—"}
                  </TableCell>
                  <TableCell className="text-xs py-2">{admin.profile?.full_name || "—"}</TableCell>
                  <TableCell className="py-2">
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-primary/10 text-primary font-medium uppercase">
                      {admin.role}
                    </span>
                  </TableCell>
                  <TableCell className="text-[10px] text-muted-foreground py-2">
                    {admin.created_at ? new Date(admin.created_at).toLocaleDateString() : "—"}
                  </TableCell>
                  <TableCell className="text-right py-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRevoke(admin.user_id, admin.role as "ops" | "super_admin")}
                      disabled={revokeRoleMutation.isPending}
                      className="h-7 px-2"
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
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