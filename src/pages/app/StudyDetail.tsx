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
  Brain,
  ListOrdered,
  RefreshCw,
} from "lucide-react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import MetricsView from "@/components/report/MetricsView";
import AnalysisView from "@/components/report/AnalysisView";
import ErrorPage from "@/components/ErrorPage";
import { toast } from "@/components/ui/sonner";
import { useState, useEffect, useRef, Component, type ReactNode } from "react";
import { useSku } from "@/hooks/useSku";
import { useUserSession } from "@/contexts/UserSessionContext";
import { SkuGate } from "@/components/SkuGate";
import { fetchJson } from "@/shared/readApiClient";
import { formatStudySourceLine } from "@/lib/studySourceFile";
import { getStudyDocumentTitle, getStudyHandle, getStudyListTitle, type StudyLike } from "@/lib/studyDisplay";
import { useStudyBreadcrumb } from "@/contexts/StudyBreadcrumbContext";
import { StudyFlowProgress } from "@/components/study/StudyFlowProgress";
import { studyTriageIsPaid } from "@/shared/tokenEconomy";
import { PilotInlineSla } from "@/components/pilot/PilotInlineSla";
import type { PilotStudy } from "@/hooks/usePilotData";
import SlaSelectionModal from "@/components/dashboard/SlaSelectionModal";
import { PatientMetaEditor } from "@/components/study/PatientMetaEditor";

dayjs.extend(relativeTime);

