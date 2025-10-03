import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import dayjs from "dayjs";

export default function StudyDetail() {
  const { id } = useParams<{ id: string }>();

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

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <div className="flex items-center gap-4">
          <h1 className="text-3xl font-bold">{study.patient_name}</h1>
          <Badge className="bg-blue-500">{study.state.replace("_", " ")}</Badge>
          <Badge variant={study.sla_type === "STAT" ? "destructive" : "secondary"}>
            {study.sla_type}
          </Badge>
        </div>
        <p className="text-muted-foreground">Patient ID: {study.patient_id}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Patient Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <span className="text-sm text-muted-foreground">Name:</span>
              <p className="font-medium">{study.patient_name}</p>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">ID:</span>
              <p className="font-medium">{study.patient_id}</p>
            </div>
            {study.patient_age && (
              <div>
                <span className="text-sm text-muted-foreground">Age:</span>
                <p className="font-medium">{study.patient_age}</p>
              </div>
            )}
            {study.patient_gender && (
              <div>
                <span className="text-sm text-muted-foreground">Gender:</span>
                <p className="font-medium">{study.patient_gender}</p>
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
                    <p className="font-medium">{file.filename}</p>
                    <p className="text-sm text-muted-foreground">
                      {(file.file_size / 1024 / 1024).toFixed(2)} MB
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

      {study.reports && (
        <Card>
          <CardHeader>
            <CardTitle>Report</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {(() => {
              const report = study.reports as any;
              return (
                <div className="space-y-4">
                  {report.background_activity && (
                    <div>
                      <h3 className="font-medium mb-2">Background Activity</h3>
                      <p className="text-sm">{report.background_activity}</p>
                    </div>
                  )}
                  {report.impression && (
                    <div>
                      <h3 className="font-medium mb-2">Impression</h3>
                      <p className="text-sm">{report.impression}</p>
                    </div>
                  )}
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
