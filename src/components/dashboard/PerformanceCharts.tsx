import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import dayjs from "dayjs";
import { useDemoMode } from "@/contexts/DemoModeContext";
import { useMemo } from "react";

interface Study {
  id: string;
  state: string;
  created_at: string;
  triage_started_at?: string;
  triage_completed_at?: string;
}

interface PerformanceChartsProps {
  studies: Study[];
}

export default function PerformanceCharts({ studies }: PerformanceChartsProps) {
  const { isDemoMode } = useDemoMode();

  // Prepare data for last 7 days - studies completed
  const last7Days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const date = dayjs().subtract(6 - i, 'day');
      const count = studies.filter(s => 
        s.state === 'signed' && 
        dayjs(s.created_at).isSame(date, 'day')
      ).length;
      
      return {
        date: date.format('MMM DD'),
        count
      };
    });
  }, [studies]);

  // Calculate real turnaround time from actual data
  const turnaroundData = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const date = dayjs().subtract(6 - i, 'day');
      
      // Find studies completed on this day with timing data
      const dayStudies = studies.filter(s => {
        const isCompleted = s.state === 'signed';
        const completedOnDay = dayjs(s.created_at).isSame(date, 'day');
        return isCompleted && completedOnDay;
      });

      // Calculate average turnaround in hours
      let avgHours = 0;
      if (dayStudies.length > 0) {
        const totalHours = dayStudies.reduce((sum, s) => {
          const study = s as any;
          if (study.triage_started_at && study.triage_completed_at) {
            const start = dayjs(study.triage_started_at);
            const end = dayjs(study.triage_completed_at);
            return sum + end.diff(start, 'hour', true);
          }
          // Fallback: estimate based on SLA
          return sum + 12;
        }, 0);
        avgHours = totalHours / dayStudies.length;
      }
      
      return {
        date: date.format('MMM DD'),
        hours: Math.round(avgHours * 10) / 10 || 0
      };
    });
  }, [studies]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Studies Completed</CardTitle>
              <p className="text-sm text-muted-foreground">Last 7 days</p>
            </div>
            {isDemoMode && <Badge variant="outline" className="text-xs">Demo</Badge>}
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={last7Days}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="date" 
                className="text-xs" 
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
              />
              <YAxis 
                className="text-xs" 
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px'
                }}
              />
              <Bar 
                dataKey="count" 
                fill="hsl(var(--primary))" 
                radius={[8, 8, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Avg Turnaround Time</CardTitle>
              <p className="text-sm text-muted-foreground">Last 7 days (hours)</p>
            </div>
            {isDemoMode && <Badge variant="outline" className="text-xs">Demo</Badge>}
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={turnaroundData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="date" 
                className="text-xs" 
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
              />
              <YAxis 
                className="text-xs" 
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
                domain={[0, 30]}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px'
                }}
                formatter={(value: number) => [`${value.toFixed(1)}h`, 'Turnaround']}
              />
              <Line 
                type="monotone" 
                dataKey="hours" 
                stroke="hsl(var(--primary))" 
                strokeWidth={2}
                dot={{ fill: 'hsl(var(--primary))' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
