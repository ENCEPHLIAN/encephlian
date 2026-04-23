import { Badge } from "@/components/ui/badge";
import { useSku } from "@/hooks/useSku";
import { useUserSession } from "@/contexts/UserSessionContext";
import { SKU_LABELS } from "@/shared/skuPolicy";
import { Sparkles, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Visual badge showing the current SKU tier
 * Used in sidebar footer to indicate plan type
 */
export function SkuBadge({ className }: { className?: string }) {
  const { sku, isPilot, isInternal } = useSku();
  const { clinicContext } = useUserSession();
  const Icon = isPilot ? Zap : Sparkles;
  const clinicLine = clinicContext?.clinic_name?.trim();

  return (
    <div className={cn("space-y-1", className)}>
      <Badge
        variant="outline"
        className={cn(
          "text-[10px] gap-1 w-full justify-center",
          isPilot && "border-amber-500/50 text-amber-500",
          isInternal && "border-emerald-500/50 text-emerald-500",
        )}
        title={clinicLine ? `${SKU_LABELS[sku]} · ${clinicLine}` : SKU_LABELS[sku]}
      >
        <Icon className="h-3 w-3" />
        {SKU_LABELS[sku]}
      </Badge>
      {clinicLine && (
        <p className="text-[10px] text-muted-foreground truncate px-0.5" title={clinicLine}>
          {clinicLine}
        </p>
      )}
    </div>
  );
}
