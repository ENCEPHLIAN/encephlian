import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, KeyRound, Shield } from "lucide-react";

export default function AdminAccount() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  const handleChangePassword = async () => {
    if (!currentPassword) {
      toast.error("Enter your current password");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }

    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    if (currentPassword === newPassword) {
      toast.error("New password must differ from current password");
      return;
    }

    setIsUpdating(true);
    try {
      // Supabase's updateUser does NOT verify the current password, so an
      // attacker with a hijacked session could silently rotate it. Re-auth
      // first with the email+currentPassword pair; on success we know the
      // session is actually the owner.
      const { data: userData, error: getUserErr } = await supabase.auth.getUser();
      if (getUserErr) throw getUserErr;
      const email = userData.user?.email;
      if (!email) throw new Error("No email on current session");

      const { error: reauthErr } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });
      if (reauthErr) {
        throw new Error("Current password is incorrect");
      }

      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      toast.success("Password updated successfully");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error: any) {
      toast.error(error.message || "Failed to update password");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Account</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Admin account security settings
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base font-medium">Change Password</CardTitle>
          </div>
          <CardDescription>
            Update your password regularly to keep your account secure
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Current Password</Label>
            <Input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
            />
          </div>
          <div className="space-y-2">
            <Label>New Password</Label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password"
            />
          </div>
          <div className="space-y-2">
            <Label>Confirm New Password</Label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
            />
          </div>
          <Button
            onClick={handleChangePassword}
            disabled={isUpdating || !currentPassword || !newPassword || !confirmPassword}
            className="w-full"
          >
            {isUpdating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Update Password
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base font-medium">Security Information</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>• Admin sessions require 2FA verification on each login</p>
          <p>• Sessions expire after 30 minutes of inactivity</p>
          <p>• All admin actions are logged for audit compliance</p>
        </CardContent>
      </Card>
    </div>
  );
}
