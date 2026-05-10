import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";

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

import { LayoutDashboard, FileText, Wallet, User, LogOut, Activity, Settings, Search, X, CreditCard, HelpCircle, Menu, PanelLeftClose, PanelLeft, Layers, FolderOpen, StickyNote } from "lucide-react";

import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useIsMobile } from "@/hooks/use-mobile";
import CommandPalette from "@/components/CommandPalette";
import logo from "@/assets/logo.png";
import Breadcrumbs from "@/components/Breadcrumbs";
import { QuickTipsDialog } from "@/components/QuickTipsDialog";
import { NotificationBell } from "@/components/NotificationBell";
import { LiveAlertBanner } from "@/components/LiveAlertBanner";
import { useUserSession } from "@/contexts/UserSessionContext";
import { useSku } from "@/hooks/useSku";
import { SkuBadge } from "@/components/sku/SkuBadge";
import { NavItemId } from "@/shared/skuPolicy";
import { StudyBreadcrumbProvider } from "@/contexts/StudyBreadcrumbContext";
import { NotificationProvider } from "@/contexts/NotificationContext";

// --------------- NAV DATA ---------------
const mainNavigation: Array<{ id: NavItemId; name: string; href: string; icon: any }> = [
  { id: "dashboard", name: "Dashboard", href: "/app/dashboard", icon: LayoutDashboard },
  { id: "studies", name: "Studies", href: "/app/studies", icon: Activity },
  { id: "lanes", name: "Lanes", href: "/app/lanes", icon: Layers },
  { id: "reports", name: "Reports", href: "/app/reports", icon: FileText },
];

const resourceNavigation: Array<{ id: NavItemId; name: string; href: string; icon: any }> = [
  { id: "files", name: "Files", href: "/app/files", icon: FolderOpen },
  { id: "notes", name: "Notes", href: "/app/notes", icon: StickyNote },
];

const accountNavigation: Array<{ id: NavItemId; name: string; href: string; icon: any }> = [
  { id: "wallet", name: "Wallet", href: "/app/wallet", icon: Wallet },
  { id: "support", name: "Support", href: "/app/support", icon: HelpCircle },
];

// --------------- SHARED SIDEBAR NAV ---------------

