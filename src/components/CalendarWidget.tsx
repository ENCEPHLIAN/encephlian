import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState, useMemo } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Activity, FileText, Clock, CalendarDays } from "lucide-react";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";

interface Study {
  id: string;
  created_at: string;
  state: string;
  sla: string;
  meta: any;
  triage_status?: string;
}

export function CalendarWidget() {
  const [date, setDate] = useState<Date | undefined>(new Date());
  const isMobile = useIsMobile();
  const navigate = useNavigate();

  // Fetch all studies for calendar markers
  const { data: studies } = useQuery({
    queryKey: ["calendar-studies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("studies")
        .select("id, created_at, state, sla, meta, triage_status")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Study[];
    },
  });

  // Get dates that have studies
  const studyDates = useMemo(() => {
    if (!studies) return new Set<string>();
    return new Set(studies.map(s => dayjs(s.created_at).format("YYYY-MM-DD")));
  }, [studies]);

  // Get studies for selected date
  const selectedDateStudies = useMemo(() => {
    if (!date || !studies) return [];
    const selectedDay = dayjs(date).format("YYYY-MM-DD");
    return studies.filter(s => dayjs(s.created_at).format("YYYY-MM-DD") === selectedDay);
  }, [date, studies]);

  // Custom day modifier to highlight days with studies
  const modifiers = useMemo(() => ({
    hasStudies: (day: Date) => studyDates.has(dayjs(day).format("YYYY-MM-DD")),
  }), [studyDates]);

  const modifiersStyles = {
    hasStudies: {
      fontWeight: 700,
      backgroundColor: "hsl(var(--primary) / 0.15)",
      borderRadius: "50%",
    },
  };

  const getStatusColor = (state: string, triage_status?: string) => {
    if (triage_status === "completed" || state === "signed") return "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400";
    if (triage_status === "processing") return "bg-blue-500/20 text-blue-600 dark:text-blue-400";
    if (state === "uploaded") return "bg-amber-500/20 text-amber-600 dark:text-amber-400";
    return "bg-muted text-muted-foreground";
  };

  return (
    <Card className="openai-card border-2">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Study Calendar</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <div className={`grid gap-6 ${isMobile ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-3"}`}>
          {/* Calendar Section */}
          <div className={isMobile ? "flex justify-center" : "lg:col-span-2"}>
            {isMobile ? (
              <Calendar
                mode="single"
                selected={date}
                onSelect={setDate}
                className="rounded-lg border"
                modifiers={modifiers}
                modifiersStyles={modifiersStyles}
              />
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={setDate}
                  className="rounded-lg border"
                  modifiers={modifiers}
                  modifiersStyles={modifiersStyles}
                />
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={setDate}
                  className="rounded-lg border"
                  month={new Date(new Date().getFullYear(), new Date().getMonth() + 1)}
                  modifiers={modifiers}
                  modifiersStyles={modifiersStyles}
                />
              </div>
            )}
          </div>

          {/* Selected Date Studies Panel */}
          <div className="lg:col-span-1">
            <div className="rounded-lg border bg-muted/30 p-4 h-full">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-semibold text-sm">
                  {date ? dayjs(date).format("MMMM D, YYYY") : "Select a date"}
                </h3>
              </div>

              {selectedDateStudies.length > 0 ? (
                <ScrollArea className="h-[200px]">
                  <div className="space-y-2">
                    {selectedDateStudies.map((study) => {
                      const meta = study.meta as any;
                      return (
                        <div
                          key={study.id}
                          className="flex items-center justify-between p-3 rounded-lg bg-background hover:bg-muted/50 transition-colors cursor-pointer border"
                          onClick={() => navigate(`/app/studies/${study.id}`)}
                        >
                          <div className="flex items-center gap-3">
                            <Activity className="h-4 w-4 text-primary shrink-0" />
                            <div className="min-w-0">
                              <p className="font-medium text-sm truncate">
                                {meta?.patient_name || meta?.patient_id || study.id.slice(0, 8)}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {dayjs(study.created_at).format("h:mm A")}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={`text-xs ${getStatusColor(study.state, study.triage_status)}`}>
                              {study.triage_status === "completed" || study.state === "signed" ? "Done" :
                               study.triage_status === "processing" ? "Processing" :
                               study.state === "uploaded" ? "Pending" : study.state}
                            </Badge>
                            <Badge variant="secondary" className="text-xs">
                              {study.sla}
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              ) : (
                <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground">
                  <FileText className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm">No studies on this date</p>
                  {date && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2"
                      onClick={() => navigate("/app/files")}
                    >
                      Upload Study
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
