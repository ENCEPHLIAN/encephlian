import { lazy, Suspense } from "react";
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

// -----------------------------------------------------------------------------
// AdminIndexByRole — picks between the cross-clinic AdminDashboard
// (super_admin) and the per-clinic ManagementDashboard (management, not
// super_admin). Mounted as the index child of /admin so the role-aware
// branch lives next to the route guard, per design §2 + §11.
// -----------------------------------------------------------------------------

const AdminDashboard      = lazy(() => import("@/pages/admin/AdminDashboard"));
const ManagementDashboard = lazy(() => import("@/pages/admin/ManagementDashboard"));

function AdminIndexLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}

export function AdminIndexByRole() {
  const { roles } = useUserSession();
  const isSuperAdmin = roles.includes("super_admin");
  const isManagement = roles.includes("management");

  // Canonical roles only: super_admin, management, clinician. AdminRoute
  // already filters out clinicians, so by here we are one of the two.
  if (isManagement && !isSuperAdmin) {
    return (
      <Suspense fallback={<AdminIndexLoader />}>
        <ManagementDashboard />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<AdminIndexLoader />}>
      <AdminDashboard />
    </Suspense>
  );
}
