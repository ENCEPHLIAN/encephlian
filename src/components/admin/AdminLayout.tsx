import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useUserSession } from "@/contexts/UserSessionContext";
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
  RotateCcw,
  ClipboardList,
} from "lucide-react";

export default function AdminLayout() {
  const navigate = useNavigate();
  const { roles, signOut } = useUserSession();

  const isSuperAdmin = useMemo(() => roles.includes("super_admin"), [roles]);

  // Build nav items dynamically
  const adminNav = useMemo(
    () => [
      { name: "Dashboard", href: "/admin", icon: LayoutDashboard, end: true },
      { name: "Control", href: "/admin/control", icon: Shield },
      { name: "Studies", href: "/admin/studies", icon: FileText },
      { name: "Clinics", href: "/admin/clinics", icon: Building2 },
      { name: "Users", href: "/admin/users", icon: Users },
      { name: "Wallets", href: "/admin/wallets", icon: Coins },
      ...(!isSuperAdmin ? [{ name: "Tickets", href: "/admin/tickets", icon: MessageSquare }] : []),
      { name: "EEG Push", href: "/admin/eeg-push", icon: SendHorizontal },
      { name: "Health", href: "/admin/health", icon: Activity },
      { name: "Diagnostics", href: "/admin/diagnostics", icon: Activity },
      { name: "Report v0", href: "/admin/report-v0", icon: ClipboardList },
      { name: "Cleanup", href: "/admin/cleanup", icon: Trash2 },
      { name: "Restore", href: "/admin/restore", icon: RotateCcw },
      { name: "Audit Logs", href: "/admin/audit", icon: ScrollText },
      { name: "Settings", href: "/admin/settings", icon: Settings },
      { name: "Account", href: "/admin/account", icon: Shield },
    ],
    [isSuperAdmin],
  );

  const groupedNav = useMemo(() => {
    const byHref = (h: string) => adminNav.find((x) => x.href === h);

    const sections = [
      {
        title: "Core",
        items: ["/admin", "/admin/control", "/admin/studies"],
      },
      {
        title: "Tenant",
        items: ["/admin/clinics", "/admin/users", "/admin/account"],
      },
      {
        title: "Finance",
        items: ["/admin/wallets", "/admin/tickets"],
      },
      {
        title: "Ops",
        items: ["/admin/health", "/admin/diagnostics", "/admin/eeg-push", "/admin/read-api", "/admin/report-v0"],
      },
      {
        title: "Insights",
        items: ["/admin/audit"],
      },
      {
        title: "System",
        items: ["/admin/cleanup", "/admin/restore", "/admin/settings"],
      },
    ];

    const groups = sections
      .map((sec) => ({ title: sec.title, items: sec.items.map(byHref).filter(Boolean) }))
      .filter((sec) => sec.items.length > 0);

    // Any ungrouped routes are dumped into "More"
    const groupedHrefs = new Set(sections.flatMap((s) => s.items));
    const extras = adminNav.filter((x) => !groupedHrefs.has(x.href)).map((x) => x.href);
    if (extras.length) groups.push({ title: "More", items: extras.map(byHref).filter(Boolean) });

    return groups as { title: string; items: any[] }[];
  }, [adminNav]);

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="w-64 border-r bg-background/60 backdrop-blur">
        <div className="flex h-16 items-center justify-between px-4 border-b">
          <div className="font-semibold tracking-tight">Admin</div>
          <ThemeToggle />
        </div>

        <div className="p-3 space-y-4">
          {groupedNav.map((group) => (
            <div key={group.title}>
              <div className="px-2 pb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {group.title}
              </div>

              <nav className="space-y-1">
                {group.items.map((item: any) => (
                  <NavLink
                    key={item.href}
                    to={item.href}
                    end={item.end}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                        isActive ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
                      )
                    }
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.name}</span>
                  </NavLink>
                ))}
              </nav>
            </div>
          ))}
        </div>

        <div className="mt-auto p-3 border-t">
          <Button
            variant="outline"
            className="w-full justify-start"
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

      <main className="flex-1">
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
