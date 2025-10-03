import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

export default function Studies() {
  const { data: studies, isLoading } = useQuery({
    queryKey: ["studies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("studies")
        .select(`
          *,
          clinics(name)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Studies</h1>
        <p className="text-muted-foreground">
          Manage all research studies
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Studies</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Loading...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Clinic</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>End Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {studies?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      No studies found
                    </TableCell>
                  </TableRow>
                ) : (
                  studies?.map((study) => (
                    <TableRow key={study.id}>
                      <TableCell className="font-medium">{study.title}</TableCell>
                      <TableCell>{study.clinics?.name || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={study.status === "active" ? "default" : "secondary"}>
                          {study.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {study.start_date ? format(new Date(study.start_date), "MMM dd, yyyy") : "—"}
                      </TableCell>
                      <TableCell>
                        {study.end_date ? format(new Date(study.end_date), "MMM dd, yyyy") : "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
