import * as React from "react";
import { cn } from "@/lib/utils";

export interface PillToggleProps {
  label?: string;
  checked: boolean;
  onChange: () => void;
  className?: string;
}

const PillToggle = React.forwardRef<HTMLButtonElement, PillToggleProps>(
  ({ label, checked, onChange, className }, ref) => {
    return (
      <button
        ref={ref}
        onClick={onChange}
        className={cn(
          "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm",
          "border border-border bg-secondary transition-colors",
          checked && "bg-primary text-primary-foreground",
          className
        )}
      >
        <div
          className={cn(
            "h-4 w-4 rounded-full transition-colors",
            checked ? "bg-primary-foreground" : "bg-muted-foreground/70"
          )}
        />
        {label && <span>{label}</span>}
      </button>
    );
  }
);

PillToggle.displayName = "PillToggle";

export { PillToggle };
