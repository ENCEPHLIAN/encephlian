import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Loader2,
  ArrowLeft,
  RefreshCw,
  Brain,
  Lock,
  Unlock,
  FileText,
  Clock,
  User,
  Building2,
  AlertCircle,
  Play,
  Download,
  Database,
  Activity,
} from "lucide-react";
import { format } from "date-fns";
import { resolveReadApiBase, getReadApiKey } from "@/shared/readApiConfig";
import { Link } from "react-router-dom";

export default function AdminStudyDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: study, isLoading } = useQuery({
    queryKey: ["admin-study", id],
    enabled: !!id,
    queryFn: async () => {
      // admin_get_all_studies returns all studies; filter client-side by id
      const { data, error } = await supabase.rpc("admin_get_all_studies");
      if (error) throw error;
      const found = (data as any[])?.find((s) => s.id === id);
      if (!found) throw new Error("Study not found");
      return found;
    },
  });

  const { data: studyFiles } = useQuery({
    queryKey: ["admin-study-files", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("study_files")
        .select("*")
        .eq("study_id", id);
      if (error) throw error;
      return data;
    },
  });

  const { data: clinic } = useQuery({
    queryKey: ["admin-clinic", study?.clinic_id],
    enabled: !!study?.clinic_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clinics")
        .select("*")
        .eq("id", study!.clinic_id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: reviewEvents } = useQuery({
    queryKey: ["admin-review-events", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("review_events")
        .select("*, profiles:actor(full_name, email)")
        .eq("study_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: pipelineEvents = [] } = useQuery({
    queryKey: ["admin-pipeline-events", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("study_pipeline_events")
        .select("id, created_at, step, status, source, detail, correlation_id")
        .eq("study_id", id!)
        .order("created_at", { ascending: false })
        .limit(120);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Mutations
  const updateStudyMutation = useMutation({
    mutationFn: async (updates: Record<string, any>) => {
      const { error } = await supabase.rpc("admin_update_study", {
        p_study_id: id,
        p_updates: updates,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-study", id] });
      toast.success("Study updated");
    },
    onError: (error: any) => toast.error(error.message),
  });

  const logEventMutation = useMutation({
    mutationFn: async ({ event, payload }: { event: string; payload?: any }) => {
      const { error } = await supabase.rpc("admin_log_event", {
        p_study_id: id,
        p_event: event,
        p_payload: payload || {},
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-review-events", id] });
    },
    onError: (error: any) => toast.error(error.message),
  });

  const handleRerunParse = async () => {
    toast.info("Re-running parse...");
    try {
      const { error } = await supabase.functions.invoke("parse_eeg_study", {
        body: { study_id: id },
      });
      if (error) throw error;
      await logEventMutation.mutateAsync({ event: "admin_rerun_parse" });
      toast.success("Parse triggered");
    } catch (error: any) {
      toast.error(`Parse failed: ${error.message}`);
    }
  };

  const handleRerunCanonicalization = async () => {
    const cplaneBase = (import.meta as any).env?.VITE_CPLANE_BASE as string | undefined;
    if (!cplaneBase) {
      toast.error("C-Plane not configured (VITE_CPLANE_BASE missing)");
      return;
    }
    toast.info("Triggering canonicalization...");
    try {
      const res = await fetch(`${cplaneBase}/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ study_id: id }),
      });
      if (!res.ok) throw new Error(`C-Plane returned ${res.status}`);
      await logEventMutation.mutateAsync({
        event: "admin_rerun_canonicalization",
        payload: { cplane: cplaneBase },
      });
      queryClient.invalidateQueries({ queryKey: ["admin-pipeline-events", id] });
      toast.success("C-Plane processing triggered");
    } catch (err: any) {
      toast.error(`Canonicalization failed: ${err.message}`);
    }
  };

  // Trigger inference via Read API
  const handleRunInference = async () => {
    const studyKey = study?.study_key || id;
    if (!studyKey) {
      toast.error("No study_key defined - cannot call Read API");
      return;
    }

    const base = resolveReadApiBase();
    const key = getReadApiKey();

    toast.info(`Triggering inference on ${base}...`);

    try {
      const res = await fetch(`${base}/studies/${encodeURIComponent(studyKey)}/inference/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(key ? { "X-API-KEY": key } : {}),
        },
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status}: ${body}`);
      }

      const data = await res.json();
      const runId = data.run_id || data.runId || null;

      // Store run_id in Supabase
      if (runId) {
        await supabase
          .from("studies")
          .update({ latest_run_id: runId } as any)
          .eq("id", id);
      }

      await logEventMutation.mutateAsync({
        event: "admin_inference_triggered",
        payload: { run_id: runId },
      });

      queryClient.invalidateQueries({ queryKey: ["admin-study", id] });
      toast.success(`Inference complete. Run ID: ${runId || "unknown"}`);
    } catch (error: any) {
      toast.error(`Inference failed: ${error.message}`);
    }
  };

  // Generate report from Read API data
  const handleGenerateReport = async () => {
    const studyKey = study?.study_key || id;
    if (!studyKey) {
      toast.error("No study_key defined");
      return;
    }

    const base = resolveReadApiBase();
    const key = getReadApiKey();
    const headers: Record<string, string> = key ? { "X-API-KEY": key } : {};

    toast.info("Fetching data for report...");

    try {
      const [metaRes, artifactsRes, annotationsRes, segmentsRes] = await Promise.all([
        fetch(`${base}/studies/${encodeURIComponent(studyKey)}/meta?root=.`, { headers }),
        fetch(`${base}/studies/${encodeURIComponent(studyKey)}/artifacts?root=.`, { headers }).catch(() => null),
        fetch(`${base}/studies/${encodeURIComponent(studyKey)}/annotations?root=.`, { headers }).catch(() => null),
        fetch(`${base}/studies/${encodeURIComponent(studyKey)}/segments?root=.`, { headers }).catch(() => null),
      ]);

      const meta = metaRes.ok ? await metaRes.json() : null;
      const artifacts = artifactsRes?.ok ? await artifactsRes.json() : null;
      const annotations = annotationsRes?.ok ? await annotationsRes.json() : null;
      const segments = segmentsRes?.ok ? await segmentsRes.json() : null;

      // Build report content
      const reportContent = {
        study_id: id,
        study_key: studyKey,
        generated_at: new Date().toISOString(),
        run_id: study?.latest_run_id || segments?.run_id || null,
        meta,
        artifacts,
        annotations,
        segments,
      };

      // Generate simple HTML
      const reportHtml = `<!DOCTYPE html>
<html>
<head>
  <title>EEG Triage Report - ${studyKey}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; }
    h1 { color: #1a1a1a; border-bottom: 2px solid #eee; padding-bottom: 0.5rem; }
    h2 { color: #333; margin-top: 2rem; }
    pre { background: #f5f5f5; padding: 1rem; border-radius: 4px; overflow-x: auto; font-size: 12px; }
    .badge { display: inline-block; padding: 0.25rem 0.5rem; background: #e5e5e5; border-radius: 4px; font-size: 12px; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin: 1rem 0; }
    .meta-item { background: #f9f9f9; padding: 0.5rem; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>EEG Triage Report</h1>
  <div class="meta">
    <div class="meta-item"><strong>Study Key:</strong> ${studyKey}</div>
    <div class="meta-item"><strong>Study ID:</strong> ${id}</div>
    <div class="meta-item"><strong>Run ID:</strong> ${reportContent.run_id || "N/A"}</div>
    <div class="meta-item"><strong>Generated:</strong> ${new Date().toLocaleString()}</div>
  </div>
  
  <h2>Metadata</h2>
  <pre>${JSON.stringify(meta, null, 2)}</pre>
  
  <h2>Artifacts</h2>
  <pre>${JSON.stringify(artifacts, null, 2)}</pre>
  
  <h2>Annotations</h2>
  <pre>${JSON.stringify(annotations, null, 2)}</pre>
  
  <h2>Segments</h2>
  <pre>${JSON.stringify(segments, null, 2)}</pre>
</body>
</html>`;

      // Store in study_reports table
      const { data: userData } = await supabase.auth.getUser();
      await supabase.from("study_reports").insert({
        study_id: id,
        run_id: reportContent.run_id,
        content: reportContent,
        report_html: reportHtml,
        created_by: userData?.user?.id,
      } as any);

      await logEventMutation.mutateAsync({
        event: "admin_report_generated",
        payload: { run_id: reportContent.run_id },
      });

      // Trigger download
      const blob = new Blob([reportHtml], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `triage-report-${studyKey}-${Date.now()}.html`;
      a.click();
      URL.revokeObjectURL(url);

      queryClient.invalidateQueries({ queryKey: ["admin-study", id] });
      toast.success("Report generated and downloaded!");
    } catch (error: any) {
      toast.error(`Report generation failed: ${error.message}`);
    }
  };

  const handleToggleLock = async () => {
    const newValue = !study?.report_locked;
    await updateStudyMutation.mutateAsync({ report_locked: newValue });
    await logEventMutation.mutateAsync({
      event: newValue ? "admin_lock_report" : "admin_unlock_report",
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!study) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <AlertCircle className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">Study not found</p>
        <Button variant="outline" onClick={() => navigate("/admin/studies")}>
          Back to Studies
        </Button>
      </div>
    );
  }

  const meta = study.meta as any;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/admin/studies")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-mono font-bold">Study Detail</h1>
          <p className="text-sm text-muted-foreground font-mono">{id}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Badge variant={study.sla === "STAT" ? "destructive" : "secondary"} className="font-mono">
            {study.sla}
          </Badge>
          <Badge
            variant="secondary"
            className={`font-mono ${
              study.state === "signed"
                ? "bg-green-500/10 text-green-500"
                : study.state === "failed"
                ? "bg-red-500/10 text-red-500"
                : ""
            }`}
          >
            {(study.state || "uploaded").toUpperCase()}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Core Fields */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-mono">Study Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Clinic</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span className="font-mono text-sm">{clinic?.name || "—"}</span>
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Owner</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="font-mono text-sm">{study.owner?.slice(0, 8)}...</span>
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Patient ID</Label>
                  <p className="font-mono text-sm mt-1">{meta?.patient_id || "—"}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Created</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">
                      {format(new Date(study.created_at), "MMM d, yyyy HH:mm")}
                    </span>
                  </div>
                </div>
              </div>

              <Separator />

              <div>
                <Label className="text-xs text-muted-foreground">Uploaded File</Label>
                <p className="font-mono text-sm mt-1 break-all">
                  {study.uploaded_file_path || "—"}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Files */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-mono">Associated Files</CardTitle>
              <CardDescription>{studyFiles?.length || 0} files</CardDescription>
            </CardHeader>
            <CardContent>
              {studyFiles && studyFiles.length > 0 ? (
                <div className="space-y-2">
                  {studyFiles.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center justify-between py-2 px-3 bg-muted/30 rounded"
                    >
                      <div className="flex items-center gap-3">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="font-mono text-sm">{file.kind}</p>
                          <p className="text-xs text-muted-foreground break-all">{file.path}</p>
                        </div>
                      </div>
                      {file.size_bytes && (
                        <span className="text-xs text-muted-foreground">
                          {Math.round(file.size_bytes / 1024)} KB
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-4">No files found</p>
              )}
            </CardContent>
          </Card>

          {/* Pipeline trace (infra) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-mono">Pipeline trace</CardTitle>
              <CardDescription>Edge → C-Plane → I-Plane append-only log</CardDescription>
            </CardHeader>
            <CardContent>
              {pipelineEvents.length === 0 ? (
                <p className="text-muted-foreground text-center py-4 text-sm">No pipeline rows</p>
              ) : (
                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                  {pipelineEvents.map((ev: any) => (
                    <div key={ev.id} className="border-b border-border/40 pb-2 last:border-0 text-xs font-mono">
                      <div className="flex flex-wrap gap-2 items-center text-muted-foreground">
                        <span>{format(new Date(ev.created_at), "MMM d HH:mm:ss")}</span>
                        <Badge variant={ev.status === "error" ? "destructive" : "outline"}>{ev.status}</Badge>
                        <Badge variant="secondary">{ev.source}</Badge>
                      </div>
                      <p className="mt-1 break-all">{ev.step}</p>
                      {ev.correlation_id ? (
                        <p className="text-[10px] text-muted-foreground">corr {ev.correlation_id}</p>
                      ) : null}
                      {ev.detail && Object.keys(ev.detail).length > 0 ? (
                        <pre className="mt-1 bg-muted/40 rounded p-2 max-h-24 overflow-auto whitespace-pre-wrap">
                          {JSON.stringify(ev.detail, null, 2)}
                        </pre>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Events Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-mono">Events Timeline</CardTitle>
              <CardDescription>Chronological processing events</CardDescription>
            </CardHeader>
            <CardContent>
              {reviewEvents && reviewEvents.length > 0 ? (
                <div className="space-y-3">
                  {reviewEvents.map((event) => (
                    <div key={event.id} className="flex items-start gap-3 pb-3 border-b last:border-0">
                      <div className="h-2 w-2 mt-2 rounded-full bg-primary" />
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <Badge variant="outline" className="font-mono text-xs">
                            {event.event}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(event.created_at), "MMM d, HH:mm:ss")}
                          </span>
                        </div>
                        {event.profiles && (
                          <p className="text-xs text-muted-foreground mt-1">
                            by {(event.profiles as any)?.full_name || (event.profiles as any)?.email}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-4">No events recorded</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Actions Panel */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-mono">Actions</CardTitle>
              <CardDescription>Admin control panel</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Lock/Unlock */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {study.report_locked ? (
                    <Lock className="h-4 w-4 text-destructive" />
                  ) : (
                    <Unlock className="h-4 w-4 text-muted-foreground" />
                  )}
                  <Label className="text-sm">Report Locked</Label>
                </div>
                <Switch
                  checked={study.report_locked || false}
                  onCheckedChange={handleToggleLock}
                />
              </div>

              <Separator />

              {/* Re-run Actions */}
              <div className="space-y-3">
                <Button
                  variant="outline"
                  className="w-full justify-start font-mono"
                  onClick={handleRerunParse}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Re-run Parse
                </Button>

                <Button
                  variant="outline"
                  className="w-full justify-start font-mono"
                  onClick={handleRerunCanonicalization}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Re-run Canonicalization
                </Button>

                <Button
                  variant="default"
                  className="w-full justify-start font-mono"
                  onClick={handleRunInference}
                >
                  <Play className="h-4 w-4 mr-2" />
                  Run Inference
                </Button>

                <Button
                  variant="outline"
                  className="w-full justify-start font-mono"
                  asChild
                >
                  <Link to={`/app/eeg-viewer?studyId=${id}`} target="_blank">
                    <Activity className="h-4 w-4 mr-2" />
                    Open EEG Viewer
                  </Link>
                </Button>

                <Button
                  variant="outline"
                  className="w-full justify-start font-mono"
                  onClick={handleGenerateReport}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Generate Report
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Source Chip (for viewer) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-mono">Data Source</CardTitle>
            </CardHeader>
            <CardContent>
              <Badge variant="outline" className="font-mono">
                {studyFiles?.some((f) => f.kind === "canonical_tensor")
                  ? "canonical_v1"
                  : "raw_edf_fallback"}
              </Badge>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
