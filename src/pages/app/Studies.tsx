import { useState, useCallback, useRef, memo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { isAcceptedExtension, ACCEPTED_FORMATS_LABEL } from "@/shared/eegFormats";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, FileText, Eye, Download, Upload, Loader2 as Spinner } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import dayjs from "dayjs";
import { toast } from "@/components/ui/sonner";
import { useStudiesData, useFilteredStudies } from "@/hooks/useStudiesData";
import { useSku } from "@/hooks/useSku";
import { formatEdgeFunctionError } from "@/lib/edgeFunctionError";
import { formatStudySourceLine } from "@/lib/studySourceFile";
import { sha256HexFromFile } from "@/lib/fileSha256";
import { getStudyHandle, getPatientLabel } from "@/lib/studyDisplay";
import { extractEDFPatientMeta } from "@/lib/signal/signal-patient";
import { selectSlaAndStartPipeline } from "@/lib/analysisPipeline";
import PilotStudiesView from "@/components/pilot/PilotStudiesView";
import logoSrc from "@/assets/logo.png";

const stateColors: Record<string, string> = {
  pending: "bg-gray-400",
  uploaded: "bg-blue-500",
  processing: "bg-yellow-500",
  awaiting_sla: "bg-amber-500",
  preprocessing: "bg-yellow-500",
  canonicalized: "bg-cyan-500",
  triage_draft: "bg-purple-500",
  in_review: "bg-orange-500",
  complete: "bg-green-500",
  signed: "bg-green-500",
  completed: "bg-green-500",
  failed: "bg-red-500",
};

// Memoized table row component
/**
 * StudyRow - Memoized table row for study list
 * Displays patient info with anonymized demographics (age/gender)
 */
const StudyRow = memo(({ study, onDownload, onNavigate }: { 
  study: any; 
  onDownload: (study: any) => void;
  onNavigate: (path: string) => void;
}) => {
  const meta = study.meta as any;
  const sourceLine = formatStudySourceLine(meta, study.original_format ?? null);
  const handle = getStudyHandle(study);
  const displayName = getPatientLabel(study);

  const patientAge = meta?.patient_age;
  const patientGender = meta?.patient_gender ?? meta?.patient_sex;
  const patientId = meta?.patient_id && !meta.patient_id.startsWith("PT-") && meta.patient_id !== "X"
    ? meta.patient_id : null;
  const demographicsStr = [
    patientAge ? `${patientAge}y` : null,
    patientGender && patientGender !== "X" ? patientGender.charAt(0).toUpperCase() : null,
  ].filter(Boolean).join("/");
  
  return (
    <TableRow>
      <TableCell>
        <div>
          <div className="font-medium text-sm flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span>
              {displayName}
              {demographicsStr && (
                <span className="text-muted-foreground font-normal ml-1.5 text-xs">
                  ({demographicsStr})
                </span>
              )}
            </span>
            <Badge variant="outline" className="text-[10px] font-mono font-normal px-1.5 py-0 shrink-0" title="Study reference">
              {handle}
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground">
            {patientId ?? <span className="italic opacity-50">No patient ID</span>}
            {study.sample && <Badge variant="outline" className="ml-1 text-[10px]">Sample</Badge>}
          </div>
          {sourceLine && (
            <div className="text-[11px] text-muted-foreground/90 max-w-[220px] sm:max-w-[280px] truncate mt-0.5" title={sourceLine}>
              {sourceLine}
            </div>
          )}
        </div>
      </TableCell>
      <TableCell className="hidden sm:table-cell text-sm">{(study.clinics as any)?.name || "—"}</TableCell>
      <TableCell className="hidden md:table-cell">
        <div className="text-xs max-w-[150px] truncate" title={meta?.indication}>
          {meta?.indication || "—"}
        </div>
      </TableCell>
      <TableCell>
        {study.sla === "pending" || study.state === "awaiting_sla" ? (
          <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-600 dark:text-amber-400">
            Pending
          </Badge>
        ) : (
          <Badge variant={study.sla === "STAT" ? "destructive" : "secondary"} className="text-[10px]">
            {study.sla}
          </Badge>
        )}
      </TableCell>
      <TableCell>
        {study.triage_status === "processing" ? (
          <div className="flex flex-col gap-1 min-w-[90px]">
            <div className="flex items-center gap-1.5">
              <Spinner className="h-3 w-3 animate-spin text-blue-500" />
              <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">Processing</span>
            </div>
            <Progress value={study.triage_progress || 0} className="h-1.5" />
            <span className="text-[10px] text-muted-foreground tabular-nums">{study.triage_progress || 0}%</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <div className={`h-2 w-2 rounded-full ${stateColors[study.state as string] || 'bg-muted'}`} />
            <span className="capitalize text-xs">{study.state?.replace("_", " ")}</span>
          </div>
        )}
      </TableCell>
      <TableCell className="hidden sm:table-cell text-xs">{dayjs(study.created_at).format("MMM D, YYYY")}</TableCell>
      <TableCell>
        <div className="flex gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Link to={`/app/studies/${study.id}`}>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <FileText className="h-4 w-4" />
                </Button>
              </Link>
            </TooltipTrigger>
            <TooltipContent>View Details</TooltipContent>
          </Tooltip>
          
          {/* EEG Viewer - available once SLA chosen and tokens deducted */}
          {study.tokens_deducted && study.tokens_deducted > 0 ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-primary"
                  onClick={() => onNavigate(`/app/eeg-viewer?studyId=${study.study_key || study.id}`)}
                >
                  <Eye className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Open EEG Viewer</TooltipContent>
            </Tooltip>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-[11px] font-normal border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/5"
              onClick={() => onNavigate(`/app/studies/${study.id}`)}
            >
              Choose priority
            </Button>
          )}
          
          {study.state === 'signed' && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => onDownload(study)}
                >
                  <Download className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Download Report</TooltipContent>
            </Tooltip>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
});

