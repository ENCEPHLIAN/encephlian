import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface KPICardProps {
  label: string;
  value: string | number;
  change: string;
  trend: "up" | "down" | "neutral";
  /** Pass one of: "kpi-blue", "kpi-green", "kpi-indigo", "kpi-amber", "kpi-cyan", "kpi-neutral" */
  color?: string;
  onClick?: () => void;
  tooltip?: string;
}

const tooltipMap: Record<string, string> = {
  "Pending Studies": "EEG studies awaiting SLA selection and analysis",
  "Completed Today": "Number of studies completed in the last 24 hours",
  "This Week": "Studies analyzed in the current week",
  "Token Balance": "Available tokens for analysis purchases",
  "Avg Turnaround": "Average time from upload to report completion",
  "This Month": "Total studies completed this month",
  "Total Studies": "All studies in your account",
  "Processing Now": "Studies currently being analyzed",
};

export default function KPICard({ label, value, change, trend, color, onClick, tooltip }: KPICardProps) {
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const tooltipText = tooltip || tooltipMap[label] || label;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Card
          className={cn(
            "kpi-card transition-all duration-200 hover:scale-[1.02]",
            color,
            onClick && "cursor-pointer",
          )}
          onClick={onClick}
        >
          <CardContent className="p-4 md:p-5">
            {/* subtle top band */}
            <div className="mb-3 h-1.5 w-12 rounded-full bg-white/30 dark:bg-white/10" />

            <div className="space-y-2">
              <div className="text-sm text-muted-foreground font-medium">{label}</div>
              <div className="text-3xl font-semibold tracking-tight">{value}</div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <TrendIcon
                  className={cn("h-3.5 w-3.5", trend === "up" && "text-success", trend === "down" && "text-destructive")}
                />
                <span>{change}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </TooltipTrigger>
      <TooltipContent>{tooltipText}</TooltipContent>
    </Tooltip>
  );
}
