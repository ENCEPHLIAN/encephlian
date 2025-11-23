import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { 
  Loader2, 
  FolderOpen, 
  File, 
  Download, 
  Trash2, 
  Upload, 
  Eye, 
  Search,
  Grid3x3,
  List,
  Star,
  ChevronRight,
  MoreVertical,
  Activity,
  FileText,
  StickyNote
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { FilePreviewDialog } from "@/components/FilePreviewDialog";

dayjs.extend(relativeTime);

const BUCKETS = [
  { 
    id: "eeg-raw", 
    name: "EEG Studies", 
    icon: Activity,
    description: "Raw EEG recordings (.edf files)",
    color: "text-blue-600"
  },
  { 
    id: "eeg-reports", 
    name: "Reports", 
    icon: FileText,
    description: "Signed PDF reports",
    color: "text-green-600"
  },
  { 
    id: "notes", 
    name: "My Notes", 
    icon: StickyNote,
    description: "Private notes and annotations",
    color: "text-purple-600"
  },
];

export default function Files() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [selectedBucket, setSelectedBucket] = useState("eeg-raw");
  const [currentPath, setCurrentPath] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [dragActive, setDragActive] = useState(false);
  const [previewFile, setPreviewFile] = useState<any>(null);

  const { data: files, isLoading } = useQuery({
    queryKey: ["storage-files", selectedBucket, currentPath],
    queryFn: async () => {
      // Handle notes bucket - fetch from notes table
      if (selectedBucket === 'notes') {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const { data, error } = await supabase
          .from('notes')
          .select('*')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false });

        if (error) throw error;

        // Transform notes to file-like structure
        return (data || []).map(note => ({
          name: note.title + '.txt',
          id: note.id,
          created_at: note.created_at,
          updated_at: note.updated_at,
          metadata: { 
            size: new Blob([note.content]).size,
            mimetype: 'text/plain',
            noteContent: note.content,
            isPinned: note.is_pinned
          }
        }));
      }

      // Handle storage buckets with user-specific paths
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      
      const userPath = currentPath ? `${user.id}/${currentPath}` : user.id;
      const { data, error } = await supabase.storage
        .from(selectedBucket)
        .list(userPath, { 
          limit: 100, 
          offset: 0, 
          sortBy: { column: "name", order: "asc" } 
        });
      if (error) throw error;
      return data;
    }
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      
      // Enforce user-specific paths for security
      const userFilePath = `${user.id}/${currentPath ? `${currentPath}/` : ''}${file.name}`;
      const { error } = await supabase.storage.from(selectedBucket).upload(userFilePath, file);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("File uploaded successfully");
      queryClient.invalidateQueries({ queryKey: ["storage-files", selectedBucket, currentPath] });
    },
    onError: (error: any) => toast.error(error.message || "Upload failed")
  });

  const deleteMutation = useMutation({
    mutationFn: async (fileName: string) => {
      const filePath = currentPath ? `${currentPath}/${fileName}` : fileName;
      const { error } = await supabase.storage.from(selectedBucket).remove([filePath]);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("File deleted");
      queryClient.invalidateQueries({ queryKey: ["storage-files", selectedBucket, currentPath] });
    }
  });

  const handleDownload = async (fileName: string) => {
    // Handle notes download
    const file = files?.find((f: any) => f.name === fileName);
    if (selectedBucket === 'notes' && file?.metadata?.noteContent) {
      const blob = new Blob([file.metadata.noteContent], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Note downloaded successfully');
      return;
    }

    // Handle storage file download
    const filePath = currentPath ? `${currentPath}/${fileName}` : fileName;
    const { data, error } = await supabase.storage.from(selectedBucket).download(filePath);
    if (error) {
      toast.error("Download failed");
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

  const handleViewInViewer = async (fileName: string) => {
    // For notes, navigate to notes page
    if (selectedBucket === 'notes') {
      navigate('/app/notes');
      return;
    }

    if (!fileName.toLowerCase().endsWith('.edf')) {
      toast.error("Only EDF files can be opened in viewer");
      return;
    }
    const filePath = currentPath ? `${currentPath}/${fileName}` : fileName;
    const { data: studyFile } = await supabase
      .from("study_files")
      .select("study_id")
      .eq("path", filePath)
      .single();
    
    if (!studyFile) {
      toast.error("No study found for this file");
      return;
    }
    navigate(`/app/viewer?studyId=${studyFile.study_id}`);
  };

  const handleFileUpload = (uploadedFiles: FileList | null) => {
    if (!uploadedFiles) return;
    Array.from(uploadedFiles).forEach(file => {
      uploadMutation.mutate(file);
    });
  };

  const handleFolderClick = (folderName: string) => {
    const newPath = currentPath ? `${currentPath}/${folderName}` : folderName;
    setCurrentPath(newPath);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const handleGenerateReport = async (filePath: string) => {
    try {
      toast.info("Creating study from file...");
      
      const { data, error } = await supabase.functions.invoke("create_study_from_upload", {
        body: { filePath, fileName: filePath.split('/').pop() }
      });

      if (error) throw error;

      if (data?.studyId) {
        toast.success("Study created! Generating AI draft...");
        
        const { error: aiError } = await supabase.functions.invoke("generate_ai_report", {
          body: { study_id: data.studyId }
        });

        if (aiError) {
          toast.error("AI draft generation failed, but study was created");
        } else {
          toast.success("AI draft generated! View in Studies page");
        }
      }
    } catch (error) {
      console.error("Error:", error);
      toast.error("Failed to create study");
    }
  };

  const filteredFiles = files?.filter(file => 
    file.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const folders = filteredFiles?.filter(f => !f.name.includes('.')) || [];
  const regularFiles = filteredFiles?.filter(f => f.name.includes('.')) || [];

  return (
    <div className="space-y-[var(--space-xl)] animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold">Files</h1>
          <p className="text-muted-foreground mt-1">
            Manage your EEG files and reports securely
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setViewMode(viewMode === "list" ? "grid" : "list")}
          >
            {viewMode === "list" ? <Grid3x3 className="h-4 w-4" /> : <List className="h-4 w-4" />}
          </Button>
          
          <Button onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4 mr-2" />
            Upload
          </Button>
          <Input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleFileUpload(e.target.files)}
          />
        </div>
      </div>

      {/* Main Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar */}
        <Card className="lg:col-span-1 openai-card">
          <CardContent className="p-6">
            <div className="space-y-1">
              <h3 className="font-semibold mb-4 text-sm text-muted-foreground">FOLDERS</h3>
              {BUCKETS.map((bucket) => (
                <Button
                  key={bucket.id}
                  variant={selectedBucket === bucket.id ? "secondary" : "ghost"}
                  className="w-full justify-start h-auto py-4 px-4"
                  onClick={() => {
                    setSelectedBucket(bucket.id);
                    setCurrentPath("");
                  }}
                >
                  <div className="flex items-start gap-3 w-full">
                    <bucket.icon className={cn("h-5 w-5 shrink-0 mt-0.5", bucket.color)} />
                    <div className="flex flex-col gap-1 flex-1 min-w-0">
                      <span className="font-semibold text-sm leading-tight">{bucket.name}</span>
                      <span className="text-xs text-muted-foreground leading-relaxed folder-btn-text">
                        {bucket.description}
                      </span>
                    </div>
                  </div>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Main Content */}
        <Card className="lg:col-span-3 openai-card">
          <CardContent className="p-8">
            {/* Search and Path */}
            <div className="space-y-4 mb-6">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FolderOpen className="h-4 w-4" />
                <span>{BUCKETS.find(b => b.id === selectedBucket)?.name}</span>
                {currentPath && (
                  <>
                    <ChevronRight className="h-4 w-4" />
                    <span>{currentPath}</span>
                  </>
                )}
              </div>
              
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search files..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-11"
                />
              </div>
            </div>

            {/* Drop Zone */}
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              className={cn(
                "border-2 border-dashed rounded-lg p-12 mb-8 transition-colors",
                dragActive ? "border-primary bg-primary/5" : "border-muted",
                "hover:border-primary/50 cursor-pointer"
              )}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="flex flex-col items-center justify-center text-center">
                <Upload className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-lg font-medium mb-1">
                  {dragActive ? "Drop files here" : "Drag & drop files here"}
                </p>
                <p className="text-sm text-muted-foreground">
                  or click to browse
                </p>
              </div>
            </div>

            {/* Files List */}
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : !files || files.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FolderOpen className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-lg font-medium">No files in this folder</p>
                <p className="text-sm text-muted-foreground mb-4">Upload files to get started</p>
                <Button onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Files
                </Button>
              </div>
            ) : (
              <ScrollArea className="h-[500px]">
                <div className={cn(
                  viewMode === "grid" 
                    ? "grid grid-cols-2 md:grid-cols-3 gap-4" 
                    : "space-y-2"
                )}>
                  {folders.map((folder) => (
                    <div
                      key={folder.name}
                      className={cn(
                        "flex items-center justify-between p-4 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors",
                        viewMode === "grid" && "flex-col items-start"
                      )}
                      onClick={() => handleFolderClick(folder.name)}
                    >
                      <div className="flex items-center gap-3">
                        <FolderOpen className="h-5 w-5 text-blue-500" />
                        <span className="font-medium">{folder.name}</span>
                      </div>
                    </div>
                  ))}
                  
                  {regularFiles.map((file) => (
                    <div
                      key={file.name}
                      className={cn(
                        "flex items-center justify-between p-4 rounded-lg hover:bg-muted/50 transition-colors group",
                        viewMode === "grid" && "flex-col items-start"
                      )}
                    >
                      <div 
                        className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                        onClick={() => setPreviewFile({
                          name: file.name,
                          path: currentPath ? `${currentPath}/${file.name}` : file.name,
                          size: file.metadata?.size || 0,
                          created_at: file.created_at || file.updated_at
                        })}
                      >
                        <File className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{file.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {file.metadata?.size && formatFileSize(file.metadata.size)}
                            {file.updated_at && ` • ${dayjs(file.updated_at).fromNow()}`}
                          </p>
                        </div>
                      </div>
                      
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {file.name.toLowerCase().endsWith('.edf') && (
                            <DropdownMenuItem onClick={() => handleViewInViewer(file.name)}>
                              <Eye className="mr-2 h-4 w-4" />
                              Open in Viewer
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => handleDownload(file.name)}>
                            <Download className="mr-2 h-4 w-4" />
                            Download
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => deleteMutation.mutate(file.name)}
                            className="text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      {/* File Preview Dialog */}
      {previewFile && (
        <FilePreviewDialog
          file={previewFile}
          bucket={selectedBucket}
          open={!!previewFile}
          onOpenChange={(open) => !open && setPreviewFile(null)}
          onGenerateReport={handleGenerateReport}
        />
      )}
    </div>
  );
}
