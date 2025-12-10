import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Rocket } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";

const featureNames: Record<string, string> = {
  analytics: "Analytics",
  scheduler: "Scheduler",
  integrations: "Integrations",
  team: "Team",
};

export default function ComingSoon() {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Extract feature name from path
  const pathParts = location.pathname.split("/");
  const pageName = pathParts[pathParts.length - 1];
  const feature = featureNames[pageName] || "Feature";

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="max-w-md w-full border-none shadow-lg">
        <CardContent className="text-center space-y-6 py-12">
          <div className="flex justify-center">
            <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
              <Rocket className="h-10 w-10 text-primary" />
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-bold">{feature} Coming Soon</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              We're working hard to bring you this feature. Stay tuned!
            </p>
          </div>
          <Button onClick={() => navigate("/app/dashboard")} className="w-full sm:w-auto">
            Back to Dashboard
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
