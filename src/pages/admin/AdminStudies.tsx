import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Search, ExternalLink, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useClinicSelector } from "@/hooks/useClinicSelector";

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
  study_key?: string | null;
  storage_backend?: string | null;
  latest_run_id?: string | null;
};

export default function AdminStudies() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { selectedClinicId } = useClinicSelector();
  const [searchQuery, setSearchQuery] = useState("");
  const [stateFilter, setStateFilter] = useState<string>("all");
  const [deleteStudy, setDeleteStudy] = useState<StudyWithClinic | null>(null);

  const { data: studies, isLoading } = useQuery<StudyWithClinic[]>({
    queryKey: ["admin-all-studies", selectedClinicId],
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

      let result = (studiesData || []).map((s: any) => ({
        ...s,
        clinic_name: clinicMap.get(s.clinic_id) || "Unknown",
        last_event_at: lastEventMap.get(s.id),
      }));

      // Apply clinic filter if selected
      if (selectedClinicId) {
        result = result.filter((s: any) => s.clinic_id === selectedClinicId);
      }

      return result;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (studyId: string) => {
      const { data, error } = await supabase.rpc("admin_delete_study", {
        p_study_id: studyId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Study deleted successfully");
      queryClient.invalidateQueries({ queryKey: ["admin-all-studies"] });
      setDeleteStudy(null);
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to delete study");
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
    processing: "bg-cyan-500/10 text-cyan-500",
    ai_draft: "bg-cyan-500/10 text-cyan-500",
    in_review: "bg-orange-500/10 text-orange-500",
    completed: "bg-green-500/10 text-green-500",
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
        <h1 className="text-2xl font-bold tracking-tight">Studies Queue</h1>
        <p className="text-sm text-muted-foreground">
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
            className="pl-9"
          />
        </div>
        <Select value={stateFilter} onValueChange={setStateFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Filter by state" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All States</SelectItem>
            <SelectItem value="uploaded">Uploaded</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
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
                <TableHead>ID / Key</TableHead>
                <TableHead>Clinic</TableHead>
                <TableHead>Patient ID</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Backend</TableHead>
                <TableHead>Run ID</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredStudies?.map((study) => (
                <TableRow key={study.id} className="group">
                  <TableCell className="font-mono text-xs">
                    <div>{study.study_key || study.id.slice(0, 8)}</div>
                    {study.study_key && (
                      <div className="text-muted-foreground text-[10px]">{study.id.slice(0, 8)}...</div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {study.clinic_name}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {study.meta?.patient_id || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={`text-xs ${stateColors[study.state || "uploaded"]}`}
                    >
                      {(study.state || "uploaded").toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs font-mono">
                      {study.storage_backend || "supabase"}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {study.latest_run_id ? study.latest_run_id.slice(0, 8) : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(study.created_at), "MMM d, HH:mm")}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8"
                        onClick={() => navigate(`/admin/studies/${study.id}`)}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteStudy(study);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
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

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteStudy} onOpenChange={() => setDeleteStudy(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Study</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this study and all associated data including files, reports, and markers.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteStudy && deleteMutation.mutate(deleteStudy.id)}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete Study"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
