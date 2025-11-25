import * as React from "react";
import { cn } from "@/lib/utils";

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ElementType;
}

const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, icon: Icon, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "flex items-center justify-center h-9 w-9 rounded-full",
          "bg-secondary/80 hover:bg-secondary border border-border/60",
          "transition-colors",
          className
        )}
        {...props}
      >
        <Icon className="h-4 w-4" />
      </button>
    );
  }
);

IconButton.displayName = "IconButton";

export { IconButton };
