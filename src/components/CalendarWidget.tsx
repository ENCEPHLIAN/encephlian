import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Activity, FileText, Clock, CalendarDays } from "lucide-react";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

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

  // Fetch studies with optimized query
  const { data: studies } = useQuery({
    queryKey: ["calendar-studies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("studies")
        .select("id, created_at, state, sla, meta, triage_status")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as Study[];
    },
    staleTime: 30000,
    gcTime: 60000,
  });

  // Memoized study dates
  const studyDates = useMemo(() => {
    if (!studies) return new Set<string>();
    return new Set(studies.map(s => dayjs(s.created_at).format("YYYY-MM-DD")));
  }, [studies]);

  // Memoized selected date studies
  const selectedDateStudies = useMemo(() => {
    if (!date || !studies) return [];
    const selectedDay = dayjs(date).format("YYYY-MM-DD");
    return studies.filter(s => dayjs(s.created_at).format("YYYY-MM-DD") === selectedDay);
  }, [date, studies]);

  // Memoized modifiers
  const modifiers = useMemo(() => ({
    hasStudies: (day: Date) => studyDates.has(dayjs(day).format("YYYY-MM-DD")),
  }), [studyDates]);

  const modifiersStyles = useMemo(() => ({
    hasStudies: {
      fontWeight: 700,
      backgroundColor: "hsl(var(--primary) / 0.15)",
      borderRadius: "50%",
    },
  }), []);

  const getStatusColor = useCallback((state: string, triage_status?: string) => {
    if (triage_status === "completed" || state === "signed") return "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400";
    if (triage_status === "processing") return "bg-blue-500/20 text-blue-600 dark:text-blue-400";
    if (state === "uploaded") return "bg-amber-500/20 text-amber-600 dark:text-amber-400";
    return "bg-muted text-muted-foreground";
  }, []);

  // Count stats for selected date
  const dateStats = useMemo(() => {
    if (!selectedDateStudies.length) return null;
    const completed = selectedDateStudies.filter(s => s.triage_status === "completed" || s.state === "signed").length;
    const pending = selectedDateStudies.filter(s => s.state === "uploaded").length;
    const processing = selectedDateStudies.filter(s => s.triage_status === "processing").length;
    return { completed, pending, processing };
  }, [selectedDateStudies]);

  return (
    <Card className="openai-card border-2">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Study Calendar</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Studies List Panel - takes remaining space */}
          <div className="flex-1 min-w-0">
            <div className="rounded-lg border bg-muted/30 p-3 h-full flex flex-col">
              <div className="flex items-center gap-2 mb-3 shrink-0">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-semibold text-sm">
                  {date ? dayjs(date).format("DD MMM YYYY") : "Select a date"}
                </h3>
                {selectedDateStudies.length > 0 && (
                  <Badge variant="outline" className="ml-auto text-xs">
                    {selectedDateStudies.length}
                  </Badge>
                )}
              </div>

              {/* Date Stats - show when there are studies */}
              {dateStats && (
                <div className="flex items-center gap-3 mb-3 text-xs">
                  <span className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    {dateStats.completed} done
                  </span>
                  <span className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-amber-500" />
                    {dateStats.pending} pending
                  </span>
                  {dateStats.processing > 0 && (
                    <span className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                      {dateStats.processing} running
                    </span>
                  )}
                </div>
              )}

              {selectedDateStudies.length > 0 ? (
                <ScrollArea className="flex-1 min-h-[180px] max-h-[220px]">
                  <div className="space-y-2 pr-2">
                    {selectedDateStudies.map((study) => {
                      const meta = study.meta as any;
                      return (
                        <Tooltip key={study.id}>
                          <TooltipTrigger asChild>
                            <div
                              className="flex items-center justify-between p-2.5 rounded-lg bg-background hover:bg-muted/50 transition-all duration-200 cursor-pointer border hover:border-primary/30 hover:shadow-sm"
                              onClick={() => navigate(`/app/studies/${study.id}`)}
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <Activity className="h-4 w-4 text-primary shrink-0" />
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium text-sm truncate">
                                    {meta?.patient_name || meta?.patient_id || study.id.slice(0, 8)}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {dayjs(study.created_at).format("h:mm A")}
                                  </p>
                                </div>
                              </div>
                              <Badge variant="outline" className={`text-xs px-2 ${getStatusColor(study.state, study.triage_status)}`}>
                                {study.triage_status === "completed" || study.state === "signed" ? "Done" :
                                 study.triage_status === "processing" ? "Run" :
                                 study.state === "uploaded" ? "New" : study.state?.slice(0, 4)}
                              </Badge>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="right">View study details</TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                </ScrollArea>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground min-h-[180px]">
                  <FileText className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm">No studies on this date</p>
                  {date && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2 text-xs transition-all duration-200"
                      onClick={() => navigate("/app/files")}
                    >
                      Upload Study
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Calendar Section - compact, fits content */}
          <div className="lg:w-auto shrink-0">
            <Calendar
              mode="single"
              selected={date}
              onSelect={setDate}
              className="rounded-lg border pointer-events-auto"
              modifiers={modifiers}
              modifiersStyles={modifiersStyles}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
