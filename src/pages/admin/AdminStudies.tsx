import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Search, ExternalLink } from "lucide-react";
import { format } from "date-fns";

type StudyWithClinic = {
  id: string;
  clinic_id: string;
  owner: string;
  sla: string;
  state: string | null;
  meta: any;
  created_at: string;
  report_locked: boolean | null;
  clinic_name?: string;
  last_event_at?: string;
};

export default function AdminStudies() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [stateFilter, setStateFilter] = useState<string>("all");

  const { data: studies, isLoading } = useQuery<StudyWithClinic[]>({
    queryKey: ["admin-all-studies"],
    queryFn: async () => {
      // Get all studies via admin function
      const { data: studiesData, error: studiesError } = await supabase.rpc("admin_get_all_studies");
      if (studiesError) throw studiesError;

      // Get clinic names
      const { data: clinics } = await supabase.from("clinics").select("id, name");
      const clinicMap = new Map(clinics?.map(c => [c.id, c.name]) || []);

      // Get last event for each study
      const { data: events } = await supabase
        .from("review_events")
        .select("study_id, created_at")
        .order("created_at", { ascending: false });

      const lastEventMap = new Map<string, string>();
      events?.forEach(e => {
        if (e.study_id && !lastEventMap.has(e.study_id)) {
          lastEventMap.set(e.study_id, e.created_at);
        }
      });

      return (studiesData || []).map((s: any) => ({
        ...s,
        clinic_name: clinicMap.get(s.clinic_id) || "Unknown",
        last_event_at: lastEventMap.get(s.id),
      }));
    },
  });

  const filteredStudies = studies?.filter((study) => {
    const matchesSearch =
      !searchQuery ||
      study.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      study.meta?.patient_id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      study.clinic_name?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesState = stateFilter === "all" || study.state === stateFilter;

    return matchesSearch && matchesState;
  });

  const stateColors: Record<string, string> = {
    uploaded: "bg-blue-500/10 text-blue-500",
    parsed: "bg-yellow-500/10 text-yellow-500",
    canonicalized: "bg-purple-500/10 text-purple-500",
    ai_draft: "bg-cyan-500/10 text-cyan-500",
    in_review: "bg-orange-500/10 text-orange-500",
    signed: "bg-green-500/10 text-green-500",
    failed: "bg-red-500/10 text-red-500",
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-mono font-bold tracking-tight">Studies Queue</h1>
        <p className="text-sm text-muted-foreground font-mono">
          All studies across all clinics
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by ID, patient, clinic..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 font-mono"
          />
        </div>
        <Select value={stateFilter} onValueChange={setStateFilter}>
          <SelectTrigger className="w-40 font-mono">
            <SelectValue placeholder="Filter by state" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All States</SelectItem>
            <SelectItem value="uploaded">Uploaded</SelectItem>
            <SelectItem value="parsed">Parsed</SelectItem>
            <SelectItem value="canonicalized">Canonicalized</SelectItem>
            <SelectItem value="ai_draft">AI Draft</SelectItem>
            <SelectItem value="in_review">In Review</SelectItem>
            <SelectItem value="signed">Signed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Studies Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-mono">ID</TableHead>
                <TableHead className="font-mono">Clinic</TableHead>
                <TableHead className="font-mono">Patient ID</TableHead>
                <TableHead className="font-mono">State</TableHead>
                <TableHead className="font-mono">SLA</TableHead>
                <TableHead className="font-mono">Created</TableHead>
                <TableHead className="font-mono">Last Event</TableHead>
                <TableHead className="font-mono"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredStudies?.map((study) => (
                <TableRow
                  key={study.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => navigate(`/admin/studies/${study.id}`)}
                >
                  <TableCell className="font-mono text-xs">
                    {study.id.slice(0, 8)}...
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {study.clinic_name}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {study.meta?.patient_id || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={`font-mono text-xs ${stateColors[study.state || "uploaded"]}`}
                    >
                      {(study.state || "uploaded").toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={study.sla === "STAT" ? "destructive" : "outline"}
                      className="font-mono text-xs"
                    >
                      {study.sla}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(study.created_at), "MMM d, HH:mm")}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {study.last_event_at
                      ? format(new Date(study.last_event_at), "MMM d, HH:mm")
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {(!filteredStudies || filteredStudies.length === 0) && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No studies found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
