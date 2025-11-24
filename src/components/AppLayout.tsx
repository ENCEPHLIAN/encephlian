import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent } from "@/components/ui/sheet";

import {
  LayoutDashboard,
  FileText,
  Wallet,
  User,
  LogOut,
  Activity,
  FolderOpen,
  StickyNote,
  BarChart3,
  Users,
  Settings,
  Search,
  Calendar,
  Plug,
  HelpCircle,
  PanelLeft,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useIsMobile } from "@/hooks/use-mobile";
import CommandPalette from "@/components/CommandPalette";
import EditableBranding from "@/components/EditableBranding";
import Breadcrumbs from "@/components/Breadcrumbs";
import { QuickTipsDialog } from "@/components/QuickTipsDialog";

// --------------- NAV DATA ---------------

const navigation = [
  { name: "Dashboard", href: "/app/dashboard", icon: LayoutDashboard },
  { name: "Studies", href: "/app/studies", icon: FileText },
  { name: "EEG Viewer", href: "/app/viewer", icon: Activity },
  { name: "Files", href: "/app/files", icon: FolderOpen },
  { name: "Notes", href: "/app/notes", icon: StickyNote },
  { name: "Wallet", href: "/app/wallet", icon: Wallet },
  { name: "Analytics", href: "/app/analytics", icon: BarChart3, badge: "Soon" },
  { name: "Templates", href: "/app/templates", icon: FileText },
  { name: "Scheduler", href: "/app/scheduler", icon: Calendar, badge: "Soon" },
  { name: "Integrations", href: "/app/integrations", icon: Plug, badge: "Soon" },
  { name: "Team", href: "/app/team", icon: Users, badge: "Soon" },
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

        return (
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
            {!collapsed && (
              <div className="flex-1 flex items-center justify-between gap-2">
                <span>{item.name}</span>
                {item.badge && (
                  <span className="ml-2 rounded-full bg-background px-2 py-0.5 text-[11px] leading-none">
                    {item.badge}
                  </span>
                )}
              </div>
            )}
          </NavLink>
        );
      })}
    </div>
  );
}

// --------------- DESKTOP SIDEBAR (PINNED + STICKY + FROSTED) ---------------

function AppSidebarDesktop({ collapsed }: { collapsed: boolean }) {
  return (
    <aside
      className={cn(
        "hidden md:flex flex-col border-r",
        "bg-sidebar/80 backdrop-blur supports-[backdrop-filter]:bg-sidebar/60",
        "sticky top-16 h-[calc(100vh-4rem)] z-30",
        "transition-[width] duration-200",
        collapsed ? "w-16" : "w-56",
      )}
    >
      <div className="flex-1 overflow-y-auto px-3 py-4">
        {!collapsed && (
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
            Navigation
          </div>
        )}
        <SidebarNav collapsed={collapsed} />
      </div>
    </aside>
  );
}

// --------------- MOBILE SIDEBAR (FULLSCREEN FROSTED SHEET) ---------------

function AppSidebarMobile({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className={cn(
          "w-full max-w-none p-0 border-none",
          "bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70",
        )}
      >
        <div className="h-full flex flex-col">
          {/* Top row: "Navigation" + X */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
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

  // desktop: collapsed vs expanded
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // mobile: full-screen nav open/close
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // profile
  const { data: profile } = useQuery({
    queryKey: ["user-profile"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase.from("profiles").select("full_name, company_name").eq("id", user.id).single();
      return data;
    },
  });

  useEffect(() => {
    if (profile) {
      setUserName(profile.full_name || "User");
    }
  }, [profile]);

  // clinic / logo
  const { data: clinicContext } = useQuery({
    queryKey: ["clinic-context"],
    queryFn: async () => {
      const { data } = await supabase.from("user_clinic_context").select("*").single();
      return data;
    },
  });

  const brandName = profile?.company_name || "ENCEPHLIAN";
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
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* APP BAR (STICKY, FROSTED) */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="flex h-16 items-center justify-between px-4 sm:px-6">
          {/* LEFT: logo + sidebar toggle */}
          <div className="flex items-center gap-3">
            <EditableBranding companyName={brandName} logoUrl={logoUrl} logoClassName="h-8 w-8" />

            {/* Sidebar toggle – desktop collapses, mobile opens sheet */}
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={handleSidebarToggle}>
              <PanelLeft className="h-4 w-4" />
              <span className="sr-only">Toggle navigation</span>
            </Button>
          </div>

          {/* RIGHT: search + actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Desktop command palette button */}
            <Button
              variant="outline"
              className="hidden md:flex h-9 px-3 min-w-[260px] max-w-sm items-center justify-start rounded-full"
              onClick={() => setCommandOpen(true)}
            >
              <Search className="mr-2 h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground text-sm truncate">Search studies, patients...</span>
              <kbd className="ml-auto hidden lg:inline-flex h-5 select-none items-center gap-1 rounded border px-1.5 text-[10px]">
                <span>⌘</span>K
              </kbd>
            </Button>

            {/* Mobile search icon */}
            <Button
              variant="ghost"
              size="icon"
              className="flex md:hidden h-8 w-8 rounded-full"
              onClick={() => setCommandOpen(true)}
            >
              <Search className="h-4 w-4" />
              <span className="sr-only">Open search</span>
            </Button>

            {/* QuickTips only on desktop */}
            {!isMobile && <QuickTipsDialog />}

            <ThemeToggle />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 rounded-full">
                  <User className="h-5 w-5" />
                  <span className="hidden md:inline">{userName}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/app/profile")}>
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/app/settings")}>
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* BODY: sidebar pinned; whole page scrolls */}
      <div className="flex flex-1">
        {/* Desktop sidebar (sticky, frosted, pinned left) */}
        {!isMobile && <AppSidebarDesktop collapsed={sidebarCollapsed} />}

        {/* Mobile full-screen nav */}
        {isMobile && <AppSidebarMobile open={mobileNavOpen} onOpenChange={setMobileNavOpen} />}

        {/* Main content; no custom scroll container so sticky works */}
        <main className="flex-1 px-4 sm:px-6 py-6">
          <Breadcrumbs />
          <Outlet />
        </main>
      </div>

      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
    </div>
  );
}

export default function AppLayout() {
  return <AppLayoutContent />;
}
