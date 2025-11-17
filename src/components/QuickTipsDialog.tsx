import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HelpCircle, Keyboard, Upload, Zap, Activity, Search, Home, FileText } from "lucide-react";
import { Separator } from "@/components/ui/separator";

export function QuickTipsDialog() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button 
        variant="ghost" 
        size="icon" 
        className="h-8 w-8 rounded-full"
        onClick={() => setOpen(true)}
        title="Quick Tips & Shortcuts"
      >
        <HelpCircle className="h-4 w-4" />
      </Button>
      
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5" />
              Quick Tips & Keyboard Shortcuts
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* Quick Tips Section */}
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                Quick Tips
              </h3>
              <ul className="space-y-3">
                <li className="flex gap-3">
                  <Search className="h-5 w-5 text-primary flex-shrink-0" />
                  <div>
                    <p className="font-medium">Press <kbd className="px-2 py-1 bg-muted rounded text-xs">Ctrl+K</kbd> to search</p>
                    <p className="text-sm text-muted-foreground">Quickly find studies, navigate, or take actions</p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <Upload className="h-5 w-5 text-primary flex-shrink-0" />
                  <div>
                    <p className="font-medium">Drag & drop EEG files</p>
                    <p className="text-sm text-muted-foreground">Upload directly from Files or Studies page</p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <Activity className="h-5 w-5 text-primary flex-shrink-0" />
                  <div>
                    <p className="font-medium">AI assists your reviews</p>
                    <p className="text-sm text-muted-foreground">Get draft reports in seconds, review and sign</p>
                  </div>
                </li>
              </ul>
            </div>

            <Separator />

            {/* Keyboard Shortcuts Section */}
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Keyboard className="h-4 w-4 text-primary" />
                Keyboard Shortcuts
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center py-2">
                  <span className="text-muted-foreground">Open command palette</span>
                  <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">Ctrl+K</kbd>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-muted-foreground">Toggle sidebar</span>
                  <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">Ctrl+B</kbd>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <Home className="h-3 w-3" />
                    Go to dashboard
                  </span>
                  <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">G then D</kbd>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <FileText className="h-3 w-3" />
                    Go to studies
                  </span>
                  <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">G then S</kbd>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <Activity className="h-3 w-3" />
                    Go to EEG viewer
                  </span>
                  <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">G then V</kbd>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