class ReportErrorBoundary extends Component<{ children: ReactNode }, { crashed: boolean }> {
  state = { crashed: false };
  static getDerivedStateFromError() { return { crashed: true }; }
  render() {
    if (this.state.crashed) {
      return (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Report failed to render. Try refreshing or re-generating the analysis.
        </div>
      );
    }
    return this.props.children;
  }
}

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
  failed: { label: "Failed", color: "bg-red-500", icon: AlertCircle },
  completed: { label: "Completed", color: "bg-cyan-500", icon: CheckCircle2 },
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
  const { isAuthenticated } = useUserSession();
  const studyRtRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const prevStateRef = useRef<string | null>(null);

  const { can, capabilities, isPilot } = useSku();
  const { setActiveStudyLabel } = useStudyBreadcrumb();
  const queryClient = useQueryClient();
  const [downloading, setDownloading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [runningTriage, setRunningTriage] = useState(false);
  const [slaModalOpen, setSlaModalOpen] = useState(false);
  const [localMeta, setLocalMeta] = useState<any>(null);

  const { data: wallet } = useQuery({
    queryKey: ["wallet-balance"],
    queryFn: async () => {
      const { data } = await supabase.from("wallets").select("tokens").maybeSingle();
      return data || { tokens: 0 };
    },
    enabled: isAuthenticated,
    staleTime: 30_000,
  });
  const tokenBalance = wallet?.tokens ?? 0;

  const IPLANE_BASE = import.meta.env.VITE_IPLANE_BASE as string | undefined;

  const { data: pipelineEvents = [] } = useQuery({
    queryKey: ["study-pipeline-events", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("study_pipeline_events")
        .select("id, created_at, step, status, source, correlation_id")  // dropped 'detail' (JSON) — pulled on demand only
        .eq("study_id", id!)
        .order("created_at", { ascending: false })
        .limit(20);  // was 80 — most recent events only
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!id,
  });

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
    // Poll only while pipeline is actively running — awaiting_sla/pending change only on user action
    refetchInterval: (query) => {
      const row = query.state.data as { state?: string; triage_status?: string } | undefined;
      if (!row) return false;
      if (row.triage_status === "processing") return 5_000;
      const state = row.state;
      return state === "processing" || state === "uploaded" ? 8_000 : false;
    },
  });

  // Live study row → progress bar and actions update without full page refresh
  useEffect(() => {
    if (!id || !isAuthenticated) return;
    if (studyRtRef.current) return;

    let t: ReturnType<typeof setTimeout> | null = null;
    const ch = supabase
      .channel(`study-detail-rt-${id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "study_pipeline_events", filter: `study_id=eq.${id}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["study-pipeline-events", id] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "studies", filter: `id=eq.${id}` },
        () => {
          if (t) clearTimeout(t);
          t = setTimeout(() => {
            void queryClient.invalidateQueries({ queryKey: ["study-detail", id] });
            void queryClient.invalidateQueries({ queryKey: ["study", id] });
            void queryClient.invalidateQueries({ queryKey: ["mind-report", id] });
            void queryClient.invalidateQueries({ queryKey: ["pilot-studies"] });
            void queryClient.invalidateQueries({ queryKey: ["dashboard-studies"] });
            void queryClient.invalidateQueries({ queryKey: ["study-pipeline-events", id] });
          }, 100);
        },
      )
      .subscribe();

    studyRtRef.current = ch;
    return () => {
      if (t) clearTimeout(t);
      if (studyRtRef.current) {
        supabase.removeChannel(studyRtRef.current);
        studyRtRef.current = null;
      }
    };
  }, [id, isAuthenticated, queryClient]);

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
    // Poll while pipeline is writing I-Plane blob; stop once report arrives
    refetchInterval: (query) => {
      if (query.state.data) return false;
      const row = queryClient.getQueryData(["study-detail", id]) as
        | { state?: string; triage_status?: string }
        | undefined;
      if (!row) return false;
      if (row.triage_status === "processing") return 8_000;
      const state = row.state;
      if (state === "uploaded" || state === "processing" || state === "ai_draft") return 10_000;
      return false;
    },
  });

  useEffect(() => {
    if (!study) {
      setActiveStudyLabel(null);
      return;
    }
    const label = getStudyListTitle(study as StudyLike);
    setActiveStudyLabel(label);
    const prevTitle = document.title;
    document.title = getStudyDocumentTitle(study as StudyLike);
    return () => {
      setActiveStudyLabel(null);
      document.title = prevTitle;
    };
  }, [study, setActiveStudyLabel]);

  // Keep localMeta in sync with the query result (realtime / refetch)
  useEffect(() => { setLocalMeta(study?.meta ?? null); }, [study?.meta]);

  // Pipeline state-change notifications
  useEffect(() => {
    if (!study) return;
    const prev = prevStateRef.current;
    prevStateRef.current = study.state;
    if (!prev || prev === study.state) return;

    if (study.state === "ai_draft" && prev !== "ai_draft") {
      toast.success("Analysis complete", {
        description: "Recording has been processed. Ready for physician review.",
        action: {
          label: "Review & Sign →",
          onClick: () => navigate(`/app/studies/${id}/review`),
        },
        duration: 10_000,
      });
    }
    if (study.state === "signed" && prev !== "signed") {
      toast.success("Report signed", {
        description: "The signed report is now finalized.",
        duration: 5_000,
      });
    }
    if (study.state === "failed" && prev !== "failed") {
      toast.error("Pipeline error", {
        description: "Processing failed. Check the pipeline log below and retry.",
        duration: 8_000,
      });
    }
  }, [study?.state, id, navigate]);

  // Re-trigger the full C-Plane → I-Plane pipeline via edge function
  const handleRunAITriage = async () => {
    if (!id) return;
    setRunningTriage(true);
    const body: Record<string, string> = { study_id: id };
    if (!isPilot && study?.sla && study.sla !== "pending") body.sla = study.sla;

    try {
      await toast.promise(
        (async () => {
          const { error } = await supabase.functions.invoke("generate_ai_report", { body });
          if (error) throw error;
          void refetch();
          void refetchMind();
          void queryClient.invalidateQueries({ queryKey: ["study-pipeline-events", id] });
        })(),
        {
          loading: "Starting analysis…",
          success: "Pipeline started — results appear in 1–3 minutes",
          error: (err: Error) => err?.message || "Analysis failed to start",
        }
      );
    } finally {
      setRunningTriage(false);
    }
  };

  const handleGenerateAIReport = async () => {
    setGenerating(true);
    try {
      await toast.promise(
        (async () => {
          const { error } = await supabase.functions.invoke("generate_ai_report", {
            body: { study_id: id },
          });
          if (error) throw error;
          void refetch();
          void queryClient.invalidateQueries({ queryKey: ["study-pipeline-events", id] });
        })(),
        {
          loading: "Generating report…",
          success: "Report generated — ready for review",
          error: (err: Error) => err?.message || "Generation failed",
        }
      );
    } finally {
      setGenerating(false);
    }
  };

  const handleDownloadReport = async () => {
    setDownloading(true);
    const tid = toast.loading("Preparing report…");
    try {
      let report = study?.reports?.[0] as any;

      // RLS on the join may block — try a direct fetch by study_id
      if (!report) {
        const { data } = await supabase
          .from("reports")
          .select("id, pdf_path, content, signed_at, created_at, status, profiles:interpreter(full_name, credentials)")
          .eq("study_id", id!)
          .maybeSingle();
        if (data) report = data;
      }

      let pdfPath = report?.pdf_path ?? null;

      // Try server-side PDF generation if we have a report but no pdf_path
      if (report && !pdfPath) {
        const { error: genError } = await supabase.functions.invoke("generate_report_pdf", {
          body: { reportId: report.id },
        });
        if (!genError) {
          const { data: fresh } = await supabase.from("reports").select("pdf_path").eq("id", report.id).single();
          pdfPath = fresh?.pdf_path ?? null;
          if (pdfPath) queryClient.invalidateQueries({ queryKey: ["study-detail", id] });
        }
      }

      // Download from storage if server-side PDF exists
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
      const content = (report?.content as any) ?? (study?.ai_draft_json as any);
      if (content) {
        const aiDraft = study?.ai_draft_json as any;
        const meta = study.meta as any;

        const [{ pdf: renderPDF }, { ReportDocument }] = await Promise.all([
          import("@react-pdf/renderer"),
          import("@/components/report/ReportPDF"),
        ]);

        const blob = await renderPDF(
          ReportDocument({
            patientName: patientName || "Unknown Patient",
            patientId: patientId || undefined,
            studyDate: dayjs(study.created_at).format("MMMM D, YYYY"),
            signedDate: dayjs(report?.signed_at || report?.created_at || new Date()).format("MMMM D, YYYY"),
            studyId: study.id,
            content,
            interpreterName: (report?.profiles as any)?.full_name,
            interpreterCredentials: (report?.profiles as any)?.credentials,
            aiClassification: aiDraft?.triage?.classification ?? aiDraft?.classification,
            aiConfidence: aiDraft?.triage?.confidence ?? aiDraft?.triage_confidence,
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
      console.error("Download error:", error);
      toast.dismiss(tid);
      toast.error("Download failed", {
        description: error instanceof Error ? error.message : "Unknown error",
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

  const meta = localMeta as any;

  const isBlankName = (v: string | null | undefined) =>
    !v || v === "Pending" || v === "X" || v.trim() === "";
  const isBlankId = (v: string | null | undefined) =>
    !v || v === "Pending" || v.startsWith("PT-") || v === "X" || v.trim() === "";

  const patientName   = !isBlankName(meta?.patient_name)
    ? meta.patient_name
    : meta?.original_filename
      ? meta.original_filename.replace(/\.[^.]+$/, "")
      : null;
  const patientId     = !isBlankId(meta?.patient_id) ? meta.patient_id : null;
  const patientAge    = meta?.patient_age;
  const patientGender = meta?.patient_gender ?? meta?.patient_sex;
  const sourceFileLine = formatStudySourceLine(meta, study.original_format ?? null);
  const stateConfig = STATE_CONFIG[study.state || "uploaded"] || STATE_CONFIG.uploaded;
  const triageConfig = TRIAGE_STATUS_CONFIG[study.triage_status || "pending"] || TRIAGE_STATUS_CONFIG.pending;
  const report = study.reports?.[0];
  const canonicalRecord = study.canonical_eeg_records?.[0];
  const hasReport = !!report || study.state === "signed";
  const isSigned = study.state === "signed" || report?.status === "signed";
  const isProcessing = study.triage_status === "processing";
  const canGenerateReport = !hasReport && !isProcessing &&
    (study.state === "uploaded" || study.state === "parsed" || study.state === "ai_draft") &&
    !study.ai_draft_json;
  const triagePaid = studyTriageIsPaid(study);
  // Pilot users must pay (tokens) before analysis runs. Internal users are never gated.
  const gateTriageActions = isPilot && !triagePaid && study.state !== "signed";
  const lastPipelineError = pipelineEvents.find((e: any) => e.status === "error");
  const canReview =
    (!isPilot || triagePaid) &&
    (study.triage_status === "completed" ||
      study.state === "ai_draft" ||
      study.state === "in_review" ||
      study.state === "complete" ||
      study.state === "completed");
  const StateIcon = stateConfig.icon;
  const studyHandle = getStudyHandle(study);
  const defaultStudyTab =
    gateTriageActions ? "overview" : study.ai_draft_json || mindReport ? "ai-analysis" : "overview";

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
                <CardTitle className="text-2xl">
                  {patientName ?? <span className="font-normal text-lg text-muted-foreground italic">No patient name</span>}
                </CardTitle>
                <Badge variant="outline" className="font-mono text-xs font-normal shrink-0" title="Stable study reference">
                  {studyHandle}
                </Badge>
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
                  const cls  = activeReport.triage?.classification;
                  const conf = activeReport.triage?.confidence;
                  const qflag = activeReport.triage?.quality_flag;
                  if (!cls || cls === "unknown") return null;
                  if (cls === "inconclusive" || qflag) {
                    return (
                      <Badge className="bg-amber-500 text-white" title={activeReport.triage?.quality_detail ?? ""}>
                        <Brain className="h-3 w-3 mr-1" />
                        INCONCLUSIVE
                      </Badge>
                    );
                  }
                  return (
                    <Badge className={cls === "abnormal" ? "bg-destructive text-destructive-foreground" : "bg-emerald-500 text-white"}>
                      <Brain className="h-3 w-3 mr-1" />
                      {cls.toUpperCase()}
                      {conf != null && conf >= 0.65 && ` ${(conf * 100).toFixed(0)}%`}
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
              <CardDescription className="flex items-center gap-2 flex-wrap">
                <User className="h-3.5 w-3.5 shrink-0" />
                {patientId
                  ? <span className="font-mono">{patientId}</span>
                  : <span className="italic text-muted-foreground/60">No patient ID</span>}
                {patientAge && <span>• {patientAge}y</span>}
                {patientGender && patientGender !== "X" && <span>/ {patientGender === "M" ? "Male" : patientGender === "F" ? "Female" : patientGender}</span>}
                {meta?.indication && <span className="text-muted-foreground/80">• {meta.indication}</span>}
                <PatientMetaEditor
                  studyId={study.id}
                  meta={meta ?? {}}
                  onSaved={setLocalMeta}
                  compact
                />
              </CardDescription>
              {sourceFileLine && (
                <p className="text-sm text-muted-foreground flex items-center gap-2 pt-0.5">
                  <FileIcon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate" title={sourceFileLine}>{sourceFileLine}</span>
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" asChild>
                <Link to={`/app/studies/${study.id}/viewer`}>
                  <Activity className="h-4 w-4 mr-2" />
                  Open Viewer
                </Link>
              </Button>
              
              {/* Run Analysis — opens SLA modal when not yet paid */}
              {IPLANE_BASE && study.state !== "signed" && (
                <Button
                  onClick={gateTriageActions ? () => setSlaModalOpen(true) : handleRunAITriage}
                  disabled={runningTriage}
                  className="bg-primary"
                >
                  {runningTriage ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Brain className="h-4 w-4 mr-2" />
                  )}
                  {gateTriageActions ? "Select Analysis Priority" : "Run Analysis"}
                </Button>
              )}
              
              {!isPilot && canGenerateReport && (
                <Button
                  onClick={handleGenerateAIReport}
                  disabled={generating || gateTriageActions}
                  variant="outline"
                  title={gateTriageActions ? "Select analysis priority first." : undefined}
                >
                  {generating ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Zap className="h-4 w-4 mr-2" />
                  )}
                  Generate Report
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
                <Button
                  variant="outline"
                  onClick={handleDownloadReport}
                  disabled={downloading || gateTriageActions}
                  title={gateTriageActions ? "Available after analysis priority is selected and processing completes." : undefined}
                >
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
                  Processing...
                </span>
                <span className="text-muted-foreground">{study.triage_progress || 0}%</span>
              </div>
              <Progress value={study.triage_progress || 0} className="h-2" />
            </div>
          </CardContent>
        )}
      </Card>

      <StudyFlowProgress study={study} isPilot={isPilot} />

      {/* Signal Analysis Pipeline — architecture indicator */}
      {(study.ai_draft_json || study.triage_status === "completed") && (
        <Card className="border-border/60">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-3">
              <Brain className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Signal Analysis Pipeline
                  </p>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] bg-primary/15 text-primary border border-primary/30 rounded px-1.5 py-0.5 font-mono font-semibold">
                      MIND-Triage v3
                    </span>
                    <span className="text-[9px] text-muted-foreground/60">AUC 85.7%</span>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {/* Classification result */}
                  <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium">Classification</p>
                      <p className="text-[10px] text-muted-foreground">
                        {(() => {
                          const r = study.ai_draft_json as any;
                          const cls = r?.classification ?? r?.triage?.classification;
                          const conf = r?.triage_confidence ?? r?.triage?.confidence;
                          if (!cls || cls === "unknown") return "Unclassified";
                          const confStr = typeof conf === "number" && conf >= 0.5 ? ` · ${Math.round(conf * 100)}% confidence` : "";
                          return `${cls.charAt(0).toUpperCase() + cls.slice(1)}${confStr}`;
                        })()}
                      </p>
                    </div>
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  </div>

                  {/* Feature pipeline info */}
                  <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-blue-400 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium">Feature Pipeline</p>
                      <p className="text-[10px] text-muted-foreground">
                        241-dim · ESF 19ch + raw amplitude
                      </p>
                    </div>
                    <CheckCircle2 className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                  </div>

                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {lastPipelineError && (
        <Alert className="border-destructive/40 bg-destructive/5">
          <AlertCircle className="h-4 w-4 text-destructive" />
          <AlertTitle className="text-destructive">Pipeline error — {lastPipelineError.step}</AlertTitle>
          <AlertDescription className="text-sm flex flex-col gap-2">
            <span>{lastPipelineError.detail ? JSON.stringify(lastPipelineError.detail) : "An error occurred during processing."}</span>
            <Button
              size="sm"
              variant="destructive"
              className="self-start"
              onClick={handleRunAITriage}
              disabled={runningTriage}
            >
              {runningTriage ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1.5" />}
              Retry pipeline
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {gateTriageActions && (
        <Alert className="border-amber-500/40 bg-amber-500/5">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-900 dark:text-amber-100">Analysis not started</AlertTitle>
          <AlertDescription className="text-sm">
            {isPilot ? (
              <div className="flex flex-col gap-3 mt-1">
                <span>Choose a triage priority to start AI analysis. Tokens are charged now.</span>
                <PilotInlineSla
                  study={study as unknown as PilotStudy}
                  tokenBalance={tokenBalance}
                  onNeedTokens={() => navigate("/app/wallet")}
                  onStarted={() => {
                    queryClient.invalidateQueries({ queryKey: ["study-detail", id] });
                    queryClient.invalidateQueries({ queryKey: ["pilot-studies"] });
                  }}
                />
              </div>
            ) : (
              <div className="flex flex-col gap-3 mt-1">
                <span>Select Standard (12–24 h) or Priority (30–90 min) to start analysis.</span>
                <Button
                  size="sm"
                  className="self-start"
                  onClick={() => setSlaModalOpen(true)}
                >
                  <Brain className="h-3.5 w-3.5 mr-1.5" />
                  Select Analysis Priority
                </Button>
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Tabs for different sections */}
      <Tabs key={study.id} defaultValue={defaultStudyTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {!isPilot && (
            <TabsTrigger value="report" disabled={!hasReport || gateTriageActions}>
              Report {hasReport && <CheckCircle2 className="h-3 w-3 ml-1 text-emerald-500" />}
            </TabsTrigger>
          )}
          <TabsTrigger value="ai-analysis" disabled={gateTriageActions}>
            Analysis {(study.ai_draft_json || mindReport) && <CheckCircle2 className="h-3 w-3 ml-1 text-emerald-500" />}
          </TabsTrigger>
          {!isPilot && (
            <TabsTrigger value="files">Files ({study.study_files?.length || 0})</TabsTrigger>
          )}
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          {!isPilot ? (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ListOrdered className="h-4 w-4 text-primary" />
                Pipeline activity
              </CardTitle>
              <CardDescription>
                Append-only trace from Edge, C-Plane, and I-Plane. Correlation IDs group one upload with its
                downstream steps.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pipelineEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No pipeline events yet. They appear after you upload and processing starts.
                </p>
              ) : (
                <ScrollArea className="h-[min(520px,60vh)] pr-4">
                  <div className="relative pl-6">
                    {/* Vertical timeline line */}
                    <div className="absolute left-[9px] top-2 bottom-2 w-px bg-border" />
                    <ul className="space-y-0">
                      {pipelineEvents.map((ev: any, idx: number) => {
                        const isError = ev.status === "error";
                        const isSuccess = ev.status === "ok" || ev.status === "completed" || ev.status === "done";
                        const isLatest = idx === 0;
                        return (
                          <li key={ev.id} className="relative pb-4 last:pb-0">
                            {/* Timeline dot */}
                            <div className={`absolute -left-6 top-1.5 h-[11px] w-[11px] rounded-full border-2 ${
                              isError ? "bg-red-500 border-red-300" :
                              isSuccess ? "bg-emerald-500 border-emerald-300" :
                              isLatest ? "bg-primary border-primary/50 ring-2 ring-primary/20" :
                              "bg-muted border-border"
                            }`} />
                            <div className="ml-2">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-[11px] text-muted-foreground font-mono tabular-nums">
                                  {dayjs(ev.created_at).format("HH:mm:ss")}
                                </span>
                                <Badge
                                  variant={isError ? "destructive" : isSuccess ? "secondary" : "outline"}
                                  className={`text-[10px] h-4 px-1.5 ${isSuccess ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" : ""}`}
                                >
                                  {ev.status}
                                </Badge>
                                <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-mono">
                                  {ev.source}
                                </Badge>
                              </div>
                              <p className="mt-0.5 text-xs font-medium">{ev.step}</p>
                              {ev.detail && Object.keys(ev.detail).length > 0 && (
                                <pre className="mt-1 text-[11px] bg-muted/50 rounded p-1.5 overflow-x-auto max-h-20 whitespace-pre-wrap text-muted-foreground">
                                  {JSON.stringify(ev.detail, null, 2)}
                                </pre>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
          ) : null}

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
                <p className="font-medium">{(study as any).clinics?.name || "—"}</p>
                {(study as any).clinics?.city && (
                  <p className="text-xs text-muted-foreground mt-0.5">{(study as any).clinics.city}</p>
                )}
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
          {hasReport && report ? (
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
          ) : hasReport ? (
            /* Study is signed but the reports join was blocked by RLS — show download-only view */
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
                <CheckCircle2 className="h-12 w-12 text-emerald-500" />
                <div className="text-center">
                  <p className="text-lg font-medium">Report signed</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    The signed report is ready. Click download to retrieve it.
                  </p>
                </div>
                <Button onClick={handleDownloadReport} disabled={downloading}>
                  {downloading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 mr-2" />
                  )}
                  Download Report
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FileText className="h-12 w-12 text-muted-foreground/30 mb-4" />
                <p className="text-lg font-medium">No report yet</p>
                <p className="text-sm text-muted-foreground mb-4">
                  Generate a report to get started
                </p>
                {canGenerateReport && (
                  <Button onClick={handleGenerateAIReport} disabled={generating || gateTriageActions}>
                    {generating ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Zap className="h-4 w-4 mr-2" />
                    )}
                    Generate Report
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Analysis Tab — Pipeline results */}
        <TabsContent value="ai-analysis">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Brain className="h-4 w-4 text-primary" />
                Analysis
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Triage · Clean · Seizure · SCORE — clinician interprets
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* ── Channel mapping quality warning ── */}
              {(() => {
                const activeReport = mindReport?.schema_version === "mind.report.v1" ? mindReport
                  : (study.ai_draft_json as any)?.schema_version === "mind.report.v1" ? study.ai_draft_json
                  : null;
                if (!activeReport) return null;
                const triage = activeReport.triage || {};
                const qflag = triage.quality_flag;
                const validCh = triage.valid_channels;
                const totalCh = triage.total_channels;
                if (!qflag) return null;

                const messages: Record<string, { title: string; body: string }> = {
                  insufficient_channels: {
                    title: "Insufficient channel mapping",
                    body: `Only ${validCh ?? "?"} of ${totalCh ?? 19} EEG channels could be mapped from this file. The input montage may be bipolar or use non-standard labels. The AI result is not reliable — manual review is required.`,
                  },
                  low_confidence: {
                    title: "Low model confidence",
                    body: `Model confidence was ${triage.confidence != null ? `${(triage.confidence * 100).toFixed(0)}%` : "below threshold"} — below the 65% minimum for a reliable classification. The recording was processed but results should not be used clinically without manual review.`,
                  },
                  nan_in_features: {
                    title: "Signal quality issue",
                    body: "Feature extraction encountered non-finite values, likely due to missing or corrupted channels. Results are unreliable.",
                  },
                  heuristic_fallback: {
                    title: "Heuristic model (no ONNX)",
                    body: "The ONNX model was not loaded. A simple spectral heuristic was used — not suitable for clinical use.",
                  },
                };
                const msg = messages[qflag] ?? { title: "Quality issue", body: triage.quality_detail ?? "Results may not be reliable." };

                return (
                  <Alert variant="destructive" className="border-amber-500/50 bg-amber-500/8 text-amber-900 dark:text-amber-200">
                    <AlertCircle className="h-4 w-4 !text-amber-600" />
                    <AlertTitle className="text-amber-800 dark:text-amber-300">{msg.title}</AlertTitle>
                    <AlertDescription className="text-amber-700 dark:text-amber-400 text-sm">
                      {msg.body}
                      {validCh != null && totalCh != null && qflag === "insufficient_channels" && (
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-xs font-mono">
                            {validCh}/{totalCh} channels valid
                          </span>
                          <div className="flex-1 h-1.5 rounded-full bg-amber-200/50 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-amber-500"
                              style={{ width: `${Math.round((validCh / totalCh) * 100)}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </AlertDescription>
                  </Alert>
                );
              })()}

              {gateTriageActions ? (
                <div className="text-center py-10 space-y-2 text-muted-foreground text-sm">
                  <p>Analysis opens after you start triage from Studies (token charge applies there).</p>
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/app/studies">Back to Studies</Link>
                  </Button>
                </div>
              ) : mindLoading ? (
                <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm">Loading analysis...</span>
                </div>
              ) : mindReport?.schema_version === "mind.report.v1" ? (
                <ReportErrorBoundary>
                  <AnalysisView report={mindReport} studyId={study.id} />
                </ReportErrorBoundary>
              ) : study.ai_draft_json && (study.ai_draft_json as any).schema_version === "mind.report.v1" ? (
                <ReportErrorBoundary>
                  <AnalysisView report={study.ai_draft_json} studyId={study.id} />
                </ReportErrorBoundary>
              ) : study.ai_draft_json ? (
                // Legacy format (old MetricsView schema)
                <MetricsView
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
                      ? " Click \"Run Analysis\" above to start."
                      : " Upload an EDF file and wait for the pipeline to complete."}
                  </p>
                  {IPLANE_BASE && (
                    <Button
                      onClick={gateTriageActions ? () => setSlaModalOpen(true) : handleRunAITriage}
                      disabled={runningTriage}
                      size="sm"
                    >
                      {runningTriage ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Brain className="h-4 w-4 mr-2" />}
                      {gateTriageActions ? "Select Analysis Priority" : "Run Analysis"}
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

      {study && (
        <SlaSelectionModal
          open={slaModalOpen}
          onOpenChange={setSlaModalOpen}
          study={study as any}
          tokenBalance={tokenBalance}
          isPilot={isPilot}
          onInsufficientTokens={() => {
            setSlaModalOpen(false);
            navigate("/app/wallet");
          }}
        />
      )}
    </div>
  );
}
