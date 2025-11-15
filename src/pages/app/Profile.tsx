import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import dayjs from "dayjs";

export default function Profile() {
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserEmail(user.email || "");
      }
    });
  }, []);

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (error) throw error;
      return data;
    }
  });

  const { data: memberships, isLoading: membershipsLoading } = useQuery({
    queryKey: ["clinic-memberships"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clinic_memberships")
        .select("*, clinics(name)");

      if (error) throw error;
      return data;
    }
  });

  if (profileLoading || membershipsLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold">Profile</h1>
        <p className="text-muted-foreground">Manage your account information</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Account Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={userEmail} disabled />
          </div>
          
          <div className="space-y-2">
            <Label>Full Name</Label>
            <Input value={profile?.full_name || ""} disabled />
          </div>

          <div className="space-y-2">
            <Label>Member Since</Label>
            <Input value={dayjs(profile?.created_at).format("MMMM D, YYYY")} disabled />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Clinic Memberships</CardTitle>
        </CardHeader>
        <CardContent>
          {memberships && memberships.length > 0 ? (
            <div className="space-y-2">
              {memberships.map((membership: any) => (
                <div key={membership.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <span className="font-medium">{membership.clinics?.name}</span>
                  {membership.is_primary && (
                    <span className="text-sm text-muted-foreground">Primary</span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No clinic memberships yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
