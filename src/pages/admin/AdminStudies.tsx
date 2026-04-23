import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Search, Trash2, RotateCcw, ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatStudySourceLine, getStudyOriginalFilename } from "@/lib/studySourceFile";

type Study = {
  id: string;
  clinic_id: string;
  owner: string;
  sla: string;
  state: string | null;
  meta: any;
  original_format?: string | null;
  created_at: string;
  study_key?: string | null;
  clinic_name?: string;
};

const STATE_STYLE: Record<string, string> = {
  awaiting_sla: "bg-muted/50 text-muted-foreground",
  pending:      "bg-muted/50 text-muted-foreground",
  uploaded:     "bg-blue-500/10 text-blue-500",
  processing:   "bg-amber-500/10 text-amber-500",
  ai_draft:     "bg-violet-500/10 text-violet-500",
  complete:     "bg-emerald-500/10 text-emerald-500",
  signed:       "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  failed:       "bg-red-500/10 text-red-500",
};

export default function AdminStudies() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<string>(searchParams.get("state") || "all");
  const [deleteTarget, setDeleteTarget] = useState<Study | null>(null);

  const { data: studies, isLoading } = useQuery<Study[]>({
    queryKey: ["admin-all-studies"],
    queryFn: async () => {
      const [studiesRes, clinicsRes] = await Promise.all([
        supabase.rpc("admin_get_all_studies"),
        supabase.from("clinics").select("id, name"),
      ]);
      if (studiesRes.error) throw studiesRes.error;
      const clinicMap = new Map((clinicsRes.data || []).map((c) => [c.id, c.name]));
      return (studiesRes.data || []).map((s: any) => ({
        ...s,
        clinic_name: clinicMap.get(s.clinic_id) || "—",
      }));
    },
    refetchInterval: 15000,
  });

  const retryMutation = useMutation({
    mutationFn: async (studyId: string) => {
      const res = await supabase.functions.invoke("generate_ai_report", {
        body: { study_id: studyId },
      });
      if (res.error) throw res.error;
    },
    onSuccess: () => {
      toast.success("Pipeline restarted");
      queryClient.invalidateQueries({ queryKey: ["admin-all-studies"] });
    },
    onError: (err: any) => toast.error(err.message || "Retry failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (studyId: string) => {
      const { error } = await supabase.rpc("admin_delete_study", { p_study_id: studyId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Study deleted");
      queryClient.invalidateQueries({ queryKey: ["admin-all-studies"] });
      setDeleteTarget(null);
    },
    onError: (err: any) => toast.error(err.message || "Delete failed"),
  });

  const filtered = studies?.filter((s) => {
    const fn = getStudyOriginalFilename(s.meta)?.toLowerCase() ?? "";
    const matchSearch = !search
      || s.id.toLowerCase().includes(search.toLowerCase())
      || s.meta?.patient_id?.toLowerCase().includes(search.toLowerCase())
      || s.meta?.patient_name?.toLowerCase().includes(search.toLowerCase())
      || s.clinic_name?.toLowerCase().includes(search.toLowerCase())
      || fn.includes(search.toLowerCase());
    const matchState = stateFilter === "all" || s.state === stateFilter;
    return matchSearch && matchState;
  }) ?? [];

  const counts = studies?.reduce<Record<string, number>>((acc, s) => {
    const k = s.state || "pending";
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {}) ?? {};

  return (
    <div className="space-y-4 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Studies</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {studies?.length ?? 0} total
            {counts["failed"] ? ` · ${counts["failed"]} failed` : ""}
            {counts["processing"] ? ` · ${counts["processing"]} processing` : ""}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="ID, patient, file, clinic…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
        <Select value={stateFilter} onValueChange={setStateFilter}>
          <SelectTrigger className="w-36 h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All states</SelectItem>
            {Object.keys(STATE_STYLE).map((s) => (
              <SelectItem key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
                {counts[s] ? ` (${counts[s]})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="rounded-lg border border-border/60 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40 bg-muted/30">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Study</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Clinic</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Patient</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden lg:table-cell max-w-[200px]">
                  Recording
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">State</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Created</th>
                <th className="px-4 py-2.5 w-24" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {filtered.length > 0 ? (
                filtered.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => navigate(`/admin/studies/${s.id}`)}
                    className="hover:bg-accent/20 transition-colors cursor-pointer group"
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-muted-foreground">
                        {s.study_key || s.id.slice(0, 8)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{s.clinic_name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {s.meta?.patient_id || "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell max-w-[200px]">
                      <span className="line-clamp-2 break-all" title={formatStudySourceLine(s.meta, s.original_format ?? null) || undefined}>
                        {formatStudySourceLine(s.meta, s.original_format ?? null) || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant="secondary"
                        className={cn("text-[10px] h-4 px-1.5", STATE_STYLE[s.state || "pending"])}
                      >
                        {s.state || "pending"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(s.created_at), { addSuffix: true })}
                    </td>
                    <td className="px-4 py-3">
                      <div
                        className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {s.state === "failed" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="Retry pipeline"
                            onClick={() => retryMutation.mutate(s.id)}
                            disabled={retryMutation.isPending}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Open"
                          onClick={() => navigate(`/admin/studies/${s.id}`)}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                          title="Delete"
                          onClick={() => setDeleteTarget(s)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-xs text-muted-foreground">
                    No studies match the current filters
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete study?</AlertDialogTitle>
            <AlertDialogDescription>
              Study <code className="font-mono text-xs">{deleteTarget?.id.slice(0, 8)}</code> and all
              associated data — files, reports, markers — will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
