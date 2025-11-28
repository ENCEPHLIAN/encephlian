import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, X, FileText, Image as ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PDFViewer } from "./PDFViewer";
import mammoth from "mammoth";

interface FilePreviewDialogProps {
  file: {
    name: string;
    path: string;
    size?: number;
    created_at?: string;
  };
  bucket: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerateReport?: (filePath: string) => void;
}

export function FilePreviewDialog({
  file,
  bucket,
  open,
  onOpenChange,
  onGenerateReport,
}: FilePreviewDialogProps) {
  const [downloading, setDownloading] = useState(false);
  const [fileUrl, setFileUrl] = useState<string>("");
  const [fileContent, setFileContent] = useState<string>("");
  const [fileType, setFileType] = useState<"pdf" | "image" | "text" | "docx" | "edf" | "unknown">("unknown");

  // Determine file type
  useEffect(() => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext === "pdf") setFileType("pdf");
    else if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext || "")) setFileType("image");
    else if (["txt", "md", "json", "csv", "log"].includes(ext || "")) setFileType("text");
    else if (["doc", "docx"].includes(ext || "")) setFileType("docx");
    else if (ext === "edf") setFileType("edf");
    else setFileType("unknown");
  }, [file.name]);

  // Fetch file URL or content when dialog opens
  useEffect(() => {
    if (!open) return;

    const loadFile = async () => {
      try {
        if (fileType === "pdf" || fileType === "image") {
          // Download file and create blob URL
          const { data, error } = await supabase.storage.from(bucket).download(file.path);
          if (error) throw error;
          const blobUrl = URL.createObjectURL(data);
          setFileUrl(blobUrl);
        } else if (fileType === "text") {
          // Download and display text content
          const { data, error } = await supabase.storage.from(bucket).download(file.path);
          if (error) throw error;
          const text = await data.text();
          setFileContent(text);
        } else if (fileType === "docx") {
          // Download and convert DOCX to HTML
          const { data, error } = await supabase.storage.from(bucket).download(file.path);
          if (error) throw error;
          const arrayBuffer = await data.arrayBuffer();
          const result = await mammoth.convertToHtml({ arrayBuffer });
          setFileContent(result.value);
        } else if (fileType === "edf") {
          // For EDF files, show metadata
          setFileContent(
            `EDF File: ${file.name}\nSize: ${((file.size || 0) / 1024).toFixed(2)} KB\nCreated: ${file.created_at || "Unknown"}\n\nThis is an EEG data file. Open in EEG Viewer for full analysis.`
          );
        }
      } catch (error) {
        console.error("Error loading file:", error);
        toast.error("Failed to load file preview");
      }
    };

    loadFile();

    // Cleanup blob URL when dialog closes
    return () => {
      if (fileUrl && (fileType === "pdf" || fileType === "image")) {
        URL.revokeObjectURL(fileUrl);
      }
    };
  }, [open, bucket, file, fileType]);

  const handleDownload = async () => {
    try {
      setDownloading(true);
      const { data, error } = await supabase.storage.from(bucket).download(file.path);

      if (error) throw error;

      const url = window.URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast.success("Download started");
    } catch (error: any) {
      console.error("Download error:", error);
      toast.error(error.message || "Failed to download file");
    } finally {
      setDownloading(false);
    }
  };

  const renderPreview = () => {
    if (fileType === "pdf" && fileUrl) {
      return <PDFViewer fileUrl={fileUrl} />;
    }

    if (fileType === "image" && fileUrl) {
      return (
        <div className="flex items-center justify-center h-full bg-muted/20 p-4">
          <img
            src={fileUrl}
            alt={file.name}
            className="max-w-full max-h-full object-contain rounded"
          />
        </div>
      );
    }

    if (fileType === "text" || fileType === "edf") {
      return (
        <div className="h-full overflow-auto bg-muted/20 p-6">
          <pre className="text-sm font-mono whitespace-pre-wrap">{fileContent}</pre>
        </div>
      );
    }

    if (fileType === "docx" && fileContent) {
      return (
        <div
          className="h-full overflow-auto bg-background p-6 prose prose-sm max-w-none dark:prose-invert"
          dangerouslySetInnerHTML={{ __html: fileContent }}
        />
      );
    }

    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
        <FileText className="h-16 w-16" />
        <div className="text-center space-y-1">
          <p className="font-medium">Preview not available</p>
          <p className="text-sm">Download to view this file</p>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[85vh] p-0 gap-0 [&>button]:hidden">
        {/* Custom header with single X button */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-card">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {fileType === "image" ? (
              <ImageIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            ) : (
              <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            )}
            <span className="text-sm font-medium truncate">{file.name}</span>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDownload}
              disabled={downloading}
              className="h-8"
            >
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>

            {fileType === "edf" && onGenerateReport && (
              <Button variant="default" size="sm" onClick={() => onGenerateReport(file.path)} className="h-8">
                Generate AI Report
              </Button>
            )}

            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </Button>
          </div>
        </div>

        {/* Preview content */}
        <div className="flex-1 overflow-hidden">{renderPreview()}</div>
      </DialogContent>
    </Dialog>
  );
}