StudyRow.displayName = "StudyRow";

export default function Studies() {
  const { isPilot } = useSku();

  // Pilot SKU gets value-focused view
  if (isPilot) {
    return <PilotStudiesView />;
  }

  return <InternalStudiesView />;
}

function InternalStudiesView() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<string>("all");

  // "processing" is a UI-collapse over multiple pipeline states; the hook only
  // supports a single .eq, so for that case we fetch all and post-filter below.
  const PROCESSING_STATES = ["processing", "preprocessing", "canonicalized", "triage_draft"];
  const hookFilter = stateFilter === "processing" ? "all" : stateFilter;
  const { studies, isLoading } = useStudiesData(hookFilter);
  const searchFiltered = useFilteredStudies(studies, search);
  const filteredStudies = stateFilter === "processing"
    ? searchFiltered.filter((s) => PROCESSING_STATES.includes(s.state))
    : searchFiltered;

  const handleNavigate = useCallback((path: string) => {
    navigate(path);
  }, [navigate]);
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      toast.error("Your session has expired", {
        description: "Please sign in again to upload an EEG study.",
      });
      navigate("/login", { replace: true });
      return;
    }

    const file = files[0];
    if (!isAcceptedExtension(file.name)) {
      toast.error("This file format is not supported", {
        description: `Supported vendor formats: ${ACCEPTED_FORMATS_LABEL}`,
      });
      return;
    }

    const uploadTid = toast.loading(`Preparing upload — ${file.name}`);
    try {
      // extractEDFPatientMeta parses an EDF/BDF fixed-offset header. For other
      // vendor formats (.e Natus, .vhdr BrainVision, .set EEGLAB, etc.) those
      // bytes are unrelated binary and would decode as garbled text. So we
      // skip extraction for non-EDF/BDF and let the C-Plane fill patient meta
      // during canonicalisation, or the clinician edit the field manually.
      const lower = file.name.toLowerCase();
      const isEdfFamily = lower.endsWith(".edf") || lower.endsWith(".bdf");
      const [contentSha256, patientMeta] = await Promise.all([
        sha256HexFromFile(file),
        isEdfFamily ? extractEDFPatientMeta(file) : Promise.resolve({}),
      ]);

      const { data, error: createError } = await supabase.functions.invoke("create_study_from_upload", {
        body: { fileName: file.name, contentSha256, patientMeta },
      });
      if (createError) {
        throw new Error(await formatEdgeFunctionError(createError, data));
      }
      if (data && typeof data === "object" && "error" in data && typeof (data as { error?: string }).error === "string") {
        throw new Error((data as { error: string }).error);
      }
      if (!data?.studyId) throw new Error("No study ID returned");

      const { studyId, sasUrl, duplicate, message } = data as {
        studyId: string;
        sasUrl?: string | null;
        duplicate?: boolean;
        message?: string;
      };

      if (duplicate) {
        toast.dismiss(uploadTid);
        toast.info("This recording is already in the system", {
          description: message || "Opening your existing study so you don't lose context.",
          action: { label: "View study →", onClick: () => navigate(`/app/studies/${studyId}`) },
        });
        navigate(`/app/studies/${studyId}`);
        return;
      }

      if (sasUrl) {
        toast.loading(`Uploading ${(file.size / 1024 / 1024).toFixed(1)} MB…`, { id: uploadTid });
        const uploadRes = await fetch(sasUrl, {
          method: "PUT",
          body: file,
          headers: {
            "x-ms-blob-type": "BlockBlob",
            "Content-Type": "application/octet-stream",
          },
        });
        if (!uploadRes.ok) {
          const errText = await uploadRes.text();
          throw new Error(`Azure upload failed: ${uploadRes.status} — ${errText}`);
        }
      } else {
        if (import.meta.env.DEV) console.warn(`[${studyId}] No SAS URL — pipeline may fail without source_url`);
      }

      toast.dismiss(uploadTid);
      // Internal SKU bypasses the SLA picker: tokens auto-deduct at default TAT
      // and triage starts immediately. (Pilot SKU goes through PilotStudiesView,
      // which keeps the explicit SLA selection step.)
      const autoTid = toast.loading("Starting triage…");
      try {
        const result = await selectSlaAndStartPipeline(studyId, "TAT");
        toast.dismiss(autoTid);
        if (result?.success) {
          toast.success("Upload complete · triage started", {
            description: "Canonicalization, biomarkers, and MIND®Triage are running now.",
            action: { label: "Open study →", onClick: () => navigate(`/app/studies/${studyId}`) },
            duration: 5000,
          });
        } else {
          toast.warning("Upload complete · could not auto-start triage", {
            description: result?.error ?? "Open the study to start triage manually.",
            action: { label: "Open study →", onClick: () => navigate(`/app/studies/${studyId}`) },
            duration: 6000,
          });
        }
      } catch (e: any) {
        toast.dismiss(autoTid);
        toast.warning("Upload complete · could not auto-start triage", {
          description: e?.message ?? "Open the study to start triage manually.",
          action: { label: "Open study →", onClick: () => navigate(`/app/studies/${studyId}`) },
          duration: 6000,
        });
      }
      navigate(`/app/studies/${studyId}`);
    } catch (error: any) {
      if (import.meta.env.DEV) console.error("Upload error:", error);
      toast.dismiss(uploadTid);
      toast.error("EEG upload failed", {
        description: error?.message || "Could not upload the EEG file. Please check your connection and try again.",
      });
    }
  };

  const handleDownloadReport = async (study: any) => {
    const tid = toast.loading("Preparing report…");
    try {
      // Fetch report with content for fallback
      const { data: report } = await supabase
        .from("reports")
        .select("id, pdf_path, content, signed_at, created_at")
        .eq("study_id", study.id)
        .maybeSingle();

      let pdfPath = report?.pdf_path ?? null;

      // Try server-side PDF generation if no path
      if (report && !pdfPath) {
        const { error: genError } = await supabase.functions.invoke("generate_report_pdf", {
          body: { reportId: report.id },
        });
        if (!genError) {
          const { data: fresh } = await supabase.from("reports").select("pdf_path").eq("id", report.id).maybeSingle();
          pdfPath = fresh?.pdf_path ?? null;
        }
      }

      // Download from storage
      if (pdfPath) {
        const { data, error } = await supabase.storage.from("eeg-reports").download(pdfPath);
        if (!error && data) {
          const url = URL.createObjectURL(data);
          const a = document.createElement("a");
          a.href = url;
          a.download = `report-${study.id.slice(0, 8)}.pdf`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          toast.dismiss(tid);
          toast.success("Report downloaded");
          return;
        }
      }

      // Client-side PDF via @react-pdf/renderer
      const content = (report?.content as any) ?? (study?.triage_draft_json as any);
      if (content) {
        const meta = study.meta as any;
        const triageDraft = study?.triage_draft_json as any;

        const [{ pdf: renderPDF }, { ReportDocument }] = await Promise.all([
          import("@react-pdf/renderer"),
          import("@/components/report/ReportPDF"),
        ]);

        const blob = await renderPDF(
          ReportDocument({
            patientName: getPatientLabel(study) || "Unknown Patient",
            patientId: meta?.patient_id?.startsWith("PT-") ? undefined : meta?.patient_id,
            studyDate: dayjs(study.created_at).format("MMMM D, YYYY"),
            signedDate: dayjs(report?.signed_at || report?.created_at || new Date()).format("MMMM D, YYYY"),
            studyId: study.id,
            content,
            triageClassification: triageDraft?.triage?.classification ?? triageDraft?.classification,
            triageConfidence: triageDraft?.triage?.confidence ?? triageDraft?.triage_confidence,
          }) as any
        ).toBlob();

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `report-${study.id.slice(0, 8)}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.dismiss(tid);
        toast.success("Report downloaded as PDF");
        return;
      }

      toast.dismiss(tid);
      toast.error("Report content unavailable");
    } catch (error) {
      if (import.meta.env.DEV) console.error("Download error:", error);
      toast.dismiss(tid);
      toast.error("Download failed");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="space-y-2">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="rounded-lg border border-border/60 p-4 space-y-3">
          <div className="flex gap-3">
            <Skeleton className="h-9 flex-1" />
            <Skeleton className="h-9 w-32" />
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">EEG Studies</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Upload a new EEG, track canonicalization + triage progress, and open completed studies for review.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button onClick={() => fileInputRef.current?.click()} size="sm">
                  <Upload className="h-4 w-4 mr-2" />
                  Upload new EEG
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Upload an EEG recording to start a new study.
                <br />
                Supported vendor formats: {ACCEPTED_FORMATS_LABEL}
              </TooltipContent>
            </Tooltip>
            <input
              ref={fileInputRef}
              type="file"
              // NO `accept` attribute. macOS / Chrome / Firefox file pickers
              // grey out files whose extension they don't recognise — notably
              // single-character extensions like `.e` (Natus). JS validates
              // via isAcceptedExtension after selection.
              className="hidden"
              onChange={(e) => handleFileUpload(e.target.files)}
            />
          </div>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by patient, ID, or recording filename…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={stateFilter} onValueChange={setStateFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Filter by state" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All states</SelectItem>
                  <SelectItem value="awaiting_sla">Awaiting SLA selection</SelectItem>
                  <SelectItem value="processing">Processing (canonicalization or inference)</SelectItem>
                  <SelectItem value="in_review">In review (awaiting signature)</SelectItem>
                  <SelectItem value="signed">Signed (report finalised)</SelectItem>
                  <SelectItem value="failed">Failed (pipeline error)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patient</TableHead>
                  <TableHead className="hidden sm:table-cell">Clinic</TableHead>
                  <TableHead className="hidden md:table-cell">Indication</TableHead>
                  <TableHead>SLA</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead className="hidden sm:table-cell">Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStudies.map((study) => (
                  <StudyRow 
                    key={study.id} 
                    study={study} 
                    onDownload={handleDownloadReport}
                    onNavigate={handleNavigate}
                  />
                ))}
              </TableBody>
            </Table>
            {filteredStudies.length === 0 && (
              <div className="text-center py-12 text-muted-foreground text-sm">
                No studies found
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}
