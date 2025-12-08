import { useEffect, useState, useCallback } from "react";
import { Navigate, Outlet, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import AdminTFAGate, { useAdminTFA } from "./AdminTFAGate";

export default function AdminRoute() {
  const navigate = useNavigate();
  const [authState, setAuthState] = useState<"loading" | "unauthenticated" | "admin" | "not-admin">("loading");
  const { isVerified, needsVerification, verify, clearTFA } = useAdminTFA();

  const handleLogout = useCallback(async () => {
    clearTFA();
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  }, [clearTFA, navigate]);

  useEffect(() => {
    const checkAdminStatus = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          setAuthState("unauthenticated");
          return;
        }

        // Check if user has admin role - fetch ALL roles for this user
        const { data: roles, error } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);

        if (error) {
          console.error("Error checking roles:", error);
          setAuthState("not-admin");
          return;
        }

        // Check if any of the roles are admin roles - includes management
        const adminRoles = ["super_admin", "ops", "management"];
        const hasAdminRole = roles?.some(r => adminRoles.includes(r.role));
        
        console.log("AdminRoute - User roles:", roles, "Has admin role:", hasAdminRole);
        setAuthState(hasAdminRole ? "admin" : "not-admin");
      } catch (error) {
        console.error("Admin check error:", error);
        setAuthState("unauthenticated");
      }
    };

    checkAdminStatus();
  }, []);

  if (authState === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Not logged in - redirect to login
  if (authState === "unauthenticated") {
    return <Navigate to="/login" replace />;
  }

  // Logged in but not admin - redirect to PaaS
  if (authState === "not-admin") {
    return <Navigate to="/app/dashboard" replace />;
  }

  // Show TFA gate if not verified - required for all admin users
  if (needsVerification && !isVerified) {
    return <AdminTFAGate onVerified={verify} onLogout={handleLogout} />;
  }

  return <Outlet />;
}
