import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, FileSignature, FileText, Download } from "lucide-react";
import dayjs from "dayjs";
import { AnomalyDetectionPreview } from "@/components/ai/AnomalyDetectionPreview";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

export default function StudyDetail() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [downloading, setDownloading] = useState(false);

  const { data: study, isLoading } = useQuery({
    queryKey: ["study", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("studies")
        .select("*, clinics(name), study_files(*), reports(*)")
        .eq("id", id!)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!id
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!study) {
    return <div>Study not found</div>;
  }

  const meta = study.meta as any;
  const patientName = meta?.patient_name || "N/A";
  const patientId = meta?.patient_id || "N/A";
  const patientAge = meta?.patient_age;
  const patientGender = meta?.patient_gender;

  const handleGenerateAIReport = async () => {
    setDownloading(true);
    try {
      toast({ title: "Generating AI report...", description: "This may take a minute" });
      
      const { data, error } = await supabase.functions.invoke("generate_ai_report", {
        body: { study_id: id }
      });
      
      if (error) throw error;
      
      toast({
        title: "AI Report generated!",
        description: "Refreshing page...",
      });
      
      // Refresh the page to show the new report
      window.location.reload();
    } catch (error) {
      console.error("AI generation error:", error);
      toast({
        title: "Generation failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadReport = async () => {
    setDownloading(true);
    try {
      const report = study.reports?.[0];
      if (!report) {
        toast({
          title: "No report found",
          description: "Generate an AI report first",
          variant: "destructive",
        });
        return;
      }

      // Generate PDF if it doesn't exist
      if (!report.pdf_path) {
        toast({ title: "Generating PDF...", description: "Please wait" });
        
        const { data: pdfData, error: genError } = await supabase.functions.invoke("generate_report_pdf", {
          body: { reportId: report.id }
        });
        
        if (genError) {
          throw new Error(genError.message || "Failed to generate PDF");
        }
        
        // Refresh to get the updated pdf_path
        window.location.reload();
        return;
      }

      // Download the PDF
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
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-4">
            <h1 className="text-3xl font-bold">{patientName}</h1>
            <Badge className="bg-blue-500">{study.state.replace("_", " ")}</Badge>
            <Badge variant={study.sla === "STAT" ? "destructive" : "secondary"}>
              {study.sla}
            </Badge>
          </div>
          <p className="text-muted-foreground">Patient ID: {patientId}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to={`/app/studies/${id}/viewer`}>
              <FileText className="mr-2 h-4 w-4" />
              Open EEG Viewer
            </Link>
          </Button>
          {!study.reports?.[0] && study.state === 'uploaded' && (
            <Button onClick={handleGenerateAIReport} disabled={downloading}>
              <FileSignature className="mr-2 h-4 w-4" />
              {downloading ? "Generating..." : "Generate AI Report"}
            </Button>
          )}
          {(study.state === 'ai_draft' || study.state === 'in_review') && (
            <Button asChild>
              <Link to={`/app/studies/${id}/review`}>
                <FileSignature className="mr-2 h-4 w-4" />
                Review & Sign
              </Link>
            </Button>
          )}
          {(study.state === 'signed' || study.reports?.[0]) && (
            <Button onClick={handleDownloadReport} disabled={downloading}>
              <Download className="mr-2 h-4 w-4" />
              {downloading ? "Preparing..." : "Download Report"}
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Patient Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <span className="text-sm text-muted-foreground">Name:</span>
              <p className="font-medium">{patientName}</p>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">ID:</span>
              <p className="font-medium">{patientId}</p>
            </div>
            {patientAge && (
              <div>
                <span className="text-sm text-muted-foreground">Age:</span>
                <p className="font-medium">{patientAge}</p>
              </div>
            )}
            {patientGender && (
              <div>
                <span className="text-sm text-muted-foreground">Gender:</span>
                <p className="font-medium">{patientGender}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Study Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <span className="text-sm text-muted-foreground">Clinic:</span>
              <p className="font-medium">{study.clinics?.name}</p>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Created:</span>
              <p className="font-medium">{dayjs(study.created_at).format("MMM D, YYYY HH:mm")}</p>
            </div>
            {study.indication && (
              <div>
                <span className="text-sm text-muted-foreground">Indication:</span>
                <p className="font-medium">{study.indication}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      
      {/* AI Anomaly Detection Preview */}
      <AnomalyDetectionPreview studyId={id} />

      <Card>
        <CardHeader>
          <CardTitle>Files</CardTitle>
        </CardHeader>
        <CardContent>
          {study.study_files && study.study_files.length > 0 ? (
            <div className="space-y-2">
              {study.study_files.map((file: any) => (
                <div key={file.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div>
                    <p className="font-medium">{file.path}</p>
                    <p className="text-sm text-muted-foreground">
                      {file.kind} • {file.size_bytes ? (file.size_bytes / 1024 / 1024).toFixed(2) + ' MB' : 'Size unknown'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No files uploaded yet</p>
          )}
        </CardContent>
      </Card>

      {study.reports?.[0] ? (
        <Card>
          <CardHeader>
            <CardTitle>Report</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {(() => {
              const report = study.reports[0] as any;
              const content = report.content as any;
              return (
                <div className="space-y-4">
                  {content?.background_activity && (
                    <div>
                      <h3 className="font-medium mb-2">Background Activity</h3>
                      <p className="text-sm">{content.background_activity}</p>
                    </div>
                  )}
                  {content?.impression && (
                    <div>
                      <h3 className="font-medium mb-2">Impression</h3>
                      <p className="text-sm">{content.impression}</p>
                    </div>
                  )}
                  {content?.recommendations && (
                    <div>
                      <h3 className="font-medium mb-2">Recommendations</h3>
                      <p className="text-sm">{content.recommendations}</p>
                    </div>
                  )}
                </div>
              );
            })()}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Report</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">No report generated yet. Click "Generate AI Report" to create one.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
