import { useState, useMemo, useEffect } from "react";
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
  MoreHorizontal,
  Ban,
  CheckCircle,
  KeyRound,
  Users,
  Building2,
  Trash2,
  ShieldOff,
  Coins,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

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

/**
 * AdminUsers - Simplified User Management
 * 
 * In the value unit model:
 * - Clinicians are created via the "Onboard Clinic" flow (AdminClinics)
 * - This page is for viewing/managing existing users
 * - Management users are rare (internal only)
 */
export default function AdminUsers() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [clinicFilter, setClinicFilter] = useState<string>("all");
  const [showTokenDialog, setShowTokenDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [deleteUser, setDeleteUser] = useState<UserRow | null>(null);
  const [tokenAmount, setTokenAmount] = useState("");

  // Fetch users
  const { data: users, isLoading } = useQuery<UserRow[]>({
    queryKey: ["admin-all-users"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_get_all_users");
      if (error) throw error;
      return data as UserRow[];
    },
  });

  // Fetch clinics for filter
  const { data: clinics } = useQuery<ClinicOption[]>({
    queryKey: ["admin-clinics-list"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_get_clinics_for_dropdown");
      if (error) throw error;
      return data as ClinicOption[];
    },
  });

  // Calculate stats
  const stats = useMemo(() => {
    if (!users) return { total: 0, clinicians: 0, management: 0 };
    return {
      total: users.length,
      clinicians: users.filter(u => u.app_roles?.some(r => r.role === 'clinician')).length,
      management: users.filter(u => u.app_roles?.some(r => r.role === 'management' || r.role === 'super_admin')).length,
    };
  }, [users]);

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
      toast.success(`User deleted`);
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
    onSuccess: () => toast.success("TFA reset successfully"),
    onError: (error: any) => toast.error(error.message),
  });

  // Adjust tokens mutation
  const adjustTokensMutation = useMutation({
    mutationFn: async ({ userId, amount, operation }: { userId: string; amount: number; operation: string }) => {
      const { data, error } = await supabase.rpc("admin_adjust_tokens", {
        p_user_id: userId,
        p_amount: amount,
        p_operation: operation,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["admin-all-users"] });
      toast.success(`Tokens: ${data?.old_balance} → ${data?.new_balance}`);
      setShowTokenDialog(false);
      setTokenAmount("");
    },
    onError: (error: any) => toast.error(error.message),
  });

  // Helper functions
  const isSuperAdmin = (user: UserRow) => user.app_roles?.some((r) => r.role === "super_admin");
  const isSystemRole = (user: UserRow) => user.app_roles?.some((r) => r.role === "super_admin" || r.role === "management");
  const isClinician = (user: UserRow) => !isSystemRole(user);

  // Filter users
  const filteredUsers = useMemo(() => {
    if (!users) return [];
    return users.filter((user) => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch =
          user.email.toLowerCase().includes(query) ||
          user.full_name?.toLowerCase().includes(query);
        if (!matchesSearch) return false;
      }
      if (clinicFilter !== "all") {
        const inClinic = user.clinics?.some((c) => c.clinic_id === clinicFilter);
        if (!inClinic) return false;
      }
      return true;
    });
  }, [users, searchQuery, clinicFilter]);

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "super_admin": return "destructive";
      case "management": return "default";
      case "clinician": return "secondary";
      default: return "outline";
    }
  };

  const handleOpenTokenDialog = (user: UserRow) => {
    setSelectedUser(user);
    setTokenAmount(String(user.tokens));
    setShowTokenDialog(true);
  };

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
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage clinicians and their tokens. To add new clinicians, use "Onboard Clinic".
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-card border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
              <Users className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Total Users</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
              <User className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{stats.clinicians}</p>
              <p className="text-xs text-muted-foreground">Clinicians</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{clinics?.length || 0}</p>
              <p className="text-xs text-muted-foreground">Clinics</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by email or name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
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

      {/* Users Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>User</TableHead>
                <TableHead>Clinic</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-center">Tokens</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map((user) => (
                <TableRow key={user.id} className={cn(user.is_disabled && "opacity-50")}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                        <User className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{user.full_name || "—"}</p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {user.clinics?.length > 0 ? (
                      <Badge variant="outline" className="text-xs">
                        {user.clinics[0].clinic_name}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {user.app_roles?.length > 0 ? (
                      <Badge
                        variant={getRoleBadgeVariant(user.app_roles[0].role) as any}
                        className="text-xs"
                      >
                        {user.app_roles[0].role}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="font-mono text-sm">{user.tokens}</span>
                  </TableCell>
                  <TableCell>
                    {user.is_disabled ? (
                      <Badge variant="destructive" className="text-xs">
                        <Ban className="h-3 w-3 mr-1" />
                        Suspended
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-green-600 border-green-200">
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
                        {isClinician(user) && (
                          <DropdownMenuItem onClick={() => handleOpenTokenDialog(user)}>
                            <Coins className="h-4 w-4 mr-2" />
                            Adjust Tokens
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        {user.is_disabled ? (
                          <DropdownMenuItem
                            onClick={() => suspendMutation.mutate({ userId: user.id, suspend: false })}
                          >
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Reactivate
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            onClick={() => suspendMutation.mutate({ userId: user.id, suspend: true })}
                            className="text-destructive"
                          >
                            <Ban className="h-4 w-4 mr-2" />
                            Suspend
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
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    No users found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Adjust Tokens Dialog */}
      <Dialog open={showTokenDialog} onOpenChange={setShowTokenDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Adjust Tokens</DialogTitle>
            <DialogDescription>
              Set token balance for {selectedUser?.full_name || selectedUser?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Current Balance</Label>
              <p className="text-2xl font-mono font-bold">{selectedUser?.tokens || 0}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-tokens">New Balance</Label>
              <Input
                id="new-tokens"
                type="number"
                value={tokenAmount}
                onChange={(e) => setTokenAmount(e.target.value)}
                min={0}
                className="font-mono"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowTokenDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedUser) {
                  const newAmount = parseInt(tokenAmount) || 0;
                  const diff = newAmount - (selectedUser.tokens || 0);
                  adjustTokensMutation.mutate({
                    userId: selectedUser.id,
                    amount: Math.abs(diff),
                    operation: diff >= 0 ? "credit" : "debit",
                  });
                }
              }}
              disabled={adjustTokensMutation.isPending}
            >
              {adjustTokensMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Update Tokens
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete User Confirmation */}
      <AlertDialog open={!!deleteUser} onOpenChange={(open) => !open && setDeleteUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {deleteUser?.email} and all their data.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteUser && deleteUserMutation.mutate(deleteUser.id)}
            >
              {deleteUserMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
