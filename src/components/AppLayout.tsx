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

// --------------- SHARED SIDEBAR CONTENT ---------------

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
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
              "flex items-center justify-between rounded-full px-3 py-1.5 text-sm transition-colors",
              "hover:bg-secondary hover:text-foreground",
              active && "bg-secondary text-foreground font-medium",
            )}
          >
            <span className="flex items-center gap-2">
              {Icon && <Icon className="h-4 w-4" />}
              {item.name}
            </span>
            {item.badge && (
              <span className="ml-2 rounded-full bg-background px-2 py-0.5 text-[11px] leading-none">{item.badge}</span>
            )}
          </NavLink>
        );
      })}
    </div>
  );
}

// Desktop sidebar – nav centered vertically and stationary
function AppSidebarDesktop() {
  return (
    <nav className="hidden md:flex w-56 flex-col border-r bg-sidebar/40 text-muted-foreground">
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full">
          <div className="mb-4 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/70 text-center">
            Navigation
          </div>
          <SidebarNav />
        </div>
      </div>
    </nav>
  );
}

// Mobile sidebar (sheet) – nav centered vertically as well
function AppSidebarMobile({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-64 p-0 bg-sidebar text-sidebar-foreground">
        <div className="h-full flex">
          <div className="flex-1 flex items-center justify-center px-4">
            <div className="w-full">
              <div className="mb-4 text-xs font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/70 text-center">
                Navigation
              </div>
              <SidebarNav onNavigate={() => onOpenChange(false)} />
            </div>
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

  // single source of truth for sidebar – desktop + mobile
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Default: desktop → open, mobile → closed
  useEffect(() => {
    setSidebarOpen(!isMobile);
  }, [isMobile]);

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

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* APP BAR */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="flex h-16 items-center justify-between px-4 sm:px-6">
          {/* LEFT: branding + sidebar toggle */}
          <div className="flex items-center gap-3">
            {/* Desktop / larger: full branding (logo + text, editable) */}
            <div className="hidden sm:flex">
              <EditableBranding companyName={brandName} logoUrl={logoUrl} logoClassName="h-8 w-8" />
            </div>

            {/* Mobile: logo only, no text */}
            <div className="flex sm:hidden items-center">
              {logoUrl ? (
                <img src={logoUrl} alt={brandName} className="h-8 w-8 rounded-md object-cover" />
              ) : (
                <div className="h-8 w-8 rounded-md bg-primary text-primary-foreground flex items-center justify-center text-sm font-semibold">
                  {brandName.charAt(0)}
                </div>
              )}
            </div>

            {/* Sidebar toggle – works for both desktop & mobile */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={() => setSidebarOpen((v) => !v)}
            >
              <PanelLeft className="h-4 w-4" />
              <span className="sr-only">Toggle sidebar</span>
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

            <QuickTipsDialog />
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

      {/* BODY */}
      <div className="flex flex-1">
        {/* Desktop sidebar – only when not mobile and sidebarOpen */}
        {!isMobile && sidebarOpen && <AppSidebarDesktop />}

        {/* Mobile sidebar – sheet driven by same sidebarOpen */}
        {isMobile && <AppSidebarMobile open={sidebarOpen} onOpenChange={setSidebarOpen} />}

        {/* Main content scrolls; sidebar stays stationary */}
        <main className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
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
