import { useState, useEffect } from "react";
import { Command } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLocation } from "react-router-dom";
import logoImg from "@/assets/logo.png";

interface FloatingCommandIslandProps {
  onOpen: () => void;
}

export function FloatingCommandIsland({ onOpen }: FloatingCommandIslandProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isNearBottom, setIsNearBottom] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const isMobile = useIsMobile();
  const location = useLocation();
  const isDashboard = location.pathname === "/app/dashboard";

  useEffect(() => {
    // Don't run on mobile
    if (isMobile) {
      setIsVisible(false);
      return;
    }

    let timeout: NodeJS.Timeout;

    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const scrollHeight = document.documentElement.scrollHeight;
      const clientHeight = window.innerHeight;

      // Check if near bottom (within 200px of bottom)
      const nearBottom = scrollTop + clientHeight >= scrollHeight - 200;
      setIsNearBottom(nearBottom);

      // On dashboard: show when scrolled to bottom
      // On other pages: only show on hover (handled separately)
      if (isDashboard && nearBottom) {
        setIsVisible(true);
        clearTimeout(timeout);
      } else if (isDashboard) {
        timeout = setTimeout(() => {
          if (!isHovering) setIsVisible(false);
        }, 300);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => {
      window.removeEventListener("scroll", handleScroll);
      clearTimeout(timeout);
    };
  }, [isMobile, isDashboard, isHovering]);

  // On non-dashboard pages, show on hover near bottom center
  useEffect(() => {
    if (isMobile || isDashboard) return;

    const handleMouseMove = (e: MouseEvent) => {
      const { clientX, clientY } = e;
      const { innerWidth, innerHeight } = window;

      // Check if mouse is near bottom center (bottom 80px, center 200px)
      const isNearBottomCenter =
        clientY > innerHeight - 80 &&
        clientX > innerWidth / 2 - 150 &&
        clientX < innerWidth / 2 + 150;

      if (isNearBottomCenter) {
        setIsVisible(true);
        setIsHovering(true);
      } else if (!isHovering) {
        // Only hide if not actively hovering the island
      }
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [isMobile, isDashboard, isHovering]);

  // Don't render on mobile
  if (isMobile) return null;

  const shouldShow = isDashboard ? (isVisible && isNearBottom) : isVisible;

  return (
    <div
      className={cn(
        "fixed bottom-6 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ease-out",
        shouldShow
          ? "opacity-100 translate-y-0"
          : "opacity-0 translate-y-4 pointer-events-none"
      )}
      onMouseEnter={() => {
        setIsHovering(true);
        setIsVisible(true);
      }}
      onMouseLeave={() => {
        setIsHovering(false);
        if (!isDashboard) {
          setTimeout(() => setIsVisible(false), 300);
        }
      }}
    >
      <button
        onClick={onOpen}
        className={cn(
          "group flex items-center gap-3 px-5 py-3 rounded-xl",
          "bg-background/10 backdrop-blur-md",
          "border border-white/10 dark:border-white/5",
          "shadow-lg shadow-black/5 dark:shadow-black/15",
          "hover:bg-background/15 hover:border-white/15 hover:shadow-xl",
          "transition-all duration-300",
          "supports-[backdrop-filter]:bg-background/10"
        )}
      >
        {/* Logo - no background */}
        <img
          src={logoImg}
          alt="ENCEPHLIAN"
          className="h-6 w-6 object-contain"
          onError={(e) => {
            e.currentTarget.style.display = "none";
            const fallback = e.currentTarget.nextElementSibling as HTMLElement;
            if (fallback) fallback.classList.remove("hidden");
          }}
        />
        <Command className="h-4 w-4 text-foreground hidden" />
        <span className="text-sm font-medium text-foreground/70 group-hover:text-foreground transition-colors">
          Search or navigate...
        </span>
        <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded border border-white/10 bg-white/5 px-1.5 text-[10px] text-muted-foreground">
          <span>⌘</span>K
        </kbd>
      </button>
    </div>
  );
}
