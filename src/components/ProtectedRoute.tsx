import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useUserSession } from "@/contexts/UserSessionContext";

export default function ProtectedRoute() {
  const { isLoading, isAuthenticated, isAdmin } = useUserSession();
  const location = useLocation();

  // Still loading - show spinner, don't redirect yet
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Not authenticated - redirect to login
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Admin users should not access PaaS routes - redirect to admin
  // Only redirect if NOT already coming from admin (prevents loops)
  if (isAdmin && !location.pathname.startsWith('/admin')) {
    return <Navigate to="/admin" replace />;
  }

  return <Outlet />;
}