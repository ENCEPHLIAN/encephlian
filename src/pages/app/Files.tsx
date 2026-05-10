import { useState, useRef, useCallback, memo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  Loader2,
  FolderOpen,
  FolderPlus,
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
  AlertCircle,
  RefreshCw,
  Pencil,
  ShieldCheck,
  Clock,
  Brain,
  CheckCircle2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { FilePreviewDialog } from "@/components/FilePreviewDialog";
import { supabase } from "@/integrations/supabase/client";
import {
  useStudiesForFiles,
  useStorageFiles,
  useFileUpload,
  useFileDelete,
  useStudyDelete,
  useCreateFolder,
  useRenameFile,
  useFilteredFiles,
  type StudyFile,
  type StudyForFiles,
} from "@/hooks/useFilesData";

dayjs.extend(relativeTime);

/* ─── Bucket config ─────────────────────────────────────── */

const BUCKETS = [
  {
    id: "study-files",
    name: "My Studies",
    icon: Database,
    description: "EEG studies & analyses",
    color: "text-primary",
  },
  {
    id: "eeg-uploads",
    name: "EEG Uploads",
    icon: Activity,
    description: "Raw EEG recordings",
    color: "text-blue-600",
  },
  {
    id: "eeg-reports",
    name: "Reports",
    icon: FileText,
    description: "Signed PDF reports",
    color: "text-emerald-600",
  },
  {
    id: "notes",
    name: "My Notes",
    icon: StickyNote,
    description: "Private notes",
    color: "text-purple-600",
  },
] as const;

type BucketId = (typeof BUCKETS)[number]["id"];

/* ─── Helpers ────────────────────────────────────────────── */

function formatBytes(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getStudyClassification(study: StudyForFiles) {
  const report = study.ai_draft_json;
  if (!report) return null;
  const cls = report.classification ?? report.triage?.classification ?? null;
  const conf = report.triage_confidence ?? report.triage?.confidence ?? null;
  return cls && cls !== "unknown" ? { cls, conf } : null;
}

function getStateBadge(study: StudyForFiles) {
  const s = study.triage_status === "completed" ? "signed" : study.state;
  const map: Record<string, { label: string; className: string }> = {
    uploaded: { label: "Uploaded", className: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
    awaiting_sla: { label: "Awaiting SLA", className: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
    processing: { label: "Processing", className: "bg-purple-500/10 text-purple-600 border-purple-500/20" },
    ai_draft: { label: "Draft Ready", className: "bg-cyan-500/10 text-cyan-600 border-cyan-500/20" },
    in_review: { label: "In Review", className: "bg-orange-500/10 text-orange-600 border-orange-500/20" },
    signed: { label: "Signed", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  };
  return map[s] || { label: s, className: "bg-muted text-muted-foreground border-border" };
}

function totalStudySize(study: StudyForFiles): number {
  return (study.study_files || []).reduce((sum, f) => sum + (f.size_bytes || 0), 0);
}

/* ─── NameInputDialog ────────────────────────────────────── */

const NameInputDialog = memo(function NameInputDialog({
  open,
  title,
  description,
  placeholder,
  confirmLabel,
  initialValue,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: string;
  placeholder: string;
  confirmLabel: string;
  initialValue?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue || "");

  const handleConfirm = () => {
    if (!value.trim()) return;
    onConfirm(value.trim());
    setValue("");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") handleConfirm();
            if (e.key === "Escape") onCancel();
          }}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={!value.trim()}>{confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

/* ─── StudyCard ──────────────────────────────────────────── */

const StudyCard = memo(function StudyCard({
  study,
  onDelete,
}: {
  study: StudyForFiles;
  onDelete: (study: StudyForFiles) => void;
}) {
  const navigate = useNavigate();
  const meta = study.meta as any;
  const patientName = meta?.patient_name || meta?.patientName;
  const patientId = meta?.patient_id || meta?.patientId;
  const classification = getStudyClassification(study);
  const stateBadge = getStateBadge(study);
  const isProcessing = study.triage_status === "processing";
  const totalSize = totalStudySize(study);
  const fileCount = study.study_files?.length || 0;
  const isNormal = classification?.cls === "normal";
  const isAbnormal = classification?.cls === "abnormal";

  return (
    <div
      className={cn(
        "group flex items-start gap-3 px-3 py-3 rounded-lg border transition-colors cursor-pointer",
        "hover:bg-muted/40 hover:border-primary/20",
        isAbnormal ? "border-red-500/20" : isNormal ? "border-emerald-500/20" : "border-border/50"
      )}
      onClick={() => navigate(`/app/studies/${study.id}`)}
    >
      {/* Icon */}
      <div
        className={cn(
          "mt-0.5 h-9 w-9 rounded-lg flex items-center justify-center shrink-0",
          isAbnormal
            ? "bg-red-500/10"
            : isNormal
            ? "bg-emerald-500/10"
            : isProcessing
            ? "bg-purple-500/10"
            : "bg-muted"
        )}
      >
        {isNormal ? (
          <ShieldCheck className="h-4 w-4 text-emerald-500" />
        ) : isAbnormal ? (
          <AlertCircle className="h-4 w-4 text-red-500" />
        ) : isProcessing ? (
          <Brain className="h-4 w-4 text-purple-500 animate-pulse" />
        ) : (
          <FileIcon className="h-4 w-4 text-muted-foreground" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm truncate">
            {patientName || patientId || `Study ${study.id.slice(0, 6).toUpperCase()}`}
          </span>
          <Badge variant={study.sla === "STAT" ? "destructive" : "secondary"} className="text-[10px] shrink-0">
            {study.sla}
          </Badge>
          <Badge className={cn("text-[10px] shrink-0", stateBadge.className)}>
            {stateBadge.label}
          </Badge>
          {classification && (
            <Badge
              className={cn(
                "text-[10px] shrink-0 gap-0.5",
                isNormal
                  ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                  : "bg-red-500/10 text-red-600 border-red-500/20"
              )}
            >
              {isNormal ? <ShieldCheck className="h-2.5 w-2.5" /> : <AlertCircle className="h-2.5 w-2.5" />}
              {isNormal ? "Normal" : "Abnormal"}
              {typeof classification.conf === "number" && classification.conf > 0 && (
                <span className="opacity-60 ml-0.5">{Math.round(classification.conf * 100)}%</span>
              )}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
          {patientId && patientName && <span className="font-mono">{patientId}</span>}
          <span className="flex items-center gap-1">
            <Clock className="h-2.5 w-2.5" />
            {dayjs(study.created_at).fromNow()}
          </span>
          {fileCount > 0 && (
            <span>{fileCount} file{fileCount !== 1 ? "s" : ""} · {formatBytes(totalSize)}</span>
          )}
        </div>

        {isProcessing && (
          <div className="mt-1.5">
            <Progress className="h-1 w-48" value={undefined} />
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          title="Open EEG Viewer"
          onClick={() => navigate(`/app/studies/${study.id}/viewer`)}
        >
          <Activity className="h-3.5 w-3.5" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <MoreVertical className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => navigate(`/app/studies/${study.id}`)}>
              <Eye className="h-4 w-4 mr-2" />
              View Study
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate(`/app/studies/${study.id}/viewer`)}>
              <Activity className="h-4 w-4 mr-2" />
              Open EEG Viewer
            </DropdownMenuItem>
            {(study.triage_status === "completed" || study.state === "signed") && (
              <DropdownMenuItem onClick={() => navigate(`/app/studies/${study.id}`)}>
                <FileText className="h-4 w-4 mr-2" />
                View Report
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => onDelete(study)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Study
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
});

/* ─── StorageFileRow ─────────────────────────────────────── */

const StorageFileRow = memo(function StorageFileRow({
  file,
  bucket,
  onPreview,
  onDownload,
  onDelete,
  onRename,
  onViewStudy,
}: {
  file: any;
  bucket: string;
  onPreview: () => void;
  onDownload: () => void;
  onDelete: () => void;
  onRename: () => void;
  onViewStudy?: () => void;
}) {
  const isFolder = !file.name?.includes(".");
  const size = file.metadata?.size ?? file.size_bytes ?? null;
  const isDbRecord = bucket === "eeg-uploads" || bucket === "eeg-reports";

  const icon =
    bucket === "eeg-reports" ? (
      <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0" />
    ) : bucket === "eeg-uploads" ? (
      <Activity className="h-5 w-5 text-blue-500 flex-shrink-0" />
    ) : isFolder ? (
      <FolderOpen className="h-5 w-5 text-blue-500 flex-shrink-0" />
    ) : (
      <FileIcon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
    );

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors group">
      {icon}

      <div className="flex-1 min-w-0 cursor-pointer" onClick={onViewStudy || onPreview}>
        <p className="font-medium text-sm truncate">{file.patientLabel || file.name}</p>
        <p className="text-xs text-muted-foreground truncate">
          {file.name}
          {file.kind && <span className="ml-1 font-mono uppercase opacity-60">{file.kind}</span>}
          {size && ` · ${formatBytes(size)}`}
          {(file.updated_at || file.created_at) &&
            ` · ${dayjs(file.updated_at || file.created_at).fromNow()}`}
          {bucket === "eeg-reports" && file.status && (
            <Badge className={cn(
              "ml-2 text-[9px]",
              file.status === "signed"
                ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                : "bg-muted text-muted-foreground border-border"
            )}>
              {file.status}
            </Badge>
          )}
        </p>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 h-8 w-8 p-0">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {onViewStudy && (
            <DropdownMenuItem onClick={onViewStudy}>
              <Eye className="h-4 w-4 mr-2" />
              View Study
            </DropdownMenuItem>
          )}
          {!isFolder && !isDbRecord && (
            <DropdownMenuItem onClick={onPreview}>
              <Eye className="h-4 w-4 mr-2" />
              Preview
            </DropdownMenuItem>
          )}
          {!isFolder && !isDbRecord && (
            <DropdownMenuItem onClick={onDownload}>
              <Download className="h-4 w-4 mr-2" />
              Download
            </DropdownMenuItem>
          )}
          {!isDbRecord && (
            <DropdownMenuItem onClick={onRename}>
              <Pencil className="h-4 w-4 mr-2" />
              Rename
            </DropdownMenuItem>
          )}
          {!isDbRecord && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
});

/* ─── Main component ─────────────────────────────────────── */

export default function Files() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedBucket, setSelectedBucket] = useState<BucketId>("study-files");
  const [currentPath, setCurrentPath] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [previewFile, setPreviewFile] = useState<any>(null);

  // Dialogs
  const [deleteStudyTarget, setDeleteStudyTarget] = useState<StudyForFiles | null>(null);
  const [deleteFileTarget, setDeleteFileTarget] = useState<string | null>(null);
  const [showFolderDialog, setShowFolderDialog] = useState(false);
  const [renameTarget, setRenameTarget] = useState<string | null>(null);

  // Data hooks
  const { data: studiesForFiles, isLoading: studiesLoading, isError: studiesError, refetch: refetchStudies } = useStudiesForFiles();
  const { data: storageFiles, isLoading: storageLoading, isError: storageError, refetch: refetchStorage } = useStorageFiles(
    selectedBucket,
    currentPath,
    selectedBucket !== "study-files"
  );

  const uploadMutation = useFileUpload(selectedBucket, currentPath);
  const deleteMutation = useFileDelete(selectedBucket, currentPath);
  const deleteStudyMutation = useStudyDelete();
  const createFolderMutation = useCreateFolder(selectedBucket, currentPath);
  const renameMutation = useRenameFile(selectedBucket, currentPath);

  const { folders, files: regularFiles, total } = useFilteredFiles(
    undefined,
    storageFiles,
    selectedBucket,
    searchQuery
  );

  // Filtered studies
  const filteredStudies = (studiesForFiles || []).filter((s) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const meta = s.meta as any;
    return (
      meta?.patient_name?.toLowerCase().includes(q) ||
      meta?.patient_id?.toLowerCase().includes(q) ||
      s.id.includes(q)
    );
  });

  const handleDownload = useCallback(
    async (fileName: string, filePath?: string) => {
      if (selectedBucket === "study-files" && filePath) {
        const { data, error } = await supabase.storage.from("eeg-uploads").download(filePath);
        if (error) {
          toast.error("Download failed: " + error.message);
          return;
        }
        const url = URL.createObjectURL(data);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error("Not authenticated"); return; }

      const downloadPath = currentPath
        ? `${user.id}/${currentPath}/${fileName}`
        : `${user.id}/${fileName}`;
      const { data, error } = await supabase.storage.from(selectedBucket).download(downloadPath);
      if (error) {
        toast.error("Download failed: " + error.message);
        return;
      }
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    },
    [selectedBucket, currentPath]
  );

  const handlePreview = useCallback(
    async (fileName: string, filePath?: string) => {
      if (selectedBucket === "notes") {
        navigate("/app/notes");
        return;
      }

      if (selectedBucket === "study-files" && filePath) {
        setPreviewFile({ name: fileName, path: filePath, bucket: "eeg-uploads" });
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const fp = currentPath ? `${user.id}/${currentPath}/${fileName}` : `${user.id}/${fileName}`;
      setPreviewFile({ name: fileName, path: fp, bucket: selectedBucket });
    },
    [selectedBucket, currentPath, navigate]
  );

  const handleFileUpload = useCallback(
    (uploadedFiles: FileList | null) => {
      if (!uploadedFiles) return;
      Array.from(uploadedFiles).forEach((file) => uploadMutation.mutate(file));
    },
    [uploadMutation]
  );

  const handleFolderClick = useCallback(
    (folderName: string) => {
      setCurrentPath(currentPath ? `${currentPath}/${folderName}` : folderName);
    },
    [currentPath]
  );

  const handleBack = useCallback(() => {
    if (!currentPath) return;
    const parts = currentPath.split("/");
    parts.pop();
    setCurrentPath(parts.join("/"));
  }, [currentPath]);

  const handleBucketChange = useCallback((bucketId: BucketId) => {
    setSelectedBucket(bucketId);
    setCurrentPath("");
    setSearchQuery("");
  }, []);

  const isLoading = selectedBucket === "study-files" ? studiesLoading : storageLoading;
  const isError = selectedBucket === "study-files" ? studiesError : storageError;
  const activeCount = selectedBucket === "study-files" ? filteredStudies.length : total;
  const canCreateFolder = !["study-files", "notes", "eeg-uploads", "eeg-reports"].includes(selectedBucket);
  const canUpload = !["study-files", "notes", "eeg-uploads", "eeg-reports"].includes(selectedBucket);

  return (
    <div className="h-[calc(100vh-10rem)] flex flex-col gap-2">
      <div className="flex-1 flex gap-0 rounded-lg overflow-hidden border border-border min-h-0">

        {/* ── Left sidebar ── */}
        <div className="w-56 border-r bg-card/50 flex flex-col shrink-0">
          <div className="p-3 border-b bg-card/80">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Storage
            </h3>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-2 space-y-0.5">
              {BUCKETS.map((bucket) => {
                const Icon = bucket.icon;
                const isActive = selectedBucket === bucket.id;
                return (
                  <button
                    key={bucket.id}
                    onClick={() => handleBucketChange(bucket.id as BucketId)}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all text-left",
                      "hover:bg-secondary/80",
                      isActive && "bg-secondary text-foreground font-medium"
                    )}
                  >
                    <Icon className={cn("h-4 w-4 shrink-0", bucket.color)} />
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{bucket.name}</div>
                      {!isActive && (
                        <div className="text-[10px] text-muted-foreground/70 truncate">{bucket.description}</div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </ScrollArea>

          {/* Sidebar footer: storage hint */}
          <div className="p-3 border-t">
            <p className="text-[10px] text-muted-foreground/60 leading-snug">
              Files are private to your account. RLS enforced.
            </p>
          </div>
        </div>

        {/* ── Right panel ── */}
        <div className="flex-1 flex flex-col bg-background min-w-0">

          {/* Toolbar */}
          <div className="h-12 border-b bg-card/50 flex items-center justify-between px-4 gap-3 shrink-0">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {currentPath && (
                <Button variant="ghost" size="sm" onClick={handleBack} className="h-7 px-2 shrink-0">
                  <ArrowLeft className="h-3.5 w-3.5" />
                </Button>
              )}
              <div className="flex items-center gap-1 text-sm text-muted-foreground min-w-0">
                <FolderOpen className="h-4 w-4 shrink-0" />
                <span className="font-medium shrink-0">
                  {BUCKETS.find((b) => b.id === selectedBucket)?.name}
                </span>
                {currentPath && (
                  <>
                    <ChevronRight className="h-3 w-3 shrink-0" />
                    <span className="truncate text-xs">{currentPath}</span>
                  </>
                )}
              </div>
              {!isLoading && (
                <span className="text-[10px] font-mono text-muted-foreground/60 shrink-0">
                  {activeCount} item{activeCount !== 1 ? "s" : ""}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-48 pl-8 h-8 text-sm"
                />
              </div>

              {canCreateFolder && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1.5"
                  onClick={() => setShowFolderDialog(true)}
                >
                  <FolderPlus className="h-3.5 w-3.5" />
                  New Folder
                </Button>
              )}

              {canUpload && (
                <Button
                  size="sm"
                  className="h-8 text-xs gap-1.5"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadMutation.isPending}
                >
                  {uploadMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Upload className="h-3.5 w-3.5" />
                  )}
                  Upload
                </Button>
              )}

              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => handleFileUpload(e.target.files)}
              />
            </div>
          </div>

          {/* Error banner */}
          {isError && (
            <Alert variant="destructive" className="m-3 mb-0">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="flex items-center justify-between">
                <span>Failed to load files. Check your connection.</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 ml-2 gap-1"
                  onClick={() =>
                    selectedBucket === "study-files" ? refetchStudies() : refetchStorage()
                  }
                >
                  <RefreshCw className="h-3 w-3" />
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* File list */}
          <ScrollArea className="flex-1">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Loading files…</p>
              </div>
            ) : selectedBucket === "study-files" ? (
              /* Studies view */
              filteredStudies.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center px-6">
                  <Database className="h-12 w-12 text-muted-foreground/30 mb-4" />
                  <p className="font-medium">No studies yet</p>
                  <p className="text-sm text-muted-foreground mt-1 mb-4">
                    Upload an EEG recording from the Studies page to get started.
                  </p>
                  <Button size="sm" onClick={() => navigate("/app/studies")}>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Study
                  </Button>
                </div>
              ) : (
                <div className="p-3 space-y-1.5">
                  {filteredStudies.map((study) => (
                    <StudyCard
                      key={study.id}
                      study={study}
                      onDelete={setDeleteStudyTarget}
                    />
                  ))}
                </div>
              )
            ) : (
              /* Storage bucket view */
              activeCount === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center px-6">
                  {selectedBucket === "eeg-uploads" ? (
                    <Activity className="h-12 w-12 text-muted-foreground/30 mb-4" />
                  ) : selectedBucket === "eeg-reports" ? (
                    <FileText className="h-12 w-12 text-muted-foreground/30 mb-4" />
                  ) : (
                    <FolderOpen className="h-12 w-12 text-muted-foreground/30 mb-4" />
                  )}
                  <p className="font-medium">
                    {searchQuery
                      ? "No files match your search"
                      : selectedBucket === "eeg-uploads"
                      ? "No EEG uploads yet"
                      : selectedBucket === "eeg-reports"
                      ? "No signed reports yet"
                      : "Empty folder"}
                  </p>
                  {!searchQuery && selectedBucket === "eeg-uploads" && (
                    <p className="text-sm text-muted-foreground mt-1">
                      Upload an EEG recording from the Studies page to get started.
                    </p>
                  )}
                  {!searchQuery && selectedBucket === "eeg-reports" && (
                    <p className="text-sm text-muted-foreground mt-1">
                      Reports appear here once a study is signed.
                    </p>
                  )}
                  {!searchQuery && canUpload && !["eeg-uploads", "eeg-reports"].includes(selectedBucket) && (
                    <p className="text-sm text-muted-foreground mt-1">
                      Click Upload to add files here.
                    </p>
                  )}
                </div>
              ) : (
                <div className="p-2">
                  {/* Folders */}
                  {folders.map((folder) => (
                    <div
                      key={folder.name}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors group"
                      onClick={() => handleFolderClick(folder.name)}
                    >
                      <FolderOpen className="h-5 w-5 text-blue-500 shrink-0" />
                      <span className="flex-1 font-medium text-sm">{folder.name}</span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/40 opacity-0 group-hover:opacity-100" />
                    </div>
                  ))}

                  {/* Files */}
                  {regularFiles.map((file) => (
                    <StorageFileRow
                      key={file.id || file.name}
                      file={file}
                      bucket={selectedBucket}
                      onPreview={() => handlePreview(file.name)}
                      onDownload={() => handleDownload(file.name)}
                      onDelete={() => setDeleteFileTarget(file.name)}
                      onRename={() => setRenameTarget(file.name)}
                      onViewStudy={file.study_id ? () => navigate(`/app/studies/${file.study_id}`) : undefined}
                    />
                  ))}
                </div>
              )
            )}
          </ScrollArea>
        </div>
      </div>

      {/* ── Dialogs ── */}

      {/* Delete study confirmation */}
      <AlertDialog
        open={!!deleteStudyTarget}
        onOpenChange={(o) => !o && setDeleteStudyTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Study?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the EEG recording
              {deleteStudyTarget?.meta?.patient_name
                ? ` for ${deleteStudyTarget.meta.patient_name}`
                : ""}
              , all associated files, and any generated analysis. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteStudyTarget(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                if (deleteStudyTarget) {
                  deleteStudyMutation.mutate(deleteStudyTarget.id);
                  setDeleteStudyTarget(null);
                }
              }}
            >
              {deleteStudyMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete file confirmation */}
      <AlertDialog
        open={!!deleteFileTarget}
        onOpenChange={(o) => !o && setDeleteFileTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete File?</AlertDialogTitle>
            <AlertDialogDescription>
              Delete <span className="font-mono text-sm">{deleteFileTarget}</span>? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteFileTarget(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                if (deleteFileTarget) {
                  deleteMutation.mutate(deleteFileTarget);
                  setDeleteFileTarget(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create folder dialog */}
      <NameInputDialog
        open={showFolderDialog}
        title="Create Folder"
        description="Enter a name for the new folder."
        placeholder="Folder name"
        confirmLabel="Create"
        onConfirm={(name) => {
          createFolderMutation.mutate(name);
          setShowFolderDialog(false);
        }}
        onCancel={() => setShowFolderDialog(false)}
      />

      {/* Rename dialog */}
      <NameInputDialog
        open={!!renameTarget}
        title="Rename File"
        placeholder="New filename"
        confirmLabel="Rename"
        initialValue={renameTarget || ""}
        onConfirm={(newName) => {
          if (renameTarget) {
            renameMutation.mutate({ oldName: renameTarget, newName });
            setRenameTarget(null);
          }
        }}
        onCancel={() => setRenameTarget(null)}
      />

      {/* File preview */}
      {previewFile && (
        <FilePreviewDialog
          file={{
            name: previewFile.name,
            path: previewFile.path,
            size: 0,
            created_at: new Date().toISOString(),
          }}
          bucket={previewFile.bucket || selectedBucket}
          open={!!previewFile}
          onOpenChange={(open) => !open && setPreviewFile(null)}
        />
      )}
    </div>
  );
}
