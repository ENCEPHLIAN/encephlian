import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Smartphone, Cpu, Bluetooth, Wifi, CheckCircle2, XCircle, RefreshCw } from "lucide-react";

export default function AdminIntegrations() {
  // Placeholder device status - will be connected to real BLE/app status later
  const deviceStatus = {
    androidApp: { connected: false, lastSeen: null },
    eegMachine: { connected: false, lastSeen: null },
    bleDevice: { connected: false, lastSeen: null },
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-mono font-bold tracking-tight">Integrations</h1>
          <p className="text-sm text-muted-foreground font-mono">
            Device connections and external service status
          </p>
        </div>
        <Button variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh Status
        </Button>
      </div>

      {/* Device Status */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Smartphone className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-base font-mono">Android App</CardTitle>
              </div>
              {deviceStatus.androidApp.connected ? (
                <div className="flex items-center gap-1.5">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                  </span>
                  <span className="text-xs text-green-600 font-mono">ONLINE</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30"></span>
                  <span className="text-xs text-muted-foreground font-mono">OFFLINE</span>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Mobile companion app for EEG capture and sync
            </p>
            <div className="mt-3 pt-3 border-t">
              <p className="text-xs text-muted-foreground">
                Last seen: {deviceStatus.androidApp.lastSeen || "Never"}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-base font-mono">EEG Machine</CardTitle>
              </div>
              {deviceStatus.eegMachine.connected ? (
                <div className="flex items-center gap-1.5">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                  </span>
                  <span className="text-xs text-green-600 font-mono">ONLINE</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30"></span>
                  <span className="text-xs text-muted-foreground font-mono">OFFLINE</span>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Direct connection to clinic EEG hardware
            </p>
            <div className="mt-3 pt-3 border-t">
              <p className="text-xs text-muted-foreground">
                Last seen: {deviceStatus.eegMachine.lastSeen || "Never"}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bluetooth className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-base font-mono">BLE Bridge</CardTitle>
              </div>
              {deviceStatus.bleDevice.connected ? (
                <div className="flex items-center gap-1.5">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                  </span>
                  <span className="text-xs text-green-600 font-mono">PAIRED</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30"></span>
                  <span className="text-xs text-muted-foreground font-mono">NOT PAIRED</span>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Bluetooth Low Energy bridge device on EEG PC
            </p>
            <div className="mt-3 pt-3 border-t">
              <p className="text-xs text-muted-foreground">
                Last seen: {deviceStatus.bleDevice.lastSeen || "Never"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* External Services */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-mono">External Services</CardTitle>
          <CardDescription>Third-party service connections</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg border">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-blue-500/10 flex items-center justify-center">
                  <Wifi className="h-4 w-4 text-blue-500" />
                </div>
                <div>
                  <p className="font-medium text-sm">Razorpay Payments</p>
                  <p className="text-xs text-muted-foreground">Payment processing</p>
                </div>
              </div>
              <Badge variant="outline" className="text-green-600 border-green-500/30">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Connected
              </Badge>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-purple-500/10 flex items-center justify-center">
                  <Wifi className="h-4 w-4 text-purple-500" />
                </div>
                <div>
                  <p className="font-medium text-sm">Resend Email</p>
                  <p className="text-xs text-muted-foreground">Email delivery</p>
                </div>
              </div>
              <Badge variant="outline" className="text-green-600 border-green-500/30">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Connected
              </Badge>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border border-dashed">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                  <Cpu className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium text-sm">Inference Backend</p>
                  <p className="text-xs text-muted-foreground">Azure ML service</p>
                </div>
              </div>
              <Badge variant="secondary">
                <XCircle className="h-3 w-3 mr-1" />
                Not Connected
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
