import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Eye, Activity, RotateCcw, Clock, ShieldCheck, AlertCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { cn } from "@/lib/utils";

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
  ai_draft_json?: any;
}

interface ReportReadyCardProps {
  study: Study;
  onRequestRefund: (study: Study) => void;
  hideRefundButton?: boolean;
}

export default function ReportReadyCard({ study, onRequestRefund, hideRefundButton = false }: ReportReadyCardProps) {
  const navigate = useNavigate();
  const meta = (study.meta || {}) as Record<string, any>;
  const patientName = meta.patient_name || meta.patientName;
  const patientId = meta.patient_id || meta.patientId || `ID-${study.id.slice(0, 6).toUpperCase()}`;

  // Check if refund is still available (within 48 hours of completion)
  const completedAt = study.triage_completed_at ? dayjs(study.triage_completed_at) : dayjs(study.created_at);
  const canRefund = !study.refund_requested &&
                    study.tokens_deducted &&
                    study.tokens_deducted > 0 &&
                    dayjs().diff(completedAt, 'hour') < 48;

  // Classification from MIND report
  const report = study.ai_draft_json;
  const cls = report?.classification ?? report?.triage?.classification ?? null;
  const conf = report?.triage_confidence ?? report?.triage?.confidence ?? null;
  const isNormal = cls === "normal";
  const isAbnormal = cls === "abnormal";
  const hasClassification = cls && cls !== "unknown";

  return (
    <Card className={cn(
      "border transition-colors cursor-pointer hover:bg-muted/20",
      isAbnormal ? "border-red-500/20 bg-red-500/3" :
      isNormal   ? "border-emerald-500/20 bg-emerald-500/3" :
                   "border-border/60 bg-card"
    )} onClick={() => navigate(`/app/studies/${study.id}`)}>
      <CardContent className="p-3.5">
        <div className="flex items-center gap-3">
          <div className={cn(
            "h-9 w-9 rounded-lg flex items-center justify-center shrink-0",
            isAbnormal ? "bg-red-500/10" :
            isNormal   ? "bg-emerald-500/10" : "bg-green-500/10"
          )}>
            {isNormal
              ? <ShieldCheck className="h-4 w-4 text-emerald-500" />
              : isAbnormal
              ? <AlertCircle className="h-4 w-4 text-red-500" />
              : <CheckCircle2 className="h-4 w-4 text-green-500" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">{patientName || patientId}</span>
              <Badge variant={study.sla === "STAT" ? "destructive" : "secondary"} className="text-[10px] shrink-0">
                {study.sla}
              </Badge>
              {hasClassification ? (
                <Badge className={cn(
                  "text-[10px] shrink-0",
                  isNormal
                    ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                    : "bg-red-500/10 text-red-600 border-red-500/20"
                )}>
                  {isNormal ? "Normal" : "Abnormal"}
                  {typeof conf === "number" && conf > 0 && (
                    <span className="ml-1 opacity-60">{Math.round(conf * 100)}%</span>
                  )}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] bg-green-500/10 text-green-600 border-green-500/30 shrink-0">
                  Report Ready
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {completedAt.fromNow()}
              </span>
              {study.refund_requested && (
                <Badge variant="secondary" className="mt-2 text-xs">
                  Token Refunded
                </Badge>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
            {canRefund && !hideRefundButton && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={() => onRequestRefund(study)}
                title="Request refund"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => navigate(`/app/studies/${study.id}/viewer`)}
              title="Open EEG Viewer"
            >
              <Activity className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => navigate(`/app/studies/${study.id}`)}
            >
              <Eye className="h-3 w-3 mr-1" />
              View
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
