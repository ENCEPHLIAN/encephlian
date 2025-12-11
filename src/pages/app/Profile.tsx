import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Building2, Stethoscope, Mail } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUserSession } from "@/contexts/UserSessionContext";

export default function Profile() {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<any>(null);
  const { userId, profile: sessionProfile, refreshSession } = useUserSession();
  
  useEffect(() => {
    if (sessionProfile) {
      setFormData(sessionProfile);
    }
  }, [sessionProfile]);
  
  const handleSave = async () => {
    if (!userId) {
      toast.error("Not authenticated");
      return;
    }
    
    setLoading(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: formData.full_name,
          credentials: formData.credentials,
          medical_license_number: formData.medical_license_number,
          specialization: formData.specialization,
          department: formData.department,
          hospital_affiliation: formData.hospital_affiliation,
          phone_number: formData.phone_number,
        })
        .eq('id', userId);
      
      if (error) throw error;
      
      // Refresh global session
      await refreshSession();
      
      toast.success("Profile updated successfully");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };
  
  const initials = formData?.full_name
    ?.split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase() || formData?.email?.substring(0, 2).toUpperCase() || '??';
  
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
              <Avatar className="h-16 w-16 sm:h-20 sm:w-20">
                <AvatarFallback className="text-lg sm:text-xl bg-primary/10 text-primary">{initials}</AvatarFallback>
              </Avatar>
              <div className="text-center sm:text-left flex-1">
                <h2 className="text-lg sm:text-xl font-semibold">{formData?.full_name || "Clinician"}</h2>
                <p className="text-xs sm:text-sm text-muted-foreground flex items-center justify-center sm:justify-start gap-1 mt-1">
                  <Mail className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  {formData?.email}
                </p>
                {formData?.role && (
                  <Badge variant="secondary" className="mt-2 text-xs">
                    {formData.role}
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Professional Information */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3 sm:pb-6">
            <div className="flex items-center gap-2">
              <Stethoscope className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              <CardTitle className="text-base sm:text-lg">Professional Information</CardTitle>
            </div>
            <CardDescription className="text-xs sm:text-sm">Your medical credentials and contact details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 sm:space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="full_name" className="text-xs sm:text-sm">Full Name</Label>
                <Input 
                  id="full_name"
                  value={formData?.full_name || ''}
                  onChange={(e) => setFormData({...formData, full_name: e.target.value})}
                  placeholder="Dr. John Smith"
                  className="h-9 sm:h-10 text-sm"
                />
              </div>
              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="credentials" className="text-xs sm:text-sm">Credentials</Label>
                <Input 
                  id="credentials"
                  value={formData?.credentials || ''}
                  onChange={(e) => setFormData({...formData, credentials: e.target.value})}
                  placeholder="MD, PhD, FAES"
                  className="h-9 sm:h-10 text-sm"
                />
              </div>
              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="medical_license_number" className="text-xs sm:text-sm">Medical License Number</Label>
                <Input 
                  id="medical_license_number"
                  value={formData?.medical_license_number || ''}
                  onChange={(e) => setFormData({...formData, medical_license_number: e.target.value})}
                  placeholder="Enter license number"
                  className="h-9 sm:h-10 text-sm"
                />
              </div>
              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="specialization" className="text-xs sm:text-sm">Specialization</Label>
                <Select 
                  value={formData?.specialization || ''} 
                  onValueChange={(value) => setFormData({...formData, specialization: value})}
                >
                  <SelectTrigger className="h-9 sm:h-10 text-sm">
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
              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="department" className="text-xs sm:text-sm">Department</Label>
                <Input 
                  id="department"
                  value={formData?.department || ''}
                  onChange={(e) => setFormData({...formData, department: e.target.value})}
                  placeholder="Department of Neurology"
                  className="h-9 sm:h-10 text-sm"
                />
              </div>
              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="phone_number" className="text-xs sm:text-sm">Phone Number</Label>
                <Input 
                  id="phone_number"
                  value={formData?.phone_number || ''}
                  onChange={(e) => setFormData({...formData, phone_number: e.target.value})}
                  placeholder="+1 (555) 123-4567"
                  className="h-9 sm:h-10 text-sm"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Hospital Affiliation */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3 sm:pb-6">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              <CardTitle className="text-base sm:text-lg">Hospital Affiliation</CardTitle>
            </div>
            <CardDescription className="text-xs sm:text-sm">Your primary hospital or clinic</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="hospital_affiliation" className="text-xs sm:text-sm">Hospital/Clinic Name</Label>
              <Input 
                id="hospital_affiliation"
                value={formData?.hospital_affiliation || ''}
                onChange={(e) => setFormData({...formData, hospital_affiliation: e.target.value})}
                placeholder="City General Hospital"
                className="h-9 sm:h-10 text-sm"
              />
            </div>
          </CardContent>
        </Card>
        
        {/* Save Button */}
        <div className="flex justify-end pb-6">
          <Button onClick={handleSave} disabled={loading} className="min-w-[100px] sm:min-w-[120px] h-9 sm:h-10 text-sm">
            {loading && <Loader2 className="mr-2 h-3 w-3 sm:h-4 sm:w-4 animate-spin" />}
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
}