import { Navigate, Outlet, useNavigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import AdminTFAGate, { useAdminTFA } from "./AdminTFAGate";
import { useUserSession } from "@/contexts/UserSessionContext";

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

  // Not logged in - redirect to login
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Logged in but not admin - redirect to PaaS
  if (!isAdmin) {
    return <Navigate to="/app/dashboard" replace />;
  }

  // Show TFA gate if not verified - required for all admin users
  if (needsVerification && !isVerified) {
    return <AdminTFAGate onVerified={verify} onLogout={handleLogout} />;
  }

  return <Outlet />;
}
