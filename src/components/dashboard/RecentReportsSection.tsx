import { memo } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShieldCheck, AlertCircle, CheckCircle2, ArrowRight, Eye, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
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
  ai_draft_json?: any;
}

interface RecentReportsSectionProps {
  studies: Study[];
  onRequestRefund: (study: Study) => void;
}

function getClassification(study: Study) {
  const r = study.ai_draft_json;
  if (!r) return null;
  const cls = r.classification ?? r.triage?.classification ?? null;
  const conf = r.triage_confidence ?? r.triage?.confidence ?? null;
  if (!cls || cls === "unknown") return null;
  return { cls, conf };
}

const ReportRow = memo(function ReportRow({ study }: { study: Study }) {
  const navigate = useNavigate();
  const meta = study.meta as any;
  const patientName = meta?.patient_name || meta?.patientName;
  const patientId = meta?.patient_id || meta?.patientId;
  const completedAt = study.triage_completed_at
    ? dayjs(study.triage_completed_at)
    : dayjs(study.created_at);
  const classification = getClassification(study);
  const isNormal = classification?.cls === "normal";
  const isAbnormal = classification?.cls === "abnormal";

  return (
    <div
      className={cn(
        "group relative flex items-center gap-3 px-4 py-3 transition-colors cursor-pointer",
        "hover:bg-muted/50",
        isAbnormal && "hover:bg-red-500/5"
      )}
      onClick={() => navigate(`/app/studies/${study.id}`)}
    >
      {/* Classification accent strip */}
      <span
        className={cn(
          "absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-8 rounded-r-full transition-opacity opacity-0 group-hover:opacity-100",
          isNormal ? "bg-emerald-500" : isAbnormal ? "bg-red-500" : "bg-primary/40"
        )}
      />

      {/* Icon */}
      <div
        className={cn(
          "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
          isNormal ? "bg-emerald-500/10" : isAbnormal ? "bg-red-500/10" : "bg-muted"
        )}
      >
        {isNormal
          ? <ShieldCheck className="h-4 w-4 text-emerald-500" />
          : isAbnormal
          ? <AlertCircle className="h-4 w-4 text-red-500" />
          : <CheckCircle2 className="h-4 w-4 text-muted-foreground" />}
      </div>

      {/* Patient info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium truncate">
            {patientName || patientId || `Study ${study.id.slice(0, 6).toUpperCase()}`}
          </span>
          <Badge
            variant={study.sla === "STAT" ? "destructive" : "secondary"}
            className="text-[10px] shrink-0 h-4 px-1.5"
          >
            {study.sla}
          </Badge>
          {classification && (
            <Badge
              className={cn(
                "text-[10px] shrink-0 h-4 px-1.5 gap-0.5",
                isNormal
                  ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                  : "bg-red-500/10 text-red-600 border-red-500/20"
              )}
            >
              {isNormal ? "Normal" : "Abnormal"}
              {typeof classification.conf === "number" && classification.conf > 0.5 && (
                <span className="opacity-60 ml-0.5">
                  {Math.round(classification.conf * 100)}%
                </span>
              )}
            </Badge>
          )}
          {study.refund_requested && (
            <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-muted-foreground">
              Refunded
            </Badge>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {patientId && patientName && <span className="font-mono mr-2">{patientId}</span>}
          {completedAt.fromNow()}
        </p>
      </div>

      {/* Actions — only visible on hover */}
      <div
        className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => e.stopPropagation()}
      >
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          title="Open EEG Viewer"
          onClick={() => navigate(`/app/studies/${study.id}/viewer`)}
        >
          <Activity className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={() => navigate(`/app/studies/${study.id}`)}
        >
          <Eye className="h-3 w-3" />
          View
        </Button>
      </div>
    </div>
  );
});

export default function RecentReportsSection({
  studies,
  onRequestRefund: _onRequestRefund,
}: RecentReportsSectionProps) {
  const navigate = useNavigate();
  const visible = studies.slice(0, 6);

  if (visible.length === 0) return null;

  return (
    <div className="rounded-xl border border-border/60 overflow-hidden bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          <span className="text-sm font-semibold">Recent Reports</span>
          <span className="text-xs font-mono text-muted-foreground bg-muted rounded px-1.5 py-0.5">
            {visible.length}
          </span>
        </div>
        <button
          onClick={() => navigate("/app/reports")}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          View all
          <ArrowRight className="h-3 w-3" />
        </button>
      </div>

      {/* Rows */}
      <div className="divide-y divide-border/30">
        {visible.map((study) => (
          <ReportRow key={study.id} study={study} />
        ))}
      </div>
    </div>
  );
}
