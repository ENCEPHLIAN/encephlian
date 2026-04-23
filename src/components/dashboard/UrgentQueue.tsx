import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { AlertCircle, Clock, ArrowRight } from "lucide-react";
import { formatStudySourceLine } from "@/lib/studySourceFile";
import { getStudyHandle } from "@/lib/studyDisplay";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

interface Study {
  id: string;
  sla: string;
  state: string;
  created_at: string;
  meta: any;
  reference?: string | null;
  original_format?: string | null;
}

interface UrgentQueueProps {
  studies: Study[];
}

export default function UrgentQueue({ studies: initialStudies }: UrgentQueueProps) {
  const navigate = useNavigate();
  
  // Sort: STAT first, then by age - no realtime subscription needed as parent handles updates
  const sortedStudies = [...initialStudies]
    .sort((a, b) => {
      if (a.sla === 'STAT' && b.sla !== 'STAT') return -1;
      if (a.sla !== 'STAT' && b.sla === 'STAT') return 1;
      return dayjs(a.created_at).isBefore(dayjs(b.created_at)) ? -1 : 1;
    })
    .slice(0, 5);

  if (sortedStudies.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <CardTitle>Urgent Queue</CardTitle>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate("/app/studies")}>
            View All <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {sortedStudies.map((study) => {
            const meta = study.meta || {};
            const patientId = meta.patient_id || meta.patient_name || 'Unknown';
            const age = meta.patient_age || meta.age || 'N/A';
            const gender = meta.patient_gender || meta.gender || 'N/A';
            const fileLine = formatStudySourceLine(meta, study.original_format ?? null);
            const handle = getStudyHandle(study);

            return (
              <div
                key={study.id}
                onClick={() => navigate(`/app/studies/${study.id}`)}
                className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-4 flex-1">
                  <Badge variant={study.sla === 'STAT' ? 'destructive' : 'default'}>
                    {study.sla}
                  </Badge>
                  <div className="flex-1">
                    <div className="font-medium">{patientId}</div>
                    <div className="text-sm text-muted-foreground">
                      {age !== 'N/A' ? `${age}y` : ''} {gender !== 'N/A' ? gender.charAt(0).toUpperCase() : ''} • {study.state.replace('_', ' ')}
                    </div>
                    <div className="text-[10px] font-mono text-muted-foreground/90">{handle}</div>
                    {fileLine && (
                      <div className="text-xs text-muted-foreground truncate max-w-[240px] sm:max-w-[320px]" title={fileLine}>
                        {fileLine}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  {dayjs(study.created_at).fromNow()}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}