import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import dayjs from "dayjs";

export default function AdminStudies() {
  const { data: studies, isLoading } = useQuery({
    queryKey: ['admin-studies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('studies')
        .select('*, clinics(name)')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    }
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold logo-text">Studies</h1>
        <p className="text-muted-foreground mt-1">All studies across all clinics</p>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b">
                <tr className="text-left text-sm text-muted-foreground">
                  <th className="p-4 font-medium">Patient ID</th>
                  <th className="p-4 font-medium">Clinic</th>
                  <th className="p-4 font-medium">State</th>
                  <th className="p-4 font-medium">SLA</th>
                  <th className="p-4 font-medium">Created</th>
                  <th className="p-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {studies?.map((study) => {
                  const meta = study.meta as any;
                  return (
                    <tr key={study.id} className="border-b hover:bg-muted/50">
                      <td className="p-4 font-mono text-sm">{meta?.patient_id || 'N/A'}</td>
                      <td className="p-4">{(study.clinics as any)?.name || '-'}</td>
                      <td className="p-4">
                        <Badge variant="outline">{study.state}</Badge>
                      </td>
                      <td className="p-4">
                        <Badge variant={study.sla === 'STAT' ? 'destructive' : 'secondary'}>
                          {study.sla}
                        </Badge>
                      </td>
                      <td className="p-4 text-sm text-muted-foreground">
                        {dayjs(study.created_at).format('YYYY-MM-DD HH:mm')}
                      </td>
                      <td className="p-4">
                        <Button variant="ghost" size="sm" asChild>
                          <Link to={`/app/studies/${study.id}`}>
                            <ExternalLink className="h-4 w-4" />
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
