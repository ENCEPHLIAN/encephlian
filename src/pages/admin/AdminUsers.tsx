import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import InternalTeamManagement from "@/components/admin/InternalTeamManagement";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  Loader2, Search, MoreHorizontal, Ban, CheckCircle,
  KeyRound, ShieldOff, Trash2, Coins,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

type UserRow = {
  id: string;
  email: string;
  full_name: string | null;
  is_disabled: boolean;
  created_at: string;
  app_roles: { role: string; clinic_id: string | null }[];
  clinics: { clinic_id: string; role: string; clinic_name: string }[];
  tokens: number;
};

const ROLE_STYLE: Record<string, string> = {
  super_admin: "bg-red-500/10 text-red-500",
  management:  "bg-violet-500/10 text-violet-500",
  neurologist: "bg-blue-500/10 text-blue-500",
  clinician:   "bg-muted text-muted-foreground",
};

export default function AdminUsers() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [clinicFilter, setClinicFilter] = useState("all");
  const [tokenDialog, setTokenDialog] = useState<UserRow | null>(null);
  const [tokenAmount, setTokenAmount] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);

  const { data: users, isLoading } = useQuery<UserRow[]>({
    queryKey: ["admin-all-users"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_get_all_users");
      if (error) throw error;
      return data as UserRow[];
    },
  });

  const { data: clinics } = useQuery({
    queryKey: ["admin-clinics-list"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_get_clinics_for_dropdown");
      if (error) throw error;
      return data as { id: string; name: string }[];
    },
  });

  const sendResetMutation = useMutation({
    mutationFn: async (email: string) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/login`,
      });
      if (error) throw error;
    },
    onSuccess: () => toast.success("Password reset link sent"),
    onError: (e: any) => toast.error(e.message),
  });

  const suspendMutation = useMutation({
    mutationFn: async ({ userId, suspend }: { userId: string; suspend: boolean }) => {
      const { error } = await supabase.rpc("admin_suspend_user", { p_user_id: userId, p_suspend: suspend });
      if (error) throw error;
    },
    onSuccess: (_, { suspend }) => {
      queryClient.invalidateQueries({ queryKey: ["admin-all-users"] });
      toast.success(suspend ? "User suspended" : "User reactivated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc("admin_delete_user", { p_user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-all-users"] });
      toast.success("User deleted");
      setDeleteTarget(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const resetTFAMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc("admin_reset_user_tfa", { p_user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => toast.success("TFA reset"),
    onError: (e: any) => toast.error(e.message),
  });

  const adjustTokensMutation = useMutation({
    mutationFn: async ({ userId, amount, operation }: { userId: string; amount: number; operation: string }) => {
      const { data, error } = await supabase.rpc("admin_adjust_tokens", {
        p_user_id: userId, p_amount: amount, p_operation: operation,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["admin-all-users"] });
      toast.success(`Tokens: ${data?.old_balance} → ${data?.new_balance}`);
      setTokenDialog(null);
      setTokenAmount("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const isSuperAdmin = (u: UserRow) => u.app_roles?.some((r) => r.role === "super_admin");
  const isSystemRole = (u: UserRow) => u.app_roles?.some((r) => r.role === "super_admin" || r.role === "management");
  const primaryRole = (u: UserRow) => u.app_roles?.[0]?.role || "—";

  const filtered = useMemo(() => {
    if (!users) return [];
    return users.filter((u) => {
      if (search) {
        const q = search.toLowerCase();
        if (!u.email.toLowerCase().includes(q) && !u.full_name?.toLowerCase().includes(q)) return false;
      }
      if (clinicFilter !== "all") {
        if (!u.clinics?.some((c) => c.clinic_id === clinicFilter)) return false;
      }
      return true;
    });
  }, [users, search, clinicFilter]);

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Users</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {users?.length ?? 0} users across {clinics?.length ?? 0} clinics
        </p>
      </div>

      <InternalTeamManagement />

      {/* Filters */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Email or name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
        <Select value={clinicFilter} onValueChange={setClinicFilter}>
          <SelectTrigger className="w-40 h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All clinics</SelectItem>
            {clinics?.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="rounded-lg border border-border/60 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40 bg-muted/30">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">User</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Clinic</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Role</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Tokens</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Joined</th>
                <th className="px-4 py-2.5 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {filtered.map((user) => (
                <tr key={user.id} className={cn("hover:bg-accent/20 transition-colors", user.is_disabled && "opacity-50")}>
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-sm font-medium leading-none">{user.full_name || "—"}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{user.email}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {user.clinics?.[0]?.clinic_name || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant="secondary"
                      className={cn("text-[10px] h-4 px-1.5", ROLE_STYLE[primaryRole(user)] || "bg-muted text-muted-foreground")}
                    >
                      {primaryRole(user)}
                    </Badge>
                    {user.is_disabled && (
                      <Badge variant="destructive" className="text-[10px] h-4 px-1.5 ml-1">suspended</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {isSystemRole(user) ? "—" : user.tokens ?? 0}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {user.created_at
                      ? formatDistanceToNow(new Date(user.created_at), { addSuffix: true })
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onClick={() => sendResetMutation.mutate(user.email)}>
                          <KeyRound className="h-3.5 w-3.5 mr-2" />
                          Reset password
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => resetTFAMutation.mutate(user.id)}>
                          <ShieldOff className="h-3.5 w-3.5 mr-2" />
                          Reset TFA
                        </DropdownMenuItem>
                        {!isSystemRole(user) && (
                          <DropdownMenuItem onClick={() => { setTokenDialog(user); setTokenAmount(String(user.tokens ?? 0)); }}>
                            <Coins className="h-3.5 w-3.5 mr-2" />
                            Adjust tokens
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        {user.is_disabled ? (
                          <DropdownMenuItem onClick={() => suspendMutation.mutate({ userId: user.id, suspend: false })}>
                            <CheckCircle className="h-3.5 w-3.5 mr-2" />
                            Reactivate
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => suspendMutation.mutate({ userId: user.id, suspend: true })}
                          >
                            <Ban className="h-3.5 w-3.5 mr-2" />
                            Suspend
                          </DropdownMenuItem>
                        )}
                        {!isSuperAdmin(user) && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => setDeleteTarget(user)}
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-2" />
                              Delete user
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-xs text-muted-foreground">
                    No users match filters
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Adjust Tokens Dialog */}
      <Dialog open={!!tokenDialog} onOpenChange={(o) => !o && setTokenDialog(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Adjust tokens</DialogTitle>
            <DialogDescription>{tokenDialog?.full_name || tokenDialog?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs text-muted-foreground">Current</Label>
              <p className="text-2xl font-mono font-semibold">{tokenDialog?.tokens ?? 0}</p>
            </div>
            <div>
              <Label htmlFor="token-input" className="text-xs text-muted-foreground">New balance</Label>
              <Input
                id="token-input"
                type="number"
                value={tokenAmount}
                onChange={(e) => setTokenAmount(e.target.value)}
                className="font-mono mt-1 h-8"
                min={0}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setTokenDialog(null)}>Cancel</Button>
            <Button
              size="sm"
              disabled={adjustTokensMutation.isPending}
              onClick={() => {
                if (!tokenDialog) return;
                const newAmt = parseInt(tokenAmount) || 0;
                const diff = newAmt - (tokenDialog.tokens || 0);
                adjustTokensMutation.mutate({
                  userId: tokenDialog.id,
                  amount: Math.abs(diff),
                  operation: diff >= 0 ? "credit" : "debit",
                });
              }}
            >
              {adjustTokensMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Update
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete User */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user?</AlertDialogTitle>
            <AlertDialogDescription>
              <code className="font-mono text-xs">{deleteTarget?.email}</code> and all their data will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
