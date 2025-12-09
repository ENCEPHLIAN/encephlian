import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Coins } from "lucide-react";
import { cn } from "@/lib/utils";

interface TokenBalanceHeaderProps {
  balance: number;
  previousBalance?: number;
}

export default function TokenBalanceHeader({ balance, previousBalance }: TokenBalanceHeaderProps) {
  const [isAnimating, setIsAnimating] = useState(false);
  const [displayBalance, setDisplayBalance] = useState(balance);

  useEffect(() => {
    if (previousBalance !== undefined && previousBalance !== balance) {
      setIsAnimating(true);
      
      // Animate the number change
      const diff = balance - previousBalance;
      const steps = 10;
      const stepValue = diff / steps;
      let currentStep = 0;
      
      const interval = setInterval(() => {
        currentStep++;
        if (currentStep >= steps) {
          setDisplayBalance(balance);
          clearInterval(interval);
          setTimeout(() => setIsAnimating(false), 300);
        } else {
          setDisplayBalance(Math.round(previousBalance + stepValue * currentStep));
        }
      }, 50);

      return () => clearInterval(interval);
    } else {
      setDisplayBalance(balance);
    }
  }, [balance, previousBalance]);

  return (
    <div className="flex items-center gap-2">
      <Badge
        variant="outline"
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-all duration-300",
          isAnimating && "scale-110 bg-primary/10 border-primary"
        )}
      >
        <Coins className={cn(
          "h-4 w-4 transition-transform duration-300",
          isAnimating && "animate-bounce text-primary"
        )} />
        <span className={cn(
          "tabular-nums transition-colors duration-300",
          isAnimating && "text-primary font-bold"
        )}>
          {displayBalance}
        </span>
        <span className="text-muted-foreground">tokens</span>
      </Badge>
    </div>
  );
}
