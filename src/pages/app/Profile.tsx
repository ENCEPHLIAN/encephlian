import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Loader2, Building2, Stethoscope, Mail, AlertCircle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUserSession } from "@/contexts/UserSessionContext";

const SPECIALIZATIONS = [
  { value: "neurology", label: "Neurology" },
  { value: "epileptology", label: "Epileptology" },
  { value: "clinical-neurophysiology", label: "Clinical Neurophysiology" },
  { value: "sleep-medicine", label: "Sleep Medicine" },
  { value: "neurophysiology", label: "Neurophysiology" },
  { value: "pediatric-neurology", label: "Pediatric Neurology" },
  { value: "psychiatry", label: "Psychiatry" },
  { value: "internal-medicine", label: "Internal Medicine" },
  { value: "other", label: "Other" },
];

export default function Profile() {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<any>(null);
  const [savedData, setSavedData] = useState<any>(null);
  const { userId, profile: sessionProfile, refreshSession } = useUserSession();

  useEffect(() => {
    if (sessionProfile) {
      setFormData(sessionProfile);
      setSavedData(sessionProfile);
    }
  }, [sessionProfile]);

  const isDirty = JSON.stringify(formData) !== JSON.stringify(savedData);

  const handleDiscard = useCallback(() => {
    setFormData(savedData);
  }, [savedData]);

  const handleSave = async () => {
    if (!userId) {
      toast.error("Not authenticated");
      return;
    }
    if (!formData?.full_name?.trim()) {
      toast.error("Full name is required");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: formData.full_name?.trim(),
          credentials: formData.credentials?.trim() || null,
          medical_license_number: formData.medical_license_number?.trim() || null,
          specialization: formData.specialization || null,
          department: formData.department?.trim() || null,
          hospital_affiliation: formData.hospital_affiliation?.trim() || null,
          phone_number: formData.phone_number?.trim() || null,
        })
        .eq("id", userId);

      if (error) throw error;

      await refreshSession();
      setSavedData({ ...formData });
      toast.success("Profile saved");
    } catch (error: any) {
      toast.error(error.message || "Failed to save profile");
    } finally {
      setLoading(false);
    }
  };

  const field = (key: string, value: string) =>
    setFormData((prev: any) => ({ ...prev, [key]: value }));

  const initials =
    formData?.full_name
      ?.split(" ")
      .map((n: string) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) ||
    formData?.email?.substring(0, 2).toUpperCase() ||
    "??";

  if (!formData) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
            <p className="text-sm text-muted-foreground mt-1">Your professional credentials and contact information</p>
          </div>
          {isDirty && (
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={handleDiscard} disabled={loading}>
                Discard
              </Button>
              <Button size="sm" onClick={handleSave} disabled={loading}>
                {loading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Save changes
              </Button>
            </div>
          )}
        </div>

        {isDirty && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            You have unsaved changes
          </div>
        )}

        {/* Identity card */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16 ring-2 ring-border">
                <AvatarFallback className="text-lg bg-primary/10 text-primary font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="font-semibold text-lg truncate">
                  {formData.full_name || <span className="text-muted-foreground italic">No name set</span>}
                </p>
                <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{formData.email}</span>
                </p>
                {formData.role && (
                  <Badge variant="secondary" className="mt-2 text-xs capitalize">
                    {formData.role}
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Professional details */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <Stethoscope className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">Professional Information</CardTitle>
            </div>
            <CardDescription className="text-xs">Credentials appear on signed EEG reports</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">
                  Full Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={formData.full_name || ""}
                  onChange={(e) => field("full_name", e.target.value)}
                  placeholder="Dr. Priya Sharma"
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Post-nominal Credentials</Label>
                <Input
                  value={formData.credentials || ""}
                  onChange={(e) => field("credentials", e.target.value)}
                  placeholder="MD, DM (Neurology), FAES"
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Medical License Number</Label>
                <Input
                  value={formData.medical_license_number || ""}
                  onChange={(e) => field("medical_license_number", e.target.value)}
                  placeholder="MH-12345"
                  className="h-9 text-sm font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Specialization</Label>
                <Select
                  value={formData.specialization || ""}
                  onValueChange={(v) => field("specialization", v)}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {SPECIALIZATIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value} className="text-sm">
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Department</Label>
                <Input
                  value={formData.department || ""}
                  onChange={(e) => field("department", e.target.value)}
                  placeholder="Department of Neurology"
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Phone / Contact</Label>
                <Input
                  value={formData.phone_number || ""}
                  onChange={(e) => field("phone_number", e.target.value)}
                  placeholder="+91 98765 43210"
                  className="h-9 text-sm"
                  type="tel"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Hospital affiliation */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">Hospital Affiliation</CardTitle>
            </div>
            <CardDescription className="text-xs">Your primary institution</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Hospital / Clinic Name</Label>
              <Input
                value={formData.hospital_affiliation || ""}
                onChange={(e) => field("hospital_affiliation", e.target.value)}
                placeholder="City General Hospital, Mumbai"
                className="h-9 text-sm"
              />
            </div>
          </CardContent>
        </Card>

        {/* Save footer */}
        {isDirty && (
          <>
            <Separator />
            <div className="flex justify-end gap-2 pb-6">
              <Button variant="outline" onClick={handleDiscard} disabled={loading}>
                Discard changes
              </Button>
              <Button onClick={handleSave} disabled={loading}>
                {loading && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Save changes
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
