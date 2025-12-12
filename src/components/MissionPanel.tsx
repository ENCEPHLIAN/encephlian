/**
 * MissionPanel.tsx
 * 
 * Full-screen command center overlay for clinicians.
 * Provides quick access to primary workflows and system status at a glance.
 * 
 * Displays:
 * - Clinic branding (customizable per tenant)
 * - System status (Windows Uploader + Cloud Sync)
 * - Primary action links (Review, Upload, Viewer, Wallet, Notes)
 */

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { X, Activity, Upload, StickyNote, Wallet, Monitor, Cloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import logo from "@/assets/logo.png";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface MissionPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MissionPanel({ open, onOpenChange }: MissionPanelProps) {
  const navigate = useNavigate();

  // Handle escape key and body scroll lock
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

  // Fetch clinic branding context
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase.from("profiles").select("company_name").eq("id", user.id).single();
      return data;
    },
  });

  // System status - placeholder for Windows uploader integration
  // TODO: Connect to real uploader status via WebSocket/polling when ready
  const systemStatus = {
    windowsUploader: { connected: false },
    cloudSync: { connected: true },
  };

  const allOnline = systemStatus.windowsUploader.connected && systemStatus.cloudSync.connected;

  const brandName = clinicContext?.brand_name || "ENCEPHLIAN";
  const logoUrl = clinicContext?.logo_url as string | undefined;

  // Primary workflow actions
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
      {/* Full panel overlay - clicking backdrop closes it */}
      <div
        className="fixed inset-0 z-[9999] flex flex-col
                   bg-background/70 backdrop-blur-lg
                   supports-[backdrop-filter]:bg-background/60
                   transition-all duration-300 ease-out animate-fade-in"
        onClick={() => onOpenChange(false)}
      >
        <div className="flex flex-col h-full">
          {/* Header: Branding + System Status + Close */}
          <div className="flex items-center justify-between px-6 py-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <img src={logoUrl || logo} alt="Logo" className="h-8 w-8 object-contain flex-shrink-0" />
              <h1 className="text-2xl font-bold logo-text">
                {brandName}<sup className="text-[10px] align-super">™</sup>
              </h1>
            </div>
            
            {/* System Status - frosted glass panel */}
            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-3 px-4 py-2 rounded-xl bg-card/50 backdrop-blur-xl border border-border/20 shadow-lg">
                <div className="flex items-center gap-3">
                  {/* Windows Uploader */}
                  <div className="flex items-center gap-1.5">
                    <Monitor className={cn(
                      "h-4 w-4", 
                      systemStatus.windowsUploader.connected ? "text-emerald-500" : "text-muted-foreground/50"
                    )} />
                    <span className="text-[10px] text-muted-foreground">Uploader</span>
                  </div>
                  
                  {/* Cloud Sync */}
                  <div className="flex items-center gap-1.5">
                    <Cloud className={cn(
                      "h-4 w-4", 
                      systemStatus.cloudSync.connected ? "text-emerald-500" : "text-muted-foreground/50"
                    )} />
                    <span className="text-[10px] text-muted-foreground">Cloud</span>
                  </div>
                </div>
                
                {/* Status indicator */}
                <div className={cn(
                  "h-2 w-2 rounded-full",
                  allOnline ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
                )} />
                <span className={cn(
                  "text-xs font-medium",
                  allOnline ? "text-emerald-500" : "text-muted-foreground"
                )}>
                  {allOnline ? "Online" : "Partial"}
                </span>
              </div>
              
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" onClick={() => onOpenChange(false)}>
                <X className="h-5 w-5" />
                <span className="sr-only">Close</span>
              </Button>
            </div>
          </div>

          {/* Body: Primary action links */}
          <div className="flex-1 flex items-center justify-center px-6 py-8 overflow-y-auto">
            <div className="w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
              {missionLinks.map((link) => {
                const Icon = link.icon;
                return (
                  <button
                    key={link.href}
                    onClick={() => handleNavigation(link.href)}
                    className="w-full flex items-center gap-4 text-lg md:text-xl font-normal
                               tracking-tight py-3 px-4 rounded-lg hover:bg-secondary/50
                               transition-all duration-200 text-left group"
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
