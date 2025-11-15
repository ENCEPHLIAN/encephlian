import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";

interface ErrorPageProps {
  code?: string;
  title: string;
  description: string;
  actions?: Array<{
    label: string;
    onClick: () => void;
    variant?: "default" | "outline" | "destructive";
  }>;
}

export default function ErrorPage({ code, title, description, actions = [] }: ErrorPageProps) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full bg-card border-border text-center">
        <CardHeader>
          {code && (
            <div className="text-8xl font-bold text-destructive mb-4">{code}</div>
          )}
          {!code && (
            <AlertTriangle className="h-16 w-16 text-destructive mx-auto mb-4" />
          )}
          <CardTitle className="text-2xl">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {actions.map((action, index) => (
            <Button 
              key={index}
              onClick={action.onClick}
              variant={action.variant || "default"}
              className="w-full"
            >
              {action.label}
            </Button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
