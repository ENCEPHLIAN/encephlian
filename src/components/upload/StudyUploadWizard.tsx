import { useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Upload, FileUp, User, Clock, CheckCircle2, 
  AlertCircle, Zap, Loader2, X, ArrowRight, ArrowLeft 
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUserSession } from "@/contexts/UserSessionContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface StudyUploadWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface PatientData {
  patient_name: string;
  patient_id: string;
  patient_age: string;
  patient_gender: string;
  indication: string;
  notes: string;
}

const SLA_OPTIONS = [
  { 
    value: "STAT", 
    label: "STAT", 
    description: "Immediate priority, 1 hour target",
    tokens: 5,
    color: "text-destructive",
    icon: Zap
  },
  { 
    value: "24H", 
    label: "24 Hour", 
    description: "Urgent, same-day turnaround",
    tokens: 3,
    color: "text-amber-600"
  },
  { 
    value: "48H", 
    label: "48 Hour", 
    description: "Standard priority",
    tokens: 2,
    color: "text-blue-600"
  },
  { 
    value: "ROUTINE", 
    label: "Routine", 
    description: "72 hour turnaround",
    tokens: 1,
    color: "text-muted-foreground"
  },
];

const STEPS = [
  { id: 1, label: "Upload EEG", icon: FileUp },
  { id: 2, label: "Patient Info", icon: User },
  { id: 3, label: "Select SLA", icon: Clock },
];

