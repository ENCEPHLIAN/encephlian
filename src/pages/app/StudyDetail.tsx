import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { 
  Loader2, 
  FileSignature, 
  FileText, 
  Download, 
  Activity, 
  ArrowLeft,
  User,
  Calendar,
  Clock,
  Building2,
  Stethoscope,
  CheckCircle2,
  AlertCircle,
  FlaskConical,
  Layers,
  Zap,
  FileIcon,
  Eye,
  Brain
} from "lucide-react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import TriageReportView from "@/components/report/TriageReportView";
import MindReportView from "@/components/report/MindReportView";
import ErrorPage from "@/components/ErrorPage";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { useSku } from "@/hooks/useSku";
import { SkuGate } from "@/components/SkuGate";
import { fetchJson } from "@/shared/readApiClient";

dayjs.extend(relativeTime);

// State display configuration
const STATE_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: "Pending", color: "bg-gray-400", icon: Clock },
  uploaded: { label: "Uploaded", color: "bg-blue-500", icon: FileIcon },
  processing: { label: "Processing", color: "bg-purple-500", icon: Zap },
  awaiting_sla: { label: "Awaiting SLA", color: "bg-amber-500", icon: Clock },
  ai_draft: { label: "AI Draft Ready", color: "bg-cyan-500", icon: FileText },
  complete: { label: "Analysis Ready", color: "bg-cyan-500", icon: Brain },
  in_review: { label: "In Review", color: "bg-orange-500", icon: Eye },
  signed: { label: "Signed", color: "bg-emerald-500", icon: CheckCircle2 },
};

const TRIAGE_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending", color: "text-muted-foreground" },
  awaiting_sla: { label: "Awaiting SLA", color: "text-amber-500" },
  processing: { label: "Processing", color: "text-blue-500" },
  completed: { label: "Completed", color: "text-emerald-500" },
  failed: { label: "Failed", color: "text-destructive" },
};

