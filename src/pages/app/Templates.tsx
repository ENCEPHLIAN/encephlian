import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileText, Eye } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ReportTemplate {
  id: string;
  name: string;
  type: 'normal' | 'abnormal';
  template_content: Record<string, string>;
  style_config?: Record<string, string>;
  created_at: string;
}

export default function Templates() {
  const [previewTemplate, setPreviewTemplate] = useState<ReportTemplate | null>(null);

  const { data: templates, isLoading } = useQuery({
    queryKey: ["report-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("report_templates")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data as ReportTemplate[];
    }
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Report Templates</h1>
        <p className="text-muted-foreground">Standard templates for EEG report generation</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {templates?.map((template) => (
          <Card key={template.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <FileText className="h-8 w-8 text-primary" />
                  <div>
                    <CardTitle>{template.name}</CardTitle>
                    <CardDescription className="mt-1">
                      {template.type === 'normal' ? 'Normal EEG findings' : 'Abnormal EEG findings'}
                    </CardDescription>
                  </div>
                </div>
                <Badge variant={template.type === 'normal' ? 'default' : 'destructive'}>
                  {template.type}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  This template is used by the AI to generate structured reports with consistent
                  formatting and medical terminology.
                </p>
                <Button
                  variant="outline"
                  onClick={() => setPreviewTemplate(template)}
                >
                  <Eye className="h-4 w-4 mr-2" />
                  Preview Template
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!previewTemplate} onOpenChange={() => setPreviewTemplate(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>{previewTemplate?.name}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[60vh]">
            <div className="space-y-4 pr-4">
              {previewTemplate?.template_content && (
                Object.entries(previewTemplate.template_content).map(([key, value]) => (
                  <div key={key}>
                    <h3 className="font-semibold text-sm uppercase text-primary mb-2">
                      {key.replace(/_/g, ' ')}
                    </h3>
                    <p className="text-sm leading-relaxed">{value}</p>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
