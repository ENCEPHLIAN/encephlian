import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { 
  Loader2, 
  FolderOpen, 
  File, 
  Download, 
  Trash2, 
  Upload, 
  Eye,
  ArrowLeft
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";

const BUCKETS = [
  { id: "eeg-raw", name: "EEG Raw" },
  { id: "eeg-clean", name: "EEG Clean" },
  { id: "eeg-reports", name: "Reports" },
  { id: "eeg-json", name: "JSON Data" },
  { id: "eeg-preview", name: "Previews" },
  { id: "clinic-logos", name: "Logos" }
];

export default function Files() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedBucket, setSelectedBucket] = useState("eeg-raw");
  const [currentPath, setCurrentPath] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  // Fetch files from selected bucket
  const { data: files, isLoading } = useQuery({
    queryKey: ["storage-files", selectedBucket, currentPath],
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from(selectedBucket)
        .list(currentPath, {
          limit: 100,
          offset: 0,
          sortBy: { column: "name", order: "asc" }
        });

      if (error) throw error;
      return data;
    }
  });

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const filePath = currentPath ? `${currentPath}/${file.name}` : file.name;
      
      const { error } = await supabase.storage
        .from(selectedBucket)
        .upload(filePath, file);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("File uploaded successfully");
      queryClient.invalidateQueries({ queryKey: ["storage-files", selectedBucket, currentPath] });
      setUploadFile(null);
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to upload file");
    }
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (fileName: string) => {
      const filePath = currentPath ? `${currentPath}/${fileName}` : fileName;
      
      const { error } = await supabase.storage
        .from(selectedBucket)
        .remove([filePath]);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("File deleted successfully");
      queryClient.invalidateQueries({ queryKey: ["storage-files", selectedBucket, currentPath] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to delete file");
    }
  });

  const handleUpload = () => {
    if (!uploadFile) {
      toast.error("Please select a file");
      return;
    }
    uploadMutation.mutate(uploadFile);
  };

  const handleDownload = async (fileName: string) => {
    const filePath = currentPath ? `${currentPath}/${fileName}` : fileName;
    
    const { data, error } = await supabase.storage
      .from(selectedBucket)
      .download(filePath);

    if (error) {
      toast.error("Failed to download file");
      return;
    }

    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleOpenFolder = (folderName: string) => {
    setCurrentPath(currentPath ? `${currentPath}/${folderName}` : folderName);
  };

  const handleGoBack = () => {
    const pathParts = currentPath.split("/");
    pathParts.pop();
    setCurrentPath(pathParts.join("/"));
  };

  const handleViewInViewer = async (fileName: string) => {
    // Check if file is EDF
    if (!fileName.toLowerCase().endsWith('.edf')) {
      toast.error("Only EDF files can be opened in viewer");
      return;
    }

    // Find study with this file
    const filePath = currentPath ? `${currentPath}/${fileName}` : fileName;
    
    const { data: studyFile, error } = await supabase
      .from("study_files")
      .select("study_id")
      .eq("path", filePath)
      .single();

    if (error || !studyFile) {
      toast.error("No study found for this file");
      return;
    }

    navigate(`/app/viewer?studyId=${studyFile.study_id}`);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">File Browser</h1>
          <p className="text-muted-foreground">Browse and manage storage files</p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <CardTitle>Storage Buckets</CardTitle>
                <CardDescription>
                  {currentPath ? `/${currentPath}` : "Root directory"}
                </CardDescription>
              </div>
              {currentPath && (
                <Button variant="outline" size="sm" onClick={handleGoBack}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <Select value={selectedBucket} onValueChange={setSelectedBucket}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BUCKETS.map((bucket) => (
                    <SelectItem key={bucket.id} value={bucket.id}>
                      {bucket.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex gap-2 flex-1">
                <Input
                  type="file"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  className="flex-1"
                />
                <Button 
                  onClick={handleUpload} 
                  disabled={!uploadFile || uploadMutation.isPending}
                >
                  {uploadMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 mr-2" />
                  )}
                  Upload
                </Button>
              </div>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="border rounded-lg">
                <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 p-3 bg-muted font-semibold text-sm">
                  <div></div>
                  <div>Name</div>
                  <div>Size</div>
                  <div>Type</div>
                  <div>Actions</div>
                </div>

                {files && files.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    No files found in this directory
                  </div>
                ) : (
                  <div className="divide-y">
                    {files?.map((file) => (
                      <div
                        key={file.id}
                        className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 p-3 items-center hover:bg-muted/50"
                      >
                        <div>
                          {file.id === null ? (
                            <FolderOpen className="h-5 w-5 text-primary" />
                          ) : (
                            <File className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                        <div 
                          className={file.id === null ? "cursor-pointer hover:underline font-medium" : ""}
                          onClick={() => file.id === null && handleOpenFolder(file.name)}
                        >
                          {file.name}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {file.metadata?.size ? formatFileSize(file.metadata.size) : "-"}
                        </div>
                        <div>
                          {file.id === null ? (
                            <Badge variant="outline">Folder</Badge>
                          ) : (
                            <Badge variant="secondary">File</Badge>
                          )}
                        </div>
                        <div className="flex gap-1">
                          {file.id !== null && (
                            <>
                              {file.name.toLowerCase().endsWith('.edf') && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleViewInViewer(file.name)}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDownload(file.name)}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => deleteMutation.mutate(file.name)}
                                disabled={deleteMutation.isPending}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
