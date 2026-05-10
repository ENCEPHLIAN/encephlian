import { useState, useCallback, useRef, useEffect, useMemo } from "react";
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
  AlertCircle, Zap, Loader2, X, ArrowRight, ArrowLeft, WifiOff, RotateCcw
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUserSession } from "@/contexts/UserSessionContext";
import { useSku } from "@/hooks/useSku";
import { cn } from "@/lib/utils";
import { systemFeedback } from "@/lib/systemFeedback";
import { isSha256Available, sha256HexFromFile } from "@/lib/fileSha256";
import { generateEncStudyReference } from "@/lib/studyReference";

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
  const { userId, clinicContext, refreshSession } = useUserSession();
  const { isPilot } = useSku();
  const clinicId = clinicContext?.clinic_id;
  const SLA_OPTIONS = isPilot ? PILOT_SLA_OPTIONS : INTERNAL_SLA_OPTIONS;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [fileQueue, setFileQueue] = useState<File[]>([]);  // multi-file queue
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ name: string; status: "pending"|"uploading"|"done"|"error" }[]>([]);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const activeXhrRef = useRef<XMLHttpRequest | null>(null);
  const activeIPlaneControllerRef = useRef<AbortController | null>(null);
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

  const wizardSteps = useMemo(() => (isPilot ? STEPS.slice(0, 2) : STEPS), [isPilot]);

  // Network connectivity detection
  useEffect(() => {
    const onOnline  = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);
    window.addEventListener("online",  onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online",  onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  // Cancel an in-progress upload
  const handleCancelUpload = useCallback(() => {
    activeXhrRef.current?.abort();
    activeXhrRef.current = null;
    activeIPlaneControllerRef.current?.abort();
    activeIPlaneControllerRef.current = null;
    setIsUploading(false);
    setUploadProgress(0);
    setUploadStage("");
    setUploadError(null);
  }, []);

  // Reset wizard state
  const resetWizard = useCallback(() => {
    activeXhrRef.current?.abort();
    activeXhrRef.current = null;
    activeIPlaneControllerRef.current?.abort();
    activeIPlaneControllerRef.current = null;
    setStep(1);
    setFile(null);
    setFileQueue([]);
    setBatchProgress([]);
    setUploadProgress(0);
    setIsUploading(false);
    setEdfMeta(null);
    setIsProprietaryFormat(false);
    setUploadError(null);
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
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length === 1) {
      handleFileSelect(dropped[0]);
    } else if (dropped.length > 1) {
      const valid = dropped.filter(f => {
        const ext = f.name.toLowerCase().slice(f.name.lastIndexOf("."));
        return ALL_ACCEPTED_EXTENSIONS.includes(ext);
      });
      if (valid.length > 0) {
        setFile(valid[0]);
        setFileQueue(valid);
        setBatchProgress(valid.map(f => ({ name: f.name, status: "pending" as const })));
      }
    }
  }, [handleFileSelect]);

  // Upload a single file — returns studyId on success, throws on error
  const uploadOneFile = useCallback(async (
    targetFile: File,
    cplaneBase: string,
    onProgress: (pct: number, stage: string) => void,
  ): Promise<{ studyId: string; duplicate?: boolean }> => {
    if (!userId || !clinicId) {
      throw new Error("Missing authentication or clinic");
    }

    const fileExt = targetFile.name.split(".").pop()?.toUpperCase() || "UNKNOWN";
    const studyMeta: Record<string, any> = {
      patient_name: patientData.patient_name || null,
      patient_id: patientData.patient_id || null,
      patient_age: patientData.patient_age ? parseInt(patientData.patient_age) : null,
      patient_gender: patientData.patient_gender || null,
      notes: patientData.notes || null,
      original_filename: targetFile.name,
      file_size_bytes: targetFile.size,
    };
    if (edfMeta && targetFile === file) {
      studyMeta.edf_num_channels = edfMeta.num_channels || null;
      studyMeta.edf_sample_rate = edfMeta.sample_rate || null;
      studyMeta.edf_duration_sec = edfMeta.duration_sec || null;
      studyMeta.edf_channel_labels = edfMeta.channel_labels || null;
    }

    let sourceContentSha256: string | null = null;
    let reference: string | null = null;
    try {
      if (!isSha256Available()) {
        onProgress(2, "Preparing upload…");
      } else {
        onProgress(2, "Fingerprinting recording…");
        sourceContentSha256 = await sha256HexFromFile(targetFile);
        const { data: dupRow, error: dupErr } = await supabase
          .from("studies")
          .select("id, tokens_deducted, sla_selected_at, triage_status")
          .eq("clinic_id", clinicId)
          .eq("owner", userId)
          .eq("source_content_sha256", sourceContentSha256)
          .neq("state", "failed")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (dupErr) {
          console.warn("[upload] dedupe check failed:", dupErr);
        } else if (dupRow?.id) {
          // Only deduplicate if triage has been paid/started on the existing study.
          // Stale studies (blob deleted by admin, aborted uploads) have tokens_deducted=0
          // and sla_selected_at=null — allow re-upload in that case.
          const triageStarted =
            (dupRow.tokens_deducted ?? 0) > 0 ||
            !!dupRow.sla_selected_at ||
            (dupRow.triage_status && dupRow.triage_status !== "pending");
          if (triageStarted) {
            onProgress(100, "Same recording — opening existing study");
            return { studyId: dupRow.id, duplicate: true };
          }
        }
        reference = generateEncStudyReference();
      }
    } catch (e) {
      console.warn("[upload] fingerprint/dedupe skipped:", e);
      sourceContentSha256 = null;
      reference = null;
      onProgress(2, "Preparing upload…");
    }

    onProgress(5, `Creating study for ${targetFile.name}...`);
    const insertRow: Record<string, unknown> = {
      owner: userId,
      clinic_id: clinicId,
      state: "awaiting_sla",
      sla: isPilot ? "pending" : selectedSla,
      uploaded_file_path: `blob:eeg-raw/pending`,
      original_format: fileExt,
      indication: patientData.indication || null,
      srate_hz: edfMeta?.sample_rate || null,
      duration_min: edfMeta?.duration_sec ? Math.round(edfMeta.duration_sec / 60) : null,
      meta: studyMeta,
    };
    if (reference && sourceContentSha256) {
      insertRow.reference = reference;
      insertRow.source_content_sha256 = sourceContentSha256;
    }

    let { data: study, error: studyError } = await supabase
      .from("studies")
      .insert(insertRow as never)
      .select("id")
      .single();

    if (studyError && reference && sourceContentSha256) {
      console.warn("[upload] insert with fingerprint fields failed, retrying without:", studyError);
      delete insertRow.reference;
      delete insertRow.source_content_sha256;
      const retry = await supabase
        .from("studies")
        .insert(insertRow as never)
        .select("id")
        .single();
      study = retry.data;
      studyError = retry.error;
    }

    if (studyError || !study?.id) {
      throw new Error(studyError?.message ?? "no id returned");
    }
    const studyId = study.id;

    // ── Get SAS token from C-Plane → upload directly to Azure Blob (with retry) ──
    let blobName = "";
    const MAX_UPLOAD_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_UPLOAD_ATTEMPTS; attempt++) {
      if (attempt > 1) {
        onProgress(8, `Network error — retrying (${attempt - 1}/${MAX_UPLOAD_ATTEMPTS - 1})...`);
        await new Promise(r => setTimeout(r, 2000 * (attempt - 1)));
      }
      try {
        onProgress(8, attempt > 1 ? `Retrying upload...` : `Preparing upload...`);
        const sasRes = await fetch(`${cplaneBase}/upload-token/${studyId}`, { method: "POST" });
        if (!sasRes.ok) throw new Error(`Failed to get upload token: ${sasRes.status}`);
        const { sas_url: sasUrl, blob_name: bn } = await sasRes.json();
        blobName = bn;

        onProgress(10, `Uploading ${targetFile.name} to Azure...`);
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          activeXhrRef.current = xhr;
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable)
              onProgress(10 + Math.round((e.loaded / e.total) * 72), `Uploading ${targetFile.name}...`);
          };
          xhr.onload = () => {
            activeXhrRef.current = null;
            xhr.status >= 200 && xhr.status < 300
              ? resolve()
              : reject(new Error(`Upload failed: HTTP ${xhr.status} — ${xhr.responseText}`));
          };
          xhr.onerror = () => { activeXhrRef.current = null; reject(new Error("Network error during upload")); };
          xhr.onabort = () => { activeXhrRef.current = null; reject(new Error("Upload cancelled")); };
          xhr.timeout = 600000;
          xhr.ontimeout = () => { activeXhrRef.current = null; reject(new Error("UPLOAD_TIMEOUT")); };
          xhr.open("PUT", sasUrl);
          xhr.setRequestHeader("x-ms-blob-type", "BlockBlob");
          xhr.setRequestHeader("Content-Type", "application/octet-stream");
          xhr.send(targetFile);
        });
        break; // Upload succeeded — exit retry loop
      } catch (e: any) {
        if (e?.message === "Upload cancelled" || e?.message === "UPLOAD_TIMEOUT") throw e;
        if (attempt === MAX_UPLOAD_ATTEMPTS || !e?.message?.startsWith("Network error")) throw e;
        // Network error with retries remaining — loop continues
      }
    }

    onProgress(84, `Registering...`);

    if (isPilot) {
      await supabase
        .from("studies")
        .update({
          state: "awaiting_sla",
          sla: "pending",
          triage_status: "pending",
          triage_progress: 0,
          uploaded_file_path: blobName,
        })
        .eq("id", studyId);
      onProgress(100, "File saved — choose triage on Studies");
    } else {
      // Mark sla_selected_at now — SLA was chosen in the wizard, no token deduction for internal
      await supabase
        .from("studies")
        .update({
          state: "uploaded",
          uploaded_file_path: blobName,
          sla_selected_at: new Date().toISOString(),
          triage_status: "processing",
          triage_progress: 5,
          triage_started_at: new Date().toISOString(),
        })
        .eq("id", studyId);

      // Fire-and-forget: C-Plane canonicalises the EDF and internally calls I-Plane.
      // Do NOT await — the wizard completes immediately and the study page
      // shows live progress via Supabase realtime + polling.
      fetch(`${cplaneBase}/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ study_id: studyId }),
      }).catch((err) => console.warn("[upload] C-Plane trigger failed:", err));

      onProgress(100, "Analysis running — view progress on the study page");
    }

    return { studyId };
  }, [userId, clinicId, selectedSla, patientData, edfMeta, file, isProprietaryFormat, isPilot]);

  // Submit the study (single or batch)
  const handleSubmit = useCallback(async () => {
    if (!file || !userId) {
      systemFeedback.report({ severity: "error", what: "Cannot upload", why: "Missing authentication.", action: "Refresh and sign in." });
      return;
    }
    if (!clinicId) {
      systemFeedback.noClinicAssigned();
      return;
    }

    const CPLANE_BASE = import.meta.env.VITE_CPLANE_BASE as string | undefined;
    if (!CPLANE_BASE) {
      systemFeedback.report({
        severity: "error",
        what: "C-Plane not configured",
        why: "VITE_CPLANE_BASE environment variable is not set.",
        action: "Add VITE_CPLANE_BASE to your Vercel environment variables and redeploy.",
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    const filesToUpload = fileQueue.length > 1 ? fileQueue : [file];
    const lastStudyIds: string[] = [];

    try {
      if (filesToUpload.length === 1) {
        // Single-file path — navigate to study on completion
        setUploadStage("Starting upload...");
        const { studyId, duplicate } = await uploadOneFile(filesToUpload[0], CPLANE_BASE, (pct, stage) => {
          setUploadProgress(pct);
          setUploadStage(stage);
        });
        lastStudyIds.push(studyId);
        systemFeedback.report({
          severity: "info",
          what: duplicate ? "Same recording" : "Study uploaded",
          why: duplicate
            ? "This file matches a study you already uploaded — opening it."
            : isProprietaryFormat
              ? "Proprietary format — export as EDF for analysis."
              : isPilot
                ? "File stored — select Standard or Priority to start analysis."
                : "Analysis pipeline started.",
          action: "Opening study…",
        });
        // Navigate first — unmounts the dialog/wizard cleanly without a
        // blank flash from resetWizard() clearing content mid-close-animation.
        navigate(`/app/studies/${studyId}`);
        onOpenChange(false);
      } else {
        // Batch path — upload all files, show queue progress
        const progress = filesToUpload.map(f => ({ name: f.name, status: "pending" as const }));
        setBatchProgress(progress);
        let completed = 0;

        for (let i = 0; i < filesToUpload.length; i++) {
          setBatchProgress(prev => prev.map((p, idx) => idx === i ? { ...p, status: "uploading" } : p));
          try {
            const { studyId } = await uploadOneFile(filesToUpload[i], CPLANE_BASE, (pct, stage) => {
              setUploadProgress(Math.round(((i + pct / 100) / filesToUpload.length) * 100));
              setUploadStage(`[${i + 1}/${filesToUpload.length}] ${stage}`);
            });
            lastStudyIds.push(studyId);
            completed++;
            setBatchProgress(prev => prev.map((p, idx) => idx === i ? { ...p, status: "done" } : p));
          } catch (e: any) {
            setBatchProgress(prev => prev.map((p, idx) => idx === i ? { ...p, status: "error" } : p));
          }
        }

        systemFeedback.report({
          severity: "info",
          what: `${completed}/${filesToUpload.length} studies uploaded`,
          why: "Analysis pipelines started for all uploaded files.",
          action: "Opening studies list...",
        });
        navigate("/app/studies");
        onOpenChange(false);
      }
    } catch (error: any) {
      const msg = error?.message || String(error);
      if (msg === "Upload cancelled") {
        // User cancelled — no error shown
      } else if (msg === "UPLOAD_TIMEOUT") {
        systemFeedback.uploadTimeout();
        setUploadError("Upload timed out after 10 minutes. Check your network connection and retry.");
      } else if (msg.startsWith("Network error")) {
        setUploadError("Network connection lost during upload. Check your connection and tap Retry.");
      } else {
        systemFeedback.uploadFailed(msg);
        setUploadError(msg);
      }
    } finally {
      setIsUploading(false);
      setUploadStage("");
    }
  }, [file, fileQueue, userId, clinicId, selectedSla, patientData, edfMeta, isProprietaryFormat, isPilot, uploadOneFile, navigate, onOpenChange, resetWizard]);

  // Validation
  const canProceedStep1 = !!file;
  const canProceedStep2 = true;
  const canSubmit = !!file && (isPilot || !!selectedSla);

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
      <DialogContent className="sm:max-w-lg z-[100]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            {isPilot ? "Upload recording" : "Upload EEG Study"}
          </DialogTitle>
          <DialogDescription>
            Step {step} of {wizardSteps.length}: {wizardSteps[step - 1]?.label ?? ""}
            {isPilot && (
              <span className="block mt-1 text-xs">
                After upload, pick Standard or Priority on Studies — tokens apply only then.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Progress Steps */}
        <div className="flex items-center justify-between mb-6">
          {wizardSteps.map((s, idx) => {
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
                {idx < wizardSteps.length - 1 && (
                  <div className={cn(
                    "w-12 h-0.5 mx-2",
                    isCompleted ? "bg-primary" : "bg-muted"
                  )} />
                )}
              </div>
            );
          })}
        </div>

        {isUploading && (
          <div className="space-y-2 mb-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{uploadStage || "Preparing..."}</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs">{uploadProgress}%</span>
                <button
                  type="button"
                  onClick={handleCancelUpload}
                  className="text-xs text-muted-foreground underline hover:text-destructive"
                >
                  Cancel
                </button>
              </div>
            </div>
            <Progress value={uploadProgress} />
            {batchProgress.length > 1 && (
              <div className="space-y-1 mt-1">
                {batchProgress.map((bp, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    {bp.status === "done" && <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />}
                    {bp.status === "uploading" && <Loader2 className="h-3 w-3 animate-spin text-primary shrink-0" />}
                    {bp.status === "pending" && <span className="h-3 w-3 rounded-full border border-muted-foreground/40 shrink-0" />}
                    {bp.status === "error" && <AlertCircle className="h-3 w-3 text-destructive shrink-0" />}
                    <span className={`truncate ${bp.status === "done" ? "text-muted-foreground line-through" : bp.status === "error" ? "text-destructive" : ""}`}>
                      {bp.name}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {uploadError && !isUploading && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 space-y-2 mb-4">
            <div className="flex items-start gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{uploadError}</span>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={() => { setUploadError(null); void handleSubmit(); }}
            >
              <RotateCcw className="h-3.5 w-3.5 mr-2" />
              Retry
            </Button>
          </div>
        )}

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
                multiple
                accept={ALL_ACCEPTED_EXTENSIONS.join(",")}
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (files.length === 1) {
                    handleFileSelect(files[0]);
                  } else if (files.length > 1) {
                    const valid = files.filter(f => ALL_ACCEPTED_EXTENSIONS.includes(f.name.toLowerCase().slice(f.name.lastIndexOf("."))));
                    if (valid.length > 0) {
                      setFile(valid[0]);
                      setFileQueue(valid);
                      setBatchProgress(valid.map(f => ({ name: f.name, status: "pending" as const })));
                    }
                  }
                }}
              />

              {fileQueue.length > 1 ? (
                /* Batch file list */
                <div className="space-y-2 w-full text-left" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{fileQueue.length} files selected</p>
                    <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={(e) => { e.stopPropagation(); setFile(null); setFileQueue([]); setBatchProgress([]); }}>
                      <X className="h-3 w-3 mr-1" /> Clear
                    </Button>
                  </div>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {fileQueue.map((f, i) => (
                      <div key={i} className="flex items-center justify-between text-xs bg-muted/50 rounded px-2 py-1">
                        <span className="truncate max-w-[200px] font-mono">{f.name}</span>
                        <span className="text-muted-foreground ml-2 shrink-0">{(f.size / (1024 * 1024)).toFixed(1)} MB</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">All files will be uploaded with the same patient info and SLA.</p>
                </div>
              ) : file ? (
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
                      setFileQueue([]);
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
                  <p className="font-medium">Drop EEG file(s) here</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    or click to browse • EDF, BDF, Natus (.e), NK (.nk, .eeg, .21e), CNT
                  </p>
                  <p className="text-xs text-muted-foreground/70 mt-1">Multiple files supported for batch upload</p>
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
              {isPilot ? (
                <Button onClick={() => void handleSubmit()} disabled={!canProceedStep2 || isUploading || !clinicId}>
                  {isUploading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Uploading…
                    </>
                  ) : (
                    <>
                      Upload <ArrowRight className="h-4 w-4 ml-2" />
                    </>
                  )}
                </Button>
              ) : (
                <Button onClick={() => setStep(3)} disabled={!canProceedStep2}>
                  Next <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Step 3: SLA Selection (internal / demo — pilot chooses SLA on Studies after upload) */}
        {!isPilot && step === 3 && (
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

            {/* Network offline warning */}
            {isOffline && (
              <div className="flex items-center gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-600">
                <WifiOff className="h-4 w-4 shrink-0" />
                <span>No network connection — upload will resume when connectivity is restored.</span>
              </div>
            )}

            {/* No clinic assigned warning */}
            {!clinicId && (
              <div className="flex items-center justify-between gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>No clinic assigned to your account.</span>
                </div>
                <button
                  type="button"
                  onClick={() => refreshSession()}
                  className="shrink-0 underline text-xs hover:opacity-70"
                >
                  Refresh
                </button>
              </div>
            )}

            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(2)} disabled={isUploading}>
                <ArrowLeft className="h-4 w-4 mr-2" /> Back
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!canSubmit || isUploading || !clinicId}
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
                    {fileQueue.length > 1 ? `Upload ${fileQueue.length} Studies` : "Upload Study"}
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
