import { useState, useCallback, useRef, memo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, FileText, Eye, Download, Upload, Lock, Unlock, Loader2 as Spinner } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import dayjs from "dayjs";
import { useToast } from "@/hooks/use-toast";
import { useStudiesData, useFilteredStudies } from "@/hooks/useStudiesData";
import { useSku } from "@/hooks/useSku";
import { formatEdgeFunctionError } from "@/lib/edgeFunctionError";
import { formatStudySourceLine } from "@/lib/studySourceFile";
import { sha256HexFromFile } from "@/lib/fileSha256";
import { getStudyHandle } from "@/lib/studyDisplay";
import PilotStudiesView from "@/components/pilot/PilotStudiesView";
import logoSrc from "@/assets/logo.png";

const stateColors: Record<string, string> = {
  pending: "bg-gray-400",
  uploaded: "bg-blue-500",
  processing: "bg-yellow-500",
  awaiting_sla: "bg-amber-500",
  preprocessing: "bg-yellow-500",
  canonicalized: "bg-cyan-500",
  ai_draft: "bg-purple-500",
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

  // Build anonymized patient demographics string
  const patientAge = meta?.patient_age;
  const patientGender = meta?.patient_gender;
  const demographicsStr = [
    patientAge ? `${patientAge}y` : null,
    patientGender ? patientGender.charAt(0).toUpperCase() : null
  ].filter(Boolean).join("/");
  
  return (
    <TableRow>
      <TableCell>
        <div>
          <div className="font-medium text-sm flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span>
              {meta?.patient_name || "Unknown"}
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
            {meta?.patient_id || "N/A"}
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
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <div className={`h-2 w-2 rounded-full ${stateColors[study.state as string] || 'bg-muted'}`} />
              <span className="capitalize text-xs">{study.state?.replace("_", " ")}</span>
            </div>
            {(() => {
              const report = (study as any).ai_draft_json;
              const cls = report?.classification ?? report?.triage?.classification;
              const conf = report?.triage_confidence ?? report?.triage?.confidence;
              if (!cls || cls === "unknown") return null;
              const isNormal = cls === "normal";
              return (
                <Badge className={`text-[10px] w-fit ${isNormal ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : "bg-red-500/10 text-red-600 border-red-500/20"}`}>
                  {isNormal ? "Normal" : "Abnormal"}
                  {typeof conf === "number" && conf > 0 && (
                    <span className="ml-1 opacity-60">{Math.round(conf * 100)}%</span>
                  )}
                </Badge>
              );
            })()}
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
          
          {/* EEG Viewer - gated by token deduction */}
          {study.tokens_deducted && study.tokens_deducted > 0 ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon"
                  className="h-8 w-8 text-primary"
                  onClick={() => onNavigate(`/app/eeg-viewer?studyId=${study.study_key || study.id}`)}
                >
                  <Unlock className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Open EEG Viewer (Unlocked)</TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon"
                  className="h-8 w-8 text-muted-foreground"
                  onClick={() => onNavigate(`/app/studies/${study.id}`)}
                >
                  <Lock className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Select SLA to unlock viewer</TooltipContent>
            </Tooltip>
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
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<string>("all");

  // Use optimized hook with request deduplication
  const { studies, isLoading } = useStudiesData(stateFilter);
  const filteredStudies = useFilteredStudies(studies, search);

  const handleNavigate = useCallback((path: string) => {
    navigate(path);
  }, [navigate]);
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      toast({ title: "Session expired", description: "Please sign in again.", variant: "destructive" });
      navigate("/login", { replace: true });
      return;
    }

    const file = files[0];
    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith('.edf') && !lowerName.endsWith('.bdf')) {
      toast({ title: "Invalid file type", description: "Only .edf and .bdf files are supported", variant: "destructive" });
      return;
    }

    try {
      toast({ title: "Fingerprinting file…", description: "Same recording opens your existing study." });
      const contentSha256 = await sha256HexFromFile(file);

      // Step 1: Create study + get Azure Blob SAS token from edge function
      toast({ title: "Creating study..." });
      const { data, error: createError } = await supabase.functions.invoke("create_study_from_upload", {
        body: { fileName: file.name, contentSha256 },
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
        toast({
          title: "Same recording",
          description: message || "Opening your existing study.",
        });
        navigate(`/app/studies/${studyId}`);
        return;
      }

      if (sasUrl) {
        // Step 2: Upload directly to Azure Blob via SAS URL (bypasses Supabase Storage)
        toast({ title: `Uploading ${(file.size / 1024 / 1024).toFixed(1)} MB to Azure...` });
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
        // Fallback: SAS not available, C-Plane will read from Supabase storage if configured
        console.warn(`[${studyId}] No SAS URL — pipeline may fail without source_url`);
      }

      toast({
        title: "Upload complete",
        description: "Select Standard or Priority analysis to start MIND® processing.",
      });
      navigate(`/app/studies/${studyId}`);
    } catch (error: any) {
      console.error("Upload error:", error);
      toast({ title: "Upload failed", description: error?.message || "Failed to upload EEG", variant: "destructive" });
    }
  };

  const handleDownloadReport = async (study: any) => {
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
        toast({ title: "Generating PDF...", description: "Please wait" });
        const { error: genError } = await supabase.functions.invoke("generate_report_pdf", {
          body: { reportId: report.id },
        });
        if (!genError) {
          const { data: fresh } = await supabase.from("reports").select("pdf_path").eq("id", report.id).single();
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
          toast({ title: "Download started" });
          return;
        }
      }

      // Fallback: generate HTML from report.content or ai_draft_json
      const content = (report?.content as any) ?? (study?.ai_draft_json as any);
      if (content) {
        const meta = study.meta as any;
        const patientName = meta?.patient_name || "Unknown Patient";
        const signedDate = dayjs(report?.signed_at || report?.created_at || new Date().toISOString()).format("MMMM D, YYYY");
        const sections = [
          { heading: "Background Activity", text: content.background_activity },
          { heading: "Sleep Architecture", text: content.sleep_architecture },
          { heading: "Abnormalities", text: content.abnormalities },
          { heading: "Impression", text: content.impression },
          { heading: "Clinical Correlates", text: content.clinical_correlates },
        ].filter(s => s.text);

        const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>EEG Report — ${patientName}</title>
<style>
  body { font-family: Georgia, serif; max-width: 720px; margin: 40px auto; color: #111; line-height: 1.6; }
  h1 { font-size: 1.5rem; border-bottom: 2px solid #111; padding-bottom: 8px; }
  h2 { font-size: 1rem; font-weight: 700; margin-top: 1.5rem; margin-bottom: 4px; }
  .meta { color: #555; font-size: 0.9rem; margin-top: 4px; }
  p { white-space: pre-wrap; margin: 0; }
  @media print { body { margin: 20mm; } }
</style></head><body>
<h1>EEG Interpretation Report</h1>
<div class="meta"><strong>Patient:</strong> ${patientName}</div>
<div class="meta"><strong>Date signed:</strong> ${signedDate}</div>
<div class="meta"><strong>Study ID:</strong> ${study.id.slice(0, 8).toUpperCase()}</div>
${sections.map(s => `<h2>${s.heading}</h2><p>${s.text || ""}</p>`).join("\n")}
<p style="margin-top:2rem;font-size:0.75rem;color:#999;">Generated by ENCEPHLIAN™ — for physician review only</p>
</body></html>`;

        const blob = new Blob([html], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `report-${study.id.slice(0, 8)}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast({ title: "Report downloaded", description: "Open the .html file to print as PDF" });
        return;
      }

      toast({ title: "Report content unavailable", variant: "destructive" });
    } catch (error) {
      console.error("Download error:", error);
      toast({ title: "Download failed", variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <img src={logoSrc} alt="Loading" className="h-10 w-10 animate-pulse" />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Studies</h1>
            <p className="text-muted-foreground text-sm">Manage EEG studies, upload files, and track progress</p>
          </div>
          <div className="flex items-center gap-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button onClick={() => fileInputRef.current?.click()} size="sm">
                  <Upload className="h-4 w-4 mr-2" />
                  Upload EEG
                </Button>
              </TooltipTrigger>
              <TooltipContent>Upload EDF/BDF file to create new study</TooltipContent>
            </Tooltip>
            <input
              ref={fileInputRef}
              type="file"
              accept=".edf,.bdf"
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
                  <SelectItem value="all">All States</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="uploaded">Uploaded</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="complete">Complete</SelectItem>
                  <SelectItem value="preprocessing">Preprocessing</SelectItem>
                  <SelectItem value="canonicalized">Canonicalized</SelectItem>
                  <SelectItem value="ai_draft">AI Draft</SelectItem>
                  <SelectItem value="in_review">In Review</SelectItem>
                  <SelectItem value="signed">Signed</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
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
