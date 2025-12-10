import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Shield, Building2, Stethoscope, Phone, Mail, BadgeCheck } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function Profile() {
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  
  useEffect(() => {
    loadProfile();
  }, []);
  
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
      if (!user) return;
      
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: profile.full_name,
          credentials: profile.credentials,
          medical_license_number: profile.medical_license_number,
          specialization: profile.specialization,
          department: profile.department,
          hospital_affiliation: profile.hospital_affiliation,
          phone_number: profile.phone_number,
        })
        .eq('id', user.id);
      
      if (error) throw error;
      
      toast.success("Profile updated successfully");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };
  
  const initials = profile?.full_name
    ?.split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase() || user?.email?.substring(0, 2).toUpperCase() || '??';
  
  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">Profile</h1>
          <p className="text-muted-foreground mt-1">Manage your professional information</p>
        </div>
        
        {/* Profile Header Card */}
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <Avatar className="h-20 w-20">
                <AvatarFallback className="text-xl bg-primary/10 text-primary">{initials}</AvatarFallback>
              </Avatar>
              <div className="text-center sm:text-left flex-1">
                <h2 className="text-xl font-semibold">{profile?.full_name || "Clinician"}</h2>
                <p className="text-sm text-muted-foreground flex items-center justify-center sm:justify-start gap-1 mt-1">
                  <Mail className="h-3.5 w-3.5" />
                  {user?.email}
                </p>
                {profile?.role && (
                  <Badge variant="secondary" className="mt-2">
                    {profile.role}
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Professional Information */}
        <Card className="bg-card border-border">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Stethoscope className="h-5 w-5 text-primary" />
              <CardTitle>Professional Information</CardTitle>
            </div>
            <CardDescription>Your medical credentials and contact details</CardDescription>
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
                <Label htmlFor="phone_number">Phone Number</Label>
                <Input 
                  id="phone_number"
                  value={profile?.phone_number || ''}
                  onChange={(e) => setProfile({...profile, phone_number: e.target.value})}
                  placeholder="+1 (555) 123-4567"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Hospital Affiliation */}
        <Card className="bg-card border-border">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              <CardTitle>Hospital Affiliation</CardTitle>
            </div>
            <CardDescription>Your primary hospital or clinic</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="hospital_affiliation">Hospital/Clinic Name</Label>
              <Input 
                id="hospital_affiliation"
                value={profile?.hospital_affiliation || ''}
                onChange={(e) => setProfile({...profile, hospital_affiliation: e.target.value})}
                placeholder="City General Hospital"
              />
            </div>
          </CardContent>
        </Card>
        
        {/* Save Button */}
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={loading} className="min-w-[120px]">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
}