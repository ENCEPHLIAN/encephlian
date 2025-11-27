import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Download, FileCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const templates = [
  {
    id: "normal-eeg",
    name: "Normal EEG Report",
    description: "Template for interpreting normal awake and sleep EEG with no epileptiform activity",
    category: "Normal",
    icon: FileCheck,
    color: "text-green-600",
  },
  {
    id: "focal-epileptiform",
    name: "Focal Epileptiform Activity",
    description: "Template for reporting focal spikes, sharp waves, and localized epileptiform discharges",
    category: "Epileptiform",
    icon: FileText,
    color: "text-orange-600",
  },
  {
    id: "generalized-epileptiform",
    name: "Generalized Epileptiform Activity",
    description: "Template for generalized spike-wave, polyspike, and diffuse epileptiform patterns",
    category: "Epileptiform",
    icon: FileText,
    color: "text-red-600",
  },
  {
    id: "artifact-limited",
    name: "Artifact-Limited Study",
    description: "Template for studies with significant artifact limiting interpretation",
    category: "Technical",
    icon: FileText,
    color: "text-yellow-600",
  },
];

export default function Templates() {
  const { toast } = useToast();

  const handleDownload = async (templateId: string, format: "pdf" | "docx") => {
    try {
      toast({
        title: "Downloading template",
        description: `Preparing ${format.toUpperCase()} template...`,
      });

      // In production, fetch from Supabase Storage templates bucket
      const fileName = `${templateId}-template.${format}`;
      
      // Create a placeholder download - real implementation would fetch from storage
      const content = `ENCEPHLIAN EEG Report Template\n\nTemplate: ${templateId}\nFormat: ${format.toUpperCase()}\n\nThis placeholder would be replaced with actual template content from Supabase Storage (templates bucket).`;
      const blob = new Blob([content], { 
        type: format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' 
      });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Download complete",
        description: `${fileName} has been downloaded`,
      });
    } catch (error) {
      toast({
        title: "Download failed",
        description: "Failed to download template. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Report Templates</h1>
        <p className="text-sm text-muted-foreground mt-1.5">
          Download standardized EEG report templates for consistent clinical documentation.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {templates.map((template) => {
          const Icon = template.icon;
          return (
            <Card key={template.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg bg-muted ${template.color}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{template.name}</CardTitle>
                      <Badge variant="outline" className="mt-1">
                        {template.category}
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="mb-4 leading-relaxed">
                  {template.description}
                </CardDescription>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDownload(template.id, "pdf")}
                    className="flex-1"
                  >
                    <Download className="h-3.5 w-3.5 mr-1.5" />
                    PDF
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDownload(template.id, "docx")}
                    className="flex-1"
                  >
                    <Download className="h-3.5 w-3.5 mr-1.5" />
                    DOCX
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="bg-muted/30">
        <CardHeader>
          <CardTitle className="text-base">About These Templates</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            These templates are designed to streamline clinical EEG reporting with standardized formats
            that comply with ACNS guidelines.
          </p>
          <p>
            Each template includes sections for clinical indication, technical adequacy, background activity,
            epileptiform findings, and clinical correlation.
          </p>
          <p className="text-xs pt-2 border-t">
            Templates are available in both PDF (for viewing) and DOCX (for editing in Microsoft Word).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
