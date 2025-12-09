import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import ReportReadyCard from "./ReportReadyCard";

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

interface RecentReportsSectionProps {
  studies: Study[];
  onRequestRefund: (study: Study) => void;
}

export default function RecentReportsSection({ studies, onRequestRefund }: RecentReportsSectionProps) {
  const navigate = useNavigate();

  if (studies.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <CardTitle>Recent Reports</CardTitle>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate("/app/studies?filter=signed")}>
            View All <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {studies.slice(0, 5).map((study) => (
            <ReportReadyCard 
              key={study.id} 
              study={study} 
              onRequestRefund={onRequestRefund}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
