import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Clock, User, FileText } from "lucide-react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

interface Study {
  id: string;
  created_at: string;
  meta: any;
  triage_status?: string;
  duration_min?: number;
}

interface PendingTriageSectionProps {
  studies: Study[];
  onSelectSla: (study: Study) => void;
}

export default function PendingTriageSection({ studies, onSelectSla }: PendingTriageSectionProps) {
  if (studies.length === 0) {
    return null;
  }

  return (
    <Card className="border-2 border-amber-500/30 bg-amber-500/5">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-500/10">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
          </div>
          <div>
            <CardTitle className="text-lg">
              {studies.length === 1 
                ? "New EEG Session Ready for Triage" 
                : `${studies.length} EEG Sessions Awaiting Triage`}
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-0.5">
              Select a priority to start triage
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {studies.slice(0, 5).map((study) => {
            const meta = (study.meta || {}) as Record<string, any>;
            const patientId = meta.patient_id || meta.patientId || `ID-${study.id.slice(0, 6).toUpperCase()}`;
            const technicianName = meta.technician || meta.recorded_by || "Unknown Technician";
            
            return (
              <div
                key={study.id}
                className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center gap-4 flex-1">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{patientId}</span>
                      <Badge variant="outline" className="text-xs shrink-0">
                        New
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {dayjs(study.created_at).fromNow()}
                      </span>
                      {study.duration_min && (
                        <span>{study.duration_min} min</span>
                      )}
                      <span className="flex items-center gap-1">
                        <User className="h-3.5 w-3.5" />
                        {technicianName}
                      </span>
                    </div>
                  </div>
                </div>
                <Button 
                  onClick={() => onSelectSla(study)} 
                  className="shrink-0 btn-gradient-analysis rounded-full px-6"
                >
                  Start Analysis
                </Button>
              </div>
            );
          })}
          
          {studies.length > 5 && (
            <p className="text-sm text-muted-foreground text-center pt-2">
              +{studies.length - 5} more pending studies
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
