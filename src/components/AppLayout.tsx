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
import { LayoutDashboard, Upload, FileText, Wallet, Receipt, User, LogOut, Coins, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

const navigation = [
  { name: "Dashboard", href: "/app/dashboard", icon: LayoutDashboard },
  { name: "Upload", href: "/app/upload", icon: Upload },
  { name: "Studies", href: "/app/studies", icon: FileText },
  { name: "Wallet", href: "/app/wallet", icon: Wallet },
  { name: "Billing", href: "/app/billing", icon: Receipt },
];

export default function AppLayout() {
  const location = useLocation();
  const { toast } = useToast();
  const [userEmail, setUserEmail] = useState<string>("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserEmail(user.email || "");
      }
    });
  }, []);

  const { data: wallet } = useQuery({
    queryKey: ["wallet-balance"],
    queryFn: async () => {
      const { data } = await supabase.from("wallets").select("tokens").single();
      return data;
    }
  });

  const { data: earnings } = useQuery({
    queryKey: ["earnings-balance"],
    queryFn: async () => {
      const { data } = await supabase.from("earnings_wallets").select("balance_inr").single();
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

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <div className="fixed inset-y-0 left-0 z-50 w-64 bg-sidebar border-r border-sidebar-border">
        <div className="flex flex-col h-full">
          <div className="py-8 px-6 border-b border-sidebar-border">
            <h1 className="text-2xl font-semibold tracking-tight text-sidebar-foreground">
              Encephalian
            </h1>
            <p className="text-sm text-sidebar-foreground/50 mt-1">Neurologist Portal</p>
          </div>
          
          {/* Wallet Preview */}
          <div className="p-5 m-5 bg-sidebar-accent/50 border border-sidebar-border rounded-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Coins className="h-4 w-4 text-sidebar-foreground/50" />
                <span className="text-sm font-medium text-sidebar-foreground/70">Tokens</span>
              </div>
              <span className="text-xl font-semibold text-sidebar-foreground">{wallet?.tokens || 0}</span>
            </div>
            {earnings && (
              <div className="flex items-center justify-between pt-3 border-t border-sidebar-border/50">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-sidebar-foreground/50" />
                  <span className="text-sm font-medium text-sidebar-foreground/70">Earnings</span>
                </div>
                <span className="text-xl font-semibold text-sidebar-foreground">₹{earnings.balance_inr || 0}</span>
              </div>
            )}
          </div>
          
          <nav className="flex-1 p-5 space-y-1.5">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.href || location.pathname.startsWith(item.href + "/");
              return (
                <Link key={item.name} to={item.href}>
                  <Button
                    variant={isActive ? "secondary" : "ghost"}
                    className={cn(
                      "w-full justify-start transition-all duration-200 h-11 text-sm font-medium",
                      isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                    )}
                  >
                    <Icon className="mr-3 h-5 w-5" />
                    <span>{item.name}</span>
                  </Button>
                </Link>
              );
            })}
          </nav>

          <div className="p-5 border-t border-sidebar-border">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="w-full justify-start h-12 hover:bg-sidebar-accent/50">
                  <Avatar className="h-9 w-9 mr-3">
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
                <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="pl-64">
        <main className="p-12 min-h-screen">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
