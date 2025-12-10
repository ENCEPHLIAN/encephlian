import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutDashboard,
  FileText,
  Building2,
  Users,
  Activity,
  Shield,
  Trash2,
  ScrollText,
  Settings,
  LogOut,
  Coins,
  MessageSquare,
  SendHorizontal,
  BarChart3,
  Calendar,
  Plug,
  UserCog,
  RotateCcw,
} from "lucide-react";

export default function AdminLayout() {
  const navigate = useNavigate();
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    const checkRole = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);
        setIsSuperAdmin(roles?.some(r => r.role === "super_admin") || false);
      }
    };
    checkRole();
  }, []);

  // Build nav items dynamically
  const adminNav = [
    { name: "Dashboard", href: "/admin", icon: LayoutDashboard, end: true },
    { name: "Studies", href: "/admin/studies", icon: FileText },
    { name: "Clinics", href: "/admin/clinics", icon: Building2 },
    { name: "Users", href: "/admin/users", icon: Users },
    { name: "Wallets", href: "/admin/wallets", icon: Coins },
    ...(!isSuperAdmin ? [{ name: "Tickets", href: "/admin/tickets", icon: MessageSquare }] : []),
    { name: "EEG Push", href: "/admin/eeg-push", icon: SendHorizontal },
    { name: "Health", href: "/admin/health", icon: Activity },
    { name: "Cleanup", href: "/admin/cleanup", icon: Trash2 },
    { name: "Restore", href: "/admin/restore", icon: RotateCcw },
    { name: "Audit Logs", href: "/admin/audit", icon: ScrollText },
    { name: "Analytics", href: "/admin/analytics", icon: BarChart3 },
    { name: "Scheduler", href: "/admin/scheduler", icon: Calendar },
    { name: "Integrations", href: "/admin/integrations", icon: Plug },
    { name: "Team", href: "/admin/team", icon: UserCog },
    { name: "Settings", href: "/admin/settings", icon: Settings },
    { name: "Account", href: "/admin/account", icon: Shield },
  ];

  const handleLogout = async () => {
    sessionStorage.removeItem("encephlian_admin_tfa");
    sessionStorage.removeItem("encephlian_admin_tfa_time");
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top Bar */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <span className="font-montserrat text-sm font-semibold tracking-tight">
                OPERATIONS CONTROL
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="ghost" size="icon" onClick={handleLogout} className="h-8 w-8">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1">
        {/* Sidebar */}
        <aside className="w-52 border-r bg-sidebar/50 p-3 space-y-1 overflow-y-auto">
          {adminNav.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.name}
                to={item.href}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                    "hover:bg-secondary hover:text-foreground",
                    isActive && "bg-secondary text-foreground font-medium"
                  )
                }
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                <span className="truncate">{item.name}</span>
              </NavLink>
            );
          })}
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6 overflow-auto">
          <Outlet />
        </main>
      </div>

      {/* Footer */}
      <footer className="border-t py-2 px-4">
        <p className="text-[10px] text-muted-foreground/50 text-center font-montserrat">
          ENCEPHLIAN OPS • INTERNAL USE ONLY
        </p>
      </footer>
    </div>
  );
}
