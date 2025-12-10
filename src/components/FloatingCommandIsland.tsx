import { useState, useEffect } from "react";
import { Command } from "lucide-react";
import { cn } from "@/lib/utils";
import logoImg from "@/assets/logo.png";

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
        timeout = setTimeout(() => {
          setIsVisible(false);
        }, 300);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

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
          "group flex items-center gap-3 px-5 py-3 rounded-xl",
          "bg-background/15 backdrop-blur-2xl",
          "border border-white/8 dark:border-white/5",
          "shadow-xl shadow-black/10 dark:shadow-black/20",
          "hover:bg-background/25 hover:border-white/12 hover:shadow-2xl",
          "transition-all duration-300"
        )}
      >
        {/* Logo - no background */}
        <img 
          src={logoImg} 
          alt="ENCEPHLIAN" 
          className="h-6 w-6 object-contain"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
            const fallback = e.currentTarget.nextElementSibling as HTMLElement;
            if (fallback) fallback.classList.remove('hidden');
          }}
        />
        <Command className="h-4 w-4 text-foreground hidden" />
        <span className="text-sm font-medium text-foreground/70 group-hover:text-foreground transition-colors">
          Search or navigate...
        </span>
        <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded border border-border/40 bg-muted/30 px-1.5 text-[10px] text-muted-foreground">
          <span>⌘</span>K
        </kbd>
      </button>
    </div>
  );
}
