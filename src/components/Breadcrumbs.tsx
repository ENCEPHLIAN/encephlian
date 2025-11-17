import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChevronRight, Home, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export default function Breadcrumbs() {
  const location = useLocation();
  const navigate = useNavigate();
  const pathnames = location.pathname.split("/").filter((x) => x);

  const breadcrumbNames: Record<string, string> = {
    app: "Dashboard",
    dashboard: "Dashboard",
    studies: "Studies",
    viewer: "EEG Viewer",
    files: "Files",
    wallet: "Wallet",
    profile: "Profile",
    settings: "Settings",
  };

  const showBackButton = location.pathname !== "/app/dashboard";
  
  if (pathnames.length <= 1 && !showBackButton) return null;

  return (
    <nav className="flex items-center space-x-2 text-sm text-muted-foreground mb-6">
      {showBackButton && (
        <>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => navigate(-1)}
            className="gap-2 h-8"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back</span>
          </Button>
          {pathnames.length > 1 && <ChevronRight className="h-4 w-4" />}
        </>
      )}
      <Link 
        to="/app/dashboard" 
        className="hover:text-foreground transition-colors flex items-center gap-1"
      >
        <Home className="h-4 w-4" />
      </Link>
      
      {pathnames.slice(1).map((pathname, index) => {
        const routeTo = `/${pathnames.slice(0, index + 2).join("/")}`;
        const isLast = index === pathnames.length - 2;
        const displayName = breadcrumbNames[pathname] || pathname;

        return (
          <div key={routeTo} className="flex items-center gap-2">
            <ChevronRight className="h-4 w-4" />
            {isLast ? (
              <span className="font-medium text-foreground">{displayName}</span>
            ) : (
              <Link 
                to={routeTo}
                className="hover:text-foreground transition-colors"
              >
                {displayName}
              </Link>
            )}
          </div>
        );
      })}
    </nav>
  );
}
