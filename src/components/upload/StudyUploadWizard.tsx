import { useState, useCallback, useRef, useEffect } from "react";
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
import { useSku } from "@/hooks/useSku";
import { cn } from "@/lib/utils";
import { systemFeedback } from "@/lib/systemFeedback";

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

interface ExtractedEdfMeta {
  patient_id?: string;
  recording_id?: string;
  start_date?: string;
  start_time?: string;
  num_channels?: number;
  sample_rate?: number;
  duration_sec?: number;
  channel_labels?: string[];
}

interface SlaOption {
  value: string;
  label: string;
  description: string;
  tokens: number;
  color: string;
  icon?: typeof Zap;
}

const EDF_BDF_EXTENSIONS = [".edf", ".bdf"];
const PROPRIETARY_EXTENSIONS = [".e", ".nk", ".eeg", ".21e", ".cnt"];
const ALL_ACCEPTED_EXTENSIONS = [...EDF_BDF_EXTENSIONS, ...PROPRIETARY_EXTENSIONS];

const INTERNAL_SLA_OPTIONS: SlaOption[] = [
  {
    value: "STAT",
    label: "STAT",
    description: "Immediate priority, 1 hour target",
    tokens: 5,
    color: "text-destructive",
    icon: Zap,
  },
  {
    value: "24H",
    label: "24 Hour",
    description: "Urgent, same-day turnaround",
    tokens: 3,
    color: "text-primary",
  },
  {
    value: "48H",
    label: "48 Hour",
    description: "Standard priority",
    tokens: 2,
    color: "text-foreground",
  },
  {
    value: "ROUTINE",
    label: "Routine",
    description: "72 hour turnaround",
    tokens: 1,
    color: "text-muted-foreground",
  },
];

const PILOT_SLA_OPTIONS: SlaOption[] = [
  {
    value: "STAT",
    label: "STAT",
    description: "Immediate priority, 30–90 minute target",
    tokens: 2,
    color: "text-destructive",
    icon: Zap,
  },
  {
    value: "TAT",
    label: "TAT",
    description: "Standard turnaround, 12–24 hour target",
    tokens: 1,
    color: "text-primary",
    icon: Clock,
  },
];

const STEPS = [
  { id: 1, label: "Upload EEG", icon: FileUp },
  { id: 2, label: "Patient Info", icon: User },
  { id: 3, label: "Select SLA", icon: Clock },
];

/**
 * Lightweight EDF header reader — reads only the first 64KB to extract metadata.
 * No signal data is parsed.
 */
async function extractEdfHeader(file: File): Promise<ExtractedEdfMeta | null> {
  try {
    const headerSlice = file.slice(0, 64 * 1024);
    const buffer = await headerSlice.arrayBuffer();
    const decoder = new TextDecoder("ascii");

    const readStr = (offset: number, length: number): string => {
      const bytes = new Uint8Array(buffer, offset, Math.min(length, buffer.byteLength - offset));
      return decoder.decode(bytes).trim();
    };

    const patientId = readStr(8, 80);
    const recordingId = readStr(88, 80);
    const startDate = readStr(168, 8);
    const startTime = readStr(176, 8);
    const numSignals = parseInt(readStr(252, 4), 10) || 0;
    const dataRecordDuration = parseFloat(readStr(244, 8)) || 1;

    if (numSignals < 1 || numSignals > 512) {
      systemFeedback.edfHeaderExtractionFailed(`Invalid signal count: ${numSignals}`);
      return null;
    }

    const ns = Math.min(numSignals, 128);
    let offset = 256;

    const labels: string[] = [];
    for (let i = 0; i < ns; i++) {
      labels.push(readStr(offset + i * 16, 16).replace(/\.+$/, "").trim());
    }
    offset += ns * 16;
    offset += ns * 80; // transducer
    offset += ns * 8; // physical dimension
    offset += ns * 8; // physical min
    offset += ns * 8; // physical max
    offset += ns * 8; // digital min
    offset += ns * 8; // digital max
    offset += ns * 80; // prefiltering

    let samplesPerRecord = 256;
    if (offset + 8 <= buffer.byteLength) {
      samplesPerRecord = parseInt(readStr(offset, 8), 10) || 256;
    }

    const numDataRecords = parseInt(readStr(236, 8), 10) || 0;
    const sampleRate = Math.round(samplesPerRecord / dataRecordDuration);
    const durationSec = numDataRecords * dataRecordDuration;

    return {
      patient_id: patientId || undefined,
      recording_id: recordingId || undefined,
      start_date: startDate || undefined,
      start_time: startTime || undefined,
      num_channels: ns,
      sample_rate: sampleRate,
      duration_sec: durationSec > 0 ? durationSec : undefined,
      channel_labels: labels.length > 0 ? labels : undefined,
    };
  } catch (e) {
    systemFeedback.edfHeaderExtractionFailed(e instanceof Error ? e.message : String(e));
    return null;
  }
}

