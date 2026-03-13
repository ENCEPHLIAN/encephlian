import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Monitor, HardDrive, FileOutput, CheckCircle2, AlertTriangle, ArrowRight, Info, Shield, Users, Activity, Ban } from "lucide-react";

const MACHINES = [
  {
    id: "natus-nicone",
    name: "Natus NicOne",
    badge: "Most Common",
    steps: [
      { action: "Open NicOne software and load the recording you want to export." },
      { action: 'Go to File → Export → select "EDF/EDF+" as the output format.' },
      { action: "Choose the channels you want to include. For a standard 10-20 montage, select all 21 channels." },
      { action: 'Set the output directory and click "Export".' },
      { action: "The exported .edf file will appear in your chosen folder. Upload this file to Encephlian." },
    ],
    notes: [
      "NicOne exports EDF+ by default, which is fully supported.",
      "If you see a .nic or .nrd file, that is the proprietary format — you must export to EDF first.",
      "Ensure the patient ID field is filled in before export; it will be auto-extracted by the system.",
    ],
  },
  {
    id: "natus-neuroworks",
    name: "Natus NeuroWorks",
    badge: "Natus/Xltek",
    steps: [
      { action: "Open NeuroWorks and navigate to the study you wish to export." },
      { action: 'Select File → Export Study → choose "EDF" from the format dropdown.' },
      { action: "In the export dialog, confirm the time range (full study or a segment)." },
      { action: "Select the electrode montage — use the default recording montage for best results." },
      { action: 'Choose a save location and click "OK" to begin the export.' },
      { action: "Wait for the progress bar to complete. Large studies (>1 hour) may take 2-3 minutes." },
    ],
    notes: [
      "NeuroWorks stores files in .erd format natively. Always export to EDF before uploading.",
      "For long-term monitoring (LTM) studies, consider exporting in 30-minute segments to keep file sizes under 20 MB.",
      "If the export option is greyed out, ensure you have the Export module licensed in your NeuroWorks installation.",
    ],
  },
  {
    id: "nihon-kohden",
    name: "Nihon Kohden EEG-1200",
    badge: "NK Series",
    steps: [
      { action: "On the EEG-1200, press the Menu button on the main screen." },
      { action: 'Navigate to Data Management → Export.' },
      { action: 'Select the recording and choose "EDF" as the export format.' },
      { action: "Insert a USB drive or select the network export path." },
      { action: 'Press "Start Export" and wait for the confirmation message.' },
      { action: "Remove the USB drive and transfer the .edf file to your computer for upload." },
    ],
    notes: [
      "Nihon Kohden native formats (.eeg, .21e, .pnt) are not directly supported for analysis. Always use the EDF export.",
      "The EEG-1200 may split long recordings into multiple files. Upload each segment separately.",
      "If your unit does not have the EDF export option, contact Nihon Kohden support to enable it — it may require a firmware update.",
    ],
  },
];

export default function OnboardingGuide() {
  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">EEG Export Guide</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Step-by-step instructions to export EDF files from your EEG machine for upload to Encephlian.
        </p>
      </div>

      <Alert className="border-primary/30 bg-primary/5">
        <Info className="h-4 w-4 text-primary" />
        <AlertDescription className="text-sm">
          Encephlian works best with <strong>EDF/EDF+</strong> files. These are the universal standard for EEG data exchange.
          If your machine uses a proprietary format, follow the steps below to export to EDF before uploading.
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="natus-nicone" className="space-y-4">
        <TabsList className="grid grid-cols-3 w-full">
          {MACHINES.map((m) => (
            <TabsTrigger key={m.id} value={m.id} className="text-xs sm:text-sm">
              <Monitor className="h-3.5 w-3.5 mr-1.5 hidden sm:inline-block" />
              {m.name}
            </TabsTrigger>
          ))}
        </TabsList>

        {MACHINES.map((machine) => (
          <TabsContent key={machine.id} value={machine.id} className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <CardTitle className="text-lg">{machine.name}</CardTitle>
                  <Badge variant="secondary" className="text-[10px]">{machine.badge}</Badge>
                </div>
                <CardDescription>Follow these steps to export your recording as EDF.</CardDescription>
              </CardHeader>

              <CardContent className="space-y-0">
                {machine.steps.map((step, idx) => (
                  <div key={idx} className="flex gap-3 py-3 border-b border-border last:border-0">
                    <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0 mt-0.5">
                      {idx + 1}
                    </div>
                    <p className="text-sm text-foreground leading-relaxed pt-1">{step.action}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Notes */}
            <Card className="border-amber-500/20 bg-amber-500/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2 text-amber-600">
                  <AlertTriangle className="h-4 w-4" />
                  Important Notes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {machine.notes.map((note, idx) => (
                  <div key={idx} className="flex gap-2 text-sm text-muted-foreground">
                    <ArrowRight className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-600" />
                    <span>{note}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {/* Quick reference */}
      <Separator />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileOutput className="h-4 w-4 text-primary" />
            Quick Reference: Supported Formats
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex items-start gap-2.5 p-3 rounded-lg border border-border bg-muted/30">
              <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">.edf / .edf+ / .bdf</p>
                <p className="text-xs text-muted-foreground">Full support — metadata auto-extracted, immediate analysis</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5 p-3 rounded-lg border border-border bg-muted/30">
              <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">.e / .nk / .eeg / .21e / .cnt</p>
                <p className="text-xs text-muted-foreground">Stored but not analyzed — export to EDF first</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
