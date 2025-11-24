import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
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
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useIsMobile } from "@/hooks/use-mobile";
import CommandPalette from "@/components/CommandPalette";
import EditableBranding from "@/components/EditableBranding";
import Breadcrumbs from "@/components/Breadcrumbs";
import { QuickTipsDialog } from "@/components/QuickTipsDialog";

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

function OpenAISidebar() {
  const location = useLocation();

  return (
    <nav className="hidden md:flex w-52 flex-col pt-8 pr-10 text-sm text-muted-foreground gap-1.5">
      {navigation.map((item) => {
        const active = location.pathname.startsWith(item.href);
        const Icon = item.icon;

        return (
          <NavLink
            key={item.name}
            to={item.href}
            className={cn(
              "flex items-center justify-between rounded-full px-0 py-1 transition-colors",
              "hover:text-foreground",
              active && "text-foreground font-medium",
            )}
          >
            <span className="flex items-center gap-2">
              {Icon && <Icon className="h-4 w-4" />}
              {item.name}
            </span>
            {item.badge && (
              <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-[11px] leading-none text-secondary-foreground">
                {item.badge}
              </span>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}

function AppLayoutContent() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [userName, setUserName] = useState<string>("");
  const [commandOpen, setCommandOpen] = useState(false);
  useIsMobile(); // keep hook handy, not critical for layout here

  // profile data
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

  // clinic / logo context
  const { data: clinicContext } = useQuery({
    queryKey: ["clinic-context"],
    queryFn: async () => {
      const { data } = await supabase.from("user_clinic_context").select("*").single();
      return data;
    },
  });

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast({
      title: "Signed out",
      description: "You have been successfully signed out.",
    });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* APP BAR – sticky, full-width, does NOT move horizontally */}
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Left: logo + company name (top-left corner relative to content) */}
          <EditableBranding
            companyName={profile?.company_name || "ENCEPHLIAN"}
            logoUrl={clinicContext?.logo_url}
            logoClassName="h-8 w-8"
          />

          {/* Right: search + actions cluster */}
          <div className="flex items-center gap-2 sm:gap-3">
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

      {/* BODY – OpenAI-style: centered content with a left nav column */}
      <div className="mx-auto flex max-w-6xl px-4 sm:px-6 lg:px-8">
        {/* Left navigation – OpenAI-style sidebar (static, no push/pull) */}
        <OpenAISidebar />

        {/* Main content area */}
        <main className="flex-1 pt-8 pb-10">
          {/* Use your existing container but remove extra horizontal padding */}
          <div className="openai-container px-0">
            <Breadcrumbs />
            <Outlet />
          </div>
        </main>
      </div>

      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
    </div>
  );
}

export default function AppLayout() {
  // SidebarProvider no longer needed because we’re not using the shadcn Sidebar here.
  return <AppLayoutContent />;
}
