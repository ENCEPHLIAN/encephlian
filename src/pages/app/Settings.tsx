import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTheme } from "next-themes";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff, Shield, ShieldCheck, ShieldOff, Palette, Lock, Monitor, Cloud, Wifi } from "lucide-react";
import { useUserSession } from "@/contexts/UserSessionContext";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export default function Settings() {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { userId, profile: contextProfile } = useUserSession();
  const [profile, setProfile] = useState<any>(null);
  
  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ newPassword: "", confirmPassword: "" });
  const [showPasswords, setShowPasswords] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [tfaStatus, setTfaStatus] = useState<{ enabled: boolean; loading: boolean }>({ enabled: false, loading: true });
  const [tfaLoading, setTfaLoading] = useState(false);

  // Device status - Windows Uploader + Cloud Sync
  const deviceStatus = {
    windowsUploader: { connected: false, lastSync: null as string | null },
    cloudSync: { connected: true, status: "idle" as "idle" | "syncing" | "error" },
  };
  const allOnline = deviceStatus.windowsUploader.connected && deviceStatus.cloudSync.connected;
  const partialOnline = deviceStatus.windowsUploader.connected || deviceStatus.cloudSync.connected;
  
  useEffect(() => {
    if (contextProfile) setProfile(contextProfile);
    loadTFAStatus();
  }, [contextProfile]);

  const loadTFAStatus = async () => {
    try {
      const { data, error } = await supabase.rpc("check_tfa_status");
      if (error) throw error;
      setTfaStatus({ enabled: (data as any)?.enabled || false, loading: false });
    } catch {
      setTfaStatus({ enabled: false, loading: false });
    }
  };

  const handleChangePassword = async () => {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setPasswordLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: passwordForm.newPassword });
      if (error) throw error;
      toast.success("Password updated successfully");
      setPasswordForm({ newPassword: "", confirmPassword: "" });
      setShowPasswordSection(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to update password");
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleDisableTFA = async () => {
    setTfaLoading(true);
    try {
      const { error } = await supabase.from("tfa_secrets").delete().eq("user_id", userId);
      if (error) throw error;
      toast.success("Two-factor authentication disabled");
      setTfaStatus({ enabled: false, loading: false });
    } catch (error: any) {
      toast.error(error.message || "Failed to disable TFA");
    } finally {
      setTfaLoading(false);
    }
  };
  
  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground mt-1">Manage your account preferences</p>
        </div>
        
        {/* Appearance */}
        <Card className="bg-card border-border">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Palette className="h-5 w-5 text-primary" />
              <CardTitle>Appearance</CardTitle>
            </div>
            <CardDescription>Customize the app theme</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <Label>Theme</Label>
                <p className="text-sm text-muted-foreground">Choose your preferred theme</p>
              </div>
              <Select value={theme} onValueChange={setTheme}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="dark">Dark</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Device Status */}
        <Card className="bg-card border-border">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Wifi className="h-5 w-5 text-primary" />
              <CardTitle>Device Status</CardTitle>
            </div>
            <CardDescription>Connection status for your devices</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <span className="text-sm font-medium">System Status</span>
              <Badge variant="outline" className={cn("text-xs", allOnline ? "border-emerald-500 text-emerald-500" : partialOnline ? "border-amber-500 text-amber-500" : "border-muted-foreground text-muted-foreground")}>
                {allOnline ? "All Online" : partialOnline ? "Partial" : "Offline"}
              </Badge>
            </div>
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-3">
                <Monitor className={cn("h-5 w-5", deviceStatus.windowsUploader.connected ? "text-emerald-500" : "text-muted-foreground/50")} />
                <div>
                  <p className="text-sm font-medium">Windows Uploader</p>
                  <p className="text-xs text-muted-foreground">{deviceStatus.windowsUploader.connected ? "Connected" : "Not connected"}</p>
                </div>
              </div>
              <div className={cn("h-3 w-3 rounded-full", deviceStatus.windowsUploader.connected ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/30")} />
            </div>
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-3">
                <Cloud className={cn("h-5 w-5", deviceStatus.cloudSync.connected ? "text-emerald-500" : "text-muted-foreground/50")} />
                <div>
                  <p className="text-sm font-medium">Cloud Sync</p>
                  <p className="text-xs text-muted-foreground capitalize">{deviceStatus.cloudSync.connected ? deviceStatus.cloudSync.status : "Disconnected"}</p>
                </div>
              </div>
              <div className={cn("h-3 w-3 rounded-full", deviceStatus.cloudSync.connected ? "bg-emerald-500" : "bg-muted-foreground/30")} />
            </div>
          </CardContent>
        </Card>

        {/* Security */}
        <Card className="bg-card border-border">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-primary" />
              <CardTitle>Security</CardTitle>
            </div>
            <CardDescription>Password and authentication settings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div><Label>Password</Label><p className="text-sm text-muted-foreground">Change your account password</p></div>
                <Button variant="outline" size="sm" onClick={() => setShowPasswordSection(!showPasswordSection)}>{showPasswordSection ? "Cancel" : "Change"}</Button>
              </div>
              {showPasswordSection && (
                <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                  <div className="space-y-2">
                    <Label>New Password</Label>
                    <div className="relative">
                      <Input type={showPasswords ? "text" : "password"} value={passwordForm.newPassword} onChange={(e) => setPasswordForm(f => ({ ...f, newPassword: e.target.value }))} placeholder="Enter new password" />
                      <button type="button" onClick={() => setShowPasswords(!showPasswords)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        {showPasswords ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Confirm Password</Label>
                    <Input type={showPasswords ? "text" : "password"} value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm(f => ({ ...f, confirmPassword: e.target.value }))} placeholder="Confirm new password" />
                  </div>
                  <Button onClick={handleChangePassword} disabled={passwordLoading || !passwordForm.newPassword || !passwordForm.confirmPassword} size="sm">
                    {passwordLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Update Password
                  </Button>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between pt-4 border-t">
              <div>
                <Label className="flex items-center gap-2">{tfaStatus.enabled ? <ShieldCheck className="h-4 w-4 text-green-500" /> : <ShieldOff className="h-4 w-4 text-muted-foreground" />}Two-Factor Authentication</Label>
                <p className="text-sm text-muted-foreground">{tfaStatus.enabled ? "TFA is enabled" : "Add extra security"}</p>
              </div>
              {tfaStatus.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : tfaStatus.enabled ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild><Button variant="destructive" size="sm">Disable</Button></AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader><AlertDialogTitle>Disable TFA?</AlertDialogTitle><AlertDialogDescription>This will reduce account security.</AlertDialogDescription></AlertDialogHeader>
                    <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleDisableTFA} className="bg-destructive hover:bg-destructive/90" disabled={tfaLoading}>{tfaLoading ? "Disabling..." : "Disable"}</AlertDialogAction></AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : <Button variant="outline" size="sm" onClick={() => navigate("/app/tfa-setup")}><Shield className="h-4 w-4 mr-2" />Enable</Button>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