export default function StudyDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const { can, capabilities, isPilot } = useSku();
  const queryClient = useQueryClient();
  const [downloading, setDownloading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [runningTriage, setRunningTriage] = useState(false);

  const IPLANE_BASE = import.meta.env.VITE_IPLANE_BASE as string | undefined;

  const { data: study, isLoading, isError, refetch } = useQuery({
    queryKey: ["study-detail", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("studies")
        .select(`
          *,
          clinics(name, logo_url, sku),
          study_files(*),
          reports(*, profiles:interpreter(full_name, credentials)),
          canonical_eeg_records(id, schema_version, tensor_path, native_sampling_hz, sfreq_model),
          study_reports(id, run_id, content, report_html, created_at)
        `)
        .eq("id", id!)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!id,
    retry: 1,
    // Auto-poll while pipeline is running — stops once complete/signed
    refetchInterval: (query) => {
      const state = (query.state.data as any)?.state;
      return (state === "processing" || state === "uploaded" || state === "pending") ? 8000 : false;
    },
  });

  // Fetch MIND® report from I-Plane blob (mind.report.v1 format)
  // Use study_key (blob UUID) when available, fallback to Supabase id
  const { data: mindReport, isLoading: mindLoading, refetch: refetchMind } = useQuery({
    queryKey: ["mind-report", id],
    queryFn: async () => {
      if (!IPLANE_BASE || !id) return null;
      const blobId = (study as any)?.study_key || id;
      const res = await fetch(`${IPLANE_BASE}/mind/report/${blobId}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!id && !!IPLANE_BASE && !isLoading,
    staleTime: 30_000,
    retry: false,
    // Poll every 15s while no report yet and study is still processing
    refetchInterval: (query) => {
      if (query.state.data) return false; // already have report
      const state = (study as any)?.state;
      return (state === "uploaded" || state === "processing" || state === "ai_draft") ? 15_000 : false;
    },
  });

  // Re-trigger the full C-Plane → I-Plane pipeline via edge function
  const handleRunAITriage = async () => {
    if (!id) return;
    setRunningTriage(true);
    try {
      toast({ title: "Starting MIND® analysis...", description: "Triggering pipeline" });
      const { error } = await supabase.functions.invoke("generate_ai_report", {
        body: { study_id: id },
      });
      if (error) throw error;
      toast({ title: "Pipeline started", description: "MIND® is processing. Results appear in 1–3 minutes." });
      refetch();
      refetchMind();
    } catch (error) {
      console.error("Triage error:", error);
      toast({
        title: "Analysis failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setRunningTriage(false);
    }
  };

  const handleGenerateAIReport = async () => {
    setGenerating(true);
    try {
      toast({ title: "Generating AI report...", description: "This may take a minute" });
      
      const { data, error } = await supabase.functions.invoke("generate_ai_report", {
        body: { study_id: id }
      });
      
      if (error) throw error;
      
      toast({ title: "AI Report generated!", description: "Report is ready for review" });
      refetch();
    } catch (error) {
      console.error("AI generation error:", error);
      toast({
        title: "Generation failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleDownloadReport = async () => {
    setDownloading(true);
    try {
      const report = study?.reports?.[0];
      if (!report) {
        toast({ title: "No report found", variant: "destructive" });
        return;
      }

      if (!report.pdf_path) {
        toast({ title: "Generating PDF...", description: "Please wait" });
        
        const { error: genError } = await supabase.functions.invoke("generate_report_pdf", {
          body: { reportId: report.id }
        });
        
        if (genError) throw new Error(genError.message || "Failed to generate PDF");
        refetch();
        return;
      }

      const { data, error } = await supabase.storage
        .from("eeg-reports")
        .download(report.pdf_path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report-${study.id.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast({ title: "Download started" });
    } catch (error) {
      console.error("Download error:", error);
      toast({
        title: "Download failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setDownloading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !study) {
    return (
      <ErrorPage
        title="Study not found"
        description="This study may have been deleted, or you may not have access to it. If you believe this is an error, contact your clinic administrator."
        actions={[
          { label: "Back to Studies", onClick: () => navigate("/app/studies") },
          { label: "Retry", onClick: () => refetch(), variant: "outline" },
        ]}
      />
    );
  }

  const meta = study.meta as any;
  const patientName = meta?.patient_name || "Unknown Patient";
  const patientId = meta?.patient_id || `ID-${study.id.slice(0, 6).toUpperCase()}`;
  const patientAge = meta?.patient_age;
  const patientGender = meta?.patient_gender;
  const stateConfig = STATE_CONFIG[study.state || "uploaded"] || STATE_CONFIG.uploaded;
  const triageConfig = TRIAGE_STATUS_CONFIG[study.triage_status || "pending"] || TRIAGE_STATUS_CONFIG.pending;
  const report = study.reports?.[0];
  const canonicalRecord = study.canonical_eeg_records?.[0];
  const hasReport = !!report;
  const isSigned = study.state === "signed" || report?.status === "signed";
  const isProcessing = study.triage_status === "processing";
  const canGenerateReport = !hasReport && !isProcessing &&
    (study.state === "uploaded" || study.state === "parsed");
  const canReview = study.state === "ai_draft" || study.state === "in_review" || study.state === "complete" || study.state === "completed";
  const StateIcon = stateConfig.icon;

  return (
    <div className="space-y-6 pb-8">
      {/* Back button */}
      <div className="flex items-center">
        <Button variant="ghost" onClick={() => navigate("/app/studies")} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Studies
        </Button>
      </div>

      {/* Header Card */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-3 flex-wrap">
                <CardTitle className="text-2xl">{patientName}</CardTitle>
                <Badge className={`${stateConfig.color} text-white`}>
                  <StateIcon className="h-3 w-3 mr-1" />
                  {stateConfig.label}
                </Badge>
                <Badge variant={study.sla === "STAT" ? "destructive" : "secondary"}>
                  {study.sla}
                </Badge>
                {(() => {
                  const activeReport = mindReport?.schema_version === "mind.report.v1" ? mindReport
                    : (study.ai_draft_json as any)?.schema_version === "mind.report.v1" ? study.ai_draft_json
                    : null;
                  if (!activeReport) return null;
                  const cls = activeReport.triage?.classification;
                  const conf = activeReport.triage?.confidence;
                  if (!cls || cls === "unknown") return null;
                  return (
                    <Badge className={cls === "abnormal" ? "bg-destructive text-destructive-foreground" : "bg-emerald-500 text-white"}>
                      <Brain className="h-3 w-3 mr-1" />
                      {cls.toUpperCase()}
                      {conf != null && ` ${(conf * 100).toFixed(0)}%`}
                    </Badge>
                  );
                })()}
                {study.sample && (
                  <Badge variant="outline" className="border-amber-500/50 text-amber-600">
                    <FlaskConical className="h-3 w-3 mr-1" />
                    Sample
                  </Badge>
                )}
              </div>
              <CardDescription className="flex items-center gap-2">
                <User className="h-3.5 w-3.5" />
                {patientId}
                {patientAge && ` • ${patientAge}y`}
                {patientGender && `/${patientGender.charAt(0).toUpperCase()}`}
              </CardDescription>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" asChild>
                <Link to={`/app/studies/${study.id}/viewer`}>
                  <Activity className="h-4 w-4 mr-2" />
                  Open Viewer
                </Link>
              </Button>
              
              {/* Run MIND® Analysis — available for all SKUs when I-Plane is configured */}
              {IPLANE_BASE && study.state !== 'signed' && (
                <Button
                  onClick={handleRunAITriage}
                  disabled={runningTriage}
                  className="bg-primary"
                >
                  {runningTriage ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Brain className="h-4 w-4 mr-2" />
                  )}
                  Run MIND® Analysis
                </Button>
              )}
              
              {!isPilot && canGenerateReport && (
                <Button onClick={handleGenerateAIReport} disabled={generating} variant="outline">
                  {generating ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Zap className="h-4 w-4 mr-2" />
                  )}
                  Generate AI Report
                </Button>
              )}
              
              {canReview && (
                <Button asChild>
                  <Link to={`/app/studies/${id}/review`}>
                    <FileSignature className="h-4 w-4 mr-2" />
                    Review & Sign
                  </Link>
                </Button>
              )}
              
              {hasReport && (
                <Button variant="outline" onClick={handleDownloadReport} disabled={downloading}>
                  {downloading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 mr-2" />
                  )}
                  Download Report
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        {/* Processing Progress */}
        {isProcessing && (
          <CardContent className="pt-0">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-blue-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  AI Triage in progress...
                </span>
                <span className="text-muted-foreground">{study.triage_progress || 0}%</span>
              </div>
              <Progress value={study.triage_progress || 0} className="h-2" />
            </div>
          </CardContent>
        )}
      </Card>

      {/* Tabs for different sections */}
      <Tabs defaultValue={(study.ai_draft_json || mindReport) ? "ai-analysis" : "overview"} className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {!isPilot && (
            <TabsTrigger value="report" disabled={!hasReport}>
              Report {hasReport && <CheckCircle2 className="h-3 w-3 ml-1 text-emerald-500" />}
            </TabsTrigger>
          )}
          <TabsTrigger value="ai-analysis">
            MIND® {(study.ai_draft_json || mindReport) && <CheckCircle2 className="h-3 w-3 ml-1 text-emerald-500" />}
          </TabsTrigger>
          {!isPilot && (
            <TabsTrigger value="files">Files ({study.study_files?.length || 0})</TabsTrigger>
          )}
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Patient Information */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <User className="h-4 w-4 text-primary" />
                  Patient Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Name</p>
                    <p className="font-medium">{patientName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">ID</p>
                    <p className="font-medium">{patientId}</p>
                  </div>
                  {patientAge && (
                    <div>
                      <p className="text-xs text-muted-foreground">Age</p>
                      <p className="font-medium">{patientAge} years</p>
                    </div>
                  )}
                  {patientGender && (
                    <div>
                      <p className="text-xs text-muted-foreground">Gender</p>
                      <p className="font-medium">{patientGender}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Study Details */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Stethoscope className="h-4 w-4 text-primary" />
                  Study Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Created</p>
                    <p className="font-medium">{dayjs(study.created_at).format("MMM D, YYYY")}</p>
                    <p className="text-xs text-muted-foreground">{dayjs(study.created_at).format("h:mm A")}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Duration</p>
                    <p className="font-medium">{study.duration_min ? `${study.duration_min} min` : "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Sample Rate</p>
                    <p className="font-medium">{study.srate_hz ? `${study.srate_hz} Hz` : "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Triage Status</p>
                    <p className={`font-medium ${triageConfig.color}`}>{triageConfig.label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Clinic Information */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" />
                  Clinic
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-medium">ENCEPHLIAN</p>
              </CardContent>
            </Card>

            {/* Clinical Indication */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  Clinical Indication
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">{study.indication || "No indication specified"}</p>
              </CardContent>
            </Card>
          </div>

        </TabsContent>

        {/* Report Tab */}
        <TabsContent value="report" className="space-y-4">
          {hasReport ? (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      EEG Analysis Report
                    </CardTitle>
                    <CardDescription>
                      {isSigned ? (
                        <span className="flex items-center gap-1 text-emerald-600">
                          <CheckCircle2 className="h-3 w-3" />
                          Signed {report.signed_at && dayjs(report.signed_at).fromNow()}
                          {report.profiles?.full_name && ` by ${report.profiles.full_name}`}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-amber-600">
                          <Clock className="h-3 w-3" />
                          Draft - {report.status}
                        </span>
                      )}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    {!isSigned && (
                      <Button variant="outline" asChild size="sm">
                        <Link to={`/app/reports/${report.id}`}>
                          <Eye className="h-4 w-4 mr-2" />
                          Edit Report
                        </Link>
                      </Button>
                    )}
                    <Button variant="outline" onClick={handleDownloadReport} disabled={downloading} size="sm">
                      {downloading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {(() => {
                  const content = report.content as any;
                  return (
                    <>
                      {content?.background_activity && (
                        <div>
                          <h4 className="font-medium mb-2 text-sm text-muted-foreground uppercase tracking-wide">
                            Background Activity
                          </h4>
                          <p className="text-sm whitespace-pre-wrap">{content.background_activity}</p>
                        </div>
                      )}
                      
                      {content?.impression && (
                        <>
                          <Separator />
                          <div>
                            <h4 className="font-medium mb-2 text-sm text-muted-foreground uppercase tracking-wide">
                              Impression
                            </h4>
                            <p className="text-sm whitespace-pre-wrap">{content.impression}</p>
                          </div>
                        </>
                      )}

                      {content?.recommendations && (
                        <>
                          <Separator />
                          <div>
                            <h4 className="font-medium mb-2 text-sm text-muted-foreground uppercase tracking-wide">
                              Recommendations
                            </h4>
                            <p className="text-sm whitespace-pre-wrap">{content.recommendations}</p>
                          </div>
                        </>
                      )}

                      {!content?.background_activity && !content?.impression && !content?.recommendations && (
                        <p className="text-center text-muted-foreground py-8">
                          Report content not available
                        </p>
                      )}
                    </>
                  );
                })()}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FileText className="h-12 w-12 text-muted-foreground/30 mb-4" />
                <p className="text-lg font-medium">No report yet</p>
                <p className="text-sm text-muted-foreground mb-4">
                  Generate an AI report to get started
                </p>
                {canGenerateReport && (
                  <Button onClick={handleGenerateAIReport} disabled={generating}>
                    {generating ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Zap className="h-4 w-4 mr-2" />
                    )}
                    Generate AI Report
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* AI Analysis Tab — MIND® Pipeline results */}
        <TabsContent value="ai-analysis">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Brain className="h-4 w-4 text-primary" />
                MIND® Analysis
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Triage · Clean · Seizure · SCORE — clinician interprets
              </p>
            </CardHeader>
            <CardContent>
              {/* Priority: live blob report > cached ai_draft_json > empty state */}
              {mindLoading ? (
                <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm">Loading analysis...</span>
                </div>
              ) : mindReport?.schema_version === "mind.report.v1" ? (
                <MindReportView report={mindReport} studyId={study.id} />
              ) : study.ai_draft_json && (study.ai_draft_json as any).schema_version === "mind.report.v1" ? (
                <MindReportView report={study.ai_draft_json} studyId={study.id} />
              ) : study.ai_draft_json ? (
                // Legacy format (old TriageReportView schema)
                <TriageReportView
                  data={study.ai_draft_json}
                  studyId={study.id}
                  patientAge={patientAge?.toString()}
                  patientGender={patientGender}
                  studyDate={study.created_at ? dayjs(study.created_at).format("YYYY-MM-DD") : undefined}
                />
              ) : (
                <div className="text-center py-10 space-y-3">
                  <Brain className="h-10 w-10 mx-auto text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">
                    No analysis yet.
                    {IPLANE_BASE
                      ? " Click \"Run MIND® Analysis\" to start."
                      : " Upload an EDF file and wait for the pipeline to complete."}
                  </p>
                  {IPLANE_BASE && (
                    <Button onClick={handleRunAITriage} disabled={runningTriage} size="sm">
                      {runningTriage ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Brain className="h-4 w-4 mr-2" />}
                      Run MIND® Analysis
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Files Tab */}
        <TabsContent value="files">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Study Files</CardTitle>
            </CardHeader>
            <CardContent>
              {study.study_files && study.study_files.length > 0 ? (
                <ScrollArea className="h-64">
                  <div className="space-y-2">
                    {study.study_files.map((file: any) => (
                      <div 
                        key={file.id} 
                        className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <FileIcon className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="font-medium text-sm">{file.path.split('/').pop()}</p>
                            <p className="text-xs text-muted-foreground">
                              {file.kind.toUpperCase()}
                              {file.size_bytes && ` • ${(file.size_bytes / 1024 / 1024).toFixed(2)} MB`}
                              {file.created_at && ` • ${dayjs(file.created_at).fromNow()}`}
                            </p>
                          </div>
                        </div>
                        <Badge variant="outline" className="text-xs">{file.kind}</Badge>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <FileIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No files associated with this study</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
