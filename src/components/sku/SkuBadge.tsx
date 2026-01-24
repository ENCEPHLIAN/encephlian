import { Badge } from "@/components/ui/badge";
import { useSku } from "@/hooks/useSku";
import { SKU_LABELS } from "@/shared/skuPolicy";
import { Sparkles, Zap, Eye } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Visual badge showing the current SKU tier
 * Used in sidebar footer to indicate plan type
 */
export function SkuBadge({ className }: { className?: string }) {
  const { sku, isPilot, isDemo, isInternal } = useSku();
  
  const Icon = isPilot ? Zap : isDemo ? Eye : Sparkles;
  
  return (
    <Badge 
      variant="outline" 
      className={cn(
        "text-[10px] gap-1",
        isPilot && "border-amber-500/50 text-amber-500",
        isDemo && "border-blue-500/50 text-blue-500",
        isInternal && "border-emerald-500/50 text-emerald-500",
        className
      )}
    >
      <Icon className="h-3 w-3" />
      {SKU_LABELS[sku]}
    </Badge>
  );
}
