import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface KPICardProps {
  label: string;
  value: string | number;
  change: string;
  trend: "up" | "down" | "neutral";
  color: string;
  onClick?: () => void;
}

export default function KPICard({ label, value, change, trend, color, onClick }: KPICardProps) {
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  
  return (
    <Card 
      className={cn(
        "border-none shadow-lg overflow-hidden cursor-pointer transition-transform hover:scale-105",
        onClick && "hover:shadow-xl"
      )}
      onClick={onClick}
    >
      <div className={cn("h-2 bg-gradient-to-r", color)} />
      <CardContent className="pt-6">
        <div className="space-y-2">
          <div className="text-sm text-muted-foreground font-medium">{label}</div>
          <div className="text-4xl font-bold">{value}</div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <TrendIcon className={cn(
              "h-3 w-3",
              trend === "up" && "text-success",
              trend === "down" && "text-destructive"
            )} />
            <span>{change}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
