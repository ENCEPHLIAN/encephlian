import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Smartphone, Cpu, Bluetooth } from "lucide-react";

interface DeviceStatusIndicatorProps {
  className?: string;
}

export function DeviceStatusIndicator({ className }: DeviceStatusIndicatorProps) {
  // Placeholder device status - will be connected to real BLE/app status later
  const deviceStatus = {
    androidApp: { connected: false },
    eegMachine: { connected: false },
    bleBridge: { connected: false },
  };

  const allConnected = deviceStatus.androidApp.connected && 
                       deviceStatus.eegMachine.connected && 
                       deviceStatus.bleBridge.connected;
  
  const anyConnected = deviceStatus.androidApp.connected || 
                       deviceStatus.eegMachine.connected || 
                       deviceStatus.bleBridge.connected;

  return (
    <Card className={className}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Device Status</span>
            {allConnected ? (
              <Badge variant="default" className="text-[10px] h-5">All Connected</Badge>
            ) : anyConnected ? (
              <Badge variant="secondary" className="text-[10px] h-5">Partial</Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] h-5">Offline</Badge>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-4 mt-3">
          {/* Android App */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Smartphone className="h-4 w-4 text-muted-foreground" />
              <span 
                className={`absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full ${
                  deviceStatus.androidApp.connected 
                    ? "bg-green-500 animate-pulse" 
                    : "bg-muted-foreground/30"
                }`} 
              />
            </div>
            <span className="text-xs text-muted-foreground">App</span>
          </div>
          
          {/* EEG Machine */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Cpu className="h-4 w-4 text-muted-foreground" />
              <span 
                className={`absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full ${
                  deviceStatus.eegMachine.connected 
                    ? "bg-green-500 animate-pulse" 
                    : "bg-muted-foreground/30"
                }`} 
              />
            </div>
            <span className="text-xs text-muted-foreground">EEG</span>
          </div>
          
          {/* BLE Bridge */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Bluetooth className="h-4 w-4 text-muted-foreground" />
              <span 
                className={`absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full ${
                  deviceStatus.bleBridge.connected 
                    ? "bg-green-500 animate-pulse" 
                    : "bg-muted-foreground/30"
                }`} 
              />
            </div>
            <span className="text-xs text-muted-foreground">BLE</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
