import { useState, useCallback, useRef, memo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, FileText, Eye, Download, Upload, Lock, Unlock } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import dayjs from "dayjs";
import { useToast } from "@/hooks/use-toast";
import { useStudiesData, useFilteredStudies } from "@/hooks/useStudiesData";
import { DemoModeToggle } from "@/components/DemoModeToggle";
import { useDemoMode } from "@/contexts/DemoModeContext";
import { useSku } from "@/hooks/useSku";
import PilotStudiesView from "@/components/pilot/PilotStudiesView";
import logoSrc from "@/assets/logo.png";

const stateColors: Record<string, string> = {
  awaiting_sla: "bg-amber-500",
  uploaded: "bg-blue-500",
  preprocessing: "bg-yellow-500",
  canonicalized: "bg-cyan-500",
  ai_draft: "bg-purple-500",
  in_review: "bg-orange-500",
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
          <div className="font-medium text-sm">
            {meta?.patient_name || "Unknown"}
            {demographicsStr && (
              <span className="text-muted-foreground font-normal ml-1.5 text-xs">
                ({demographicsStr})
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {meta?.patient_id || "N/A"}
            {study.sample && <Badge variant="outline" className="ml-1 text-[10px]">Sample</Badge>}
          </div>
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
        <div className="flex items-center gap-1.5">
          <div className={`h-2 w-2 rounded-full ${stateColors[study.state as string] || 'bg-muted'}`} />
          <span className="capitalize text-xs">{study.state?.replace("_", " ")}</span>
        </div>
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
                  onClick={() => onNavigate(`/app/viewer?studyId=${study.id}`)}
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
  const { isDemoMode } = useDemoMode();
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
    
    const file = files[0];
    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith('.edf') && !lowerName.endsWith('.bdf')) {
      toast({
        title: "Invalid file type",
        description: "Only .edf and .bdf files are supported",
        variant: "destructive",
      });
      return;
    }

    try {
      toast({ title: "Uploading file..." });
      
      const filePath = `${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("eeg-raw")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      toast({ title: "Creating study..." });
      const { data, error } = await supabase.functions.invoke("create_study_from_upload", {
        body: { filePath, fileName: file.name }
      });

      if (error) throw error;

      if (data?.studyId) {
        toast({ title: "Generating AI draft..." });
        await supabase.functions.invoke("generate_ai_report", {
          body: { study_id: data.studyId }
        });
        
        toast({
          title: "Success!",
          description: "Study created and AI draft generated",
        });
        
        navigate(`/app/studies/${data.studyId}`);
      }
    } catch (error) {
      console.error("Upload error:", error);
      toast({
        title: "Upload failed",
        description: "Failed to create study from uploaded file",
        variant: "destructive",
      });
    }
  };

  const handleDownloadReport = async (study: any) => {
    try {
      const { data: report } = await supabase
        .from("reports")
        .select("pdf_path")
        .eq("study_id", study.id)
        .single();

      if (!report?.pdf_path) {
        toast({ title: "Generating PDF...", description: "Please wait" });
        
        const { data: reportData } = await supabase
          .from("reports")
          .select("id")
          .eq("study_id", study.id)
          .single();

        if (reportData) {
          await supabase.functions.invoke("generate_report_pdf", {
            body: { reportId: reportData.id }
          });
        }
        
        return;
      }

      const { data, error } = await supabase.storage
        .from("eeg-reports")
        .download(report.pdf_path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report-${study.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast({ title: "Download started" });
    } catch (error) {
      console.error("Download error:", error);
      toast({
        title: "Download failed",
        variant: "destructive",
      });
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
            <DemoModeToggle />
            {!isDemoMode && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button onClick={() => fileInputRef.current?.click()} size="sm">
                    <Upload className="h-4 w-4 mr-2" />
                    Upload EEG
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Upload EDF/BDF file to create new study</TooltipContent>
              </Tooltip>
            )}
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
                  placeholder="Search by patient name or ID..."
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
                  <SelectItem value="uploaded">Uploaded</SelectItem>
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
