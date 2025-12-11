import { Navigate, Outlet, useNavigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import AdminTFAGate, { useAdminTFA } from "./AdminTFAGate";
import { useUserSession } from "@/contexts/UserSessionContext";

/**
 * AdminRoute - Guards /admin routes (management & super_admin only)
 * 
 * - Not authenticated -> /login
 * - Not admin (clinician) -> /app/dashboard
 * - Admin without TFA -> show TFA gate
 * - Admin with TFA verified -> allow access
 */
export default function AdminRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isLoading, isAuthenticated, isAdmin, signOut } = useUserSession();
  const { isVerified, needsVerification, verify, clearTFA } = useAdminTFA();

  const handleLogout = async () => {
    clearTFA();
    await signOut();
    navigate("/login", { replace: true });
  };

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

  // Clinicians go to PaaS, not admin
  if (!isAdmin) {
    return <Navigate to="/app/dashboard" replace />;
  }

  // TFA gate for admin users
  if (needsVerification && !isVerified) {
    return <AdminTFAGate onVerified={verify} onLogout={handleLogout} />;
  }

  return <Outlet />;
}
