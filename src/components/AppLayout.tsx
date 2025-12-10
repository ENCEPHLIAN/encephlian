import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

import {
  LayoutDashboard,
  FileText,
  Wallet,
  User,
  LogOut,
  Activity,
  FolderOpen,
  StickyNote,
  Settings,
  Search,
  X,
  Sparkles,
  CreditCard,
  HelpCircle,
  Menu,
  Smartphone,
  Cpu,
  Bluetooth,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useIsMobile } from "@/hooks/use-mobile";
import CommandPalette from "@/components/CommandPalette";
import EditableBranding from "@/components/EditableBranding";
import Breadcrumbs from "@/components/Breadcrumbs";
import { QuickTipsDialog } from "@/components/QuickTipsDialog";
import { MissionPanel } from "@/components/MissionPanel";
import { FloatingCommandIsland } from "@/components/FloatingCommandIsland";
import { FloatingDeviceStatus } from "@/components/FloatingDeviceStatus";

// --------------- NAV DATA ---------------

const navigation = [
  { name: "Dashboard", href: "/app/dashboard", icon: LayoutDashboard },
  { name: "Studies", href: "/app/studies", icon: FileText },
  { name: "EEG Viewer", href: "/app/viewer", icon: Activity },
  { name: "Files", href: "/app/files", icon: FolderOpen },
  { name: "Notes", href: "/app/notes", icon: StickyNote },
  { name: "Wallet", href: "/app/wallet", icon: Wallet },
  { name: "Support", href: "/app/support", icon: HelpCircle },
];

// --------------- SHARED SIDEBAR NAV ---------------

function SidebarNav({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const location = useLocation();

  return (
    <div className="flex flex-col gap-1.5">
      {navigation.map((item) => {
        const active = location.pathname.startsWith(item.href);
        const Icon = item.icon;

        const navLink = (
          <NavLink
            key={item.name}
            to={item.href}
            onClick={onNavigate}
            className={cn(
              "group flex items-center rounded-full px-3 py-2 text-sm transition-colors",
              "hover:bg-secondary hover:text-foreground",
              active && "bg-secondary text-foreground font-medium",
              collapsed && "justify-center px-0",
            )}
          >
            {Icon && <Icon className={cn("h-4 w-4", !collapsed && "mr-2")} />}
            {!collapsed && <span>{item.name}</span>}
          </NavLink>
        );

        if (collapsed) {
          return (
            <Tooltip key={item.name}>
              <TooltipTrigger asChild>{navLink}</TooltipTrigger>
              <TooltipContent side="right">{item.name}</TooltipContent>
            </Tooltip>
          );
        }

        return navLink;
      })}
    </div>
  );
}

// --------------- DESKTOP SIDEBAR ---------------

function AppSidebarDesktop({ collapsed, onMissionOpen, onToggle }: { collapsed: boolean; onMissionOpen: () => void; onToggle: () => void }) {
  const [isHoveringEdge, setIsHoveringEdge] = useState(false);

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col relative group/sidebar",
        "bg-sidebar/80 backdrop-blur supports-[backdrop-filter]:bg-sidebar/60",
        "fixed top-16 left-0 h-[calc(100vh-4rem)] z-30",
        "transition-[width] duration-200 ease-out",
        collapsed ? "w-16" : "w-56",
      )}
    >
      {/* Invisible hover zone on right edge for cursor change */}
      <div 
        className={cn(
          "absolute right-0 top-0 bottom-0 w-3 z-40",
          isHoveringEdge ? "cursor-ew-resize" : "cursor-default"
        )}
        onMouseEnter={() => setIsHoveringEdge(true)}
        onMouseLeave={() => setIsHoveringEdge(false)}
        onClick={onToggle}
      />
      <div className="flex-1 overflow-y-auto px-3 py-4">
        {!collapsed && (
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
            Navigation
          </div>
        )}
        <SidebarNav collapsed={collapsed} />
      </div>

      {/* Mission CTA Button at bottom */}
      <div className={cn("flex items-center justify-center", collapsed ? "p-3" : "p-4")}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-full hover:bg-secondary"
              onClick={onMissionOpen}
              aria-label="Open mission panel"
            >
              <Sparkles className="h-5 w-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Quick Actions</TooltipContent>
        </Tooltip>
      </div>
    </aside>
  );
}

// --------------- MOBILE SIDEBAR (FULLSCREEN FROSTED SHEET) ---------------