export function StudyUploadWizard({ open, onOpenChange }: StudyUploadWizardProps) {
  const navigate = useNavigate();
  const { userId, clinicContext } = useUserSession();
  const clinicId = clinicContext?.clinic_id;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  
  const [patientData, setPatientData] = useState<PatientData>({
    patient_name: "",
    patient_id: "",
    patient_age: "",
    patient_gender: "",
    indication: "",
    notes: "",
  });
  
  const [selectedSla, setSelectedSla] = useState<string>("48H");

  // Reset wizard state
  const resetWizard = useCallback(() => {
    setStep(1);
    setFile(null);
    setUploadProgress(0);
    setIsUploading(false);
    setPatientData({
      patient_name: "",
      patient_id: "",
      patient_age: "",
      patient_gender: "",
      indication: "",
      notes: "",
    });
    setSelectedSla("48H");
  }, []);

  // Handle file selection
  const handleFileSelect = useCallback((selectedFile: File) => {
    const validExtensions = [".edf", ".bdf"];
    const ext = selectedFile.name.toLowerCase().slice(selectedFile.name.lastIndexOf("."));
    
    if (!validExtensions.includes(ext)) {
      toast.error("Invalid file type", {
        description: "Please upload an EDF or BDF file.",
      });
      return;
    }
    
    setFile(selectedFile);
    
    // Try to extract patient info from filename
    const nameParts = selectedFile.name.replace(/\.(edf|bdf)$/i, "").split(/[_\-\s]+/);
    if (nameParts.length >= 1) {
      setPatientData(prev => ({
        ...prev,
        patient_id: nameParts[0] || "",
      }));
    }
  }, []);

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  }, [handleFileSelect]);

  // Submit the study
  const handleSubmit = useCallback(async () => {
    if (!file || !userId || !clinicId) {
      toast.error("Missing required data");
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // 1. Upload file to storage
      const filePath = `${userId}/${Date.now()}_${file.name}`;
      
      // Simulate progress (actual upload doesn't give progress easily)
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 80));
      }, 200);

      const { error: uploadError } = await supabase.storage
        .from("eeg-uploads")
        .upload(filePath, file);

      clearInterval(progressInterval);
      setUploadProgress(90);

      if (uploadError) {
        throw uploadError;
      }

      // 2. Create study record
      const { data: study, error: studyError } = await supabase
        .from("studies")
        .insert({
          owner: userId,
          clinic_id: clinicId,
          state: "uploaded",
          sla: selectedSla,
          uploaded_file_path: filePath,
          original_format: file.name.split(".").pop()?.toUpperCase(),
          indication: patientData.indication || null,
          meta: {
            patient_name: patientData.patient_name || null,
            patient_id: patientData.patient_id || null,
            patient_age: patientData.patient_age ? parseInt(patientData.patient_age) : null,
            patient_gender: patientData.patient_gender || null,
            notes: patientData.notes || null,
            original_filename: file.name,
            file_size_bytes: file.size,
          },
        })
        .select("id")
        .single();

      if (studyError) {
        throw studyError;
      }

      setUploadProgress(100);

      toast.success("Study uploaded successfully!", {
        description: "You can now select an SLA to start AI triage.",
      });

      // Close wizard and navigate to study
      onOpenChange(false);
      resetWizard();
      navigate(`/app/studies/${study.id}`);

    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error("Upload failed", {
        description: error.message || "Please try again.",
      });
    } finally {
      setIsUploading(false);
    }
  }, [file, userId, clinicId, selectedSla, patientData, navigate, onOpenChange, resetWizard]);

  // Validation
  const canProceedStep1 = !!file;
  const canProceedStep2 = true; // Patient info is optional
  const canSubmit = !!file && !!selectedSla;

  return (
    <Dialog open={open} onOpenChange={(o) => {
      if (!o) resetWizard();
      onOpenChange(o);
    }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            Upload EEG Study
          </DialogTitle>
          <DialogDescription>
            Step {step} of 3: {STEPS[step - 1].label}
          </DialogDescription>
        </DialogHeader>

        {/* Progress Steps */}
        <div className="flex items-center justify-between mb-6">
          {STEPS.map((s, idx) => {
            const Icon = s.icon;
            const isActive = s.id === step;
            const isCompleted = s.id < step;
            
            return (
              <div key={s.id} className="flex items-center">
                <div 
                  className={cn(
                    "flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all",
                    isActive && "border-primary bg-primary text-primary-foreground",
                    isCompleted && "border-primary bg-primary/20 text-primary",
                    !isActive && !isCompleted && "border-muted text-muted-foreground"
                  )}
                >
                  {isCompleted ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : (
                    <Icon className="h-5 w-5" />
                  )}
                </div>
                {idx < STEPS.length - 1 && (
                  <div className={cn(
                    "w-12 h-0.5 mx-2",
                    isCompleted ? "bg-primary" : "bg-muted"
                  )} />
                )}
              </div>
            );
          })}
        </div>

        {/* Step 1: File Upload */}
        {step === 1 && (
          <div className="space-y-4">
            <div
              className={cn(
                "border-2 border-dashed rounded-lg p-8 text-center transition-all cursor-pointer",
                isDragging && "border-primary bg-primary/5",
                file && "border-primary bg-primary/5",
                !isDragging && !file && "border-muted hover:border-muted-foreground"
              )}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".edf,.bdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelect(f);
                }}
              />
              
              {file ? (
                <div className="space-y-2">
                  <CheckCircle2 className="h-10 w-10 mx-auto text-primary" />
                  <p className="font-medium">{file.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {(file.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                    }}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Remove
                  </Button>
                </div>
              ) : (
                <>
                  <FileUp className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
                  <p className="font-medium">Drop your EEG file here</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    or click to browse • EDF, BDF supported
                  </p>
                </>
              )}
            </div>

            <div className="flex justify-end">
              <Button onClick={() => setStep(2)} disabled={!canProceedStep1}>
                Next <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Patient Info */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="patient_name">Patient Name</Label>
                <Input
                  id="patient_name"
                  placeholder="John Doe"
                  value={patientData.patient_name}
                  onChange={(e) => setPatientData(prev => ({ ...prev, patient_name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="patient_id">Patient ID</Label>
                <Input
                  id="patient_id"
                  placeholder="MRN-12345"
                  value={patientData.patient_id}
                  onChange={(e) => setPatientData(prev => ({ ...prev, patient_id: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="patient_age">Age</Label>
                <Input
                  id="patient_age"
                  type="number"
                  placeholder="45"
                  value={patientData.patient_age}
                  onChange={(e) => setPatientData(prev => ({ ...prev, patient_age: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Gender</Label>
                <RadioGroup
                  value={patientData.patient_gender}
                  onValueChange={(v) => setPatientData(prev => ({ ...prev, patient_gender: v }))}
                  className="flex gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="M" id="male" />
                    <Label htmlFor="male">Male</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="F" id="female" />
                    <Label htmlFor="female">Female</Label>
                  </div>
                </RadioGroup>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="indication">Clinical Indication</Label>
              <Input
                id="indication"
                placeholder="e.g., Seizure evaluation, Altered mental status"
                value={patientData.indication}
                onChange={(e) => setPatientData(prev => ({ ...prev, indication: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Additional Notes (optional)</Label>
              <Textarea
                id="notes"
                placeholder="Any relevant clinical history..."
                rows={2}
                value={patientData.notes}
                onChange={(e) => setPatientData(prev => ({ ...prev, notes: e.target.value }))}
              />
            </div>

            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(1)}>
                <ArrowLeft className="h-4 w-4 mr-2" /> Back
              </Button>
              <Button onClick={() => setStep(3)} disabled={!canProceedStep2}>
                Next <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: SLA Selection */}
        {step === 3 && (
          <div className="space-y-4">
            <RadioGroup
              value={selectedSla}
              onValueChange={setSelectedSla}
              className="space-y-3"
            >
              {SLA_OPTIONS.map((option) => {
                const Icon = option.icon;
                return (
                  <div
                    key={option.value}
                    className={cn(
                      "flex items-center justify-between p-4 rounded-lg border-2 cursor-pointer transition-all",
                      selectedSla === option.value 
                        ? "border-primary bg-primary/5" 
                        : "border-muted hover:border-muted-foreground"
                    )}
                    onClick={() => setSelectedSla(option.value)}
                  >
                    <div className="flex items-center gap-3">
                      <RadioGroupItem value={option.value} id={option.value} />
                      <div>
                        <div className="flex items-center gap-2">
                          {Icon && <Icon className={cn("h-4 w-4", option.color)} />}
                          <span className={cn("font-medium", option.color)}>
                            {option.label}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {option.description}
                        </p>
                      </div>
                    </div>
                    <Badge variant="secondary">
                      {option.tokens} token{option.tokens > 1 ? "s" : ""}
                    </Badge>
                  </div>
                );
              })}
            </RadioGroup>

            {/* Upload Progress */}
            {isUploading && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Uploading...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} />
              </div>
            )}

            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(2)} disabled={isUploading}>
                <ArrowLeft className="h-4 w-4 mr-2" /> Back
              </Button>
              <Button 
                onClick={handleSubmit} 
                disabled={!canSubmit || isUploading}
                className="btn-gradient-analysis"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Study
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
