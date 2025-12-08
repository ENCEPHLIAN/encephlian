import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Search, User } from "lucide-react";
import { format } from "date-fns";

type UserWithDetails = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  created_at: string;
  clinic_name?: string;
  app_role?: string;
};

export default function AdminUsers() {
  const [searchQuery, setSearchQuery] = useState("");

  const { data: users, isLoading } = useQuery<UserWithDetails[]>({
    queryKey: ["admin-all-users"],
    queryFn: async () => {
      // Get all profiles
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });
      if (profilesError) throw profilesError;

      // Get user_roles
      const { data: roles } = await supabase.from("user_roles").select("*");
      const roleMap = new Map<string, string>();
      roles?.forEach((r) => {
        if (!roleMap.has(r.user_id)) {
          roleMap.set(r.user_id, r.role);
        }
      });

      // Get clinic memberships
      const { data: memberships } = await supabase
        .from("clinic_memberships")
        .select("user_id, clinic:clinic_id(name)");
      const clinicMap = new Map<string, string>();
      memberships?.forEach((m) => {
        if (m.clinic && !clinicMap.has(m.user_id)) {
          clinicMap.set(m.user_id, (m.clinic as any).name);
        }
      });

      return (profiles || []).map((p) => ({
        id: p.id,
        email: p.email,
        full_name: p.full_name,
        role: p.role,
        created_at: p.created_at,
        clinic_name: clinicMap.get(p.id),
        app_role: roleMap.get(p.id),
      }));
    },
  });

  const filteredUsers = users?.filter((user) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      user.email.toLowerCase().includes(query) ||
      user.full_name?.toLowerCase().includes(query) ||
      user.clinic_name?.toLowerCase().includes(query)
    );
  });

  const getRoleBadgeVariant = (role?: string) => {
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
        <h1 className="text-2xl font-mono font-bold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground font-mono">
          All platform users and their roles
        </p>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by email, name, clinic..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 font-mono"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-mono">User</TableHead>
                <TableHead className="font-mono">Clinic</TableHead>
                <TableHead className="font-mono">Profile Role</TableHead>
                <TableHead className="font-mono">App Role</TableHead>
                <TableHead className="font-mono">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers?.map((user) => (
                <TableRow key={user.id}>
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
                  <TableCell className="text-sm">
                    {user.clinic_name || <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-xs">
                      {user.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {user.app_role ? (
                      <Badge
                        variant={getRoleBadgeVariant(user.app_role) as any}
                        className="font-mono text-xs"
                      >
                        {user.app_role}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {user.created_at
                      ? format(new Date(user.created_at), "MMM d, yyyy")
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
              {(!filteredUsers || filteredUsers.length === 0) && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No users found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground bg-muted/30 p-3 rounded">
        <strong>Note:</strong> Admin role assignment is restricted to SQL/database level only. 
        This prevents accidental privilege escalation through the UI.
      </div>
    </div>
  );
}
