import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, FileText, X, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { PDFViewer } from "./PDFViewer";

interface FilePreviewDialogProps {
  file: {
    name: string;
    path: string;
    size: number;
    created_at: string;
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
  onGenerateReport
}: FilePreviewDialogProps) {
  const { toast } = useToast();
  const [downloading, setDownloading] = useState(false);

  const fileExtension = file.name.split('.').pop()?.toLowerCase();
  const isEDF = fileExtension === 'edf';
  const isPDF = fileExtension === 'pdf';
  const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExtension || '');
  const isText = ['txt', 'json', 'md', 'log'].includes(fileExtension || '');

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const { data, error } = await supabase.storage
        .from(bucket)
        .download(file.path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Download started",
        description: `${file.name} is being downloaded`,
      });
    } catch (error) {
      console.error('Download error:', error);
      toast({
        title: "Download failed",
        description: "Failed to download file",
        variant: "destructive",
      });
    } finally {
      setDownloading(false);
    }
  };

  const getFileUrl = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return '';
      
      // Check if path already includes user ID
      const filePath = file.path.startsWith(`${user.id}/`) ? file.path : `${user.id}/${file.path}`;
      
      const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
      return data.publicUrl;
    } catch (error) {
      console.error('Error getting file URL:', error);
      return '';
    }
  };

  const [fileUrl, setFileUrl] = useState<string>('');

  useEffect(() => {
    if (open) {
      getFileUrl().then(setFileUrl);
    }
  }, [open, file.path]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[80vh] p-0">
        <DialogHeader className="px-6 pt-6 pb-0">
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle>{file.name}</DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {(file.size / 1024).toFixed(2)} KB • {new Date(file.created_at).toLocaleDateString()}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 px-6 pb-6 overflow-hidden">
          {isPDF && fileUrl && (
            <PDFViewer fileUrl={fileUrl} />
          )}

          {isEDF && (
            <div className="flex flex-col items-center justify-center h-full bg-muted/30 rounded-lg p-8">
              <FileText className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">EEG Data File</h3>
              <p className="text-sm text-muted-foreground text-center mb-6">
                This is an EDF file containing EEG waveform data. Download to view in specialized software,
                or generate an AI report to analyze the data.
              </p>
              <div className="flex gap-2">
                <Button onClick={handleDownload} disabled={downloading}>
                  <Download className="h-4 w-4 mr-2" />
                  Download File
                </Button>
                {onGenerateReport && bucket === 'eeg-raw' && (
                  <Button
                    onClick={() => {
                      onGenerateReport(file.path);
                      onOpenChange(false);
                    }}
                    variant="default"
                  >
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generate AI Report
                  </Button>
                )}
              </div>
            </div>
          )}

          {isImage && fileUrl && (
            <div className="flex items-center justify-center h-full">
              <img
                src={fileUrl}
                alt={file.name}
                className="max-w-full max-h-full object-contain"
              />
            </div>
          )}

          {isText && (
            <div className="h-full overflow-auto">
              <pre className="text-sm bg-muted p-4 rounded-lg">
                <code>{/* Text content would be loaded here */}</code>
              </pre>
            </div>
          )}

          {!isPDF && !isEDF && !isImage && !isText && (
            <div className="flex flex-col items-center justify-center h-full bg-muted/30 rounded-lg p-8">
              <FileText className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Preview Not Available</h3>
              <p className="text-sm text-muted-foreground text-center mb-6">
                This file type cannot be previewed in the browser. Download to view.
              </p>
              <Button onClick={handleDownload} disabled={downloading}>
                <Download className="h-4 w-4 mr-2" />
                Download File
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
