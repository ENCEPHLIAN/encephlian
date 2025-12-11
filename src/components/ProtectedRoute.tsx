import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useUserSession } from "@/contexts/UserSessionContext";

/**
 * ProtectedRoute - Guards PaaS routes (clinician only)
 * 
 * - Not authenticated -> /login
 * - Admin users -> /admin (they don't belong in PaaS)
 * - Clinicians -> allow access
 */
export default function ProtectedRoute() {
  const { isLoading, isAuthenticated, isAdmin } = useUserSession();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Admin users go to /admin, not PaaS
  if (isAdmin) {
    return <Navigate to="/admin" replace />;
  }

  return <Outlet />;
}
