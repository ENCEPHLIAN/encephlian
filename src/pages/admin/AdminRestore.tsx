import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Loader2, Trash2, RefreshCw, AlertTriangle, History, Database, HardDrive } from "lucide-react";
import dayjs from "dayjs";

export default function AdminRestore() {
  const queryClient = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Fetch clinician users
  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ["admin-clinician-users-restore"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_get_all_users");
      if (error) throw error;
      return (data as any[]).filter((u) => {
        const roles = u.app_roles || [];
        return !roles.some((r: any) => 
          r.role === "super_admin" || r.role === "management" || r.role === "ops"
        );
      });
    },
  });

  // Fetch studies for selected user
  const { data: userStudies, refetch: refetchStudies } = useQuery({
    queryKey: ["user-studies-restore", selectedUserId],
    enabled: !!selectedUserId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("studies")
        .select("*, study_files(*)")
        .eq("owner", selectedUserId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Get unique dates from studies
  const studyDates = userStudies
    ? [...new Set(userStudies.map(s => dayjs(s.created_at).format("YYYY-MM-DD")))]
    : [];

  // Storage buckets to clean
  const STORAGE_BUCKETS = ["eeg-uploads", "eeg-raw", "eeg-clean", "eeg-json", "eeg-reports", "eeg-preview"];

  // Handle full reset for a user
  const handleFullReset = async () => {
    if (!selectedUserId) return;
    
    setIsProcessing(true);
    try {
      const studies = userStudies || [];
      const studyIds = studies.map(s => s.id);

      // Delete files from storage for each study
      for (const study of studies) {
        const files = (study.study_files as any[]) || [];
        for (const file of files) {
          for (const bucket of STORAGE_BUCKETS) {
            try {
              await supabase.storage.from(bucket).remove([file.path]);
            } catch {
              // Ignore errors for missing files
            }
          }
        }
      }

      // Delete database records in correct order (foreign key constraints)
      if (studyIds.length > 0) {
        // Delete related records first
        await supabase.from("report_attachments").delete().in("study_id", studyIds);
        await supabase.from("eeg_markers").delete().in("study_id", studyIds);
        await supabase.from("review_events").delete().in("study_id", studyIds);
        await supabase.from("canonical_eeg_records").delete().in("study_id", studyIds);
        await supabase.from("ai_drafts").delete().in("study_id", studyIds);
        await supabase.from("reports").delete().in("study_id", studyIds);
        await supabase.from("study_files").delete().in("study_id", studyIds);
        await supabase.from("studies").delete().in("id", studyIds);
      }

      // Delete user notes
      await supabase.from("notes").delete().eq("user_id", selectedUserId);

      // Reset wallet (but keep the wallet record)
      await supabase.from("wallet_transactions").delete().eq("user_id", selectedUserId);

      toast.success("User data has been completely reset");
      queryClient.invalidateQueries({ queryKey: ["user-studies-restore", selectedUserId] });
      setShowResetConfirm(false);
      refetchStudies();
    } catch (err: any) {
      console.error("Reset failed:", err);
      toast.error(`Reset failed: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle restore to specific date (delete everything after that date)
  const handleRestoreToDate = async () => {
    if (!selectedUserId || !selectedDate) return;
    
    setIsProcessing(true);
    try {
      const cutoffDate = dayjs(selectedDate).endOf("day").toISOString();
      
      // Get studies after the cutoff date
      const { data: studiesToDelete } = await supabase
        .from("studies")
        .select("*, study_files(*)")
        .eq("owner", selectedUserId)
        .gt("created_at", cutoffDate);

      if (studiesToDelete && studiesToDelete.length > 0) {
        const studyIds = studiesToDelete.map(s => s.id);

        // Delete files from storage
        for (const study of studiesToDelete) {
          const files = (study.study_files as any[]) || [];
          for (const file of files) {
            for (const bucket of STORAGE_BUCKETS) {
              try {
                await supabase.storage.from(bucket).remove([file.path]);
              } catch {
                // Ignore errors for missing files
              }
            }
          }
        }

        // Delete database records in correct order
        await supabase.from("report_attachments").delete().in("study_id", studyIds);
        await supabase.from("eeg_markers").delete().in("study_id", studyIds);
        await supabase.from("review_events").delete().in("study_id", studyIds);
        await supabase.from("canonical_eeg_records").delete().in("study_id", studyIds);
        await supabase.from("ai_drafts").delete().in("study_id", studyIds);
        await supabase.from("reports").delete().in("study_id", studyIds);
        await supabase.from("study_files").delete().in("study_id", studyIds);
        await supabase.from("studies").delete().in("id", studyIds);
      }

      // Delete notes after cutoff
      await supabase
        .from("notes")
        .delete()
        .eq("user_id", selectedUserId)
        .gt("created_at", cutoffDate);

      toast.success(`Restored to ${selectedDate}. All data after this date has been removed.`);
      queryClient.invalidateQueries({ queryKey: ["user-studies-restore", selectedUserId] });
      setShowRestoreConfirm(false);
      setSelectedDate("");
      refetchStudies();
    } catch (err: any) {
      console.error("Restore failed:", err);
      toast.error(`Restore failed: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  if (usersLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Backup & Restore</h1>
        <p className="text-sm text-muted-foreground">
          Account-level data management and restoration
        </p>
      </div>

      {/* User Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Select Account</CardTitle>
          <CardDescription>
            Choose a clinician account to manage
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Clinician Account</Label>
            <Select value={selectedUserId} onValueChange={(v) => {
              setSelectedUserId(v);
              setSelectedDate("");
            }}>
              <SelectTrigger className="w-full max-w-md">
                <SelectValue placeholder="Select a clinician..." />
              </SelectTrigger>
              <SelectContent>
                {users?.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.full_name || user.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedUserId && (
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4" />
                <span>{userStudies?.length || 0} studies</span>
              </div>
              <div className="flex items-center gap-2">
                <HardDrive className="h-4 w-4" />
                <span>{userStudies?.reduce((acc, s) => acc + ((s.study_files as any[])?.length || 0), 0) || 0} files</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedUserId && (
        <>
          {/* Restore to Date */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <History className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle className="text-base">Restore to Date</CardTitle>
                  <CardDescription>
                    Keep data up to a specific date, remove everything after
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {studyDates.length > 0 ? (
                <>
                  <div className="space-y-2">
                    <Label>Restore Point</Label>
                    <Select value={selectedDate} onValueChange={setSelectedDate}>
                      <SelectTrigger className="w-full max-w-xs">
                        <SelectValue placeholder="Select date..." />
                      </SelectTrigger>
                      <SelectContent>
                        {studyDates.map((date) => (
                          <SelectItem key={date} value={date}>
                            {dayjs(date).format("MMM DD, YYYY")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      All data created after this date will be permanently deleted
                    </p>
                  </div>

                  <Button
                    variant="outline"
                    onClick={() => setShowRestoreConfirm(true)}
                    disabled={!selectedDate || isProcessing}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Restore to {selectedDate ? dayjs(selectedDate).format("MMM DD") : "Date"}
                  </Button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No data to restore</p>
              )}
            </CardContent>
          </Card>

          {/* Full Reset */}
          <Card className="border-destructive/50">
            <CardHeader>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                <div>
                  <CardTitle className="text-base text-destructive">Full Reset</CardTitle>
                  <CardDescription>
                    Completely wipe all data for this account
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4">
                <p className="text-sm text-destructive">
                  <strong>Warning:</strong> This will permanently delete ALL studies, files, notes, 
                  and transaction history for this user. This action cannot be undone.
                </p>
              </div>

              <Button
                variant="destructive"
                onClick={() => setShowResetConfirm(true)}
                disabled={isProcessing || !userStudies?.length}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Full Account Reset
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      {/* Reset Confirmation Dialog */}
      <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Full Reset</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all data for this account including {userStudies?.length || 0} studies, 
              all files, notes, and transaction history. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleFullReset}
              disabled={isProcessing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                "Yes, Reset Everything"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Restore Confirmation Dialog */}
      <AlertDialog open={showRestoreConfirm} onOpenChange={setShowRestoreConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Restore</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all data created after {selectedDate}. 
              Data from {selectedDate} and earlier will be preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRestoreToDate}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                "Confirm Restore"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
