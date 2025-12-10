import { useEffect, useState, useCallback } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Session, User } from "@supabase/supabase-js";
import { Loader2 } from "lucide-react";

// Global cache to prevent re-checking on every route change
let cachedRoleCheck: { userId: string; isAdmin: boolean; timestamp: number } | null = null;
const CACHE_DURATION = 60000; // 1 minute

export default function ProtectedRoute() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdminUser, setIsAdminUser] = useState<boolean | null>(null);
  const location = useLocation();

  const checkUserRole = useCallback(async (userId: string): Promise<boolean> => {
    // Check cache first
    if (cachedRoleCheck && 
        cachedRoleCheck.userId === userId && 
        Date.now() - cachedRoleCheck.timestamp < CACHE_DURATION) {
      return cachedRoleCheck.isAdmin;
    }

    try {
      const { data: roles, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);

      if (error) {
        console.error("Error checking user roles:", error);
        return false;
      }

      const adminRoles = ["super_admin", "ops", "management"];
      const hasAdminRole = roles?.some(r => adminRoles.includes(r.role)) || false;
      
      // Cache the result
      cachedRoleCheck = { userId, isAdmin: hasAdminRole, timestamp: Date.now() };
      
      return hasAdminRole;
    } catch (err) {
      console.error("Role check failed:", err);
      return false;
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!mounted) return;
        
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          const isAdmin = await checkUserRole(session.user.id);
          if (mounted) setIsAdminUser(isAdmin);
        } else {
          if (mounted) setIsAdminUser(false);
        }
      } catch (error) {
        console.error("Auth initialization error:", error);
        if (mounted) setIsAdminUser(false);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      
      setSession(session);
      setUser(session?.user ?? null);
      
      if (event === "SIGNED_OUT") {
        cachedRoleCheck = null; // Clear cache on sign out
        setIsAdminUser(false);
        return;
      }
      
      if (session?.user) {
        const isAdmin = await checkUserRole(session.user.id);
        if (mounted) setIsAdminUser(isAdmin);
      } else {
        if (mounted) setIsAdminUser(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [checkUserRole]);

  // Still loading auth state or role check
  if (loading || isAdminUser === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!session || !user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Block admin users from PaaS - redirect them to admin
  if (isAdminUser) {
    return <Navigate to="/admin" replace />;
  }

  return <Outlet />;
}
