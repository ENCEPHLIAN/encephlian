import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import dayjs from "dayjs";

interface PerformanceChartsProps {
  studies: any[];
}

export default function PerformanceCharts({ studies }: PerformanceChartsProps) {
  // Prepare data for last 7 days
  const last7Days = Array.from({ length: 7 }, (_, i) => {
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

  // Prepare turnaround time data (mock data for now)
  const turnaroundData = Array.from({ length: 7 }, (_, i) => {
    const date = dayjs().subtract(6 - i, 'day');
    return {
      date: date.format('MMM DD'),
      hours: Math.random() * 20 + 10 // Random between 10-30 hours
    };
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Studies Completed</CardTitle>
          <p className="text-sm text-muted-foreground">Last 7 days</p>
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
          <CardTitle>Avg Turnaround Time</CardTitle>
          <p className="text-sm text-muted-foreground">Last 7 days (hours)</p>
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
              />
              <Line 
                type="monotone" 
                dataKey="hours" 
                stroke="hsl(var(--primary))" 
                strokeWidth={2}
                dot={{ fill: 'hsl(var(--primary))' }}
              />
              {/* Goal lines */}
              <Line 
                type="monotone" 
                dataKey={() => 24} 
                stroke="hsl(var(--warning))" 
                strokeDasharray="5 5"
                dot={false}
                strokeWidth={1}
              />
              <Line 
                type="monotone" 
                dataKey={() => 6} 
                stroke="hsl(var(--success))" 
                strokeDasharray="5 5"
                dot={false}
                strokeWidth={1}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