function NavSection({ 
  title, 
  items, 
  collapsed, 
  onNavigate,
  visibleNav,
}: { 
  title?: string; 
  items: Array<{ id: NavItemId; name: string; href: string; icon: any }>; 
  collapsed?: boolean; 
  onNavigate?: () => void;
  visibleNav: NavItemId[];
}) {
  const location = useLocation();
  
  const filteredItems = items.filter(item => visibleNav.includes(item.id));

  if (filteredItems.length === 0) return null;

  return (
    <div className="space-y-1">
      {title && !collapsed && filteredItems.length > 0 && (
        <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
          {title}
        </div>
      )}
      {filteredItems.map((item) => {
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

function SidebarNav({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const { visibleNav } = useSku();
  
  return (
    <div className="flex flex-col gap-4">
      <NavSection items={mainNavigation} collapsed={collapsed} onNavigate={onNavigate} visibleNav={visibleNav} />
      <NavSection title="Resources" items={resourceNavigation} collapsed={collapsed} onNavigate={onNavigate} visibleNav={visibleNav} />
      <NavSection title="Account" items={accountNavigation} collapsed={collapsed} onNavigate={onNavigate} visibleNav={visibleNav} />
      
      {!collapsed && (
        <div className="px-3 pt-4 border-t border-border/30 space-y-2">
          <SkuBadge />
        </div>
      )}
    </div>
  );
}

// --------------- DESKTOP SIDEBAR ---------------

function AppSidebarDesktop({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
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
          "[&>button]:hidden",
        )}
      >
        <div className="h-full flex flex-col">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Navigation</span>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4" />
              <span className="sr-only">Close navigation</span>
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4">
            <SidebarNav onNavigate={() => onOpenChange(false)} />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// --------------- MAIN LAYOUT ---------------

export default function AppLayout() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  
  const { profile, clinicContext, signOut } = useUserSession();
  const { hasWallet } = useSku();

  const [commandOpen, setCommandOpen] = useState(false);
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const userName = profile?.full_name?.trim() || "Account";
  const brandName = "ENCEPHLIAN";
  const logoUrl = clinicContext?.logo_url as string | undefined;

  const handleSignOut = async () => {
    await signOut();
    toast({
      title: "Signed out",
      description: "You have been successfully signed out.",
    });
  };

  return (
    <TooltipProvider>
      <NotificationProvider>
      <div className="min-h-screen flex flex-col bg-background text-foreground">
        {/* APP BAR (STICKY, FROSTED) */}
        <header className="sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="flex h-16 items-center justify-between px-4 sm:px-6">
          {/* LEFT: sidebar toggle + logo */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <img
                src={logoUrl || logo}
                alt="Logo"
                className="h-8 w-8 object-contain flex-shrink-0"
                onError={(e) => { (e.currentTarget as HTMLImageElement).src = logo; }}
              />
              <h1 className="brand-encephlian text-xl md:text-2xl">
                {brandName}<sup className="text-[10px] align-super">™</sup>
              </h1>
            </div>
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

            {!isMobile && <QuickTipsDialog />}
            <NotificationBell />
            {!isMobile && <ThemeToggle />}

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

            {/* Account dropdown - desktop only */}
            {!isMobile && (
            <div 
              className="relative"
              onMouseEnter={() => setAccountDropdownOpen(true)}
              onMouseLeave={() => setAccountDropdownOpen(false)}
            >
              <DropdownMenu open={accountDropdownOpen} onOpenChange={setAccountDropdownOpen}>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center gap-2 rounded-full">
                    <User className="h-5 w-5" />
                    <span className="hidden md:inline">{userName}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64 p-2">
                  <div className="px-2 py-3 border-b border-border/50 mb-2">
                    <p className="font-medium text-sm">{userName}</p>
                    <p className="text-xs text-muted-foreground truncate">ENCEPHLIAN</p>
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
                  
                  {hasWallet && (
                    <DropdownMenuItem onClick={() => navigate("/app/wallet")} className="py-2.5">
                      <CreditCard className="mr-3 h-4 w-4" />
                      <div>
                        <p className="text-sm">Billing</p>
                        <p className="text-xs text-muted-foreground">Tokens & payments</p>
                      </div>
                    </DropdownMenuItem>
                  )}
                  
                  <DropdownMenuSeparator className="my-2" />
                  
                  <DropdownMenuItem onClick={handleSignOut} className="py-2.5 text-destructive focus:text-destructive">
                    <LogOut className="mr-3 h-4 w-4" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            )}
          </div>
        </div>
      </header>

        <LiveAlertBanner />

        {/* BODY: sidebar fixed; main content scrolls */}
        <div className="flex flex-1 relative">
          {!isMobile && <AppSidebarDesktop collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(v => !v)} />}
          {isMobile && <AppSidebarMobile open={mobileNavOpen} onOpenChange={setMobileNavOpen} />}

          <main className={cn(
            "flex-1 px-4 sm:px-6 py-6 min-h-[calc(100vh-4rem)]",
            !isMobile && (sidebarCollapsed ? "md:ml-16" : "md:ml-56"),
            "transition-[margin] duration-200 ease-out"
          )}>
            <StudyBreadcrumbProvider>
              <Breadcrumbs />
              <Outlet />
            </StudyBreadcrumbProvider>
          </main>
        </div>

        {/* Footer */}
        <footer className={cn(
          "py-3 px-4 sm:px-6",
          !isMobile && (sidebarCollapsed ? "md:ml-16" : "md:ml-56"),
          "transition-[margin] duration-200 ease-out"
        )}>
          <p className="text-[11px] text-muted-foreground/60 text-center">ENCEPHLIAN™ ©{new Date().getFullYear()}</p>
        </footer>

        <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
      </div>
      </NotificationProvider>
    </TooltipProvider>
  );
}
