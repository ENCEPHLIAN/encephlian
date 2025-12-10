import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { toast } from "sonner";
import { Loader2, Trash2, AlertTriangle, FileWarning, RefreshCw, Database, HardDrive } from "lucide-react";
import { format } from "date-fns";

type TestFile = {
  file_id: string;
  study_id: string;
  file_path: string;
  file_kind: string;
  clinic_name: string;
  created_at: string;
};

type OrphanedFile = {
  bucket: string;
  path: string;
  size: number;
  created_at: string;
};

export default function AdminCleanup() {
  const queryClient = useQueryClient();
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [activeTab, setActiveTab] = useState<"test" | "orphaned">("test");

  // Scan for test files using admin RPC (bypasses RLS)
  const { data: testFiles, isLoading: testLoading, refetch: refetchTest } = useQuery<TestFile[]>({
    queryKey: ["admin-test-files"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_scan_test_files");
      if (error) throw error;
      return data as TestFile[];
    },
  });

  // Scan for orphaned storage files (not linked to any study)
  const { data: orphanedFiles, isLoading: orphanedLoading, refetch: refetchOrphaned } = useQuery<OrphanedFile[]>({
    queryKey: ["admin-orphaned-files"],
    queryFn: async () => {
      const buckets = ["eeg-uploads", "eeg-raw", "eeg-clean", "eeg-json", "eeg-reports"];
      const orphaned: OrphanedFile[] = [];

      // Get all file paths from study_files
      const { data: studyFilePaths } = await supabase
        .from("study_files")
        .select("path");
      
      const linkedPaths = new Set(studyFilePaths?.map(f => f.path) || []);

      // Check each bucket for orphaned files
      for (const bucket of buckets) {
        try {
          const { data: files, error } = await supabase.storage.from(bucket).list("", {
            limit: 500,
          });
          
          if (error || !files) continue;

          for (const file of files) {
            const fullPath = `${bucket}/${file.name}`;
            if (!linkedPaths.has(fullPath) && !linkedPaths.has(file.name)) {
              orphaned.push({
                bucket,
                path: file.name,
                size: file.metadata?.size || 0,
                created_at: file.created_at || new Date().toISOString(),
              });
            }
          }
        } catch (e) {
          console.error(`Error scanning bucket ${bucket}:`, e);
        }
      }

      return orphaned;
    },
  });

  // Delete files mutation
  const deleteFilesMutation = useMutation({
    mutationFn: async (fileIds: string[]) => {
      const filesToDelete = testFiles?.filter((f) => fileIds.includes(f.file_id)) || [];
      
      // Delete from storage buckets
      for (const file of filesToDelete) {
        const bucketName = getBucketFromPath(file.file_path);
        if (bucketName) {
          const filePath = file.file_path.replace(`${bucketName}/`, "");
          await supabase.storage.from(bucketName).remove([filePath]);
        }
      }

      // Delete from database using admin RPC
      const { data, error } = await supabase.rpc("admin_delete_test_files", {
        p_file_ids: fileIds,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["admin-test-files"] });
      queryClient.invalidateQueries({ queryKey: ["admin-orphaned-files"] });
      toast.success(`Deleted ${data?.deleted_count || 0} files`);
      setSelectedFiles(new Set());
      setShowDeleteConfirm(false);
    },
    onError: (error: any) => toast.error(error.message),
  });

  // Delete orphaned files mutation
  const deleteOrphanedMutation = useMutation({
    mutationFn: async (files: OrphanedFile[]) => {
      let deleted = 0;
      for (const file of files) {
        try {
          const { error } = await supabase.storage.from(file.bucket).remove([file.path]);
          if (!error) deleted++;
        } catch (e) {
          console.error(`Failed to delete ${file.path}:`, e);
        }
      }
      return { deleted };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin-orphaned-files"] });
      toast.success(`Deleted ${data.deleted} orphaned files`);
    },
    onError: (error: any) => toast.error(error.message),
  });

  const getBucketFromPath = (path: string): string | null => {
    const buckets = ["eeg-uploads", "eeg-raw", "eeg-clean", "eeg-json", "eeg-reports", "eeg-preview"];
    for (const bucket of buckets) {
      if (path.includes(bucket)) return bucket;
    }
    return null;
  };

  const toggleFile = (fileId: string) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedFiles.size === testFiles?.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(testFiles?.map((f) => f.file_id) || []));
    }
  };

  const handleDelete = () => {
    if (selectedFiles.size === 0) return;
    deleteFilesMutation.mutate(Array.from(selectedFiles));
  };

  const isLoading = activeTab === "test" ? testLoading : orphanedLoading;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-mono font-bold tracking-tight">Cleanup</h1>
        <p className="text-sm text-muted-foreground font-mono">
          Remove test, sample, demo files and orphaned storage objects
        </p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setActiveTab("test")}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "test" 
              ? "border-primary text-foreground" 
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Database className="h-4 w-4" />
          Test/Sample Files
          {testFiles && testFiles.length > 0 && (
            <Badge variant="secondary" className="ml-1">{testFiles.length}</Badge>
          )}
        </button>
        <button
          onClick={() => setActiveTab("orphaned")}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "orphaned" 
              ? "border-primary text-foreground" 
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <HardDrive className="h-4 w-4" />
          Orphaned Files
          {orphanedFiles && orphanedFiles.length > 0 && (
            <Badge variant="destructive" className="ml-1">{orphanedFiles.length}</Badge>
          )}
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : activeTab === "test" ? (
        <Card className="border-destructive/30">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <CardTitle className="text-lg font-mono">Test/Sample Files Detected</CardTitle>
            </div>
            <CardDescription>
              Files matching patterns: sample, demo, test, example, or marked as sample studies (bypasses RLS)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-4">
                <Button variant="outline" size="sm" onClick={() => refetchTest()}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Rescan
                </Button>
                <span className="text-sm text-muted-foreground">
                  {testFiles?.length || 0} files found
                </span>
              </div>
              {selectedFiles.size > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Selected ({selectedFiles.size})
                </Button>
              )}
            </div>

            {testFiles && testFiles.length > 0 ? (
              <div className="border rounded-md overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={selectedFiles.size === testFiles.length && testFiles.length > 0}
                          onCheckedChange={toggleAll}
                        />
                      </TableHead>
                      <TableHead className="font-mono">File Path</TableHead>
                      <TableHead className="font-mono">Kind</TableHead>
                      <TableHead className="font-mono">Clinic</TableHead>
                      <TableHead className="font-mono">Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {testFiles.map((file) => (
                      <TableRow key={file.file_id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedFiles.has(file.file_id)}
                            onCheckedChange={() => toggleFile(file.file_id)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <FileWarning className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <span className="font-mono text-xs truncate max-w-md">
                              {file.file_path}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-xs">
                            {file.file_kind}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{file.clinic_name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(file.created_at), "MMM d, yyyy")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <FileWarning className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No test or sample files found</p>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="border-amber-500/30">
          <CardHeader>
            <div className="flex items-center gap-2">
              <HardDrive className="h-5 w-5 text-amber-500" />
              <CardTitle className="text-lg font-mono">Orphaned Storage Files</CardTitle>
            </div>
            <CardDescription>
              Files in storage buckets that are not linked to any study record
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-4">
                <Button variant="outline" size="sm" onClick={() => refetchOrphaned()}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Rescan
                </Button>
                <span className="text-sm text-muted-foreground">
                  {orphanedFiles?.length || 0} orphaned files
                </span>
              </div>
              {orphanedFiles && orphanedFiles.length > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => deleteOrphanedMutation.mutate(orphanedFiles)}
                  disabled={deleteOrphanedMutation.isPending}
                >
                  {deleteOrphanedMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-2" />
                  )}
                  Delete All Orphaned
                </Button>
              )}
            </div>

            {orphanedFiles && orphanedFiles.length > 0 ? (
              <div className="border rounded-md overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="font-mono">Bucket</TableHead>
                      <TableHead className="font-mono">Path</TableHead>
                      <TableHead className="font-mono">Size</TableHead>
                      <TableHead className="font-mono">Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orphanedFiles.map((file, idx) => (
                      <TableRow key={`${file.bucket}-${file.path}-${idx}`}>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-xs">
                            {file.bucket}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-xs truncate max-w-md block">
                            {file.path}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {(file.size / 1024).toFixed(1)} KB
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(file.created_at), "MMM d, yyyy")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <HardDrive className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No orphaned files found</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedFiles.size} files?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the selected files from both the database
              and storage. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              {deleteFilesMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete Files
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}