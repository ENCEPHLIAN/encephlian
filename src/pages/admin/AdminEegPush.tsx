import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Loader2, Upload, SendHorizontal, AlertCircle, CheckCircle2, Clock, Trash2 } from "lucide-react";
import { toast } from "sonner";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

interface User {
  id: string;
  email: string;
  full_name: string;
}

interface Clinic {
  id: string;
  name: string;
  city: string;
}

interface PushedStudy {
  id: string;
  owner: string;
  clinic_id: string;
  state: string;
  triage_status: string;
  created_at: string;
  uploaded_file_path: string;
  meta: any;
}

const CPLANE_BASE = (import.meta as any).env?.VITE_CPLANE_BASE as string | undefined;

export default function AdminEegPush() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedClinicId, setSelectedClinicId] = useState("");
  const [filePath, setFilePath] = useState("");
  const [patientId, setPatientId] = useState("");
  const [notes, setNotes] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStage, setUploadStage] = useState("");
  const [deleteStudy, setDeleteStudy] = useState<PushedStudy | null>(null);

  // Fetch clinician users
  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ["admin-clinician-users"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_get_all_users");
      if (error) throw error;
      // Filter to only clinician users (not admins)
      return (data as User[]).filter((u: any) => {
        const roles = u.app_roles || [];
        return !roles.some((r: any) => 
          r.role === "super_admin" || r.role === "management"
        );
      });
    },
  });

  // Fetch clinics
  const { data: clinics, isLoading: clinicsLoading } = useQuery({
    queryKey: ["admin-all-clinics"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_get_all_clinics");
      if (error) throw error;
      return data as Clinic[];
    },
  });

  // Fetch recently pushed studies (both awaiting_sla and others)
  const { data: recentPushes, isLoading: pushesLoading } = useQuery({
    queryKey: ["admin-recent-pushes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("studies")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as PushedStudy[];
    },
  });

  // Push EEG mutation
  const pushMutation = useMutation({
    mutationFn: async (params: {
      userId: string;
      clinicId: string;
      filePath: string;
      meta: any;
    }) => {
      const { data, error } = await supabase.rpc("admin_push_eeg_to_user", {
        p_user_id: params.userId,
        p_clinic_id: params.clinicId,
        p_file_path: params.filePath,
        p_meta: params.meta,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      toast.success("EEG pushed to user successfully!");
      queryClient.invalidateQueries({ queryKey: ["admin-recent-pushes"] });
      setDialogOpen(false);
      resetForm();
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to push EEG");
    },
  });

  // Delete mutation
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
      queryClient.invalidateQueries({ queryKey: ["admin-recent-pushes"] });
      setDeleteStudy(null);
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to delete study");
    },
  });

  const resetForm = () => {
    setSelectedUserId("");
    setSelectedClinicId("");
    setFilePath("");
    setPatientId("");
    setNotes("");
    setUploadFile(null);
  };

  const handleFileUpload = async () => {
    if (!uploadFile || !selectedUserId || !selectedClinicId) {
      toast.error("Please select a user, clinic, and file");
      return;
    }
    if (!CPLANE_BASE) {
      toast.error("C-Plane not configured (VITE_CPLANE_BASE missing)");
      return;
    }

    setIsUploading(true);
    setUploadStage("Creating study record...");
    try {
      // 1. Create study record for the target user via admin RPC
      const pid = patientId || `PAT-${Date.now().toString(36).toUpperCase()}`;
      const { data: studyData, error: studyErr } = await supabase.rpc("admin_push_eeg_to_user", {
        p_user_id: selectedUserId,
        p_clinic_id: selectedClinicId,
        p_file_path: `blob:eeg-raw/pending`,
        p_meta: {
          patient_id: pid,
          admin_notes: notes,
          admin_pushed: true,
          pushed_at: new Date().toISOString(),
          original_filename: uploadFile.name,
          file_size_bytes: uploadFile.size,
        },
      });
      if (studyErr) throw studyErr;

      const studyId = typeof studyData === "string" ? studyData : (studyData as any)?.id;
      if (!studyId) throw new Error("No study ID returned from push RPC");

      // 2. Get SAS upload token from C-Plane
      setUploadStage("Getting upload token...");
      const tokenRes = await fetch(`${CPLANE_BASE}/upload-token/${studyId}`, { method: "POST" });
      if (!tokenRes.ok) throw new Error(`Token failed: HTTP ${tokenRes.status}`);
      const { sas_url: sasUrl } = await tokenRes.json();

      // 3. Upload to Azure Blob
      setUploadStage(`Uploading ${uploadFile.name}...`);
      const CHUNK_SIZE = 4 * 1024 * 1024;
      if (uploadFile.size <= 25 * 1024 * 1024) {
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}`)));
          xhr.onerror = () => reject(new Error("Network error"));
          xhr.timeout = 300000;
          xhr.ontimeout = () => reject(new Error("Upload timeout"));
          xhr.open("PUT", sasUrl);
          xhr.setRequestHeader("x-ms-blob-type", "BlockBlob");
          xhr.setRequestHeader("Content-Type", "application/octet-stream");
          xhr.send(uploadFile);
        });
      } else {
        const totalBlocks = Math.ceil(uploadFile.size / CHUNK_SIZE);
        const blockIds: string[] = [];
        for (let i = 0; i < totalBlocks; i++) {
          const blockId = btoa(`block-${String(i).padStart(6, "0")}`);
          blockIds.push(blockId);
          const chunk = uploadFile.slice(i * CHUNK_SIZE, Math.min((i + 1) * CHUNK_SIZE, uploadFile.size));
          const res = await fetch(`${sasUrl}&comp=block&blockid=${encodeURIComponent(blockId)}`, {
            method: "PUT",
            headers: { "x-ms-blob-type": "BlockBlob", "Content-Type": "application/octet-stream" },
            body: chunk,
          });
          if (!res.ok) throw new Error(`Block ${i} failed: HTTP ${res.status}`);
          setUploadStage(`Uploading block ${i + 1}/${totalBlocks}...`);
        }
        const xml = `<?xml version="1.0" encoding="utf-8"?><BlockList>${blockIds.map(id => `<Latest>${id}</Latest>`).join("")}</BlockList>`;
        const commit = await fetch(`${sasUrl}&comp=blocklist`, { method: "PUT", headers: { "Content-Type": "application/xml" }, body: xml });
        if (!commit.ok) throw new Error(`Block list commit failed: HTTP ${commit.status}`);
      }

      // 4. Update study state and trigger pipeline
      setUploadStage("Triggering pipeline...");
      await supabase.from("studies").update({ state: "uploaded", uploaded_file_path: `blob:eeg-raw/${studyId}.edf` }).eq("id", studyId);
      fetch(`${CPLANE_BASE}/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ study_id: studyId }),
      }).catch((err) => console.warn("C-Plane trigger:", err));

      queryClient.invalidateQueries({ queryKey: ["admin-recent-pushes"] });
      setDialogOpen(false);
      resetForm();
      toast.success(`EEG pushed and pipeline started for ${pid}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to upload and push EEG");
    } finally {
      setIsUploading(false);
      setUploadStage("");
    }
  };

  const handleManualPush = () => {
    if (!selectedUserId || !selectedClinicId || !filePath) {
      toast.error("Please fill all required fields");
      return;
    }

    pushMutation.mutate({
      userId: selectedUserId,
      clinicId: selectedClinicId,
      filePath: filePath,
      meta: {
        patient_id: patientId || `PAT-${Date.now().toString(36).toUpperCase()}`,
        admin_notes: notes,
        admin_pushed: true,
        pushed_at: new Date().toISOString(),
      },
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "awaiting_sla":
      case "pending":
        return <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30">Awaiting SLA</Badge>;
      case "processing":
        return <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30">Processing</Badge>;
      case "completed":
        return <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">Completed</Badge>;
      default:
        return <Badge variant="secondary">{status || "pending"}</Badge>;
    }
  };

  const getUserEmail = (userId: string) => {
    const user = users?.find((u) => u.id === userId);
    return user?.email || user?.full_name || userId.slice(0, 8);
  };

  const getClinicName = (clinicId: string) => {
    const clinic = clinics?.find((c) => c.id === clinicId);
    return clinic?.name || clinicId.slice(0, 8);
  };

  if (usersLoading || clinicsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const awaitingSlaPushes = recentPushes?.filter((p) => !p.triage_status || p.triage_status === "awaiting_sla" || p.triage_status === "pending") || [];
  const processingPushes = recentPushes?.filter((p) => p.triage_status === "processing") || [];
  const completedToday = recentPushes?.filter((p) => p.triage_status === "completed" && dayjs(p.created_at).isAfter(dayjs().startOf("day"))) || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">EEG Push Controls</h1>
        <p className="text-sm text-muted-foreground">
          Manually push EEG files to clinician dashboards for SLA selection
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Awaiting SLA
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {awaitingSlaPushes.length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Loader2 className="h-4 w-4" />
              Processing
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {processingPushes.length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Completed Today
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {completedToday.length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Push EEG Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Push EEG to User</CardTitle>
              <CardDescription>
                Upload or specify an EEG file path to push to a clinician's dashboard
              </CardDescription>
            </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Upload className="h-4 w-4 mr-2" />
                  Push New EEG
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Push EEG to Clinician</DialogTitle>
                </DialogHeader>

                <div className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label>Target Clinician *</Label>
                    <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select clinician..." />
                      </SelectTrigger>
                      <SelectContent position="popper" sideOffset={4}>
                        {users?.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.full_name || user.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Clinic *</Label>
                    <Select value={selectedClinicId} onValueChange={setSelectedClinicId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select clinic..." />
                      </SelectTrigger>
                      <SelectContent position="popper" sideOffset={4}>
                        {clinics?.map((clinic) => (
                          <SelectItem key={clinic.id} value={clinic.id}>
                            {clinic.name} {clinic.city && `(${clinic.city})`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Upload EEG File</Label>
                    <Input
                      type="file"
                      accept=".edf,.bdf,.eeg"
                      onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Supports EDF, BDF, and EEG formats
                    </p>
                  </div>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-background px-2 text-muted-foreground">
                        Or specify path
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>File Path (if already uploaded)</Label>
                    <Input
                      placeholder="e.g., user-id/filename.edf"
                      value={filePath}
                      onChange={(e) => setFilePath(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Patient ID</Label>
                    <Input
                      placeholder="e.g., PAT-001"
                      value={patientId}
                      onChange={(e) => setPatientId(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Admin Notes</Label>
                    <Textarea
                      placeholder="Any notes for the clinician..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={2}
                    />
                  </div>

                  <div className="flex gap-3 pt-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => setDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    {uploadFile ? (
                      <Button
                        className="flex-1"
                        onClick={handleFileUpload}
                        disabled={isUploading || !selectedUserId || !selectedClinicId}
                      >
                        {isUploading ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            {uploadStage || "Uploading..."}
                          </>
                        ) : (
                          <>
                            <Upload className="h-4 w-4 mr-2" />
                            Upload & Push
                          </>
                        )}
                      </Button>
                    ) : (
                      <Button
                        className="flex-1"
                        onClick={handleManualPush}
                        disabled={pushMutation.isPending || !selectedUserId || !selectedClinicId || !filePath}
                      >
                        {pushMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Pushing...
                          </>
                        ) : (
                          <>
                            <SendHorizontal className="h-4 w-4 mr-2" />
                            Push to User
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
      </Card>

      {/* Recent Pushes Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Studies</CardTitle>
          <CardDescription>EEG files pushed to clinicians and their status</CardDescription>
        </CardHeader>
        <CardContent>
          {pushesLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : recentPushes && recentPushes.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patient ID</TableHead>
                  <TableHead>Clinician</TableHead>
                  <TableHead>Clinic</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Pushed</TableHead>
                  <TableHead className="w-16">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentPushes.map((push) => {
                  const meta = (push.meta || {}) as Record<string, any>;
                  return (
                    <TableRow key={push.id}>
                      <TableCell className="font-mono">
                        {meta.patient_id || push.id.slice(0, 8)}
                      </TableCell>
                      <TableCell>{getUserEmail(push.owner)}</TableCell>
                      <TableCell>{getClinicName(push.clinic_id)}</TableCell>
                      <TableCell>{getStatusBadge(push.triage_status)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {dayjs(push.created_at).fromNow()}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setDeleteStudy(push)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <AlertCircle className="h-4 w-4 mr-2" />
              No recent pushes
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteStudy} onOpenChange={() => setDeleteStudy(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Study</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this study and all associated data. This action cannot be undone.
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
