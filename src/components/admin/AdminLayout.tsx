import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  LayoutDashboard,
  FileText,
  Building2,
  Users,
  Activity,
  ArrowLeft,
  Shield,
  Trash2,
  ScrollText,
} from "lucide-react";

const adminNav = [
  { name: "Dashboard", href: "/admin", icon: LayoutDashboard, end: true },
  { name: "Studies", href: "/admin/studies", icon: FileText },
  { name: "Clinics", href: "/admin/clinics", icon: Building2 },
  { name: "Users", href: "/admin/users", icon: Users },
  { name: "Health", href: "/admin/health", icon: Activity },
  { name: "Cleanup", href: "/admin/cleanup", icon: Trash2 },
  { name: "Audit Logs", href: "/admin/audit", icon: ScrollText },
];

export default function AdminLayout() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top Bar */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/app/dashboard")}
              className="h-8 w-8"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <span className="font-mono text-sm font-semibold tracking-tight">
                OPERATIONS CONTROL
              </span>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1">
        {/* Sidebar */}
        <aside className="w-48 border-r bg-sidebar/50 p-3 space-y-1">
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
                <Icon className="h-4 w-4" />
                {item.name}
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
        <p className="text-[10px] text-muted-foreground/50 text-center font-mono">
          ENCEPHLIAN OPS • INTERNAL USE ONLY
        </p>
      </footer>
    </div>
  );
}
