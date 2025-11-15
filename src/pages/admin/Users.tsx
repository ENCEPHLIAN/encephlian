import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

export default function AdminUsers() {
  const { data: users, isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*, user_roles(role)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold logo-text">Users</h1>
        <p className="text-muted-foreground mt-1">Manage user accounts and roles</p>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b">
                <tr className="text-left text-sm text-muted-foreground">
                  <th className="p-4 font-medium">Email</th>
                  <th className="p-4 font-medium">Full Name</th>
                  <th className="p-4 font-medium">Roles</th>
                  <th className="p-4 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {users?.map((user) => {
                  const roles = (user as any).user_roles || [];
                  return (
                    <tr key={user.id} className="border-b hover:bg-muted/50">
                      <td className="p-4 font-mono text-sm">{user.email}</td>
                      <td className="p-4">{user.full_name || '-'}</td>
                      <td className="p-4">
                        <div className="flex gap-2 flex-wrap">
                          {roles.map((r: any, i: number) => (
                            <Badge key={i} variant="secondary">
                              {r.role}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="p-4 text-sm text-muted-foreground">
                        {new Date(user.created_at || '').toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
