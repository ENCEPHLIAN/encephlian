import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { 
  Loader2, 
  FolderOpen, 
  Download, 
  Trash2, 
  Upload, 
  Eye, 
  Search,
  ChevronRight,
  MoreVertical,
  Activity,
  FileText,
  StickyNote,
  ArrowLeft,
  FileIcon
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
    id: "eeg-uploads", 
    name: "EEG Uploads", 
    icon: Activity,
    description: "Raw EEG files for processing",
    color: "text-blue-600"
  },
  { 
    id: "eeg-raw", 
    name: "EEG Studies", 
    icon: Activity,
    description: "Processed EEG recordings",
    color: "text-cyan-600"
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
  
  const [selectedBucket, setSelectedBucket] = useState("eeg-uploads");
  const [currentPath, setCurrentPath] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
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

      // Handle storage buckets - list all files for user
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      
      const filePath = currentPath ? `${user.id}/${currentPath}/${fileName}` : `${user.id}/${fileName}`;
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
      toast.success('Note downloaded');
      return;
    }

    // Handle storage file download
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    const filePath = currentPath ? `${user.id}/${currentPath}/${fileName}` : `${user.id}/${fileName}`;
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

  const handlePreview = async (fileName: string) => {
    if (selectedBucket === 'notes') {
      navigate('/app/notes');
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const filePath = currentPath ? `${user.id}/${currentPath}/${fileName}` : `${user.id}/${fileName}`;
    
    setPreviewFile({
      name: fileName,
      path: filePath,
      bucket: selectedBucket
    });
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

  const handleBack = () => {
    if (!currentPath) return;
    const parts = currentPath.split('/');
    parts.pop();
    setCurrentPath(parts.join('/'));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const filteredFiles = files?.filter(file => 
    file.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const folders = filteredFiles?.filter(f => !f.name.includes('.')) || [];
  const regularFiles = filteredFiles?.filter(f => f.name.includes('.')) || [];

  return (
    <div className="h-[calc(100vh-12rem)] flex gap-0 rounded-lg overflow-hidden border border-border">
      {/* LEFT SIDEBAR - Finder-style */}
      <div className="w-60 border-r bg-card/50 flex flex-col">
        <div className="p-4 border-b bg-card/80">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Folders</h3>
        </div>
        
        <ScrollArea className="flex-1">
          <div className="p-2">
            {BUCKETS.map((bucket) => (
              <button
                key={bucket.id}
                onClick={() => {
                  setSelectedBucket(bucket.id);
                  setCurrentPath("");
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all",
                  "hover:bg-secondary/80",
                  selectedBucket === bucket.id && "bg-secondary text-foreground font-medium shadow-sm"
                )}
              >
                <bucket.icon className={cn("h-4 w-4", bucket.color)} />
                <span className="flex-1 text-left truncate">{bucket.name}</span>
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* RIGHT CONTENT - File list */}
      <div className="flex-1 flex flex-col bg-background">
        {/* Toolbar */}
        <div className="h-14 border-b bg-card/50 flex items-center justify-between px-4 gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {currentPath && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBack}
                className="h-8 px-2"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            
            <div className="flex items-center gap-1 text-sm text-muted-foreground truncate">
              <FolderOpen className="h-4 w-4 flex-shrink-0" />
              <span className="font-medium">{BUCKETS.find(b => b.id === selectedBucket)?.name}</span>
              {currentPath && (
                <>
                  <ChevronRight className="h-3 w-3 flex-shrink-0" />
                  <span className="truncate">{currentPath}</span>
                </>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-64 pl-9 h-9"
              />
            </div>
            
            {selectedBucket !== 'notes' && (
              <Button onClick={() => fileInputRef.current?.click()} size="sm" className="h-9">
                <Upload className="h-4 w-4 mr-2" />
                Upload
              </Button>
            )}
            <Input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => handleFileUpload(e.target.files)}
            />
          </div>
        </div>

        {/* File list */}
        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="flex justify-center items-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : !files || files.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center px-4">
              <FolderOpen className="h-16 w-16 text-muted-foreground/30 mb-4" />
              <p className="text-lg font-medium">No files here</p>
              <p className="text-sm text-muted-foreground mt-1">
                {selectedBucket === 'notes' 
                  ? 'No notes available' 
                  : 'Upload files to get started'}
              </p>
            </div>
          ) : (
            <div className="p-2">
              {/* Folders first */}
              {folders.map((folder) => (
                <div
                  key={folder.name}
                  onClick={() => handleFolderClick(folder.name)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors group"
                >
                  <FolderOpen className="h-5 w-5 text-blue-500 flex-shrink-0" />
                  <span className="flex-1 font-medium text-sm">{folder.name}</span>
                </div>
              ))}
              
              {/* Then files */}
              {regularFiles.map((file) => (
                <div
                  key={file.name}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors group"
                >
                  <FileIcon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  
                  <div 
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => handlePreview(file.name)}
                  >
                    <p className="font-medium text-sm truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {file.metadata?.size && formatFileSize(file.metadata.size)}
                      {file.updated_at && ` • ${dayjs(file.updated_at).fromNow()}`}
                    </p>
                  </div>
                  
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="opacity-0 group-hover:opacity-100 h-8 w-8 p-0"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handlePreview(file.name)}>
                        <Eye className="mr-2 h-4 w-4" />
                        Preview
                      </DropdownMenuItem>
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
          )}
        </ScrollArea>
      </div>

      {previewFile && (
        <FilePreviewDialog
          file={{
            name: previewFile.name,
            path: previewFile.path,
            size: 0,
            created_at: new Date().toISOString()
          }}
          bucket={previewFile.bucket || selectedBucket}
          open={!!previewFile}
          onOpenChange={(open) => !open && setPreviewFile(null)}
        />
      )}
    </div>
  );
}