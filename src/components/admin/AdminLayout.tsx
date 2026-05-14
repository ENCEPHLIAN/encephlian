import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useUserSession } from "@/contexts/UserSessionContext";
// ClinicSelectorDropdown removed from sidebar per user request - can be added to individual pages if needed
import {
  LayoutDashboard,
  Building2,
  Users,
  Activity,
  ScrollText,
  Settings,
  LogOut,
  Coins,
  SendHorizontal,
  Zap,
  Shield,
  Wrench,
  BarChart3,
  BookOpen,
  Trash2,
  RotateCcw,
  Ticket,
  Cloud,
  TrendingUp,
} from "lucide-react";

const NAV_SECTIONS = [
  {
    title: "Overview",
    items: [
      { name: "Dashboard", href: "/admin", icon: LayoutDashboard, end: true },
    ],
  },
  {
    title: "Value Units",
    items: [
      { name: "Clinics", href: "/admin/clinics", icon: Building2 },
      { name: "Users", href: "/admin/users", icon: Users },
      { name: "Wallets", href: "/admin/wallets", icon: Coins },
    ],
  },
  {
    title: "Pipeline",
    items: [
      { name: "Studies", href: "/admin/studies", icon: BarChart3 },
      { name: "Read API", href: "/admin/read-api", icon: Zap },
    ],
  },
  {
    title: "Operations",
    items: [
      { name: "Health", href: "/admin/health", icon: Activity },
      { name: "Infrastructure", href: "/admin/infra", icon: Cloud },
      { name: "Finance", href: "/admin/finance", icon: TrendingUp },
      { name: "Diagnostics", href: "/admin/diagnostics", icon: Wrench },
      { name: "Audit Logs", href: "/admin/audit", icon: ScrollText },
      { name: "Tickets", href: "/admin/tickets", icon: Ticket },
    ],
  },
  {
    title: "Tools",
    items: [
      { name: "EEG Push", href: "/admin/eeg-push", icon: SendHorizontal },
      { name: "Cleanup", href: "/admin/cleanup", icon: Trash2 },
      { name: "Restore", href: "/admin/restore", icon: RotateCcw },
    ],
  },
  {
    title: "System",
    items: [
      { name: "Settings", href: "/admin/settings", icon: Settings },
      { name: "Account", href: "/admin/account", icon: Shield },
      { name: "Docs", href: "/admin/docs", icon: BookOpen },
    ],
  },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut } = useUserSession();

  const currentPage = useMemo(() => {
    for (const section of NAV_SECTIONS) {
      for (const item of section.items) {
        if (location.pathname === item.href ||
            (item.href !== "/admin" && location.pathname.startsWith(item.href))) {
          return { section: section.title, name: item.name };
        }
      }
    }
    return { section: "Overview", name: "Dashboard" };
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-56 border-r border-border/50 bg-sidebar-background flex flex-col">
        {/* Header */}
        <div className="flex h-14 items-center px-4 border-b border-border/50">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded bg-primary/10 flex items-center justify-center">
              <Zap className="h-3.5 w-3.5 text-primary" />
            </div>
            <span className="text-sm font-semibold tracking-tight">Encephlian Admin</span>
          </div>
        </div>


        {/* Navigation */}
        <div className="flex-1 overflow-y-auto py-3">
          {NAV_SECTIONS.map((section) => (
            <div key={section.title} className="mb-4">
              <div className="px-4 mb-1.5">
                <span className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider">
                  {section.title}
                </span>
              </div>
              <nav className="px-2 space-y-0.5">
                {section.items.map((item) => (
                  <NavLink
                    key={item.href}
                    to={item.href}
                    end={item.end}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                        isActive
                          ? "bg-accent text-accent-foreground font-medium"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                      )
                    }
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span>{item.name}</span>
                  </NavLink>
                ))}
              </nav>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-border/50">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-muted-foreground hover:text-foreground"
            onClick={async () => {
              await signOut();
              navigate("/login");
            }}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="h-14 border-b border-border/50 bg-background/80 backdrop-blur-sm flex items-center justify-between px-6">
          <nav className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-label="Breadcrumb">
            <span className="font-medium text-foreground/70">Admin</span>
            <span className="text-border">/</span>
            <span>{currentPage.section}</span>
            <span className="text-border">/</span>
            <span className="font-semibold text-foreground">{currentPage.name}</span>
          </nav>
          <ThemeToggle />
        </header>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          <div className="p-6">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