export function StudyUploadWizard({ open, onOpenChange }: StudyUploadWizardProps) {
  const navigate = useNavigate();
  const { userId, clinicContext } = useUserSession();
  const { isPilot } = useSku();
  const clinicId = clinicContext?.clinic_id;
  const SLA_OPTIONS = isPilot ? PILOT_SLA_OPTIONS : INTERNAL_SLA_OPTIONS;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [edfMeta, setEdfMeta] = useState<ExtractedEdfMeta | null>(null);
  const [isProprietaryFormat, setIsProprietaryFormat] = useState(false);
  const [autoFilledFields, setAutoFilledFields] = useState<Set<string>>(new Set());

  const [patientData, setPatientData] = useState<PatientData>({
    patient_name: "",
    patient_id: "",
    patient_age: "",
    patient_gender: "",
    indication: "",
    notes: "",
  });

  const [selectedSla, setSelectedSla] = useState<string>(SLA_OPTIONS[0].value);

  useEffect(() => {
    if (!SLA_OPTIONS.some((option) => option.value === selectedSla)) {
      setSelectedSla(SLA_OPTIONS[0].value);
    }
  }, [selectedSla, SLA_OPTIONS]);

  // Reset wizard state
  const resetWizard = useCallback(() => {
    setStep(1);
    setFile(null);
    setUploadProgress(0);
    setIsUploading(false);
    setEdfMeta(null);
    setIsProprietaryFormat(false);
    setAutoFilledFields(new Set());
    setPatientData({
      patient_name: "",
      patient_id: "",
      patient_age: "",
      patient_gender: "",
      indication: "",
      notes: "",
    });
    setSelectedSla(SLA_OPTIONS[0].value);
  }, [SLA_OPTIONS]);

  // Handle file selection
  const handleFileSelect = useCallback(async (selectedFile: File) => {
    const ext = selectedFile.name.toLowerCase().slice(selectedFile.name.lastIndexOf("."));
    
    if (!ALL_ACCEPTED_EXTENSIONS.includes(ext)) {
      systemFeedback.report({
        severity: "error",
        what: "Unsupported file type",
        why: `The file extension "${ext}" is not recognized.`,
        action: `Supported formats: ${ALL_ACCEPTED_EXTENSIONS.join(", ")}`,
      });
      return;
    }

    // Pre-upload file size check (20MB limit)
    const MAX_FILE_SIZE = 20 * 1024 * 1024;
    if (selectedFile.size > MAX_FILE_SIZE) {
      systemFeedback.fileTooLarge(selectedFile.size / (1024 * 1024));
      return;
    }

    const isProprietary = PROPRIETARY_EXTENSIONS.includes(ext);
    setIsProprietaryFormat(isProprietary);
    setFile(selectedFile);

    if (!isProprietary && EDF_BDF_EXTENSIONS.includes(ext)) {
      const meta = await extractEdfHeader(selectedFile);
      if (meta) {
        setEdfMeta(meta);
        const filled = new Set<string>();

        setPatientData(prev => {
          const updated = { ...prev };
          if (meta.patient_id && !prev.patient_id) {
            updated.patient_id = meta.patient_id;
            filled.add("patient_id");
          }
          return updated;
        });

        setAutoFilledFields(filled);

        systemFeedback.report({
          severity: "info",
          what: "File header parsed",
          why: `${meta.num_channels} channels · ${meta.sample_rate}Hz · ${meta.duration_sec ? Math.round(meta.duration_sec / 60) + " min" : "unknown duration"}`,
          action: "Metadata has been auto-filled where available.",
        });
      }
      // If meta is null, systemFeedback already fired inside extractEdfHeader
    } else if (isProprietary) {
      systemFeedback.proprietaryFormatNotice(ext);
      const nameParts = selectedFile.name.replace(/\.[^.]+$/i, "").split(/[_\-\s]+/);
      if (nameParts.length >= 1) {
        setPatientData(prev => ({ ...prev, patient_id: nameParts[0] || "" }));
      }
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
    if (!file || !userId) {
      systemFeedback.report({
        severity: "error",
        what: "Cannot upload",
        why: "Missing authentication. Please log in again.",
        action: "Refresh the page and sign in.",
      });
      return;
    }

    if (!clinicId) {
      systemFeedback.noClinicAssigned();
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setUploadStage("Uploading file...");

    try {
      // 1. Upload file to storage with timeout
      const filePath = `${userId}/${Date.now()}_${file.name}`;
      
      setUploadProgress(10);

      const uploadPromise = supabase.storage
        .from("eeg-uploads")
        .upload(filePath, file);

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("UPLOAD_TIMEOUT")), 60000)
      );

      const { error: uploadError } = await Promise.race([uploadPromise, timeoutPromise]);

      if (uploadError) {
        throw uploadError;
      }

      setUploadProgress(50);
      setUploadStage("Creating study record...");

      // 2. Build comprehensive meta from EDF header + user input
      const fileExt = file.name.split(".").pop()?.toUpperCase() || "UNKNOWN";
      const studyMeta: Record<string, any> = {
        patient_name: patientData.patient_name || null,
        patient_id: patientData.patient_id || null,
        patient_age: patientData.patient_age ? parseInt(patientData.patient_age) : null,
        patient_gender: patientData.patient_gender || null,
        notes: patientData.notes || null,
        original_filename: file.name,
        file_size_bytes: file.size,
      };

      if (edfMeta) {
        studyMeta.edf_patient_id = edfMeta.patient_id || null;
        studyMeta.edf_recording_id = edfMeta.recording_id || null;
        studyMeta.edf_start_date = edfMeta.start_date || null;
        studyMeta.edf_start_time = edfMeta.start_time || null;
        studyMeta.edf_num_channels = edfMeta.num_channels || null;
        studyMeta.edf_sample_rate = edfMeta.sample_rate || null;
        studyMeta.edf_duration_sec = edfMeta.duration_sec || null;
        studyMeta.edf_channel_labels = edfMeta.channel_labels || null;
      }

      // 3. Create study record
      const { data: study, error: studyError } = await supabase
        .from("studies")
        .insert({
          owner: userId,
          clinic_id: clinicId,
          state: "uploaded",
          sla: selectedSla,
          uploaded_file_path: filePath,
          original_format: fileExt,
          indication: patientData.indication || null,
          srate_hz: edfMeta?.sample_rate || null,
          duration_min: edfMeta?.duration_sec ? Math.round(edfMeta.duration_sec / 60) : null,
          meta: studyMeta,
        })
        .select("id")
        .single();

      if (studyError) {
        systemFeedback.studyCreationFailed(studyError.message);
        return;
      }

      setUploadProgress(75);
      setUploadStage("Triggering analysis...");

      // 4. Auto-trigger parse_eeg_study for EDF/BDF files
      const isEdfBdf = EDF_BDF_EXTENSIONS.includes(
        file.name.toLowerCase().slice(file.name.lastIndexOf("."))
      );

      if (isEdfBdf && study?.id) {
        try {
          await supabase.functions.invoke("parse_eeg_study", {
            body: {
              study_id: study.id,
              file_path: filePath,
              file_type: file.name.toLowerCase().endsWith(".bdf") ? "bdf" : "edf",
            },
          });
        } catch (parseErr) {
          systemFeedback.parseEdgeFunctionFailed(
            parseErr instanceof Error ? parseErr.message : String(parseErr)
          );
        }
      }

      setUploadProgress(100);
      setUploadStage("Complete");

      // Kick off metadata extraction (fire-and-forget — don't block navigation)
      supabase.functions.invoke("parse_eeg_study", {
        body: {
          study_id: study.id,
          file_path: filePath,
          file_type: (file.name.split(".").pop()?.toLowerCase() || "edf") as "edf" | "bdf",
        },
      }).catch((err) => console.warn("parse_eeg_study failed:", err));

      systemFeedback.report({
        severity: "info",
        what: "Study uploaded successfully",
        why: isProprietaryFormat
          ? "Proprietary format saved. Export as EDF for immediate analysis."
          : "Metadata extracted. Study is ready for triage.",
        action: "Redirecting to study detail...",
      });

      onOpenChange(false);
      resetWizard();
      navigate(`/app/studies/${study.id}`);

    } catch (error: any) {
      if (error?.message === "UPLOAD_TIMEOUT") {
        systemFeedback.uploadTimeout();
      } else {
        systemFeedback.uploadFailed(error?.message || String(error));
      }
    } finally {
      setIsUploading(false);
      setUploadStage("");
    }
  }, [file, userId, clinicId, selectedSla, patientData, edfMeta, isProprietaryFormat, navigate, onOpenChange, resetWizard]);

  // Validation
  const canProceedStep1 = !!file;
  const canProceedStep2 = true;
  const canSubmit = !!file && !!selectedSla;

  const ExtractedBadge = () => (
    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-normal gap-0.5">
      <CheckCircle2 className="h-2.5 w-2.5" />
      From file
    </Badge>
  );

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
                accept={ALL_ACCEPTED_EXTENSIONS.join(",")}
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
                  {edfMeta && (
                    <p className="text-xs text-muted-foreground">
                      {edfMeta.num_channels} ch · {edfMeta.sample_rate}Hz
                      {edfMeta.duration_sec ? ` · ${Math.round(edfMeta.duration_sec / 60)} min` : ""}
                    </p>
                  )}
                  {isProprietaryFormat && (
                    <div className="flex items-center justify-center gap-1.5 text-xs text-amber-600">
                      <AlertCircle className="h-3 w-3" />
                      Export as EDF from your machine for immediate processing
                    </div>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                      setEdfMeta(null);
                      setIsProprietaryFormat(false);
                      setAutoFilledFields(new Set());
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
                    or click to browse • EDF, BDF, Natus (.e), NK (.nk, .eeg, .21e), CNT
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
            {/* EDF header summary */}
            {edfMeta && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <CheckCircle2 className="h-3 w-3 text-primary" />
                  Extracted from file header
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                  {edfMeta.recording_id && <span>Recording: {edfMeta.recording_id}</span>}
                  {edfMeta.start_date && <span>Date: {edfMeta.start_date}</span>}
                  {edfMeta.start_time && <span>Time: {edfMeta.start_time}</span>}
                  {edfMeta.num_channels && <span>Channels: {edfMeta.num_channels}</span>}
                  {edfMeta.sample_rate && <span>Rate: {edfMeta.sample_rate}Hz</span>}
                  {edfMeta.duration_sec && <span>Duration: {Math.round(edfMeta.duration_sec / 60)}min</span>}
                </div>
              </div>
            )}

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
                <div className="flex items-center gap-2">
                  <Label htmlFor="patient_id">Patient ID</Label>
                  {autoFilledFields.has("patient_id") && <ExtractedBadge />}
                </div>
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
                  <span className="text-muted-foreground">{uploadStage || "Preparing..."}</span>
                  <span className="font-mono text-xs">{uploadProgress}%</span>
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
