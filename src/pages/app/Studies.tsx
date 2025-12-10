import { useState, useMemo, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Search, FileText, Eye, FolderOpen, Download, Upload } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import dayjs from "dayjs";
import { useToast } from "@/hooks/use-toast";
import { useRef } from "react";

const stateColors: Record<string, string> = {
  uploaded: "bg-blue-500",
  preprocessing: "bg-yellow-500",
  canonicalized: "bg-cyan-500",
  ai_draft: "bg-purple-500",
  in_review: "bg-orange-500",
  signed: "bg-green-500",
  failed: "bg-red-500",
};

export default function Studies() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<string>("all");

  const { data: studies, isLoading } = useQuery({
    queryKey: ["studies", stateFilter],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      let query = supabase
        .from("studies")
        .select("id, created_at, state, sla, meta, indication, sample, clinics(name)")
        .or(`owner.eq.${user.id},sample.eq.true`)
        .order("created_at", { ascending: false })
        .limit(100);

      if (stateFilter !== "all") {
        query = query.eq("state", stateFilter as any);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    staleTime: 30000,
    gcTime: 60000,
  });

  const filteredStudies = useMemo(() => {
    if (!studies) return [];
    if (!search.trim()) return studies;
    const lowerSearch = search.toLowerCase();
    return studies.filter((study) => {
      const meta = study.meta as any;
      const patientName = meta?.patient_name || "";
      const patientId = meta?.patient_id || "";
      return (
        patientName.toLowerCase().includes(lowerSearch) ||
        patientId.toLowerCase().includes(lowerSearch)
      );
    });
  }, [studies, search]);
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
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Studies</h1>
            <p className="text-muted-foreground text-sm">View and manage all EEG studies</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button onClick={() => fileInputRef.current?.click()} size="sm">
                  <Upload className="h-4 w-4 mr-2" />
                  Upload
                </Button>
              </TooltipTrigger>
              <TooltipContent>Upload EDF/BDF file</TooltipContent>
            </Tooltip>
            <input
              ref={fileInputRef}
              type="file"
              accept=".edf,.bdf"
              className="hidden"
              onChange={(e) => handleFileUpload(e.target.files)}
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={() => navigate('/app/viewer')}>
                  <Eye className="h-4 w-4 mr-2" />
                  Viewer
                </Button>
              </TooltipTrigger>
              <TooltipContent>Open EEG Viewer</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={() => navigate('/app/files')}>
                  <FolderOpen className="h-4 w-4 mr-2" />
                  Files
                </Button>
              </TooltipTrigger>
              <TooltipContent>Browse all files</TooltipContent>
            </Tooltip>
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
                {filteredStudies.map((study) => {
                  const meta = study.meta as any;
                  return (
                    <TableRow key={study.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium text-sm">{meta?.patient_name || "Unknown"}</div>
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
                        <Badge variant={study.sla === "STAT" ? "destructive" : "secondary"} className="text-[10px]">
                          {study.sla}
                        </Badge>
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
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => navigate(`/app/viewer?studyId=${study.id}`)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Open in Viewer</TooltipContent>
                          </Tooltip>
                          {study.state === 'signed' && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => handleDownloadReport(study)}
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
                })}
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
