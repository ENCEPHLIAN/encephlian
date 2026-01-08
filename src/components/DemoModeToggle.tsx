import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { FlaskConical } from "lucide-react";
import { useDemoMode } from "@/contexts/DemoModeContext";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";

export function DemoModeToggle() {
  const { isDemoMode, toggleDemoMode } = useDemoMode();

  const handleToggle = () => {
    toggleDemoMode();
    toast.info(isDemoMode ? "Viewing your data" : "Viewing demo data", {
      description: isDemoMode 
        ? "Showing your real studies and reports" 
        : "Explore the platform with sample data",
      duration: 2000,
    });
  };

  return (
    <div className="flex items-center gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50 border transition-colors hover:bg-muted">
            <FlaskConical className={`h-4 w-4 ${isDemoMode ? "text-primary" : "text-muted-foreground"}`} />
            <span className="text-xs font-medium">Demo</span>
            <Switch
              checked={isDemoMode}
              onCheckedChange={handleToggle}
              className="scale-75"
            />
            {isDemoMode && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-primary/10 text-primary">
                ON
              </Badge>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          {isDemoMode 
            ? "Turn off to see your real data" 
            : "Turn on to explore with sample data"}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
