import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface KPICardProps {
  label: string;
  value: string | number;
  change: string;
  trend: "up" | "down" | "neutral";
  /** Pass one of: "kpi-blue", "kpi-green", "kpi-indigo", "kpi-amber", "kpi-cyan", "kpi-neutral" */
  color?: string;
  onClick?: () => void;
}

export default function KPICard({ label, value, change, trend, color, onClick }: KPICardProps) {
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;

  return (
    <Card
      className={cn(
        "kpi-card", // <-- uses the gradient system from index.css
        color, // <-- e.g. "kpi-blue"
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
  );
}
