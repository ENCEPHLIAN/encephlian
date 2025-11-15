import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Search, FileText } from "lucide-react";
import dayjs from "dayjs";

const stateColors = {
  uploaded: "bg-blue-500",
  preprocessing: "bg-yellow-500",
  ai_draft: "bg-purple-500",
  in_review: "bg-orange-500",
  signed: "bg-green-500",
  failed: "bg-red-500",
};

export default function Studies() {
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<string>("all");

  const { data: studies, isLoading } = useQuery({
    queryKey: ["studies", stateFilter],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      let query = supabase
        .from("studies")
        .select("*, clinics(name)")
        .or(`owner.eq.${user.id},sample.eq.true`)
        .order("created_at", { ascending: false });

      if (stateFilter !== "all") {
        query = query.eq("state", stateFilter as any);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    }
  });

  const filteredStudies = studies?.filter((study) => {
    const meta = study.meta as any;
    const patientName = meta?.patient_name || "";
    const patientId = meta?.patient_id || "";
    return (
      patientName.toLowerCase().includes(search.toLowerCase()) ||
      patientId.toLowerCase().includes(search.toLowerCase())
    );
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Studies</h1>
        <p className="text-muted-foreground">View and manage all EEG studies</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by patient name or ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={stateFilter} onValueChange={setStateFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filter by state" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All States</SelectItem>
                <SelectItem value="uploaded">Uploaded</SelectItem>
                <SelectItem value="preprocessing">Preprocessing</SelectItem>
                <SelectItem value="ai_draft">AI Draft</SelectItem>
                <SelectItem value="in_review">In Review</SelectItem>
                <SelectItem value="signed">Signed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Patient</TableHead>
                <TableHead>Clinic</TableHead>
                <TableHead>SLA</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Created</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredStudies?.map((study) => {
                const meta = study.meta as any;
                return (
                  <TableRow key={study.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div>
                          <div className="font-medium">{meta?.patient_name || "N/A"}</div>
                          <div className="text-sm text-muted-foreground">{meta?.patient_id || "N/A"}</div>
                        </div>
                        {(study as any).sample && (
                          <Badge variant="outline" className="ml-2">
                            Sample
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{study.clinics?.name}</TableCell>
                    <TableCell>
                      <Badge variant={study.sla === "STAT" ? "destructive" : "secondary"}>
                        {study.sla}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={stateColors[study.state as keyof typeof stateColors]}>
                        {study.state.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>{dayjs(study.created_at).format("MMM D, YYYY")}</TableCell>
                    <TableCell>
                      <Button asChild variant="ghost" size="sm">
                        <Link to={`/app/studies/${study.id}`}>
                          <FileText className="h-4 w-4" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {filteredStudies?.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              No studies found
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
