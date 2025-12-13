import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { AlertCircle, Clock, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

interface Study {
  id: string;
  sla: string;
  state: string;
  created_at: string;
  meta: any;
}

interface UrgentQueueProps {
  studies: Study[];
}

export default function UrgentQueue({ studies: initialStudies }: UrgentQueueProps) {
  const navigate = useNavigate();
  const [studies, setStudies] = useState<Study[]>(initialStudies);

  // Update local state when prop changes
  useEffect(() => {
    setStudies(initialStudies);
  }, [initialStudies]);

  // Real-time subscription for study updates
  useEffect(() => {
    const channel = supabase
      .channel("urgent-queue-updates")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "studies",
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const newStudy = payload.new as Study;
            // Only add if pending or processing
            if (["pending", "processing", "awaiting_sla"].includes(newStudy.state)) {
              setStudies((prev) => [...prev, newStudy]);
            }
          } else if (payload.eventType === "UPDATE") {
            const updated = payload.new as Study;
            setStudies((prev) => {
              // Remove if completed or not relevant
              if (["completed", "signed", "cancelled"].includes(updated.state)) {
                return prev.filter((s) => s.id !== updated.id);
              }
              // Update existing
              return prev.map((s) => (s.id === updated.id ? updated : s));
            });
          } else if (payload.eventType === "DELETE") {
            const deleted = payload.old as { id: string };
            setStudies((prev) => prev.filter((s) => s.id !== deleted.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
  
  // Sort: STAT first, then by age
  const sortedStudies = [...studies]
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
            const patientId = meta.patient_id || 'Unknown';
            const age = meta.age || 'N/A';
            const gender = meta.gender || 'N/A';
            
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
                      {age}y {gender} • {study.state.replace('_', ' ')}
                    </div>
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
