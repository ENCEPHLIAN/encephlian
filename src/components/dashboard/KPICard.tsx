import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface KPICardProps {
  label: string;
  value: string | number;
  change?: string;
  trend?: "up" | "down" | "neutral";
  // which color block to use
  variant: "blue" | "green" | "indigo" | "amber" | "cyan" | "neutral";
  onClick?: () => void;
}

export default function KPICard({ label, value, change, trend = "neutral", variant, onClick }: KPICardProps) {
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;

  return (
    <Card className={cn("kpi-card", `kpi-${variant}`, onClick && "cursor-pointer")} onClick={onClick}>
      <CardContent>
        <div className="space-y-2">
          <div className="text-sm text-muted-foreground font-medium">{label}</div>

          <div className="text-3xl font-semibold">{value}</div>

          {change && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <TrendIcon
                className={cn("h-3 w-3", trend === "up" && "text-success", trend === "down" && "text-destructive")}
              />
              <span>{change}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
