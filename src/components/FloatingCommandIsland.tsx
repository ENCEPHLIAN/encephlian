import { useState, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { Command } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import logoImg from "@/assets/logo.png";

interface FloatingCommandIslandProps {
  onOpen: () => void;
}

export function FloatingCommandIsland({ onOpen }: FloatingCommandIslandProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const isMobile = useIsMobile();
  const location = useLocation();
  const isDashboard = location.pathname === "/app/dashboard";

  // Handle mouse hover near bottom center for ALL pages
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isMobile) return;
    
    const { clientX, clientY } = e;
    const { innerWidth, innerHeight } = window;

    // Check if mouse is near bottom center (bottom 70px, center 180px)
    const isNearBottomCenter =
      clientY > innerHeight - 70 &&
      clientX > innerWidth / 2 - 180 &&
      clientX < innerWidth / 2 + 180;

    if (isNearBottomCenter) {
      setIsVisible(true);
    }
  }, [isMobile]);

  useEffect(() => {
    if (isMobile) {
      setIsVisible(false);
      return;
    }

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [isMobile, handleMouseMove]);

  // Dashboard-specific: also show when scrolled to bottom
  useEffect(() => {
    if (isMobile || !isDashboard) return;

    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const scrollHeight = document.documentElement.scrollHeight;
      const clientHeight = window.innerHeight;
      const nearBottom = scrollTop + clientHeight >= scrollHeight - 200;
      
      if (nearBottom) {
        setIsVisible(true);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [isMobile, isDashboard]);

  // Hide after mouse leaves (with delay)
  useEffect(() => {
    if (!isHovering && isVisible) {
      const timeout = setTimeout(() => {
        setIsVisible(false);
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [isHovering, isVisible]);

  if (isMobile) return null;

  return (
    <div
      className={cn(
        "fixed bottom-6 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ease-out",
        isVisible
          ? "opacity-100 translate-y-0"
          : "opacity-0 translate-y-4 pointer-events-none"
      )}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <button
        onClick={onOpen}
        className={cn(
          "group flex items-center gap-3 px-4 py-2.5 rounded-xl",
          "bg-foreground/5 backdrop-blur-lg",
          "border border-foreground/5",
          "shadow-lg shadow-black/5 dark:shadow-black/10",
          "hover:bg-foreground/8 hover:border-foreground/10",
          "transition-all duration-300"
        )}
      >
        <img
          src={logoImg}
          alt=""
          className="h-5 w-5 object-contain opacity-60"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
        <Command className="h-3.5 w-3.5 text-muted-foreground/60 hidden" />
        <span className="text-xs font-light text-muted-foreground group-hover:text-foreground/80 transition-colors">
          Search or navigate...
        </span>
        <kbd className="hidden sm:inline-flex h-5 items-center gap-0.5 rounded border border-foreground/10 bg-foreground/5 px-1.5 text-[10px] font-light text-muted-foreground/60">
          <span>⌘</span>K
        </kbd>
      </button>
    </div>
  );
}