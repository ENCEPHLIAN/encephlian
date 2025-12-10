import { useState, useEffect } from "react";
import { Search, Command } from "lucide-react";
import { cn } from "@/lib/utils";

interface FloatingCommandIslandProps {
  onOpen: () => void;
}

export function FloatingCommandIsland({ onOpen }: FloatingCommandIslandProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isNearBottom, setIsNearBottom] = useState(false);

  useEffect(() => {
    let timeout: NodeJS.Timeout;

    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const scrollHeight = document.documentElement.scrollHeight;
      const clientHeight = window.innerHeight;
      
      // Check if near bottom (within 200px of bottom)
      const nearBottom = scrollTop + clientHeight >= scrollHeight - 200;
      setIsNearBottom(nearBottom);
      
      if (nearBottom) {
        setIsVisible(true);
        clearTimeout(timeout);
      } else {
        // Hide after a delay when scrolling away
        timeout = setTimeout(() => {
          setIsVisible(false);
        }, 300);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll(); // Check initial state

    return () => {
      window.removeEventListener("scroll", handleScroll);
      clearTimeout(timeout);
    };
  }, []);

  return (
    <div
      className={cn(
        "fixed bottom-6 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ease-out",
        isVisible && isNearBottom
          ? "opacity-100 translate-y-0"
          : "opacity-0 translate-y-4 pointer-events-none"
      )}
    >
      <button
        onClick={onOpen}
        className={cn(
          "group flex items-center gap-3 px-5 py-3 rounded-full",
          "bg-card/90 backdrop-blur-xl border border-border/50",
          "shadow-lg shadow-background/20",
          "hover:bg-card hover:border-border hover:shadow-xl",
          "transition-all duration-200",
          // Faded RGB gradient glow effect
          "before:absolute before:inset-0 before:rounded-full before:-z-10",
          "before:bg-gradient-to-r before:from-rose-500/10 before:via-violet-500/10 before:to-cyan-500/10",
          "before:blur-xl before:opacity-0 hover:before:opacity-100 before:transition-opacity"
        )}
      >
        <div className="flex items-center justify-center h-8 w-8 rounded-full bg-gradient-to-br from-rose-500/20 via-violet-500/20 to-cyan-500/20">
          <Command className="h-4 w-4 text-foreground" />
        </div>
        <span className="text-sm font-medium text-foreground/80 group-hover:text-foreground transition-colors">
          Search or navigate...
        </span>
        <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded border border-border/60 bg-muted/50 px-1.5 text-[10px] text-muted-foreground">
          <span>⌘</span>K
        </kbd>
      </button>
    </div>
  );
}
