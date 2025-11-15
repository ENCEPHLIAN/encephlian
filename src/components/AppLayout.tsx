import { Link, Outlet, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import { LayoutDashboard, FileText, Wallet, User, LogOut, Coins, Menu, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useIsMobile } from "@/hooks/use-mobile";
import CommandPalette from "@/components/CommandPalette";
import logo from "@/assets/logo.png";

  const navigation = [
    { name: "Dashboard", href: "/app/dashboard", icon: LayoutDashboard },
    { name: "Studies", href: "/app/studies", icon: FileText },
    { name: "EEG Viewer", href: "/app/viewer", icon: Activity },
    { name: "Wallet", href: "/app/wallet", icon: Wallet },
  ];

export default function AppLayout() {
  const location = useLocation();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [userEmail, setUserEmail] = useState<string>("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserEmail(user.email || "");
      }
    });
  }, []);

  // Fetch clinic branding context
  const { data: clinicContext } = useQuery({
    queryKey: ["clinic-context"],
    queryFn: async () => {
      const { data } = await supabase
        .from("user_clinic_context")
        .select("*")
        .single();
      return data;
    }
  });

  const { data: wallet } = useQuery({
    queryKey: ["wallet-balance"],
    queryFn: async () => {
      const { data } = await supabase.from("wallets").select("tokens").single();
      return data;
    }
  });


  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast({
      title: "Signed out",
      description: "You have been successfully signed out."
    });
  };

  const SidebarContent = () => (
    <>
      <div className="py-6 px-4 md:py-8 md:px-6 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <img 
            src={clinicContext?.logo_url || logo} 
            alt="Logo" 
            className="h-8 w-8 md:h-10 md:w-10 object-contain" 
          />
          {!isMobile && (
            <div>
              <h1 className="text-2xl md:text-3xl font-bold logo-text text-sidebar-foreground">
                {clinicContext?.brand_name || "ENCEPHLIAN"}
              </h1>
            </div>
          )}
        </div>
      </div>
      
      {!isMobile && (
        <div className="p-4 m-4 md:p-5 md:m-5 bg-sidebar-accent/50 border border-sidebar-border rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Coins className="h-3.5 w-3.5 md:h-4 md:w-4 text-sidebar-foreground/50" />
              <span className="text-xs md:text-sm font-medium text-sidebar-foreground/70">Tokens</span>
            </div>
              <span className="text-base md:text-xl font-semibold text-sidebar-foreground">{wallet?.tokens || 0}</span>
            </div>
          </div>
        )}
        
        <nav className="flex-1 p-4 md:p-5 space-y-1">
        {navigation.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.href || location.pathname.startsWith(item.href + "/");
          return (
            <Link key={item.name} to={item.href} onClick={() => setMobileMenuOpen(false)}>
              <Button
                variant={isActive ? "secondary" : "ghost"}
                className={cn(
                  "w-full justify-start transition-all duration-150 h-10 md:h-11 text-sm font-medium hover:scale-[1.02] active:scale-[0.98]",
                  isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                )}
              >
                <Icon className="mr-3 h-4 w-4 md:h-5 md:w-5" />
                <span>{item.name}</span>
              </Button>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 md:p-5 border-t border-sidebar-border space-y-3">
        {!isMobile && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="w-full justify-start h-11 md:h-12 hover:bg-sidebar-accent/50 transition-all duration-150">
                <Avatar className="h-8 w-8 md:h-9 md:w-9 mr-3">
                  <AvatarFallback className="bg-sidebar-accent text-sidebar-foreground font-medium">
                    {userEmail.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col items-start flex-1 min-w-0">
                  <span className="text-sm font-medium truncate w-full text-sidebar-foreground">{userEmail}</span>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/app/profile" className="cursor-pointer">
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="cursor-pointer p-0">
                <div className="flex items-center justify-between w-full px-2 py-1.5">
                  <span className="text-sm">Theme</span>
                  <ThemeToggle />
                </div>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer">
                <LogOut className="mr-2 h-4 w-4" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {isMobile && (
          <>
            <Button
              variant="ghost"
              className="w-full justify-start h-11 transition-all duration-150"
              asChild
            >
              <Link to="/app/profile" onClick={() => setMobileMenuOpen(false)}>
                <User className="mr-3 h-4 w-4" />
                <span>Profile</span>
              </Link>
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start h-11 transition-all duration-150"
              onClick={() => {
                handleSignOut();
                setMobileMenuOpen(false);
              }}
            >
              <LogOut className="mr-3 h-4 w-4" />
              <span>Sign Out</span>
            </Button>
          </>
        )}
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-background w-full">
      {/* Mobile Header */}
      {isMobile && (
        <header className="fixed top-0 left-0 right-0 z-50 h-16 bg-sidebar border-b border-sidebar-border flex items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <img 
              src={clinicContext?.logo_url || logo} 
              alt="Logo" 
              className="h-8 w-8 object-contain" 
            />
            <span className="logo-text text-sm tracking-wider">
              {clinicContext?.brand_name || "ENCEPHLIAN"}
            </span>
          </div>
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 p-0 bg-sidebar">
              <div className="flex flex-col h-full">
                <SidebarContent />
              </div>
            </SheetContent>
          </Sheet>
        </header>
      )}

      {/* Desktop Sidebar */}
      {!isMobile && (
        <div className="fixed inset-y-0 left-0 z-50 w-64 bg-sidebar border-r border-sidebar-border">
          <div className="flex flex-col h-full">
            <SidebarContent />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className={cn(isMobile ? "pt-16" : "pl-64", "w-full")}>
        <main className="p-4 py-6 md:p-8 md:py-10 lg:p-12 lg:py-12 min-h-screen">
          <Outlet />
        </main>
      </div>
      
      {/* Command Palette */}
      <CommandPalette />
    </div>
  );
}
