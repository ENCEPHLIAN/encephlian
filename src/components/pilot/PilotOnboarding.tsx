import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Monitor,
  CheckCircle2,
  AlertTriangle,
  Info,
  Upload,
  FileText,
  Zap,
  Brain,
  Clock,
  Shield,
  ArrowRight,
} from "lucide-react";
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
  {
    id: "xltek",
    name: "Natus XLTEK / EMU40",
    badge: "XLTEK",
    steps: [
      "Open study in XLTEK review software",
      "Go to File → Export → EDF+",
      "Select channels and time range to export",
      "Choose destination folder and click Export",
      "Upload the .edf file to ENCEPHLIAN",
    ],
  },
];

const WORKFLOW_STEPS = [
  {
    icon: Upload,
    title: "1. Upload EEG",
    desc: "Drop your .EDF file or click Upload. We'll extract patient info, channel data, and recording metadata automatically.",
    time: "~30 seconds",
  },
  {
    icon: Zap,
    title: "2. Select Priority",
    desc: "Choose Standard (1 token, ~15 min) or Priority (2 tokens, ~5 min). Standard starts with a single tap.",
    time: "1 tap",
  },
  {
    icon: Brain,
    title: "3. AI Analysis",
    desc: "MIND® processes the EEG: artifact cleanup, signal analysis, and anomaly detection. Track progress in real-time on your dashboard.",
    time: "5-15 min",
  },
  {
    icon: FileText,
    title: "4. Get Report",
    desc: "Download your clinically structured triage report as PDF. View findings inline, review annotated segments, or share with colleagues.",
    time: "Instant",
  },
];

export default function PilotOnboarding({
  open,
  onOpenChange,
}: PilotOnboardingProps) {
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
            Everything you need to know to get your first triage report
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
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <step.icon className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-sm">{step.title}</h4>
                    <Badge
                      variant="outline"
                      className="text-[9px] px-1.5 py-0"
                    >
                      {step.time}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {step.desc}
                  </p>
                </div>
              </div>
            ))}

            {/* Key info boxes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
              <div className="flex items-start gap-2.5 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <Shield className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <strong className="text-foreground">HIPAA Compliant</strong>
                  <p className="text-muted-foreground mt-0.5">
                    All data encrypted at rest and in transit. SOC2 Type II
                    certified infrastructure.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2.5 p-3 rounded-lg bg-primary/10 border border-primary/20">
                <Clock className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div className="text-xs">
                  <strong className="text-foreground">
                    48h Refund Guarantee
                  </strong>
                  <p className="text-muted-foreground mt-0.5">
                    Not satisfied with the report quality? Request a full token
                    refund within 48 hours.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="text-xs text-muted-foreground">
                <strong className="text-foreground">Important:</strong> Only EDF
                (.edf) files are currently supported. If your EEG machine uses a
                proprietary format, you must export to EDF first. See the "EDF
                Export Guide" tab.
              </div>
            </div>

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
          </TabsContent>

          {/* Export Guide Tab */}
          <TabsContent value="export" className="space-y-4 mt-4">
            <p className="text-sm text-muted-foreground">
              Select your EEG machine below for step-by-step export
              instructions:
            </p>

            {MACHINES.map((machine) => (
              <div
                key={machine.id}
                className="border rounded-xl p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Monitor className="h-4 w-4 text-primary" />
                    <span className="font-semibold text-sm">
                      {machine.name}
                    </span>
                  </div>
                  <Badge variant="outline" className="text-[10px]">
                    {machine.badge}
                  </Badge>
                </div>
                <ol className="space-y-1.5 text-sm">
                  {machine.steps.map((step, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-xs font-bold text-primary mt-0.5 tabular-nums w-4 shrink-0">
                        {i + 1}.
                      </span>
                      <span className="text-muted-foreground">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}

            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-muted/50 border">
              <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                Don't see your EEG machine? Most modern EEG systems support EDF
                export. Check your software's File → Export menu, or contact our
                support team for assistance.
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
