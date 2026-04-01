import { useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Upload, FileText, CheckCircle2, Clock, 
  Loader2, Zap, Download
} from "lucide-react";
import dayjs from "dayjs";
import { toast } from "sonner";
import { useStudiesData } from "@/hooks/useStudiesData";
import SlaSelectionModal from "@/components/dashboard/SlaSelectionModal";
import { useDashboardData, Study } from "@/hooks/useDashboardData";
import { useUserSession } from "@/contexts/UserSessionContext";
import { cn } from "@/lib/utils";
import logoSrc from "@/assets/logo.png";

/**
 * PilotStudiesView: Value-focused study management
 * 
 * Three clear sections:
 * 1. Upload - Primary action
 * 2. In Progress - Processing studies
 * 3. Ready - Completed reports to download
 * 
 * No tables, no filters, no complexity.
 * Just: Upload → Process → Get Report
 */
export default function PilotStudiesView() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedStudy, setSelectedStudy] = useState<Study | null>(null);
  const [slaModalOpen, setSlaModalOpen] = useState(false);

  const { studies, isLoading } = useStudiesData("all");
  const { tokenBalance } = useDashboardData();
  const { userId } = useUserSession();

  // Categorize studies by stage
  const pendingStudies = studies.filter(s =>
    s.state === "awaiting_sla" ||
    ((s.state === "uploaded" || s.state === "parsed") && (!s.triage_status || s.triage_status === "pending" || s.triage_status === "awaiting_sla"))
  );
  
  const processingStudies = studies.filter(s =>
    s.triage_status === "processing" || s.state === "processing" || s.state === "ai_draft" || s.state === "in_review"
  );
  
  const completedStudies = studies.filter(s => 
    s.state === "signed" || s.triage_status === "completed"
  );

  const handleSelectSla = useCallback((study: Study) => {
    setSelectedStudy(study);
    setSlaModalOpen(true);
  }, []);

  const handleInsufficientTokens = useCallback(() => {
    setSlaModalOpen(false);
    toast.error("Add tokens to continue", {
      action: {
        label: "Add Tokens",
        onClick: () => navigate("/app/wallet"),
      },
    });
  }, [navigate]);

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    
    if (!userId) {
      toast.error("Not authenticated");
      return;
    }

    // Hard gate: Storage RLS requires a real user JWT (not anon).
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      toast.error("Session expired", { description: "Please sign in again." });
      navigate("/login", { replace: true });
      return;
    }
    
    const file = files[0];
    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith('.edf')) {
      toast.error("Only EDF files supported", {
        description: "BDF support coming soon"
      });
      return;
    }

    setUploading(true);
    try {
      // CRITICAL: Path must start with userId for RLS policy compliance
      const filePath = `${userId}/${Date.now()}-${file.name}`;
      
      const { error: uploadError } = await supabase.storage
        .from("eeg-raw")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false
        });

      if (uploadError) {
        console.error("Storage upload error:", uploadError);
        throw uploadError;
      }

      // Create study and trigger AI triage
      const { data, error } = await supabase.functions.invoke("create_study_from_upload", {
        body: { filePath, fileName: file.name }
      });

      if (error) {
        console.error("Create study error:", error);
        throw error;
      }

      // Kick off metadata extraction (fire-and-forget)
      if (data?.study_id) {
        supabase.functions.invoke("parse_eeg_study", {
          body: {
            study_id: data.study_id,
            file_path: filePath,
            file_type: "edf",
          },
        }).catch((err) => console.warn("parse_eeg_study failed:", err));
      }

      toast.success("EEG uploaded!", {
        description: "Select priority to start AI triage",
      });

    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error("Upload failed", {
        description: error?.message || "Please try again",
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDownload = async (study: any) => {
    try {
      const { data: report } = await supabase
        .from("reports")
        .select("pdf_path")
        .eq("study_id", study.id)
        .single();

      if (!report?.pdf_path) {
        toast.info("Generating report...");
        
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
      a.download = `triage-report-${study.id.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success("Download started");
    } catch (error) {
      toast.error("Download failed");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center space-y-3">
          <img src={logoSrc} alt="Loading" className="h-12 w-12 mx-auto animate-pulse" />
          <p className="text-muted-foreground text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  const isEmpty = studies.length === 0;

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-4 animate-fade-in">
      {/* Header */}
      <div className="text-center space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Your Studies</h1>
        <p className="text-xs text-muted-foreground">
          Upload EEG → Get AI Triage Report
        </p>
      </div>

      {/* Upload Section - Primary CTA */}
      <Card 
        className={cn(
          "border-2 border-dashed transition-colors cursor-pointer hover:border-primary/50 hover:bg-primary/5",
          uploading && "pointer-events-none opacity-70"
        )}
        onClick={() => !uploading && fileInputRef.current?.click()}
      >
        <CardContent className="p-8 text-center">
          {uploading ? (
            <>
              <Loader2 className="h-10 w-10 text-primary mx-auto mb-3 animate-spin" />
              <p className="font-medium">Uploading...</p>
            </>
          ) : (
            <>
              <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                <Upload className="h-7 w-7 text-primary" />
              </div>
              <p className="font-medium mb-1">Upload EEG File</p>
              <p className="text-xs text-muted-foreground">
                EDF or BDF format • Click or drag
              </p>
            </>
          )}
        </CardContent>
      </Card>
      <input
        ref={fileInputRef}
        type="file"
        accept=".edf,.bdf"
        className="hidden"
        onChange={(e) => handleFileUpload(e.target.files)}
      />

      {/* Pending SLA Selection */}
      {pendingStudies.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <Clock className="h-4 w-4 text-amber-600" />
            <span className="text-sm font-medium">Ready for Triage</span>
            <Badge variant="secondary" className="text-xs ml-auto">
              {pendingStudies.length}
            </Badge>
          </div>
          <div className="space-y-2">
            {pendingStudies.map((study) => {
              const meta = study.meta as any;
              return (
                <Card key={study.id} className="bg-amber-500/5 border-amber-500/20">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">
                          {meta?.patient_name || "Patient"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Uploaded {dayjs(study.created_at).format("MMM D, h:mm A")}
                        </p>
                      </div>
                      <Button 
                        size="sm" 
                        onClick={() => handleSelectSla(study as Study)}
                        className="gap-1 shrink-0"
                      >
                        <Zap className="h-3 w-3" />
                        Start Triage
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Processing */}
      {processingStudies.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <Loader2 className="h-4 w-4 text-primary animate-spin" />
            <span className="text-sm font-medium">Processing</span>
            <Badge variant="secondary" className="text-xs ml-auto">
              {processingStudies.length}
            </Badge>
          </div>
          <div className="space-y-2">
            {processingStudies.map((study) => {
              const meta = study.meta as any;
              const progress = study.triage_progress || 0;
              return (
                <Card key={study.id} className="bg-primary/5 border-primary/20">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-sm truncate">
                        {meta?.patient_name || "Patient"}
                      </p>
                      <Badge variant="outline" className="text-xs">
                        {study.sla}
                      </Badge>
                    </div>
                    <Progress value={progress} className="h-1.5" />
                    <p className="text-xs text-muted-foreground">
                      AI analysis in progress...
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Completed */}
      {completedStudies.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span className="text-sm font-medium">Reports Ready</span>
            <Badge variant="secondary" className="text-xs ml-auto">
              {completedStudies.length}
            </Badge>
          </div>
          <div className="space-y-2">
            {completedStudies.slice(0, 10).map((study) => {
              const meta = study.meta as any;
              return (
                <Card key={study.id} className="hover:bg-muted/30 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div 
                        className="flex items-center gap-3 min-w-0 cursor-pointer flex-1"
                        onClick={() => navigate(`/app/studies/${study.id}`)}
                      >
                        <div className="h-9 w-9 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">
                            {meta?.patient_name || "Patient"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {dayjs(study.triage_completed_at || study.created_at).format("MMM D")}
                            <span className="mx-1">•</span>
                            {study.sla}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button 
                          variant="ghost" 
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => navigate(`/app/studies/${study.id}`)}
                        >
                          <FileText className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleDownload(study)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty State */}
      {isEmpty && (
        <div className="text-center py-8 text-muted-foreground">
          <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No studies yet</p>
          <p className="text-xs mt-1">Upload your first EEG to get started</p>
        </div>
      )}

      {/* SLA Selection Modal */}
      <SlaSelectionModal
        open={slaModalOpen}
        onOpenChange={setSlaModalOpen}
        study={selectedStudy}
        tokenBalance={tokenBalance}
        onInsufficientTokens={handleInsufficientTokens}
      />
    </div>
  );
}
