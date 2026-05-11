import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { 
  Loader2, 
  FileText, 
  Download, 
  ArrowLeft, 
  CheckCircle2, 
  Clock, 
  User, 
  Calendar,
  Activity,
  Edit,
  Lock,
  Send
} from "lucide-react";
import dayjs from "dayjs";
import { toast } from "sonner";
import { getPatientLabel } from "@/lib/studyDisplay";

type Report = {
  id: string;
  study_id: string;
  status: string;
  created_at: string;
  signed_at: string | null;
  pdf_path: string | null;
  interpreter: string | null;
  content: any;
  studies?: {
    id: string;
    sla: string;
    meta: any;
    duration_min: number | null;
    indication: string | null;
    clinics?: { name: string } | null;
  } | null;
  profiles?: {
    full_name: string | null;
    credentials: string | null;
  } | null;
};

export default function ReportDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState<any>(null);

  const { data: report, isLoading } = useQuery({
    queryKey: ["report-detail", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reports")
        .select(`
          id, study_id, status, created_at, signed_at, pdf_path, interpreter, content,
          studies(id, sla, meta, duration_min, indication, clinics(name)),
          profiles:interpreter(full_name, credentials)
        `)
        .eq("id", id)
        .single();
      
      if (error) throw error;
      return data as Report;
    },
    enabled: !!id,
  });

  const signMutation = useMutation({
    mutationFn: async () => {
      if (!report?.study_id) throw new Error("No study linked to this report");
      const { data, error } = await supabase.functions.invoke("sign_report", {
        body: {
          studyId: report.study_id,
          reportContent: isEditing ? editedContent : report.content,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Report signed successfully");
      queryClient.invalidateQueries({ queryKey: ["report-detail", id] });
      queryClient.invalidateQueries({ queryKey: ["reports-list"] });
    },
    onError: (err: any) => {
      toast.error("Failed to sign report", { description: err?.message });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (content: any) => {
      const { error } = await supabase
        .from("reports")
        .update({ content })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Report updated");
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: ["report-detail", id] });
    },
    onError: (err: any) => {
      toast.error("Failed to update report", { description: err?.message });
    },
  });

  const handleDownload = async () => {
    let pdfPath = report?.pdf_path;

    if (!pdfPath) {
      try {
        const { error } = await supabase.functions.invoke("generate_report_pdf", {
          body: { reportId: id },
        });
        if (error) throw error;

        // Fetch fresh report to get the new pdf_path
        const { data: fresh } = await supabase
          .from("reports")
          .select("pdf_path")
          .eq("id", id)
          .single();
        pdfPath = fresh?.pdf_path;
        queryClient.invalidateQueries({ queryKey: ["report-detail", id] });
      } catch (err: any) {
        toast.error("Failed to generate PDF", { description: err?.message });
        return;
      }
    }

    if (!pdfPath) {
      toast.error("PDF not ready yet — please try again in a moment.");
      return;
    }

    try {
      const { data, error } = await supabase.storage
        .from("eeg-reports")
        .download(pdfPath);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `report-${id?.slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error("Failed to download", { description: err?.message });
    }
  };

  const handleEdit = () => {
    setEditedContent(report?.content || {});
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    updateMutation.mutate(editedContent);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Report not found</p>
        <Button variant="link" onClick={() => navigate("/app/reports")}>
          Back to Reports
        </Button>
      </div>
    );
  }

  const meta = report.studies?.meta as any;
  const content = report.content as any;
  const isSigned = report.status === "signed";
  const canSign = report.status === "pending_review" || report.status === "draft";

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => navigate("/app/reports")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Reports
        </Button>
        <div className="flex items-center gap-2">
          {!isSigned && (
            <Button variant="outline" onClick={handleEdit} disabled={isEditing}>
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
          )}
          <Button variant="outline" onClick={handleDownload}>
            <Download className="h-4 w-4 mr-2" />
            {report.pdf_path ? "Download PDF" : "Generate PDF"}
          </Button>
          {canSign && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button>
                  <Lock className="h-4 w-4 mr-2" />
                  Sign Report
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Sign this report?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Signing will lock the report and make it official. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => signMutation.mutate()} disabled={signMutation.isPending}>
                    {signMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Sign Report
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* Report Header Card */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                EEG Analysis Report
              </CardTitle>
              <CardDescription>
                Report ID: {report.id.slice(0, 8)} • Study ID: {report.study_id?.slice(0, 8)}
              </CardDescription>
            </div>
            <Badge variant={isSigned ? "default" : "secondary"}>
              {isSigned ? (
                <>
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Signed
                </>
              ) : (
                <>
                  <Clock className="h-3 w-3 mr-1" />
                  {report.status}
                </>
              )}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Patient</p>
              <p className="font-medium">{getPatientLabel(report.studies as any)}</p>
              <p className="text-xs text-muted-foreground">
                {meta?.patient_id} • {meta?.patient_age}y/{meta?.patient_gender?.charAt(0)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Clinic</p>
              <p className="font-medium">{report.studies?.clinics?.name || "—"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Created</p>
              <p className="font-medium">{dayjs(report.created_at).format("MMM D, YYYY")}</p>
              <p className="text-xs text-muted-foreground">{dayjs(report.created_at).format("h:mm A")}</p>
            </div>
            {isSigned && (
              <div>
                <p className="text-sm text-muted-foreground">Signed</p>
                <p className="font-medium">{dayjs(report.signed_at).format("MMM D, YYYY")}</p>
                <p className="text-xs text-muted-foreground">
                  by {report.profiles?.full_name || "Unknown"}
                  {report.profiles?.credentials && `, ${report.profiles.credentials}`}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Clinical Information */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Clinical Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Indication</p>
              <p className="font-medium">{report.studies?.indication || "Not specified"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Recording Duration</p>
              <p className="font-medium">
                {report.studies?.duration_min ? `${report.studies.duration_min} minutes` : "Not available"}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">SLA</p>
              <Badge variant="outline">{report.studies?.sla || "—"}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Report Content */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Report Content</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {isEditing ? (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Background Activity</label>
                <Textarea
                  value={editedContent?.background_activity || ""}
                  onChange={(e) => setEditedContent({ ...editedContent, background_activity: e.target.value })}
                  className="mt-1 min-h-[100px]"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Impression</label>
                <Textarea
                  value={editedContent?.impression || ""}
                  onChange={(e) => setEditedContent({ ...editedContent, impression: e.target.value })}
                  className="mt-1 min-h-[100px]"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Recommendations</label>
                <Textarea
                  value={editedContent?.recommendations || ""}
                  onChange={(e) => setEditedContent({ ...editedContent, recommendations: e.target.value })}
                  className="mt-1 min-h-[100px]"
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSaveEdit} disabled={updateMutation.isPending}>
                  {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Save Changes
                </Button>
                <Button variant="outline" onClick={() => setIsEditing(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              {content?.background_activity && (
                <div>
                  <h4 className="font-medium mb-2">Background Activity</h4>
                  <p className="text-muted-foreground whitespace-pre-wrap">{content.background_activity}</p>
                </div>
              )}
              
              {content?.impression && (
                <>
                  <Separator />
                  <div>
                    <h4 className="font-medium mb-2">Impression</h4>
                    <p className="text-muted-foreground whitespace-pre-wrap">{content.impression}</p>
                  </div>
                </>
              )}

              {content?.recommendations && (
                <>
                  <Separator />
                  <div>
                    <h4 className="font-medium mb-2">Recommendations</h4>
                    <p className="text-muted-foreground whitespace-pre-wrap">{content.recommendations}</p>
                  </div>
                </>
              )}

              {!content?.background_activity && !content?.impression && !content?.recommendations && (
                <p className="text-muted-foreground text-center py-8">
                  No content available. Click Edit to add report content.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Actions Footer */}
      <div className="flex items-center justify-between pt-4 border-t">
        <Button variant="outline" onClick={() => navigate(`/app/eeg-viewer?studyId=${report.study_id}`)}>
          <Activity className="h-4 w-4 mr-2" />
          Open in EEG Viewer
        </Button>
        <Button variant="outline" onClick={() => navigate(`/app/studies/${report.study_id}`)}>
          <FileText className="h-4 w-4 mr-2" />
          View Study Details
        </Button>
      </div>
    </div>
  );
}
