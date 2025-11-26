import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Download, AlertCircle, CheckCircle, AlertTriangle, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export default function Templates() {
  const { toast } = useToast();
  
  const templates = [
    {
      id: "routine-triage",
      name: "Routine Triage Template",
      description: "Standard template for routine EEG triage reports with normal turnaround time",
      category: "Triage",
      downloadUrl: "/templates/routine-triage-template.pdf",
      icon: FileText,
      color: "text-blue-600"
    },
    {
      id: "stat-triage",
      name: "STAT Triage Template",
      description: "Urgent triage template for time-sensitive EEG evaluations",
      category: "Triage",
      downloadUrl: "/templates/stat-triage-template.pdf",
      icon: AlertCircle,
      color: "text-red-600"
    },
    {
      id: "normal-eeg",
      name: "Normal EEG Template",
      description: "Comprehensive template for normal EEG findings and interpretation",
      category: "Interpretation",
      downloadUrl: "/templates/normal-eeg-template.pdf",
      icon: CheckCircle,
      color: "text-green-600"
    },
    {
      id: "abnormal-eeg",
      name: "Abnormal EEG Template",
      description: "Detailed template for abnormal EEG findings with clinical correlation",
      category: "Interpretation",
      downloadUrl: "/templates/abnormal-eeg-template.pdf",
      icon: AlertTriangle,
      color: "text-orange-600"
    }
  ];

  const handleDownload = (template: typeof templates[0]) => {
    // In production, this would download from storage
    toast({
      title: "Template download",
      description: `${template.name} will be available soon`,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Report Templates</h1>
        <p className="text-muted-foreground mt-2">
          Downloadable templates for standardized EEG reporting
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {templates.map((template) => (
          <Card key={template.id} className="openai-card hover:shadow-lg transition-all">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className={cn("p-2 rounded-lg bg-muted", template.color)}>
                    <template.icon className="h-6 w-6" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{template.name}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">{template.category}</p>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                {template.description}
              </p>
              <Button 
                onClick={() => handleDownload(template)}
                className="w-full"
                variant="outline"
              >
                <Download className="h-4 w-4 mr-2" />
                Download Template
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-dashed">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <Info className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
            <div className="space-y-2">
              <h3 className="font-semibold">About Templates</h3>
              <p className="text-sm text-muted-foreground">
                These templates follow ACNS guidelines and are designed to ensure consistent, 
                high-quality EEG reporting. Customize them to match your clinic's specific 
                requirements and workflow.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
