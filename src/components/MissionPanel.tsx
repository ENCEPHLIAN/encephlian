import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { X, Activity, Upload, StickyNote, Wallet, Smartphone, Cpu, Bluetooth } from "lucide-react";
import { Button } from "@/components/ui/button";
import EditableBranding from "./EditableBranding";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface MissionPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MissionPanel({ open, onOpenChange }: MissionPanelProps) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onOpenChange(false);
      }
    };

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener('keydown', handleEscape);
    
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open, onOpenChange]);

  const { data: clinicContext } = useQuery({
    queryKey: ["clinic-context"],
    queryFn: async () => {
      const { data } = await supabase.from("user_clinic_context").select("*").single();
      return data;
    },
  });

  const { data: profile } = useQuery({
    queryKey: ["user-profile"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase.from("profiles").select("company_name").eq("id", user.id).single();
      return data;
    },
  });

  // Placeholder device status
  const deviceStatus = {
    androidApp: { connected: false },
    eegMachine: { connected: false },
    bleBridge: { connected: false },
  };

  const allConnected = deviceStatus.androidApp.connected && 
                       deviceStatus.eegMachine.connected && 
                       deviceStatus.bleBridge.connected;

  const brandName = profile?.company_name || "ENCEPHLIAN";
  const logoUrl = clinicContext?.logo_url as string | undefined;

  const missionLinks = [
    { label: "Start Review", href: "/app/studies?filter=uploaded", icon: Activity },
    { label: "Upload Study", href: "/app/files", icon: Upload },
    { label: "Open EEG Viewer", href: "/app/viewer", icon: Activity },
    { label: "Wallet & Tokens", href: "/app/wallet", icon: Wallet },
    { label: "My Notes", href: "/app/notes", icon: StickyNote },
  ];

  const handleNavigation = (href: string) => {
    navigate(href);
    onOpenChange(false);
  };

  if (!open) return null;

  return (
    <>
      {/* Full panel - clicking empty areas closes it */}
      <div
        className="fixed inset-0 z-[9999] flex flex-col
                   bg-background/70 backdrop-blur-lg
                   supports-[backdrop-filter]:bg-background/60"
        onClick={() => onOpenChange(false)}
      >
        <div onClick={(e) => e.stopPropagation()} className="flex flex-col h-full">
          {/* Top row: branding + device status + close */}
          <div className="flex items-center justify-between px-6 py-4">
            <EditableBranding companyName={brandName} logoUrl={logoUrl} logoClassName="h-8 w-8" />
            
            {/* Device Status - top right with frosted glass look */}
            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-3 px-4 py-2 rounded-xl bg-card/50 backdrop-blur-xl border border-border/20 shadow-lg">
                <div className="flex items-center gap-2">
                  <Smartphone className={cn("h-4 w-4", deviceStatus.androidApp.connected ? "text-emerald-500" : "text-muted-foreground/50")} />
                  <Cpu className={cn("h-4 w-4", deviceStatus.eegMachine.connected ? "text-emerald-500" : "text-muted-foreground/50")} />
                  <Bluetooth className={cn("h-4 w-4", deviceStatus.bleBridge.connected ? "text-emerald-500" : "text-muted-foreground/50")} />
                </div>
                <div className={cn(
                  "h-2 w-2 rounded-full",
                  allConnected ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
                )} />
                <span className={cn(
                  "text-xs font-medium",
                  allConnected ? "text-emerald-500" : "text-muted-foreground"
                )}>
                  {allConnected ? "Online" : "Offline"}
                </span>
              </div>
              
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" onClick={() => onOpenChange(false)}>
                <X className="h-5 w-5" />
                <span className="sr-only">Close</span>
              </Button>
            </div>
          </div>

          {/* Body: CTA links */}
          <div className="flex-1 flex items-center justify-center px-6 py-8 overflow-y-auto">
            <div className="w-full max-w-md space-y-4">
              {missionLinks.map((link) => {
                const Icon = link.icon;
                return (
                  <button
                    key={link.href}
                    onClick={() => handleNavigation(link.href)}
                    className="w-full flex items-center gap-4 text-lg md:text-xl font-normal
                               tracking-tight py-3 px-4 rounded-lg hover:bg-secondary/50
                               transition-colors text-left group"
                  >
                    <Icon className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                    <span className="group-hover:opacity-80 transition-opacity">{link.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}