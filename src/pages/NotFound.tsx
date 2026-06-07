import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Home, ArrowLeft } from "lucide-react";

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full bg-card border-border text-center">
        <CardHeader className="pb-4">
          <div className="text-7xl font-bold text-primary mb-3 font-mono tracking-tight">404</div>
          <CardTitle className="text-2xl">Page not found</CardTitle>
          <CardDescription className="leading-relaxed mt-2">
            The page you tried to open doesn't exist on this ENCEPHLIAN deployment.
            It may have been moved, renamed, or the link may be out of date.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={() => navigate('/app/dashboard')} className="w-full gap-2">
            <Home className="h-4 w-4" />
            Return to clinician dashboard
          </Button>
          <Button variant="outline" onClick={() => navigate(-1)} className="w-full gap-2">
            <ArrowLeft className="h-4 w-4" />
            Go back to the previous page
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
