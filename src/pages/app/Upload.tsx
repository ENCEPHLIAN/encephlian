import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload as UploadIcon } from "lucide-react";

export default function Upload() {
  const [file, setFile] = useState<File | null>(null);
  const [patientId, setPatientId] = useState("");
  const [patientName, setPatientName] = useState("");
  const [patientAge, setPatientAge] = useState("");
  const [patientGender, setPatientGender] = useState("");
  const [indication, setIndication] = useState("");
  const [sla, setSla] = useState<"TAT" | "STAT">("TAT");
  const [clinicId, setClinicId] = useState("");
  
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: clinics, isLoading: clinicsLoading } = useQuery({
    queryKey: ["clinics"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clinics")
        .select("*");
      
      if (error) throw error;
      return data;
    }
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file || !clinicId) throw new Error("Missing required fields");

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Create study record with patient data in meta
      const { data: study, error: studyError } = await supabase
        .from("studies")
        .insert({
          clinic_id: clinicId,
          owner: user.id,
          indication,
          sla,
          state: "uploaded",
          meta: {
            patient_id: patientId,
            patient_name: patientName,
            patient_age: patientAge ? parseInt(patientAge) : null,
            patient_gender: patientGender || null,
          }
        })
        .select()
        .single();

      if (studyError) throw studyError;

      // Upload file to storage
      const filePath = `${clinicId}/${study.id}/${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("eeg-raw")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Create file record
      const { error: fileError } = await supabase
        .from("study_files")
        .insert({
          study_id: study.id,
          path: filePath,
          kind: "raw",
          size_bytes: file.size,
        });

      if (fileError) throw fileError;

      return study;
    },
    onSuccess: (study) => {
      toast({
        title: "Study uploaded successfully",
        description: "The EEG file has been uploaded and is ready for processing."
      });
      queryClient.invalidateQueries({ queryKey: ["studies"] });
      navigate(`/app/studies/${study.id}`);
    },
    onError: (error: any) => {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    uploadMutation.mutate();
  };

  if (clinicsLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Upload Study</h1>
        <p className="text-muted-foreground">Upload a new EEG study for analysis</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Study Information</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="clinic">Clinic *</Label>
              <Select value={clinicId} onValueChange={setClinicId} required>
                <SelectTrigger>
                  <SelectValue placeholder="Select clinic" />
                </SelectTrigger>
                <SelectContent>
                  {clinics?.map((clinic) => (
                    <SelectItem key={clinic.id} value={clinic.id}>
                      {clinic.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="patientId">Patient ID *</Label>
                <Input
                  id="patientId"
                  value={patientId}
                  onChange={(e) => setPatientId(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sla">SLA Type *</Label>
                <Select value={sla} onValueChange={(val: "TAT" | "STAT") => setSla(val)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TAT">TAT (Turn Around Time)</SelectItem>
                    <SelectItem value="STAT">STAT (Urgent)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="patientName">Patient Name *</Label>
              <Input
                id="patientName"
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="age">Age</Label>
                <Input
                  id="age"
                  type="number"
                  value={patientAge}
                  onChange={(e) => setPatientAge(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="gender">Gender</Label>
                <Select value={patientGender} onValueChange={setPatientGender}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Female">Female</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="indication">Clinical Indication</Label>
              <Textarea
                id="indication"
                value={indication}
                onChange={(e) => setIndication(e.target.value)}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="file">EEG File (EDF/NWB) *</Label>
              <Input
                id="file"
                type="file"
                accept=".edf,.nwb"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                required
              />
              {file && (
                <p className="text-sm text-muted-foreground">
                  Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                </p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={uploadMutation.isPending}
            >
              {uploadMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <UploadIcon className="mr-2 h-4 w-4" />
              Upload Study
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
