import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, UserPlus, Shield, X } from "lucide-react";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";

export default function InternalTeamManagement() {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    full_name: "",
    role: "management",
  });
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const queryClient = useQueryClient();

  // Check if current user is super_admin
  useEffect(() => {
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
        setIsSuperAdmin(data?.some(r => r.role === "super_admin") || false);
      }
    };
    check();
  }, []);

  const { data: internalTeam, isLoading } = useQuery({
    queryKey: ["internal-team"],
    queryFn: async () => {
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("*")
        .in("role", ["management", "super_admin"])
        .order("created_at", { ascending: false });

      if (rolesError) throw rolesError;

      const userIds = roles?.map(r => r.user_id) || [];
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, email, full_name, created_at")
        .in("id", userIds);

      if (profilesError) throw profilesError;

      return roles?.map(role => ({
        ...role,
        profile: profiles?.find(p => p.id === role.user_id),
      }));
    },
  });

  const createInternalUserMutation = useMutation({
    mutationFn: async (userData: typeof formData) => {
      const { data, error } = await supabase.functions.invoke("admin_create_user", {
        body: userData,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Internal team member created");
      queryClient.invalidateQueries({ queryKey: ["internal-team"] });
      setOpen(false);
      setFormData({ email: "", password: "", full_name: "", role: "management" });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to create team member");
    },
  });

  const revokeRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const { data, error } = await supabase.rpc("admin_revoke_role", {
        p_user_id: userId,
        p_role: role as any,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Role revoked");
      queryClient.invalidateQueries({ queryKey: ["internal-team"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to revoke role");
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Only super_admin can see this component - management cannot create management users
  if (!isSuperAdmin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Internal Team (ENCEPHLIAN)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">Only super_admin can manage internal team members.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Internal Team (ENCEPHLIAN)
          </CardTitle>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="h-4 w-4 mr-2" />
                Add Team Member
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Add Management User</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Email *</Label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="team@encephlian.com"
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
                    placeholder="John Doe"
                  />
                </div>
                <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                  New team members will be created with the Management role
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => createInternalUserMutation.mutate(formData)}
                  disabled={createInternalUserMutation.isPending || !formData.email || !formData.password || !formData.full_name}
                >
                  {createInternalUserMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Add Member
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
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {internalTeam?.map((member) => (
                <TableRow key={member.id}>
                  <TableCell className="font-medium">
                    {member.profile?.full_name || "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {member.profile?.email}
                  </TableCell>
                  <TableCell>
                    <Badge variant={member.role === "super_admin" ? "destructive" : "default"}>
                      {member.role === "super_admin" ? "SUPER ADMIN" : "MANAGEMENT"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {member.role !== "super_admin" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => revokeRoleMutation.mutate({ userId: member.user_id, role: member.role })}
                        disabled={revokeRoleMutation.isPending}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
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