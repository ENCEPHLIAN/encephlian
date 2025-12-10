import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState, useMemo, useEffect } from "react";
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
  const navigate = useNavigate();
  
  // Track container width to determine single or double calendar
  const [containerWidth, setContainerWidth] = useState(0);
  const showTwoMonths = containerWidth >= 700;

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

  // Previous month for second calendar
  const previousMonth = new Date(new Date().getFullYear(), new Date().getMonth() - 1);

  return (
    <Card className="openai-card border-2 h-full">
      <CardHeader className="pb-2 sm:pb-4">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          <CardTitle className="text-base sm:text-lg">Study Calendar</CardTitle>
        </div>
      </CardHeader>
      <CardContent 
        className="p-2 sm:p-4 pt-0 flex-1"
        ref={(el) => {
          if (el) {
            const observer = new ResizeObserver((entries) => {
              setContainerWidth(entries[0].contentRect.width);
            });
            observer.observe(el);
            return () => observer.disconnect();
          }
        }}
      >
        <div className="flex flex-col xl:flex-row gap-3 sm:gap-6 h-full">
          {/* Calendar Section - responsive */}
          <div className="flex-1 flex items-start justify-center">
            {showTwoMonths ? (
              <div className="flex gap-4 sm:gap-6 justify-center flex-wrap">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={setDate}
                  className="rounded-lg border pointer-events-auto"
                  modifiers={modifiers}
                  modifiersStyles={modifiersStyles}
                  month={previousMonth}
                />
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={setDate}
                  className="rounded-lg border pointer-events-auto"
                  modifiers={modifiers}
                  modifiersStyles={modifiersStyles}
                />
              </div>
            ) : (
              <Calendar
                mode="single"
                selected={date}
                onSelect={setDate}
                className="rounded-lg border pointer-events-auto mx-auto"
                modifiers={modifiers}
                modifiersStyles={modifiersStyles}
              />
            )}
          </div>

          {/* Selected Date Studies Panel */}
          <div className="w-full xl:w-64 shrink-0">
            <div className="rounded-lg border bg-muted/30 p-2 sm:p-3 h-full min-h-[180px] sm:min-h-[240px]">
              <div className="flex items-center gap-2 mb-2 sm:mb-3">
                <Clock className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
                <h3 className="font-semibold text-xs sm:text-sm">
                  {date ? dayjs(date).format("MMM D, YYYY") : "Select a date"}
                </h3>
              </div>

              {selectedDateStudies.length > 0 ? (
                <ScrollArea className="h-[140px] sm:h-[180px]">
                  <div className="space-y-1.5 sm:space-y-2">
                    {selectedDateStudies.map((study) => {
                      const meta = study.meta as any;
                      return (
                        <div
                          key={study.id}
                          className="flex items-center justify-between p-2 sm:p-2.5 rounded-lg bg-background hover:bg-muted/50 transition-colors cursor-pointer border"
                          onClick={() => navigate(`/app/studies/${study.id}`)}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <Activity className="h-3 w-3 sm:h-4 sm:w-4 text-primary shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-xs sm:text-sm truncate">
                                {meta?.patient_name || meta?.patient_id || study.id.slice(0, 6)}
                              </p>
                              <p className="text-[10px] sm:text-xs text-muted-foreground">
                                {dayjs(study.created_at).format("h:mm A")}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Badge variant="outline" className={`text-[10px] sm:text-xs px-1.5 ${getStatusColor(study.state, study.triage_status)}`}>
                              {study.triage_status === "completed" || study.state === "signed" ? "Done" :
                               study.triage_status === "processing" ? "Run" :
                               study.state === "uploaded" ? "New" : study.state?.slice(0, 4)}
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              ) : (
                <div className="flex flex-col items-center justify-center h-[140px] sm:h-[180px] text-muted-foreground">
                  <FileText className="h-6 w-6 sm:h-8 sm:w-8 mb-1.5 sm:mb-2 opacity-50" />
                  <p className="text-xs sm:text-sm">No studies</p>
                  {date && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-1 sm:mt-2 text-xs h-7"
                      onClick={() => navigate("/app/files")}
                    >
                      Upload
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