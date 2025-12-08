import { useEffect, useState, useCallback } from "react";
import { Navigate, Outlet, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import AdminTFAGate, { useAdminTFA } from "./AdminTFAGate";

export default function AdminRoute() {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
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
          setIsAdmin(false);
          setLoading(false);
          return;
        }

        // Check if user has admin role - fetch ALL roles for this user
        const { data: roles, error } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);

        if (error) {
          console.error("Error checking roles:", error);
          setIsAdmin(false);
          setLoading(false);
          return;
        }

        // Check if any of the roles are admin roles
        const adminRoles = ["super_admin", "ops", "management"];
        const hasAdminRole = roles?.some(r => adminRoles.includes(r.role));
        
        console.log("User roles:", roles, "Has admin role:", hasAdminRole);
        setIsAdmin(hasAdminRole);
      } catch (error) {
        console.error("Admin check error:", error);
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    };

    checkAdminStatus();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/app/dashboard" replace />;
  }

  // Show TFA gate if not verified
  if (needsVerification && !isVerified) {
    return <AdminTFAGate onVerified={verify} onLogout={handleLogout} />;
  }

  return <Outlet />;
}
