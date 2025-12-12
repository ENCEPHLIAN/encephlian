import * as React from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { Check, ChevronRight, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

interface HoverDropdownMenuProps {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const HoverDropdownMenu = React.forwardRef<
  HTMLDivElement,
  HoverDropdownMenuProps & React.HTMLAttributes<HTMLDivElement>
>(({ children, open, onOpenChange, ...props }, ref) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const timeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const handleOpen = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsOpen(true);
    onOpenChange?.(true);
  };

  const handleClose = () => {
    timeoutRef.current = setTimeout(() => {
      setIsOpen(false);
      onOpenChange?.(false);
    }, 150);
  };

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <div
      ref={ref}
      onMouseEnter={handleOpen}
      onMouseLeave={handleClose}
      {...props}
    >
      <DropdownMenuPrimitive.Root open={open !== undefined ? open : isOpen} onOpenChange={onOpenChange || setIsOpen}>
        {children}
      </DropdownMenuPrimitive.Root>
    </div>
  );
});
HoverDropdownMenu.displayName = "HoverDropdownMenu";

const HoverDropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

const HoverDropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md",
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
        className
      )}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
));
HoverDropdownMenuContent.displayName = "HoverDropdownMenuContent";

const HoverDropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
    inset?: boolean;
  }
>(({ className, inset, ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50 focus:bg-accent focus:text-accent-foreground",
      inset && "pl-8",
      className
    )}
    {...props}
  />
));
HoverDropdownMenuItem.displayName = "HoverDropdownMenuItem";

const HoverDropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator 
    ref={ref} 
    className={cn("-mx-1 my-1 h-px bg-muted", className)} 
    {...props} 
  />
));
HoverDropdownMenuSeparator.displayName = "HoverDropdownMenuSeparator";

export {
  HoverDropdownMenu,
  HoverDropdownMenuTrigger,
  HoverDropdownMenuContent,
  HoverDropdownMenuItem,
  HoverDropdownMenuSeparator,
};
