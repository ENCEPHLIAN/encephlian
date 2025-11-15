import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Users, History, FileText, Calendar } from "lucide-react";
import dayjs from "dayjs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export default function Dashboard() {
  const { data: studies, isLoading } = useQuery({
    queryKey: ["dashboard-studies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("studies")
        .select("*, clinics(name)")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    }
  });

  const today = dayjs().format('YYYY-MM-DD');
  
  const todayPatients = studies?.filter(s => 
    dayjs(s.created_at).format('YYYY-MM-DD') === today && 
    (s.state === 'uploaded' || s.state === 'in_review')
  ) || [];

  const pendingReports = studies?.filter(s => 
    s.state === 'ai_draft' || s.state === 'in_review'
  ) || [];

  const previousStudies = studies?.filter(s => 
    dayjs(s.created_at).format('YYYY-MM-DD') !== today
  ) || [];

  // Get unique dates for previous EEGs
  const previousDates = Array.from(new Set(
    previousStudies.map(s => dayjs(s.created_at).format('YYYY-MM-DD'))
  )).slice(0, 5);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-full">
      {/* Date Header */}
      <div className="flex items-center gap-3 text-muted-foreground">
        <Calendar className="h-5 w-5" />
        <span className="text-lg font-medium">
          {dayjs().format('dddd, MMMM D, YYYY')}
        </span>
      </div>

      {/* Collapsible Sections */}
      <Accordion type="multiple" defaultValue={["today", "pending"]} className="space-y-4">
        
        {/* Today's EEG Patients */}
        <AccordionItem value="today" className="border rounded-xl bg-card">
          <AccordionTrigger className="px-6 py-4 hover:no-underline">
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5" />
              <span className="text-lg font-semibold">Today's EEG Patients</span>
              <Badge variant="secondary">{todayPatients.length}</Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-6 pb-6">
            {todayPatients.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No patients scheduled for today</p>
            ) : (
              <div className="space-y-3">
                {todayPatients.map((study) => {
                  const meta = study.meta as any;
                  return (
                    <div 
                      key={study.id} 
                      className="flex items-center justify-between p-4 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="font-mono text-sm text-muted-foreground min-w-[60px]">
                          {meta?.patient_id || 'N/A'}
                        </div>
                        <div>
                          <div className="font-medium">
                            {meta?.patient_age || '?'}y / {meta?.patient_gender || '?'}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {dayjs(study.created_at).format('HH:mm')} • {meta?.indication || 'No indication'}
                          </div>
                        </div>
                      </div>
                      <Button size="sm" asChild>
                        <Link to={`/app/studies/${study.id}`}>
                          <FileText className="h-4 w-4 mr-2" />
                          Start EEG
                        </Link>
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </AccordionContent>
        </AccordionItem>

        {/* Previous EEGs */}
        <AccordionItem value="previous" className="border rounded-xl bg-card">
          <AccordionTrigger className="px-6 py-4 hover:no-underline">
            <div className="flex items-center gap-3">
              <History className="h-5 w-5" />
              <span className="text-lg font-semibold">Previous EEGs</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-6 pb-6">
            <div className="flex flex-wrap gap-2">
              {previousDates.map((date) => (
                <Button
                  key={date}
                  variant="outline"
                  size="sm"
                  asChild
                  className="font-mono"
                >
                  <Link to={`/app/studies?date=${date}`}>
                    {dayjs(date).format('YYYY-MM-DD')}
                  </Link>
                </Button>
              ))}
              {previousDates.length === 0 && (
                <p className="text-muted-foreground">No previous studies</p>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Pending EEG Reports */}
        <AccordionItem value="pending" className="border rounded-xl bg-card">
          <AccordionTrigger className="px-6 py-4 hover:no-underline">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5" />
              <span className="text-lg font-semibold">Pending EEG Reports</span>
              <Badge variant="destructive">{pendingReports.length}</Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-6 pb-6">
            {pendingReports.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No pending reports</p>
            ) : (
              <div className="space-y-3">
                {pendingReports.map((study) => {
                  const meta = study.meta as any;
                  return (
                    <div 
                      key={study.id}
                      className="flex items-center justify-between p-4 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div>
                        <div className="font-medium">
                          {meta?.patient_id || 'N/A'} - {meta?.patient_age || '?'}y / {meta?.patient_gender || '?'}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {dayjs(study.created_at).format('YYYY-MM-DD')} • {study.sla} • Ref: {meta?.referring_doctor || 'N/A'}
                        </div>
                      </div>
                      <Button size="sm" variant="outline" asChild>
                        <Link to={`/app/studies/${study.id}`}>
                          Review
                        </Link>
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </AccordionContent>
        </AccordionItem>

      </Accordion>
    </div>
  );
}
