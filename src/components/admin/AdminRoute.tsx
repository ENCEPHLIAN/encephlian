import { useEffect, useState, useCallback, useRef } from "react";
import { Navigate, Outlet, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import AdminTFAGate, { useAdminTFA } from "./AdminTFAGate";

// Global cache to prevent re-checking on every route change
let cachedAdminCheck: { userId: string; isAdmin: boolean; timestamp: number } | null = null;
const CACHE_DURATION = 60000; // 1 minute

export default function AdminRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  const [authState, setAuthState] = useState<"loading" | "unauthenticated" | "admin" | "not-admin">("loading");
  const { isVerified, needsVerification, verify, clearTFA } = useAdminTFA();
  const initializedRef = useRef(false);
  const checkingRef = useRef(false);

  const handleLogout = useCallback(async () => {
    clearTFA();
    cachedAdminCheck = null;
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  }, [clearTFA, navigate]);

  useEffect(() => {
    // Prevent multiple initializations
    if (initializedRef.current) return;
    initializedRef.current = true;

    let mounted = true;

    const checkAdminStatus = async () => {
      // Prevent concurrent checks
      if (checkingRef.current) return;
      checkingRef.current = true;

      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!mounted) return;
        
        if (!user) {
          setAuthState("unauthenticated");
          return;
        }

        // Check cache first
        if (cachedAdminCheck && 
            cachedAdminCheck.userId === user.id && 
            Date.now() - cachedAdminCheck.timestamp < CACHE_DURATION) {
          setAuthState(cachedAdminCheck.isAdmin ? "admin" : "not-admin");
          return;
        }

        // Check if user has admin role
        const { data: roles, error } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);

        if (!mounted) return;

        if (error) {
          console.error("Error checking roles:", error);
          setAuthState("not-admin");
          return;
        }

        const adminRoles = ["super_admin", "management"];
        const hasAdminRole = roles?.some(r => adminRoles.includes(r.role)) || false;
        
        // Cache the result
        cachedAdminCheck = { userId: user.id, isAdmin: hasAdminRole, timestamp: Date.now() };
        
        setAuthState(hasAdminRole ? "admin" : "not-admin");
      } catch (error) {
        console.error("Admin check error:", error);
        if (mounted) setAuthState("unauthenticated");
      } finally {
        checkingRef.current = false;
      }
    };

    checkAdminStatus();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (!mounted) return;
      
      // Only respond to SIGNED_OUT
      if (event === "SIGNED_OUT") {
        cachedAdminCheck = null;
        setAuthState("unauthenticated");
      }
      // Ignore other events to prevent loops
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
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
    return <Navigate to="/login" replace state={{ from: location }} />;
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
