import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface KPICardProps {
  label: string;
  value: string | number;
  change: string;
  trend: "up" | "down" | "neutral";
  /**
   * @deprecated Previously used for loud gradients. Kept only for API compatibility.
   * The visual style is now driven by trend + dashboard card tokens.
   */
  color: string;
  onClick?: () => void;
}

export default function KPICard({ label, value, change, trend, onClick }: KPICardProps) {
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;

  // Map trend -> subtle dashboard variant
  const variantClass =
    trend === "up"
      ? "dashboard-card dashboard-card--success"
      : trend === "down"
        ? "dashboard-card dashboard-card--warning"
        : "dashboard-card dashboard-card--neutral";

  return (
    <Card
      className={cn(variantClass, "cursor-pointer transition-transform", onClick && "hover:scale-[1.01]")}
      onClick={onClick}
    >
      <CardContent className="pt-4">
        <div className="space-y-2">
          <div className="dashboard-card-title">{label}</div>

          <div className="dashboard-card-value">{value}</div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <TrendIcon
              className={cn("h-3 w-3", trend === "up" && "text-success", trend === "down" && "text-destructive")}
            />
            <span className="dashboard-card-trend">{change}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
