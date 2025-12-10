import { useState } from "react";
import { Smartphone, Cpu, Bluetooth, Radio } from "lucide-react";
import { cn } from "@/lib/utils";

interface FloatingDeviceStatusProps {
  className?: string;
}

export function FloatingDeviceStatus({ className }: FloatingDeviceStatusProps) {
  const [isHovered, setIsHovered] = useState(false);

  // Placeholder device status - will be connected to real BLE/app status later
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

  return (
    <div
      className={cn(
        "fixed bottom-6 right-6 z-50 transition-all duration-300 ease-out",
        className
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Collapsed state - frosted glass button */}
      <div
        className={cn(
          "absolute right-0 bottom-0 transition-all duration-300",
          isHovered ? "opacity-0 scale-75" : "opacity-100 scale-100"
        )}
      >
        <button
          className={cn(
            "flex items-center justify-center h-12 w-12 rounded-2xl",
            "bg-background/15 backdrop-blur-2xl",
            "border border-white/8 dark:border-white/5",
            "shadow-xl shadow-black/10 dark:shadow-black/25",
            "hover:bg-background/25 hover:border-white/12",
            "transition-all duration-300"
          )}
        >
          <Radio
            className={cn(
              "h-5 w-5",
              allConnected
                ? "text-emerald-500"
                : anyConnected
                ? "text-amber-500"
                : "text-muted-foreground/70"
            )}
          />
          {/* Status dot */}
          <span
            className={cn(
              "absolute top-2 right-2 h-2.5 w-2.5 rounded-full",
              "ring-2 ring-background/50",
              allConnected
                ? "bg-emerald-500 animate-pulse"
                : anyConnected
                ? "bg-amber-500"
                : "bg-muted-foreground/30"
            )}
          />
        </button>
      </div>

      {/* Expanded state - frosted glass panel */}
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
            "flex flex-col gap-3 p-4 rounded-2xl",
            "bg-background/20 backdrop-blur-2xl",
            "border border-white/8 dark:border-white/5",
            "shadow-2xl shadow-black/15 dark:shadow-black/30",
            "min-w-[200px]"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
              Devices
            </span>
            <span
              className={cn(
                "text-[10px] px-2.5 py-1 rounded-full font-medium",
                "backdrop-blur-sm",
                allConnected
                  ? "bg-emerald-500/15 text-emerald-500 border border-emerald-500/20"
                  : anyConnected
                  ? "bg-amber-500/15 text-amber-500 border border-amber-500/20"
                  : "bg-muted/50 text-muted-foreground border border-border/30"
              )}
            >
              {allConnected ? "All Online" : anyConnected ? "Partial" : "Offline"}
            </span>
          </div>

          <div className="space-y-2.5">
            {/* Android App */}
            <div className="flex items-center justify-between py-1">
              <div className="flex items-center gap-2.5">
                <div className={cn(
                  "p-1.5 rounded-lg",
                  deviceStatus.androidApp.connected 
                    ? "bg-emerald-500/10" 
                    : "bg-muted/30"
                )}>
                  <Smartphone className={cn(
                    "h-4 w-4",
                    deviceStatus.androidApp.connected 
                      ? "text-emerald-500" 
                      : "text-muted-foreground/60"
                  )} />
                </div>
                <span className="text-sm">Android App</span>
              </div>
              <span
                className={cn(
                  "h-2.5 w-2.5 rounded-full transition-colors",
                  deviceStatus.androidApp.connected
                    ? "bg-emerald-500 shadow-sm shadow-emerald-500/50"
                    : "bg-muted-foreground/20"
                )}
              />
            </div>

            {/* EEG Machine */}
            <div className="flex items-center justify-between py-1">
              <div className="flex items-center gap-2.5">
                <div className={cn(
                  "p-1.5 rounded-lg",
                  deviceStatus.eegMachine.connected 
                    ? "bg-emerald-500/10" 
                    : "bg-muted/30"
                )}>
                  <Cpu className={cn(
                    "h-4 w-4",
                    deviceStatus.eegMachine.connected 
                      ? "text-emerald-500" 
                      : "text-muted-foreground/60"
                  )} />
                </div>
                <span className="text-sm">EEG Machine</span>
              </div>
              <span
                className={cn(
                  "h-2.5 w-2.5 rounded-full transition-colors",
                  deviceStatus.eegMachine.connected
                    ? "bg-emerald-500 shadow-sm shadow-emerald-500/50"
                    : "bg-muted-foreground/20"
                )}
              />
            </div>

            {/* BLE Bridge */}
            <div className="flex items-center justify-between py-1">
              <div className="flex items-center gap-2.5">
                <div className={cn(
                  "p-1.5 rounded-lg",
                  deviceStatus.bleBridge.connected 
                    ? "bg-emerald-500/10" 
                    : "bg-muted/30"
                )}>
                  <Bluetooth className={cn(
                    "h-4 w-4",
                    deviceStatus.bleBridge.connected 
                      ? "text-emerald-500" 
                      : "text-muted-foreground/60"
                  )} />
                </div>
                <span className="text-sm">BLE Bridge</span>
              </div>
              <span
                className={cn(
                  "h-2.5 w-2.5 rounded-full transition-colors",
                  deviceStatus.bleBridge.connected
                    ? "bg-emerald-500 shadow-sm shadow-emerald-500/50"
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
