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
} from "lucide-react";
import { format } from "date-fns";

export default function AdminStudyDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: study, isLoading } = useQuery({
    queryKey: ["admin-study", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc("admin_get_all_studies")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
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
    // Stub - placeholder for Azure endpoint
    toast.info("Canonicalization triggered (stub)");
    await logEventMutation.mutateAsync({
      event: "admin_rerun_canonicalization",
      payload: { status: "stub_triggered" },
    });
    toast.success("Canonicalization event logged (Azure endpoint TODO)");
  };

  const handleRerunInference = async () => {
    // Stub - placeholder for Azure inference
    toast.info("Inference triggered (stub)");
    await logEventMutation.mutateAsync({
      event: "admin_rerun_inference",
      payload: { status: "stub_triggered" },
    });
    toast.success("Inference event logged (Azure endpoint TODO)");
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
                  <Badge variant="secondary" className="ml-auto text-[10px]">
                    STUB
                  </Badge>
                </Button>

                <Button
                  variant="outline"
                  className="w-full justify-start font-mono"
                  onClick={handleRerunInference}
                >
                  <Brain className="h-4 w-4 mr-2" />
                  Re-run Inference
                  <Badge variant="secondary" className="ml-auto text-[10px]">
                    STUB
                  </Badge>
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
