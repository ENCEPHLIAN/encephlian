import { useState, useEffect, useCallback } from "react";
import { Smartphone, Cpu, Bluetooth, Radio } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

interface FloatingDeviceStatusProps {
  className?: string;
}

export function FloatingDeviceStatus({ className }: FloatingDeviceStatusProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const isMobile = useIsMobile();

  // Placeholder device status
  const deviceStatus = {
    androidApp: { connected: false },
    eegMachine: { connected: false },
    bleBridge: { connected: false },
  };

  const allConnected =
    deviceStatus.androidApp.connected &&
    deviceStatus.eegMachine.connected &&
    deviceStatus.bleBridge.connected;

  const anyConnected =
    deviceStatus.androidApp.connected ||
    deviceStatus.eegMachine.connected ||
    deviceStatus.bleBridge.connected;

  // Show only when mouse is near the actual icon position (bottom right corner)
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isMobile || isHovered) return;
    
    const { clientX, clientY } = e;
    const { innerWidth, innerHeight } = window;

    // Only show if mouse is very close to the icon (within ~60px)
    const isNearIcon =
      clientY > innerHeight - 60 && clientX > innerWidth - 60;

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
      {/* Collapsed state */}
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
          title="Device Status"
        >
          <Radio
            className={cn(
              "h-4 w-4",
              allConnected
                ? "text-emerald-500"
                : anyConnected
                ? "text-amber-500"
                : "text-muted-foreground/50"
            )}
          />
          <span
            className={cn(
              "absolute top-1.5 right-1.5 h-2 w-2 rounded-full",
              allConnected
                ? "bg-emerald-500 animate-pulse"
                : anyConnected
                ? "bg-amber-500"
                : "bg-muted-foreground/30"
            )}
          />
        </button>
      </div>

      {/* Expanded state */}
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
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-light uppercase tracking-wider text-muted-foreground/60">
              Devices
            </span>
            <span
              className={cn(
                "text-[10px] px-2 py-0.5 rounded-full font-light",
                allConnected
                  ? "bg-emerald-500/10 text-emerald-500"
                  : anyConnected
                  ? "bg-amber-500/10 text-amber-500"
                  : "bg-muted/30 text-muted-foreground/60"
              )}
            >
              {allConnected ? "All Online" : anyConnected ? "Partial" : "Offline"}
            </span>
          </div>

          <div className="space-y-2">
            {[
              { icon: Smartphone, label: "Android App", connected: deviceStatus.androidApp.connected },
              { icon: Cpu, label: "EEG Machine", connected: deviceStatus.eegMachine.connected },
              { icon: Bluetooth, label: "BLE Bridge", connected: deviceStatus.bleBridge.connected },
            ].map(({ icon: Icon, label, connected }) => (
              <div key={label} className="flex items-center justify-between py-0.5">
                <div className="flex items-center gap-2">
                  <Icon className={cn("h-3.5 w-3.5", connected ? "text-emerald-500" : "text-muted-foreground/40")} />
                  <span className="text-xs font-light text-foreground/70">{label}</span>
                </div>
                <span className={cn("h-2 w-2 rounded-full", connected ? "bg-emerald-500" : "bg-muted-foreground/20")} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}