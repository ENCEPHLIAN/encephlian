import { useState, useRef, useCallback, memo } from "react";
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
  FileIcon,
  Database,
  FlaskConical
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { FilePreviewDialog } from "@/components/FilePreviewDialog";
import { supabase } from "@/integrations/supabase/client";
import { 
  useStudyFiles, 
  useStorageFiles, 
  useFileUpload, 
  useFileDelete, 
  useFilteredFiles,
  type StudyFile 
} from "@/hooks/useFilesData";

dayjs.extend(relativeTime);

const BUCKETS = [
  { 
    id: "study-files", 
    name: "My Studies", 
    icon: Database,
    description: "All your EEG study files",
    color: "text-primary"
  },
  { 
    id: "eeg-uploads", 
    name: "EEG Uploads", 
    icon: Activity,
    description: "Raw EEG files for processing",
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

// Memoized file row component
const FileRow = memo(({ 
  file, 
  isStudyFile, 
  onPreview, 
  onDownload, 
  onDelete,
  formatFileSize 
}: {
  file: any;
  isStudyFile: boolean;
  onPreview: (fileName: string, studyFile?: StudyFile) => void;
  onDownload: (fileName: string, filePath?: string) => void;
  onDelete: (fileName: string) => void;
  formatFileSize: (bytes: number | null) => string;
}) => {
  const fileName = file.name;
  
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors group">
      <FileIcon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
      
      <div 
        className="flex-1 min-w-0 cursor-pointer"
        onClick={() => onPreview(fileName, isStudyFile ? file : undefined)}
      >
        <p className="font-medium text-sm truncate">{fileName}</p>
        <p className="text-xs text-muted-foreground">
          {file.metadata?.size ? formatFileSize(file.metadata.size) : formatFileSize(file.size_bytes)}
          {(file.updated_at || file.created_at) && ` • ${dayjs(file.updated_at || file.created_at).fromNow()}`}
          {isStudyFile && file.kind && ` • ${file.kind.toUpperCase()}`}
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
          <DropdownMenuItem onClick={() => onPreview(fileName, isStudyFile ? file : undefined)}>
            <Eye className="h-4 w-4 mr-2" />
            Preview
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onDownload(fileName, isStudyFile ? file.path : undefined)}>
            <Download className="h-4 w-4 mr-2" />
            Download
          </DropdownMenuItem>
          {!isStudyFile && (
            <DropdownMenuItem 
              onClick={() => onDelete(fileName)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
});

FileRow.displayName = "FileRow";

export default function Files() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  
  const [selectedBucket, setSelectedBucket] = useState("study-files");
  const [currentPath, setCurrentPath] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [previewFile, setPreviewFile] = useState<any>(null);

  // Use optimized hooks
  const { data: studyFiles, isLoading: studyFilesLoading } = useStudyFiles(selectedBucket === 'study-files');
  const { data: storageFiles, isLoading: storageLoading } = useStorageFiles(selectedBucket, currentPath, selectedBucket !== 'study-files');
  const uploadMutation = useFileUpload(selectedBucket, currentPath);
  const deleteMutation = useFileDelete(selectedBucket, currentPath);

  // Memoized filtered files
  const { folders, files: regularFiles, total } = useFilteredFiles(
    studyFiles,
    storageFiles,
    selectedBucket,
    searchQuery
  );

  const handleDownload = useCallback(async (fileName: string, filePath?: string) => {
    // Handle notes download
    const file = storageFiles?.find((f: any) => f.name === fileName);
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

    // Handle study files download
    if (selectedBucket === 'study-files' && filePath) {
      const { data, error } = await supabase.storage.from('eeg-uploads').download(filePath);
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
      return;
    }

    // Handle storage file download
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    const downloadPath = currentPath ? `${user.id}/${currentPath}/${fileName}` : `${user.id}/${fileName}`;
    const { data, error } = await supabase.storage.from(selectedBucket).download(downloadPath);
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
  }, [storageFiles, selectedBucket, currentPath]);

  const handlePreview = useCallback(async (fileName: string, studyFile?: StudyFile) => {
    if (selectedBucket === 'notes') {
      navigate('/app/notes');
      return;
    }

    if (selectedBucket === 'study-files' && studyFile) {
      setPreviewFile({
        name: fileName,
        path: studyFile.path,
        bucket: 'eeg-uploads',
        studyId: studyFile.study_id
      });
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
  }, [selectedBucket, currentPath, navigate]);

  const handleFileUpload = useCallback((uploadedFiles: FileList | null) => {
    if (!uploadedFiles) return;
    Array.from(uploadedFiles).forEach(file => {
      uploadMutation.mutate(file);
    });
  }, [uploadMutation]);

  const handleFolderClick = useCallback((folderName: string) => {
    const newPath = currentPath ? `${currentPath}/${folderName}` : folderName;
    setCurrentPath(newPath);
  }, [currentPath]);

  const handleBack = useCallback(() => {
    if (!currentPath) return;
    const parts = currentPath.split('/');
    parts.pop();
    setCurrentPath(parts.join('/'));
  }, [currentPath]);

  const formatFileSize = useCallback((bytes: number | null) => {
    if (!bytes) return 'Unknown size';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }, []);

  const handleDelete = useCallback((fileName: string) => {
    deleteMutation.mutate(fileName);
  }, [deleteMutation]);

  const isLoading = selectedBucket === 'study-files' ? studyFilesLoading : storageLoading;

  return (
    <div className="h-[calc(100vh-12rem)] flex flex-col gap-2">
      
      <div className="flex-1 flex gap-0 rounded-lg overflow-hidden border border-border">
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
            
            {selectedBucket !== 'notes' && selectedBucket !== 'study-files' && (
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
          ) : total === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center px-4">
              <FolderOpen className="h-16 w-16 text-muted-foreground/30 mb-4" />
              <p className="text-lg font-medium">No files here</p>
              <p className="text-sm text-muted-foreground mt-1">
                {selectedBucket === 'notes' 
                  ? 'No notes available' 
                  : selectedBucket === 'study-files'
                  ? 'Upload EEG studies to see them here'
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
              {regularFiles.map((file) => {
                const isStudyFile = selectedBucket === 'study-files';
                const fileName = file.name;
                
                return (
                  <div
                    key={file.id || file.name}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors group"
                  >
                    <FileIcon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    
                    <div 
                      className="flex-1 min-w-0 cursor-pointer"
                      onClick={() => handlePreview(fileName, isStudyFile ? file : undefined)}
                    >
                      <p className="font-medium text-sm truncate">{fileName}</p>
                      <p className="text-xs text-muted-foreground">
                        {file.metadata?.size ? formatFileSize(file.metadata.size) : formatFileSize(file.size_bytes)}
                        {(file.updated_at || file.created_at) && ` • ${dayjs(file.updated_at || file.created_at).fromNow()}`}
                        {isStudyFile && file.kind && ` • ${file.kind.toUpperCase()}`}
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
                        <DropdownMenuItem onClick={() => handlePreview(fileName, isStudyFile ? file : undefined)}>
                          <Eye className="mr-2 h-4 w-4" />
                          Preview
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDownload(fileName, isStudyFile ? file.path : undefined)}>
                          <Download className="mr-2 h-4 w-4" />
                          Download
                        </DropdownMenuItem>
                        {isStudyFile && (
                          <DropdownMenuItem onClick={() => navigate(`/app/studies/${file.study_id}`)}>
                            <Activity className="mr-2 h-4 w-4" />
                            View Study
                          </DropdownMenuItem>
                        )}
                        {!isStudyFile && (
                          <DropdownMenuItem 
                            onClick={() => deleteMutation.mutate(fileName)}
                            className="text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </div>
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