function AppSidebarMobile({ open, onOpenChange, onMissionOpen }: { open: boolean; onOpenChange: (open: boolean) => void; onMissionOpen: () => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className={cn(
          "w-full max-w-none p-0 border-none",
          "bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70",
          "[&>button]:hidden",
        )}
      >
        <div className="h-full flex flex-col">
          {/* Top row: "Navigation" + X */}
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Navigation</span>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4" />
              <span className="sr-only">Close navigation</span>
            </Button>
          </div>

          {/* Nav list */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <SidebarNav onNavigate={() => onOpenChange(false)} />
          </div>

          {/* Mission CTA Button at bottom */}
          <div className="p-4 flex items-center justify-center">
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-full hover:bg-secondary"
              onClick={() => {
                onOpenChange(false);
                onMissionOpen();
              }}
              aria-label="Open mission panel"
            >
              <Sparkles className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// --------------- MAIN LAYOUT ---------------

function AppLayoutContent() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const [userName, setUserName] = useState<string>("");
  const [commandOpen, setCommandOpen] = useState(false);
  const [missionOpen, setMissionOpen] = useState(false);

  // desktop: collapsed vs expanded
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // mobile: full-screen nav open/close
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Placeholder device status for dropdown
  const deviceStatus = {
    androidApp: { connected: false },
    eegMachine: { connected: false },
    bleBridge: { connected: false },
  };
  const allConnected = deviceStatus.androidApp.connected && 
                       deviceStatus.eegMachine.connected && 
                       deviceStatus.bleBridge.connected;

  // profile - only fetch full_name, no company_name
  const { data: profile } = useQuery({
    queryKey: ["user-profile"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
      return data;
    },
  });

  // Also fetch clinic context for clinic name as fallback
  useEffect(() => {
    const fetchUserName = async () => {
      // Always prioritize full_name
      if (profile?.full_name && profile.full_name.trim()) {
        setUserName(profile.full_name);
        return;
      }
      // Fallback to "Account" - don't use email
      setUserName("Account");
    };
    fetchUserName();
  }, [profile]);

  // clinic / logo
  const { data: clinicContext } = useQuery({
    queryKey: ["clinic-context"],
    queryFn: async () => {
      const { data } = await supabase.from("user_clinic_context").select("*").single();
      return data;
    },
  });

  const brandName = clinicContext?.brand_name || "ENCEPHLIAN";
  const logoUrl = clinicContext?.logo_url as string | undefined;

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast({
      title: "Signed out",
      description: "You have been successfully signed out.",
    });
  };

  const handleSidebarToggle = () => {
    if (isMobile) {
      setMobileNavOpen((v) => !v);
    } else {
      setSidebarCollapsed((v) => !v);
    }
  };

  return (
    <TooltipProvider>
      <div className="min-h-screen flex flex-col bg-background text-foreground">
        {/* APP BAR (STICKY, FROSTED) */}
        <header className="sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="flex h-16 items-center justify-between px-4 sm:px-6">
          {/* LEFT: sidebar toggle + logo */}
          <div className="flex items-center gap-2">
            <EditableBranding companyName={brandName} logoUrl={logoUrl} logoClassName="h-8 w-8" />
            {/* Sidebar toggle button - after branding, desktop only */}
            {!isMobile && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 hidden md:flex ml-2"
                    onClick={() => setSidebarCollapsed((v) => !v)}
                    aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                  >
                    {sidebarCollapsed ? (
                      <PanelLeft className="h-4 w-4" />
                    ) : (
                      <PanelLeftClose className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}</TooltipContent>
              </Tooltip>
            )}
          </div>

          {/* RIGHT: search + actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Desktop command palette button */}
            {!isMobile && (
              <Button
                variant="outline"
                className="h-9 px-3 min-w-[260px] max-w-sm items-center justify-start rounded-full border-border/50"
                onClick={() => setCommandOpen(true)}
              >
                <Search className="mr-2 h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground text-sm truncate">Search studies, patients...</span>
                <kbd className="ml-auto hidden lg:inline-flex h-5 select-none items-center gap-1 rounded border border-border/50 px-1.5 text-[10px]">
                  <span>⌘</span>K
                </kbd>
              </Button>
            )}

            {/* QuickTips only on desktop */}
            {!isMobile && <QuickTipsDialog />}

            {/* Theme toggle only on desktop */}
            {!isMobile && <ThemeToggle />}

            {/* Mobile: only sidebar icon and hamburger menu */}
            {isMobile && (
              <>
                <IconButton
                  icon={PanelLeft}
                  onClick={() => setMobileNavOpen(true)}
                  aria-label="Open sidebar"
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <IconButton
                      icon={Menu}
                      aria-label="Open menu"
                    />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 p-2">
                    <DropdownMenuItem onClick={() => navigate("/app/profile")} className="py-2.5">
                      <User className="mr-3 h-4 w-4" />
                      Profile
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate("/app/settings")} className="py-2.5">
                      <Settings className="mr-3 h-4 w-4" />
                      Settings
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="py-2.5 flex items-center justify-between">
                      <span className="flex items-center gap-3">
                        <Settings className="h-4 w-4" />
                        Theme
                      </span>
                      <ThemeToggle />
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setCommandOpen(true)} className="py-2.5">
                      <Search className="mr-3 h-4 w-4" />
                      Search
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleSignOut} className="py-2.5 text-destructive focus:text-destructive">
                      <LogOut className="mr-3 h-4 w-4" />
                      Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}

            {/* Account dropdown - only on desktop */}
            {!isMobile && (

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 rounded-full">
                  <User className="h-5 w-5" />
                  <span className="hidden md:inline">{userName}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 p-2">
                <div className="px-2 py-3 border-b border-border/50 mb-2">
                  <p className="font-medium text-sm">{userName}</p>
                  <p className="text-xs text-muted-foreground truncate">{clinicContext?.clinic_name || "Clinical Portal"}</p>
                </div>

                {/* Device Status in dropdown */}
                <div className="px-2 py-2 mb-2 rounded-lg bg-muted/50">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Device Status</span>
                    <div className="flex items-center gap-1.5">
                      <Smartphone className={cn("h-3.5 w-3.5", deviceStatus.androidApp.connected ? "text-emerald-500" : "text-muted-foreground/50")} />
                      <Cpu className={cn("h-3.5 w-3.5", deviceStatus.eegMachine.connected ? "text-emerald-500" : "text-muted-foreground/50")} />
                      <Bluetooth className={cn("h-3.5 w-3.5", deviceStatus.bleBridge.connected ? "text-emerald-500" : "text-muted-foreground/50")} />
                      <div className={cn("h-2 w-2 rounded-full ml-1", allConnected ? "bg-emerald-500" : "bg-amber-500")} />
                    </div>
                  </div>
                </div>
                
                <DropdownMenuItem onClick={() => navigate("/app/profile")} className="py-2.5">
                  <User className="mr-3 h-4 w-4" />
                  <div>
                    <p className="text-sm">Profile</p>
                    <p className="text-xs text-muted-foreground">Manage your account</p>
                  </div>
                </DropdownMenuItem>
                
                <DropdownMenuItem onClick={() => navigate("/app/settings")} className="py-2.5">
                  <Settings className="mr-3 h-4 w-4" />
                  <div>
                    <p className="text-sm">Settings</p>
                    <p className="text-xs text-muted-foreground">Preferences & security</p>
                  </div>
                </DropdownMenuItem>
                
                <DropdownMenuItem onClick={() => navigate("/app/wallet")} className="py-2.5">
                  <CreditCard className="mr-3 h-4 w-4" />
                  <div>
                    <p className="text-sm">Billing</p>
                    <p className="text-xs text-muted-foreground">Tokens & payments</p>
                  </div>
                </DropdownMenuItem>
                
                <DropdownMenuSeparator className="my-2" />
                
                <DropdownMenuItem onClick={handleSignOut} className="py-2.5 text-destructive focus:text-destructive">
                  <LogOut className="mr-3 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            )}
          </div>
        </div>
      </header>

      {/* BODY: sidebar fixed; main content scrolls */}
      <div className="flex flex-1 relative">
        {/* Desktop sidebar (fixed, frosted, pinned left) */}
        {!isMobile && <AppSidebarDesktop collapsed={sidebarCollapsed} onMissionOpen={() => setMissionOpen(true)} onToggle={() => setSidebarCollapsed(v => !v)} />}

        {/* Mobile full-screen nav */}
        {isMobile && <AppSidebarMobile open={mobileNavOpen} onOpenChange={setMobileNavOpen} onMissionOpen={() => setMissionOpen(true)} />}

        {/* Main content with margin for fixed sidebar */}
        <main className={cn(
          "flex-1 px-4 sm:px-6 py-6 min-h-[calc(100vh-4rem)]",
          !isMobile && (sidebarCollapsed ? "md:ml-16" : "md:ml-56"),
          "transition-[margin] duration-200 ease-out"
        )}>
          <Breadcrumbs />
          <Outlet />
        </main>
      </div>

      {/* Footer - positioned after main content, doesn't affect sidebar */}
      <footer className={cn(
        "py-3 px-4 sm:px-6",
        !isMobile && (sidebarCollapsed ? "md:ml-16" : "md:ml-56"),
        "transition-[margin] duration-200 ease-out"
      )}>
        <p className="text-[11px] text-muted-foreground/60 text-center">ENCEPHLIAN©2025</p>
      </footer>

      {/* Floating elements */}
      <FloatingCommandIsland onOpen={() => setCommandOpen(true)} />
      <FloatingDeviceStatus />

      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
      <MissionPanel open={missionOpen} onOpenChange={setMissionOpen} />
    </div>
    </TooltipProvider>
  );
}

export default function AppLayout() {
  return <AppLayoutContent />;
}
