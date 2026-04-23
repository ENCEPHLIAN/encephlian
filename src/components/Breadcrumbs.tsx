import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChevronRight, Home, ArrowLeft, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useState, useMemo } from "react";
import { useStudyBreadcrumb } from "@/contexts/StudyBreadcrumbContext";

const UUID_SEG = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function Breadcrumbs() {
  const location = useLocation();
  const navigate = useNavigate();
  const pathnames = location.pathname.split("/").filter((x) => x);
  const [isExpanded, setIsExpanded] = useState(false);
  const { activeStudyLabel } = useStudyBreadcrumb();

  const studyTailLabel = useMemo(() => {
    if (pathnames[0] !== "app" || pathnames[1] !== "studies") return null;
    const seg = pathnames[2];
    if (!seg || !UUID_SEG.test(seg) || pathnames.length > 3) return null;
    return activeStudyLabel || "Study";
  }, [pathnames, activeStudyLabel]);

  const breadcrumbNames: Record<string, string> = {
    app: "Dashboard",
    dashboard: "Dashboard",
    studies: "Studies",
    lanes: "Lanes",
    viewer: "EEG Viewer",
    files: "Files",
    wallet: "Wallet",
    profile: "Profile",
    settings: "Settings",
    notes: "Notes",
    support: "Support",
  };

  const showBackButton = location.pathname !== "/app/dashboard";
  
  if (pathnames.length <= 1 && !showBackButton) return null;

  // Collapsed view - just back button and current page
  const rawTail = pathnames[pathnames.length - 1];
  const currentPage =
    studyTailLabel && pathnames.length === 3 && pathnames[1] === "studies"
      ? studyTailLabel
      : breadcrumbNames[rawTail] || rawTail;

  return (
    <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
      {showBackButton && (
        <Button 
          variant="ghost" 
          size="sm"
          onClick={() => navigate(-1)}
          className="gap-1.5 h-8 px-2"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Back</span>
        </Button>
      )}
      
      {/* Always show home icon */}
      <Link 
        to="/app/dashboard" 
        className="hover:text-foreground transition-colors flex items-center gap-1"
        title="Home"
      >
        <Home className="h-4 w-4" />
      </Link>
      
      {/* Show rest of breadcrumb if more than just app */}
      {pathnames.length > 1 && (
        <>
          <ChevronRight className="h-4 w-4" />
          
          {isExpanded ? (
            // Expanded view - full breadcrumb trail
            <div className="flex items-center gap-2">
              {pathnames.slice(1).map((pathname, index) => {
                const routeTo = `/${pathnames.slice(0, index + 2).join("/")}`;
                const isLast = index === pathnames.length - 2;
                const isStudyUuid =
                  index === 1 &&
                  pathnames[0] === "app" &&
                  pathnames[1] === "studies" &&
                  UUID_SEG.test(pathname);
                const displayName = isStudyUuid
                  ? (studyTailLabel || "Study")
                  : breadcrumbNames[pathname] || pathname;

                return (
                  <div key={routeTo} className="flex items-center gap-2">
                    {index > 0 && <ChevronRight className="h-4 w-4" />}
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
              
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 ml-1"
                onClick={() => setIsExpanded(false)}
              >
                <ChevronDown className="h-3 w-3 rotate-180" />
              </Button>
            </div>
          ) : (
            // Collapsed view - just current page with expand option
            <button
              onClick={() => setIsExpanded(true)}
              className="flex items-center gap-1.5 hover:text-foreground transition-colors"
            >
              <span className="font-medium text-foreground">{currentPage}</span>
              <ChevronDown className="h-3 w-3" />
            </button>
          )}
        </>
      )}
    </nav>
  );
}