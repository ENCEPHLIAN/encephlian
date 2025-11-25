import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface AnimatedCounterProps {
  value: number;
  duration?: number;
  className?: string;
}

export function AnimatedCounter({ value, duration = 1000, className }: AnimatedCounterProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const previousValueRef = useRef(value);

  useEffect(() => {
    const previousValue = previousValueRef.current;
    
    if (previousValue === value) return;

    const difference = value - previousValue;
    const steps = Math.min(Math.abs(difference), 60); // Max 60 steps for smooth animation
    const increment = difference / steps;
    const stepDuration = duration / steps;

    let currentStep = 0;
    const timer = setInterval(() => {
      currentStep++;
      if (currentStep >= steps) {
        setDisplayValue(value);
        clearInterval(timer);
        previousValueRef.current = value;
      } else {
        setDisplayValue(Math.round(previousValue + increment * currentStep));
      }
    }, stepDuration);

    return () => clearInterval(timer);
  }, [value, duration]);

  return <span className={cn("tabular-nums", className)}>{displayValue}</span>;
}
