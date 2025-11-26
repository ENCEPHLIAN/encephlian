import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTheme } from "next-themes";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, AlertTriangle, Trash2 } from "lucide-react";
import { useProfile } from "@/contexts/ProfileContext";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useNavigate } from "react-router-dom";

export default function Settings() {
  const { theme, setTheme } = useTheme();
  const [loading, setLoading] = useState(false);
  const { profile: contextProfile, refreshProfile } = useProfile();
  const [profile, setProfile] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const navigate = useNavigate();
  
  useEffect(() => {
    loadProfile();
  }, [contextProfile]);
  
  const loadProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    setUser(user);
    
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    
    setProfile(data || {});
  };
  
  const handleSave = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      
      // Update profile - exclude email and role as they're immutable
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: profile.full_name,
          company_name: profile.company_name,
          phone_number: profile.phone_number,
          medical_license_number: profile.medical_license_number,
          specialization: profile.specialization,
          department: profile.department,
          hospital_affiliation: profile.hospital_affiliation,
          credentials: profile.credentials,
        })
        .eq('id', user.id);
      
      if (error) throw error;
      
      // Force reload to verify persistence
      await loadProfile();
      await refreshProfile();
      
      toast.success("Settings saved and verified");
    } catch (error: any) {
      toast.error(`Failed to save: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmation !== "DELETE MY ACCOUNT") {
      toast.error("Invalid confirmation text");
      return;
    }

    try {
      setIsDeleting(true);

      const { data, error } = await supabase.functions.invoke("delete_account", {
        body: { confirmation: deleteConfirmation },
      });

      if (error) throw error;

      toast.success("Account deleted successfully");

      // Sign out and redirect
      await supabase.auth.signOut();
      navigate("/");
    } catch (err: any) {
      toast.error(err.message || "Failed to delete account");
    } finally {
      setIsDeleting(false);
    }
  };
  
  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Account Settings</h1>
          <p className="text-muted-foreground mt-1">Manage your account preferences and profile</p>
        </div>
        
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle>Company/Brand Settings</CardTitle>
            <CardDescription>Customize your clinic or company branding</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="company_name">Company Name</Label>
              <Input 
                id="company_name"
                value={profile?.company_name || ''}
                onChange={(e) => setProfile({...profile, company_name: e.target.value})}
                placeholder="Enter your company name (e.g., ENCEPHLIAN)"
              />
              <p className="text-xs text-muted-foreground">This will appear as your logo text in the sidebar</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle>Professional Information</CardTitle>
            <CardDescription>Update your medical credentials and contact details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="full_name">Full Name</Label>
                <Input 
                  id="full_name"
                  value={profile?.full_name || ''}
                  onChange={(e) => setProfile({...profile, full_name: e.target.value})}
                  placeholder="Dr. John Smith"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="credentials">Credentials</Label>
                <Input 
                  id="credentials"
                  value={profile?.credentials || ''}
                  onChange={(e) => setProfile({...profile, credentials: e.target.value})}
                  placeholder="MD, PhD, FAES"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="medical_license_number">Medical License Number</Label>
                <Input 
                  id="medical_license_number"
                  value={profile?.medical_license_number || ''}
                  onChange={(e) => setProfile({...profile, medical_license_number: e.target.value})}
                  placeholder="Enter license number"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="specialization">Specialization</Label>
                <Select 
                  value={profile?.specialization || ''} 
                  onValueChange={(value) => setProfile({...profile, specialization: value})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select specialization" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="neurology">Neurology</SelectItem>
                    <SelectItem value="epileptology">Epileptology</SelectItem>
                    <SelectItem value="sleep-medicine">Sleep Medicine</SelectItem>
                    <SelectItem value="neurophysiology">Neurophysiology</SelectItem>
                    <SelectItem value="pediatric-neurology">Pediatric Neurology</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="department">Department</Label>
                <Input 
                  id="department"
                  value={profile?.department || ''}
                  onChange={(e) => setProfile({...profile, department: e.target.value})}
                  placeholder="Department of Neurology"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="hospital_affiliation">Hospital/Clinic Affiliation</Label>
                <Input 
                  id="hospital_affiliation"
                  value={profile?.hospital_affiliation || ''}
                  onChange={(e) => setProfile({...profile, hospital_affiliation: e.target.value})}
                  placeholder="City General Hospital"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone_number">Phone Number</Label>
                <Input 
                  id="phone_number"
                  value={profile?.phone_number || ''}
                  onChange={(e) => setProfile({...profile, phone_number: e.target.value})}
                  placeholder="+1 (555) 123-4567"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input 
                  id="email"
                  value={user?.email || ''}
                  disabled
                  className="bg-muted"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <Input 
                  id="role"
                  value={profile?.role || 'neurologist'}
                  disabled
                  className="bg-muted"
                />
              </div>
            </div>
            
            <Button onClick={handleSave} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </CardContent>
        </Card>
        
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>Customize how the app looks</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Theme</Label>
                <p className="text-sm text-muted-foreground">Choose your preferred theme</p>
              </div>
              <Select value={theme} onValueChange={setTheme}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="dark">Dark</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
            <CardDescription>Manage how you receive updates</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Email Notifications</Label>
                <p className="text-sm text-muted-foreground">Receive updates about new studies</p>
              </div>
              <Switch defaultChecked />
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <Label>Push Notifications</Label>
                <p className="text-sm text-muted-foreground">Get notified about urgent cases</p>
              </div>
              <Switch defaultChecked />
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-card border-border border-destructive/50">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Danger Zone
            </CardTitle>
            <CardDescription>Irreversible actions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Account
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription className="space-y-4">
                    <p>
                      This will permanently delete your account and remove all your data including:
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      <li>All EEG studies and files</li>
                      <li>Reports and notes</li>
                      <li>Wallet and payment history</li>
                      <li>Profile information</li>
                    </ul>
                    <div className="space-y-2 pt-4">
                      <Label htmlFor="delete-confirm">
                        Type <strong>DELETE MY ACCOUNT</strong> to confirm:
                      </Label>
                      <Input
                        id="delete-confirm"
                        value={deleteConfirmation}
                        onChange={(e) => setDeleteConfirmation(e.target.value)}
                        placeholder="DELETE MY ACCOUNT"
                      />
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => setDeleteConfirmation("")}>
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteAccount}
                    disabled={isDeleting || deleteConfirmation !== "DELETE MY ACCOUNT"}
                    className="bg-destructive hover:bg-destructive/90"
                  >
                    {isDeleting ? "Deleting..." : "Delete Account"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
