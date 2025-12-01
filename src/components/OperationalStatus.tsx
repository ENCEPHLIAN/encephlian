import { Badge } from "@/components/ui/badge";
import { Activity } from "lucide-react";

export default function OperationalStatus() {
  return (
    <Badge variant="outline" className="gap-2 px-3 py-1.5 bg-background/50 backdrop-blur-sm border-success/20">
      <div className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
      </div>
      <Activity className="h-3.5 w-3.5 text-success" />
      <span className="text-xs font-medium text-success">ALL UNITS OPERATIONAL</span>
    </Badge>
  );
}
