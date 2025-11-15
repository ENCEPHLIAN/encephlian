import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { toast } from "sonner";
import { Loader2, FolderOpen, File, Download, Trash2, Upload, Eye, Home, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import dayjs from "dayjs";

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

  const { data: files, isLoading } = useQuery({
    queryKey: ["storage-files", selectedBucket, currentPath],
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(selectedBucket).list(currentPath, { limit: 100, offset: 0, sortBy: { column: "name", order: "asc" } });
      if (error) throw error;
      return data;
    }
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const filePath = currentPath ? `${currentPath}/${file.name}` : file.name;
      const { error } = await supabase.storage.from(selectedBucket).upload(filePath, file);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("File uploaded"); queryClient.invalidateQueries({ queryKey: ["storage-files", selectedBucket, currentPath] }); setUploadFile(null); },
    onError: (error: any) => toast.error(error.message || "Upload failed")
  });

  const deleteMutation = useMutation({
    mutationFn: async (fileName: string) => {
      const filePath = currentPath ? `${currentPath}/${fileName}` : fileName;
      const { error } = await supabase.storage.from(selectedBucket).remove([filePath]);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("File deleted"); queryClient.invalidateQueries({ queryKey: ["storage-files", selectedBucket, currentPath] }); }
  });

  const handleDownload = async (fileName: string) => {
    const filePath = currentPath ? `${currentPath}/${fileName}` : fileName;
    const { data, error } = await supabase.storage.from(selectedBucket).download(filePath);
    if (error) { toast.error("Download failed"); return; }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url; a.download = fileName;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const handleViewInViewer = async (fileName: string) => {
    if (!fileName.toLowerCase().endsWith('.edf')) { toast.error("Only EDF files supported"); return; }
    const filePath = currentPath ? `${currentPath}/${fileName}` : fileName;
    const { data: studyFile } = await supabase.from("study_files").select("study_id").eq("path", filePath).single();
    if (!studyFile) { toast.error("No study found"); return; }
    navigate(`/app/viewer?studyId=${studyFile.study_id}`);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">File Browser</h1>
          <p className="text-muted-foreground">Browse and manage storage files</p>
        </div>
        <Button variant="outline" onClick={() => navigate('/app/dashboard')}><Home className="h-4 w-4 mr-2" />Dashboard</Button>
      </div>
      
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink onClick={() => setCurrentPath('')} className="cursor-pointer flex items-center gap-1">
              <Home className="h-4 w-4" /><span>{BUCKETS.find(b => b.id === selectedBucket)?.name}</span>
            </BreadcrumbLink>
          </BreadcrumbItem>
          {currentPath.split('/').filter(Boolean).map((segment, idx, arr) => (
            <span key={segment} className="flex items-center">
              <BreadcrumbSeparator><ChevronRight className="h-4 w-4" /></BreadcrumbSeparator>
              <BreadcrumbItem>{idx === arr.length - 1 ? <BreadcrumbPage>{segment}</BreadcrumbPage> : <BreadcrumbLink onClick={() => setCurrentPath(arr.slice(0, idx + 1).join('/'))} className="cursor-pointer">{segment}</BreadcrumbLink>}</BreadcrumbItem>
            </span>
          ))}
        </BreadcrumbList>
      </Breadcrumb>

      <Card>
        <CardHeader><CardTitle>Files</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <Select value={selectedBucket} onValueChange={(v) => { setSelectedBucket(v); setCurrentPath(""); }}>
              <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>{BUCKETS.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
            </Select>
            <div className="flex gap-2 flex-1">
              <Input type="file" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} className="flex-1" />
              <Button onClick={() => uploadFile && uploadMutation.mutate(uploadFile)} disabled={!uploadFile || uploadMutation.isPending}>
                {uploadMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Upload className="h-4 w-4 mr-2" />Upload</>}
              </Button>
            </div>
          </div>

          {isLoading ? <div className="flex items-center justify-center py-8"><Loader2 className="h-8 w-8 animate-spin" /></div> : (
            <div className="border rounded-lg">
              <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 p-3 bg-muted font-semibold text-sm">
                <div></div><div>Name</div><div>Size</div><div>Modified</div><div>Actions</div>
              </div>
              {files?.length === 0 ? <div className="p-8 text-center text-muted-foreground">No files found</div> : (
                <div className="divide-y">
                  {files?.map(f => (
                    <div key={f.id} className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 p-3 items-center hover:bg-muted/50">
                      <div>{f.id === null ? <FolderOpen className="h-5 w-5 text-blue-500" /> : <File className="h-5 w-5 text-muted-foreground" />}</div>
                      <div className={f.id === null ? "font-medium cursor-pointer" : ""} onClick={() => f.id === null && setCurrentPath(currentPath ? `${currentPath}/${f.name}` : f.name)}>
                        {f.name}{f.name.toLowerCase().endsWith('.edf') && <Badge variant="secondary" className="ml-2 text-xs">EDF</Badge>}
                      </div>
                      <div className="text-sm text-muted-foreground">{f.metadata?.size ? formatFileSize(f.metadata.size) : "—"}</div>
                      <div className="text-sm text-muted-foreground">{f.created_at ? dayjs(f.created_at).format("MMM D, YYYY") : "—"}</div>
                      <div className="flex gap-1">
                        {f.id !== null && (
                          <>{f.name.toLowerCase().endsWith('.edf') && <Button variant="ghost" size="sm" onClick={() => handleViewInViewer(f.name)} title="View in EEG Viewer"><Eye className="h-4 w-4" /></Button>}
                          <Button variant="ghost" size="sm" onClick={() => handleDownload(f.name)}><Download className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(f.name)}><Trash2 className="h-4 w-4 text-destructive" /></Button></>
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
  );
}
