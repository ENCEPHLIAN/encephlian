import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Monitor, ArrowRight, CheckCircle2, AlertTriangle, Info, Upload, FileText, Zap, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

interface PilotOnboardingProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MACHINES = [
  {
    id: "natus",
    name: "Natus NicOne / NeuroWorks",
    badge: "Most Common",
    steps: [
      "Open your recording in NicOne or NeuroWorks software",
      "Go to File → Export → select 'EDF/EDF+' format",
      "Select all channels (standard 10-20 montage recommended)",
      "Choose output directory and click Export",
      "Upload the exported .edf file to ENCEPHLIAN",
    ],
  },
  {
    id: "nihon-kohden",
    name: "Nihon Kohden EEG-1200",
    badge: "NK Series",
    steps: [
      "Press Menu → Data Management → Export",
      "Select 'EDF' as the export format",
      "Choose the study and time range",
      "Export to USB or network drive",
      "Upload the .edf file to ENCEPHLIAN",
    ],
  },
  {
    id: "compumedics",
    name: "Compumedics Profusion",
    badge: "Compumedics",
    steps: [
      "Open the study in Profusion EEG software",
      "Select File → Export → European Data Format",
      "Configure channels and time range",
      "Save to your preferred location",
      "Upload the .edf file to ENCEPHLIAN",
    ],
  },
];

const WORKFLOW_STEPS = [
  {
    icon: Upload,
    title: "1. Upload EEG",
    desc: "Drop your .EDF file or click Upload. We'll extract patient info, channel data, and recording metadata automatically.",
  },
  {
    icon: Zap,
    title: "2. Select Priority",
    desc: "Choose Standard (1 token, 12-24h) or Priority (2 tokens, 30-90min). Standard starts with a single tap.",
  },
  {
    icon: Brain,
    title: "3. AI Analysis",
    desc: "MIND® processes the EEG: artifact cleanup, signal analysis, and anomaly detection. Track progress in real-time.",
  },
  {
    icon: FileText,
    title: "4. Get Report",
    desc: "Download your triage report as PDF. View it inline or share with colleagues. Request a refund within 48h if unsatisfied.",
  },
];

export default function PilotOnboarding({ open, onOpenChange }: PilotOnboardingProps) {
  const navigate = useNavigate();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Info className="h-5 w-5 text-primary" />
            Getting Started with ENCEPHLIAN
          </DialogTitle>
          <DialogDescription>
            Everything you need to know to upload your first EEG and get a triage report
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="workflow" className="mt-2">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="workflow">How It Works</TabsTrigger>
            <TabsTrigger value="export">EDF Export Guide</TabsTrigger>
          </TabsList>

          {/* Workflow Tab */}
          <TabsContent value="workflow" className="space-y-4 mt-4">
            {WORKFLOW_STEPS.map((step, i) => (
              <div key={i} className="flex gap-4 items-start">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <step.icon className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-sm">{step.title}</h4>
                  <p className="text-sm text-muted-foreground mt-0.5">{step.desc}</p>
                </div>
              </div>
            ))}

            <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 mt-4">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs text-muted-foreground">
                <strong className="text-foreground">Important:</strong> Only EDF (.edf) files are currently supported.
                If your EEG machine uses a proprietary format (.nic, .nrd, .e, .cnt), you must export to EDF first.
                See the "EDF Export Guide" tab for step-by-step instructions.
              </div>
            </div>

            <div className="pt-2">
              <Button
                className="w-full gap-2 rounded-full"
                onClick={() => {
                  onOpenChange(false);
                  navigate("/app/studies");
                }}
              >
                <Upload className="h-4 w-4" />
                Upload Your First EEG
              </Button>
            </div>
          </TabsContent>

          {/* Export Guide Tab */}
          <TabsContent value="export" className="space-y-4 mt-4">
            <p className="text-sm text-muted-foreground">
              Select your EEG machine below for specific export instructions:
            </p>

            {MACHINES.map((machine) => (
              <div key={machine.id} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Monitor className="h-4 w-4 text-primary" />
                    <span className="font-semibold text-sm">{machine.name}</span>
                  </div>
                  <Badge variant="outline" className="text-xs">{machine.badge}</Badge>
                </div>
                <ol className="space-y-1.5 text-sm">
                  {machine.steps.map((step, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-xs font-bold text-primary mt-0.5">{i + 1}.</span>
                      <span className="text-muted-foreground">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}

            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 border">
              <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                Don't see your EEG machine? Most modern EEG systems support EDF export.
                Check your software's File → Export menu, or contact our support team.
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
