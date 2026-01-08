import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Eye, Activity, RotateCcw, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

interface Study {
  id: string;
  created_at: string;
  meta: any;
  sla: string;
  triage_completed_at?: string;
  refund_requested?: boolean;
  tokens_deducted?: number;
  state: string;
}

interface ReportReadyCardProps {
  study: Study;
  onRequestRefund: (study: Study) => void;
  hideRefundButton?: boolean;
}

export default function ReportReadyCard({ study, onRequestRefund, hideRefundButton = false }: ReportReadyCardProps) {
  const navigate = useNavigate();
  const meta = (study.meta || {}) as Record<string, any>;
  const patientId = meta.patient_id || meta.patientId || `ID-${study.id.slice(0, 6).toUpperCase()}`;
  
  // Check if refund is still available (within 48 hours of completion)
  const completedAt = study.triage_completed_at ? dayjs(study.triage_completed_at) : dayjs(study.created_at);
  const canRefund = !study.refund_requested && 
                    study.tokens_deducted && 
                    study.tokens_deducted > 0 &&
                    dayjs().diff(completedAt, 'hour') < 48;

  // Determine report status based on meta or state
  const isNormal = meta.finding === "normal" || meta.status === "normal";
  const artifactLevel = meta.artifact_level || "low";

  return (
    <Card className="border-green-500/30 bg-green-500/5">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-green-500/10 shrink-0">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium">{patientId}</span>
                <Badge variant={study.sla === "STAT" ? "destructive" : "default"} className="text-xs">
                  {study.sla}
                </Badge>
                <Badge variant="outline" className="text-xs bg-green-500/10 text-green-600 border-green-500/30">
                  Report Ready
                </Badge>
              </div>
              <div className="flex items-center gap-3 mt-1.5 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {completedAt.fromNow()}
                </span>
                <span>
                  {isNormal ? "Normal" : "Abnormal"} • Artifact: {artifactLevel}
                </span>
              </div>
              {study.refund_requested && (
                <Badge variant="secondary" className="mt-2 text-xs">
                  Token Refunded
                </Badge>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {canRefund && !hideRefundButton && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => onRequestRefund(study)}
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/app/reports/${study.id}`)}
            >
              <Eye className="h-4 w-4 mr-1.5" />
              View Report
            </Button>
            <Button
              size="sm"
              onClick={() => navigate(`/app/eeg-viewer?studyId=${study.id}`)}
            >
              <Activity className="h-4 w-4 mr-1.5" />
              Open Viewer
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
