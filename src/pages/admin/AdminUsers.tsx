import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  Loader2,
  Search,
  User,
  UserPlus,
  MoreHorizontal,
  Shield,
  Building2,
  Ban,
  CheckCircle,
  KeyRound,
  Users,
  FileText,
  Trash2,
  ShieldOff,
} from "lucide-react";
import { format } from "date-fns";

type UserRow = {
  id: string;
  email: string;
  full_name: string | null;
  profile_role: string;
  is_disabled: boolean;
  created_at: string;
  app_roles: { role: string; clinic_id: string | null }[];
  clinics: { clinic_id: string; role: string; clinic_name: string }[];
  tokens: number;
};

type ClinicOption = {
  id: string;
  name: string;
};

// Roles that require clinic assignment
const CLINIC_ROLES = ["clinic_admin", "neurologist", "technician"] as const;
// Roles that should NOT have clinic assignment
const SYSTEM_ROLES = ["ops", "super_admin"] as const;
// All assignable roles (super_admin hidden from UI per requirements)
const ALL_ROLES = [...CLINIC_ROLES, "ops"] as const;

export default function AdminUsers() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [clinicFilter, setClinicFilter] = useState<string>("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showRoleDialog, setShowRoleDialog] = useState(false);
  const [showClinicDialog, setShowClinicDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [deleteUser, setDeleteUser] = useState<UserRow | null>(null);

  const [createForm, setCreateForm] = useState({
    email: "",
    full_name: "",
    password: "",
    role: "neurologist" as string,
    clinic_id: "",
  });

  const [roleForm, setRoleForm] = useState({
    role: "neurologist" as string,
    clinic_id: "",
  });

  const [clinicForm, setClinicForm] = useState({
    clinic_id: "",
    action: "assign" as "assign" | "unassign",
    role: "neurologist",
  });

  // Fetch users
  const { data: users, isLoading } = useQuery<UserRow[]>({
    queryKey: ["admin-all-users"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_get_all_users");
      if (error) throw error;
      return data as UserRow[];
    },
  });

  // Fetch clinics for dropdowns
  const { data: clinics } = useQuery<ClinicOption[]>({
    queryKey: ["admin-clinics-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clinics")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Calculate stats
  const stats = useMemo(() => {
    if (!users) return { total: 0, clinicsCount: 0, activeStudies: 0 };
    const uniqueClinics = new Set<string>();
    users.forEach((u) => u.clinics?.forEach((c) => uniqueClinics.add(c.clinic_id)));
    return {
      total: users.length,
      clinicsCount: uniqueClinics.size,
      activeStudies: 0, // Placeholder
    };
  }, [users]);

  // Check if selected role requires clinic
  const roleRequiresClinic = (role: string) => {
    return CLINIC_ROLES.includes(role as any);
  };

  // Create user mutation
  const createUserMutation = useMutation({
    mutationFn: async (form: typeof createForm) => {
      // Validate clinic requirement
      if (roleRequiresClinic(form.role) && !form.clinic_id) {
        throw new Error("Clinic assignment is required for this role");
      }
      if (!roleRequiresClinic(form.role) && form.clinic_id) {
        throw new Error("System roles (ops) should not be assigned to a clinic");
      }

      const { data, error } = await supabase.functions.invoke("admin_create_user", {
        body: {
          email: form.email,
          password: form.password,
          full_name: form.full_name,
          role: form.role,
          clinic_id: roleRequiresClinic(form.role) ? form.clinic_id : null,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-all-users"] });
      toast.success("User created successfully");
      setShowCreateDialog(false);
      setCreateForm({ email: "", full_name: "", password: "", role: "neurologist", clinic_id: "" });
    },
    onError: (error: any) => toast.error(error.message),
  });

  // Send password reset mutation
  const sendResetMutation = useMutation({
    mutationFn: async (email: string) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/login`,
      });
      if (error) throw error;
    },
    onSuccess: () => toast.success("Password reset link sent"),
    onError: (error: any) => toast.error(error.message),
  });

  // Grant role mutation
  const grantRoleMutation = useMutation({
    mutationFn: async ({ userId, role, clinicId }: { userId: string; role: string; clinicId?: string }) => {
      const { data, error } = await supabase.rpc("admin_grant_role", {
        p_user_id: userId,
        p_role: role as "clinic_admin" | "neurologist" | "ops" | "super_admin",
        p_clinic_id: clinicId || null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-all-users"] });
      toast.success("Role assigned");
      setShowRoleDialog(false);
    },
    onError: (error: any) => toast.error(error.message),
  });

  // Revoke role mutation
  const revokeRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const { data, error } = await supabase.rpc("admin_revoke_role", {
        p_user_id: userId,
        p_role: role as "clinic_admin" | "neurologist" | "ops" | "super_admin",
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-all-users"] });
      toast.success("Role revoked");
    },
    onError: (error: any) => toast.error(error.message),
  });

  // Suspend user mutation
  const suspendMutation = useMutation({
    mutationFn: async ({ userId, suspend }: { userId: string; suspend: boolean }) => {
      const { data, error } = await supabase.rpc("admin_suspend_user", {
        p_user_id: userId,
        p_suspend: suspend,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_, { suspend }) => {
      queryClient.invalidateQueries({ queryKey: ["admin-all-users"] });
      toast.success(suspend ? "User suspended" : "User reactivated");
    },
    onError: (error: any) => toast.error(error.message),
  });

  // Manage clinic membership mutation
  const clinicMembershipMutation = useMutation({
    mutationFn: async (params: { userId: string; clinicId: string; action: string; role: string }) => {
      const { data, error } = await supabase.rpc("admin_manage_clinic_membership", {
        p_user_id: params.userId,
        p_clinic_id: params.clinicId,
        p_action: params.action,
        p_role: params.role,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-all-users"] });
      toast.success("Clinic membership updated");
      setShowClinicDialog(false);
    },
    onError: (error: any) => toast.error(error.message),
  });

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase.rpc("admin_delete_user", {
        p_user_id: userId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["admin-all-users"] });
      toast.success(`User ${data?.deleted_email || ""} deleted`);
      setDeleteUser(null);
    },
    onError: (error: any) => toast.error(error.message),
  });

  // Reset TFA mutation
  const resetTFAMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase.rpc("admin_reset_user_tfa", {
        p_user_id: userId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("TFA reset successfully");
    },
    onError: (error: any) => toast.error(error.message),
  });

  // Helper to check if user is super_admin
  const isSuperAdmin = (user: UserRow) => {
    return user.app_roles?.some((r) => r.role === "super_admin");
  };

  // Filter users
  const filteredUsers = useMemo(() => {
    if (!users) return [];
    return users.filter((user) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch =
          user.email.toLowerCase().includes(query) ||
          user.full_name?.toLowerCase().includes(query);
        if (!matchesSearch) return false;
      }

      // Role filter
      if (roleFilter !== "all") {
        const hasRole = user.app_roles?.some((r) => r.role === roleFilter);
        if (!hasRole) return false;
      }

      // Clinic filter
      if (clinicFilter !== "all") {
        const inClinic = user.clinics?.some((c) => c.clinic_id === clinicFilter);
        if (!inClinic) return false;
      }

      return true;
    });
  }, [users, searchQuery, roleFilter, clinicFilter]);

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "super_admin":
        return "destructive";
      case "ops":
        return "default";
      case "clinic_admin":
        return "secondary";
      default:
        return "outline";
    }
  };

  const handleOpenRoleDialog = (user: UserRow) => {
    setSelectedUser(user);
    setRoleForm({ role: "neurologist", clinic_id: "" });
    setShowRoleDialog(true);
  };

  const handleOpenClinicDialog = (user: UserRow) => {
    setSelectedUser(user);
    setClinicForm({ clinic_id: "", action: "assign", role: "neurologist" });
    setShowClinicDialog(true);
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
          <h1 className="text-2xl font-mono font-bold tracking-tight">Users</h1>
          <p className="text-sm text-muted-foreground font-mono">
            Manage platform users, roles, and clinic assignments
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <UserPlus className="h-4 w-4 mr-2" />
          Create User
        </Button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-muted/30">
          <CardContent className="p-4 flex items-center gap-3">
            <Users className="h-8 w-8 text-primary" />
            <div>
              <p className="text-2xl font-mono font-bold">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Total Users</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-muted/30">
          <CardContent className="p-4 flex items-center gap-3">
            <Building2 className="h-8 w-8 text-primary" />
            <div>
              <p className="text-2xl font-mono font-bold">{clinics?.length || 0}</p>
              <p className="text-xs text-muted-foreground">Active Clinics</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-muted/30">
          <CardContent className="p-4 flex items-center gap-3">
            <FileText className="h-8 w-8 text-primary" />
            <div>
              <p className="text-2xl font-mono font-bold">—</p>
              <p className="text-xs text-muted-foreground">Active Studies</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by email or name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 font-mono"
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Filter by role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            {ALL_ROLES.map((role) => (
              <SelectItem key={role} value={role}>
                {role}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={clinicFilter} onValueChange={setClinicFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by clinic" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Clinics</SelectItem>
            {clinics?.map((clinic) => (
              <SelectItem key={clinic.id} value={clinic.id}>
                {clinic.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-mono">User</TableHead>
                <TableHead className="font-mono">Clinics</TableHead>
                <TableHead className="font-mono">App Roles</TableHead>
                <TableHead className="font-mono">Tokens</TableHead>
                <TableHead className="font-mono">Status</TableHead>
                <TableHead className="font-mono">Created</TableHead>
                <TableHead className="font-mono w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map((user) => (
                <TableRow key={user.id} className={user.is_disabled ? "opacity-50" : ""}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                        <User className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-mono text-sm">{user.full_name || "—"}</p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {user.clinics?.length > 0 ? (
                        user.clinics.map((c, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {c.clinic_name}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {user.app_roles?.length > 0 ? (
                        user.app_roles.map((r, i) => (
                          <Badge
                            key={i}
                            variant={getRoleBadgeVariant(r.role) as any}
                            className="font-mono text-xs"
                          >
                            {r.role}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-sm">{user.tokens}</span>
                  </TableCell>
                  <TableCell>
                    {user.is_disabled ? (
                      <Badge variant="destructive" className="text-xs">
                        <Ban className="h-3 w-3 mr-1" />
                        Suspended
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-green-600">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Active
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {user.created_at ? format(new Date(user.created_at), "MMM d, yyyy") : "—"}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleOpenRoleDialog(user)}>
                          <Shield className="h-4 w-4 mr-2" />
                          Manage Roles
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleOpenClinicDialog(user)}>
                          <Building2 className="h-4 w-4 mr-2" />
                          Manage Clinics
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => sendResetMutation.mutate(user.email)}
                          disabled={sendResetMutation.isPending}
                        >
                          <KeyRound className="h-4 w-4 mr-2" />
                          Send Password Reset
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => resetTFAMutation.mutate(user.id)}
                          disabled={resetTFAMutation.isPending}
                        >
                          <ShieldOff className="h-4 w-4 mr-2" />
                          Reset TFA
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {user.is_disabled ? (
                          <DropdownMenuItem
                            onClick={() => suspendMutation.mutate({ userId: user.id, suspend: false })}
                          >
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Reactivate User
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            onClick={() => suspendMutation.mutate({ userId: user.id, suspend: true })}
                            className="text-destructive"
                          >
                            <Ban className="h-4 w-4 mr-2" />
                            Suspend User
                          </DropdownMenuItem>
                        )}
                        {!isSuperAdmin(user) && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => setDeleteUser(user)}
                              className="text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete User
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {filteredUsers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No users found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create User Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-mono">Create New User</DialogTitle>
            <DialogDescription>Add a new user to the platform</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input
                value={createForm.full_name}
                onChange={(e) => setCreateForm((f) => ({ ...f, full_name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Temporary Password</Label>
              <Input
                type="password"
                value={createForm.password}
                onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select
                value={createForm.role}
                onValueChange={(v) => setCreateForm((f) => ({ ...f, role: v, clinic_id: "" }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Only show clinic selection for clinic-bound roles */}
            {roleRequiresClinic(createForm.role) && (
              <div className="space-y-2">
                <Label>
                  Clinic <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={createForm.clinic_id}
                  onValueChange={(v) => setCreateForm((f) => ({ ...f, clinic_id: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select clinic..." />
                  </SelectTrigger>
                  <SelectContent>
                    {clinics?.map((clinic) => (
                      <SelectItem key={clinic.id} value={clinic.id}>
                        {clinic.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Required for {createForm.role} role
                </p>
              </div>
            )}

            {!roleRequiresClinic(createForm.role) && (
              <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                System roles (ops) are not assigned to clinics
              </p>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => createUserMutation.mutate(createForm)}
                disabled={
                  createUserMutation.isPending ||
                  !createForm.email ||
                  !createForm.password ||
                  (roleRequiresClinic(createForm.role) && !createForm.clinic_id)
                }
              >
                {createUserMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create User
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Manage Roles Dialog */}
      <Dialog open={showRoleDialog} onOpenChange={setShowRoleDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-mono">Manage Roles</DialogTitle>
            <DialogDescription>
              {selectedUser?.email} - Current roles:{" "}
              {selectedUser?.app_roles?.map((r) => r.role).join(", ") || "None"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            {/* Current roles with revoke option */}
            {selectedUser?.app_roles && selectedUser.app_roles.length > 0 && (
              <div className="space-y-2">
                <Label>Current Roles</Label>
                <div className="flex flex-wrap gap-2">
                  {selectedUser.app_roles.map((r, i) => (
                    <Badge
                      key={i}
                      variant={getRoleBadgeVariant(r.role) as any}
                      className="pr-1"
                    >
                      {r.role}
                      {r.role !== "super_admin" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-4 w-4 ml-1 hover:bg-destructive/20"
                          onClick={() =>
                            revokeRoleMutation.mutate({ userId: selectedUser.id, role: r.role })
                          }
                        >
                          ×
                        </Button>
                      )}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Add Role</Label>
              <Select
                value={roleForm.role}
                onValueChange={(v) => setRoleForm((f) => ({ ...f, role: v, clinic_id: "" }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {roleRequiresClinic(roleForm.role) && (
              <div className="space-y-2">
                <Label>
                  Associated Clinic <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={roleForm.clinic_id}
                  onValueChange={(v) => setRoleForm((f) => ({ ...f, clinic_id: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select clinic..." />
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
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setShowRoleDialog(false)}>
                Done
              </Button>
              <Button
                onClick={() => {
                  if (!selectedUser) return;
                  if (roleRequiresClinic(roleForm.role) && !roleForm.clinic_id) {
                    toast.error("Clinic is required for this role");
                    return;
                  }
                  grantRoleMutation.mutate({
                    userId: selectedUser.id,
                    role: roleForm.role,
                    clinicId: roleRequiresClinic(roleForm.role) ? roleForm.clinic_id : undefined,
                  });
                }}
                disabled={grantRoleMutation.isPending}
              >
                {grantRoleMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Add Role
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Manage Clinics Dialog */}
      <Dialog open={showClinicDialog} onOpenChange={setShowClinicDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-mono">Manage Clinic Memberships</DialogTitle>
            <DialogDescription>
              {selectedUser?.email} - Current clinics:{" "}
              {selectedUser?.clinics?.map((c) => c.clinic_name).join(", ") || "None"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            {/* Current clinic memberships */}
            {selectedUser?.clinics && selectedUser.clinics.length > 0 && (
              <div className="space-y-2">
                <Label>Current Clinics</Label>
                <div className="flex flex-wrap gap-2">
                  {selectedUser.clinics.map((c, i) => (
                    <Badge key={i} variant="outline" className="pr-1">
                      {c.clinic_name} ({c.role})
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-4 w-4 ml-1 hover:bg-destructive/20"
                        onClick={() =>
                          clinicMembershipMutation.mutate({
                            userId: selectedUser.id,
                            clinicId: c.clinic_id,
                            action: "unassign",
                            role: c.role,
                          })
                        }
                      >
                        ×
                      </Button>
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Add to Clinic</Label>
              <Select
                value={clinicForm.clinic_id}
                onValueChange={(v) => setClinicForm((f) => ({ ...f, clinic_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select clinic..." />
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
              <Label>Role in Clinic</Label>
              <Select
                value={clinicForm.role}
                onValueChange={(v) => setClinicForm((f) => ({ ...f, role: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="neurologist">Neurologist</SelectItem>
                  <SelectItem value="technician">Technician</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setShowClinicDialog(false)}>
                Done
              </Button>
              <Button
                onClick={() => {
                  if (!selectedUser || !clinicForm.clinic_id) return;
                  clinicMembershipMutation.mutate({
                    userId: selectedUser.id,
                    clinicId: clinicForm.clinic_id,
                    action: "assign",
                    role: clinicForm.role,
                  });
                }}
                disabled={clinicMembershipMutation.isPending || !clinicForm.clinic_id}
              >
                {clinicMembershipMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Add to Clinic
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete User Confirmation Dialog */}
      <AlertDialog open={!!deleteUser} onOpenChange={(open) => !open && setDeleteUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User Permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteUser?.email}</strong> and all associated data including:
              <ul className="list-disc list-inside mt-2 text-sm">
                <li>Wallet and earnings</li>
                <li>Notes and support tickets</li>
                <li>Clinic memberships and roles</li>
                <li>EEG markers</li>
              </ul>
              <span className="block mt-2 font-semibold text-destructive">This action cannot be undone.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteUser && deleteUserMutation.mutate(deleteUser.id)}
              disabled={deleteUserMutation.isPending}
            >
              {deleteUserMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete User
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="text-xs text-muted-foreground bg-muted/30 p-3 rounded">
        <strong>Note:</strong> super_admin role can only be assigned via direct SQL for security.
      </div>
    </div>
  );
}
