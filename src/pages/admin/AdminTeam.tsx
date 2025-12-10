import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Loader2, Users, Shield, UserCog } from "lucide-react";

export default function AdminTeam() {
  const { data: teamMembers, isLoading } = useQuery({
    queryKey: ["admin-team-members"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_get_all_users");
      if (error) throw error;
      // Filter to only admin/management users
      return (data as any[]).filter((u) => {
        const roles = u.app_roles || [];
        return roles.some((r: any) => 
          r.role === "super_admin" || r.role === "management"
        );
      });
    },
  });

  const getRoleBadge = (roles: any[]) => {
    if (roles.some(r => r.role === "super_admin")) {
      return <Badge className="bg-red-500/10 text-red-600 border-red-500/30">Super Admin</Badge>;
    }
    if (roles.some(r => r.role === "management")) {
      return <Badge className="bg-purple-500/10 text-purple-600 border-purple-500/30">Management</Badge>;
    }
    return <Badge variant="secondary">Unknown</Badge>;
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
        <h1 className="text-2xl font-mono font-bold tracking-tight">Team</h1>
        <p className="text-sm text-muted-foreground font-mono">
          Internal team members with admin access
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Total Team
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">
              {teamMembers?.length || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Super Admins
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">
              {teamMembers?.filter(u => u.app_roles?.some((r: any) => r.role === "super_admin")).length || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <UserCog className="h-4 w-4" />
              Management
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">
              {teamMembers?.filter(u => u.app_roles?.some((r: any) => r.role === "management")).length || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Team List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-mono">Team Members</CardTitle>
          <CardDescription>Users with administrative privileges</CardDescription>
        </CardHeader>
        <CardContent>
          {teamMembers && teamMembers.length > 0 ? (
            <div className="space-y-3">
              {teamMembers.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-3 rounded-lg border"
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-primary/10 text-primary font-mono">
                        {(member.full_name || member.email || "?").slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium text-sm">{member.full_name || "Unnamed"}</p>
                      <p className="text-xs text-muted-foreground font-mono">{member.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getRoleBadge(member.app_roles || [])}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No team members found
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
