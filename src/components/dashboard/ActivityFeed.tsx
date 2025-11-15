import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { FileText, CheckCircle, Sparkles, Coins, ArrowRight } from "lucide-react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

interface ActivityFeedProps {
  studies: any[];
}

export default function ActivityFeed({ studies }: ActivityFeedProps) {
  const navigate = useNavigate();
  
  // Get recent activities
  const recentStudies = studies
    .filter(s => s.state === 'signed' || s.state === 'ai_draft')
    .sort((a, b) => dayjs(b.created_at).diff(dayjs(a.created_at)))
    .slice(0, 5);

  const activities = recentStudies.map(study => {
    const meta = study.meta || {};
    const patientId = meta.patient_id || 'Unknown';
    
    if (study.state === 'signed') {
      return {
        id: study.id,
        icon: CheckCircle,
        iconColor: "text-success",
        text: `Signed report for ${patientId}`,
        time: dayjs(study.created_at).fromNow()
      };
    } else {
      return {
        id: study.id,
        icon: Sparkles,
        iconColor: "text-purple-500",
        text: `Generated AI draft for ${patientId}`,
        time: dayjs(study.created_at).fromNow()
      };
    }
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Recent Activity</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => navigate("/app/studies")}>
            View All <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No recent activity
          </div>
        ) : (
          <div className="space-y-4">
            {activities.map((activity) => {
              const Icon = activity.icon;
              return (
                <div key={activity.id} className="flex items-start gap-3">
                  <div className={`mt-0.5 ${activity.iconColor}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm">{activity.text}</p>
                    <p className="text-xs text-muted-foreground">{activity.time}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
