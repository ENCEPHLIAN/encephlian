/**
 * FloatingDeviceStatus.tsx
 * 
 * Quick-glance system status indicator for clinicians.
 * Shows connection status for Windows uploader and cloud sync.
 * Appears on hover near bottom-right corner (desktop only).
 * 
 * MVP: Static placeholder status - will integrate with real device APIs
 * when Windows uploader software is ready.
 */

import { useState, useEffect, useCallback } from "react";
import { Monitor, Cloud, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

interface FloatingDeviceStatusProps {
  className?: string;
}

export function FloatingDeviceStatus({ className }: FloatingDeviceStatusProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const isMobile = useIsMobile();

  // System status - placeholder for Windows uploader integration
  // TODO: Connect to real uploader status via WebSocket/polling
  const systemStatus = {
    windowsUploader: { connected: false, lastSync: null as string | null },
    cloudSync: { connected: true, status: "idle" as "idle" | "syncing" | "error" },
  };

  const allOnline = systemStatus.windowsUploader.connected && systemStatus.cloudSync.connected;
  const partialOnline = systemStatus.windowsUploader.connected || systemStatus.cloudSync.connected;

  // Show only when mouse is near the icon position (bottom right corner)
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isMobile || isHovered) return;
    
    const { clientX, clientY } = e;
    const { innerWidth, innerHeight } = window;

    // Trigger zone: within 60px of bottom-right corner
    const isNearIcon = clientY > innerHeight - 60 && clientX > innerWidth - 60;
    setIsVisible(isNearIcon);
  }, [isMobile, isHovered]);

  useEffect(() => {
    if (isMobile) {
      setIsVisible(false);
      return;
    }

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [isMobile, handleMouseMove]);

  // Hide on mobile devices
  if (isMobile) return null;

  return (
    <div
      className={cn(
        "fixed bottom-6 right-6 z-50 transition-all duration-300 ease-out",
        isVisible || isHovered ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none",
        className
      )}
      onMouseEnter={() => {
        setIsHovered(true);
        setIsVisible(true);
      }}
      onMouseLeave={() => {
        setIsHovered(false);
        setIsVisible(false);
      }}
    >
      {/* Collapsed state - minimal indicator */}
      <div
        className={cn(
          "absolute right-0 bottom-0 transition-all duration-300",
          isHovered ? "opacity-0 scale-75" : "opacity-100 scale-100"
        )}
      >
        <button
          className={cn(
            "flex items-center justify-center h-10 w-10 rounded-xl",
            "bg-foreground/5 backdrop-blur-lg",
            "border border-foreground/5",
            "shadow-lg shadow-black/5 dark:shadow-black/10",
            "hover:bg-foreground/8",
            "transition-all duration-300"
          )}
          title="System Status"
        >
          <Wifi
            className={cn(
              "h-4 w-4",
              allOnline
                ? "text-emerald-500"
                : partialOnline
                ? "text-amber-500"
                : "text-muted-foreground/50"
            )}
          />
          {/* Status indicator dot */}
          <span
            className={cn(
              "absolute top-1.5 right-1.5 h-2 w-2 rounded-full",
              allOnline
                ? "bg-emerald-500 animate-pulse"
                : partialOnline
                ? "bg-amber-500"
                : "bg-muted-foreground/30"
            )}
          />
        </button>
      </div>

      {/* Expanded state - detailed status panel */}
      <div
        className={cn(
          "transition-all duration-300 origin-bottom-right",
          isHovered
            ? "opacity-100 scale-100 translate-y-0"
            : "opacity-0 scale-90 translate-y-2 pointer-events-none"
        )}
      >
        <div
          className={cn(
            "flex flex-col gap-2.5 p-3 rounded-xl",
            "bg-foreground/5 backdrop-blur-lg",
            "border border-foreground/5",
            "shadow-xl shadow-black/5 dark:shadow-black/10",
            "min-w-[180px]"
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-light uppercase tracking-wider text-muted-foreground/60">
              System
            </span>
            <span
              className={cn(
                "text-[10px] px-2 py-0.5 rounded-full font-light",
                allOnline
                  ? "bg-emerald-500/10 text-emerald-500"
                  : partialOnline
                  ? "bg-amber-500/10 text-amber-500"
                  : "bg-muted/30 text-muted-foreground/60"
              )}
            >
              {allOnline ? "All Online" : partialOnline ? "Partial" : "Offline"}
            </span>
          </div>

          {/* Status items */}
          <div className="space-y-2">
            {/* Windows Uploader Status */}
            <div className="flex items-center justify-between py-0.5">
              <div className="flex items-center gap-2">
                <Monitor 
                  className={cn(
                    "h-3.5 w-3.5", 
                    systemStatus.windowsUploader.connected 
                      ? "text-emerald-500" 
                      : "text-muted-foreground/40"
                  )} 
                />
                <div className="flex flex-col">
                  <span className="text-xs font-light text-foreground/70">Windows Uploader</span>
                  {systemStatus.windowsUploader.lastSync && (
                    <span className="text-[10px] text-muted-foreground/50">
                      Last: {systemStatus.windowsUploader.lastSync}
                    </span>
                  )}
                </div>
              </div>
              <span 
                className={cn(
                  "h-2 w-2 rounded-full", 
                  systemStatus.windowsUploader.connected 
                    ? "bg-emerald-500" 
                    : "bg-muted-foreground/20"
                )} 
              />
            </div>

            {/* Cloud Sync Status */}
            <div className="flex items-center justify-between py-0.5">
              <div className="flex items-center gap-2">
                <Cloud 
                  className={cn(
                    "h-3.5 w-3.5", 
                    systemStatus.cloudSync.connected 
                      ? "text-emerald-500" 
                      : "text-muted-foreground/40"
                  )} 
                />
                <div className="flex flex-col">
                  <span className="text-xs font-light text-foreground/70">Cloud Sync</span>
                  <span className="text-[10px] text-muted-foreground/50 capitalize">
                    {systemStatus.cloudSync.status}
                  </span>
                </div>
              </div>
              <span 
                className={cn(
                  "h-2 w-2 rounded-full", 
                  systemStatus.cloudSync.connected 
                    ? systemStatus.cloudSync.status === "syncing"
                      ? "bg-blue-500 animate-pulse"
                      : "bg-emerald-500"
                    : "bg-muted-foreground/20"
                )} 
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
