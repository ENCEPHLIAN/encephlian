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
import { LayoutDashboard, Building2, Users, FileText, DollarSign, Settings, LogOut, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import logo from "@/assets/logo.png";

const navigation = [
  { name: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
  { name: "Clinics", href: "/admin/clinics", icon: Building2 },
  { name: "Users", href: "/admin/users", icon: Users },
  { name: "Studies", href: "/admin/studies", icon: FileText },
  { name: "Finance", href: "/admin/finance", icon: DollarSign },
  { name: "System", href: "/admin/system", icon: Settings },
];

export default function AdminLayout() {
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
          <img src={logo} alt="Logo" className="h-8 w-8 md:h-10 md:w-10 object-contain" />
          {!isMobile && (
            <div>
              <h1 className="text-xl md:text-2xl font-bold logo-text text-sidebar-foreground">
                ENCEPHLIAN
              </h1>
              <p className="text-xs text-muted-foreground">Admin Portal</p>
            </div>
          )}
        </div>
      </div>
      
      <nav className="flex-1 p-4 md:p-5 space-y-1">
        {navigation.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.href || location.pathname.startsWith(item.href + "/");
          return (
            <Link key={item.name} to={item.href} onClick={() => setMobileMenuOpen(false)}>
              <Button
                variant={isActive ? "secondary" : "ghost"}
                className={cn(
                  "w-full justify-start transition-all duration-150 h-10 md:h-11 text-sm font-medium",
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
        <Button
          variant="ghost"
          className="w-full justify-start h-11 transition-all duration-150"
          asChild
        >
          <Link to="/app/dashboard" onClick={() => setMobileMenuOpen(false)}>
            <LayoutDashboard className="mr-3 h-4 w-4" />
            <span>Neurologist Portal</span>
          </Link>
        </Button>

        {!isMobile && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="w-full justify-start h-11 md:h-12 hover:bg-sidebar-accent/50">
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
              <DropdownMenuLabel>Admin Account</DropdownMenuLabel>
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
          <Button
            variant="ghost"
            className="w-full justify-start h-11"
            onClick={() => {
              handleSignOut();
              setMobileMenuOpen(false);
            }}
          >
            <LogOut className="mr-3 h-4 w-4" />
            <span>Sign Out</span>
          </Button>
        )}
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-background w-full">
      {isMobile && (
        <header className="fixed top-0 left-0 right-0 z-50 h-16 bg-sidebar border-b border-sidebar-border flex items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <img src={logo} alt="Logo" className="h-8 w-8 object-contain" />
            <span className="logo-text text-sm tracking-wider">ENCEPHLIAN ADMIN</span>
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

      {!isMobile && (
        <div className="fixed inset-y-0 left-0 z-50 w-64 bg-sidebar border-r border-sidebar-border">
          <div className="flex flex-col h-full">
            <SidebarContent />
          </div>
        </div>
      )}

      <div className={cn(isMobile ? "pt-16" : "pl-64", "w-full")}>
        <main className="p-4 py-6 md:p-8 md:py-10 lg:p-12 lg:py-12 min-h-screen">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
