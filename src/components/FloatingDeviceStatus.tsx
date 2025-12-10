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
      {/* Collapsed state - just an icon */}
      <div
        className={cn(
          "absolute right-0 bottom-0 transition-all duration-300",
          isHovered ? "opacity-0 scale-75" : "opacity-100 scale-100"
        )}
      >
        <button
          className={cn(
            "flex items-center justify-center h-12 w-12 rounded-full",
            "bg-card/90 backdrop-blur-xl border border-border/50",
            "shadow-lg shadow-background/20",
            "hover:bg-card hover:border-border",
            "transition-all duration-200"
          )}
        >
          <Radio
            className={cn(
              "h-5 w-5",
              allConnected
                ? "text-emerald-500"
                : anyConnected
                ? "text-amber-500"
                : "text-muted-foreground"
            )}
          />
          {/* Status dot */}
          <span
            className={cn(
              "absolute top-2 right-2 h-2.5 w-2.5 rounded-full",
              allConnected
                ? "bg-emerald-500 animate-pulse"
                : anyConnected
                ? "bg-amber-500"
                : "bg-muted-foreground/40"
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
            "flex flex-col gap-3 p-4 rounded-2xl",
            "bg-card/95 backdrop-blur-xl border border-border/50",
            "shadow-xl shadow-background/30",
            "min-w-[180px]"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Devices
            </span>
            <span
              className={cn(
                "text-[10px] px-2 py-0.5 rounded-full font-medium",
                allConnected
                  ? "bg-emerald-500/10 text-emerald-500"
                  : anyConnected
                  ? "bg-amber-500/10 text-amber-500"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {allConnected ? "All Online" : anyConnected ? "Partial" : "Offline"}
            </span>
          </div>

          <div className="space-y-2">
            {/* Android App */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Android App</span>
              </div>
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  deviceStatus.androidApp.connected
                    ? "bg-emerald-500 animate-pulse"
                    : "bg-muted-foreground/30"
                )}
              />
            </div>

            {/* EEG Machine */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">EEG Machine</span>
              </div>
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  deviceStatus.eegMachine.connected
                    ? "bg-emerald-500 animate-pulse"
                    : "bg-muted-foreground/30"
                )}
              />
            </div>

            {/* BLE Bridge */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bluetooth className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">BLE Bridge</span>
              </div>
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  deviceStatus.bleBridge.connected
                    ? "bg-emerald-500 animate-pulse"
                    : "bg-muted-foreground/30"
                )}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
