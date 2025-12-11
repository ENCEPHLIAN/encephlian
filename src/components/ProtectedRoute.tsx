import { useEffect, useState, useCallback, useRef } from "react";
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
  const initializedRef = useRef(false);
  const checkingRoleRef = useRef(false);

  const checkUserRole = useCallback(async (userId: string): Promise<boolean> => {
    // Prevent concurrent role checks
    if (checkingRoleRef.current) {
      // If already checking, wait for cache to be populated
      await new Promise(resolve => setTimeout(resolve, 100));
      if (cachedRoleCheck?.userId === userId) {
        return cachedRoleCheck.isAdmin;
      }
    }

    // Check cache first
    if (cachedRoleCheck && 
        cachedRoleCheck.userId === userId && 
        Date.now() - cachedRoleCheck.timestamp < CACHE_DURATION) {
      return cachedRoleCheck.isAdmin;
    }

    checkingRoleRef.current = true;

    try {
      const { data: roles, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);

      if (error) {
        console.error("Error checking user roles:", error);
        return false;
      }

      const adminRoles = ["super_admin", "management"];
      const hasAdminRole = roles?.some(r => adminRoles.includes(r.role)) || false;
      
      // Cache the result
      cachedRoleCheck = { userId, isAdmin: hasAdminRole, timestamp: Date.now() };
      
      return hasAdminRole;
    } catch (err) {
      console.error("Role check failed:", err);
      return false;
    } finally {
      checkingRoleRef.current = false;
    }
  }, []);

  useEffect(() => {
    // Prevent multiple initializations
    if (initializedRef.current) return;
    initializedRef.current = true;

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
      
      // Only respond to actual sign out events
      if (event === "SIGNED_OUT") {
        cachedRoleCheck = null;
        setSession(null);
        setUser(null);
        setIsAdminUser(false);
        return;
      }
      
      // For SIGNED_IN, update state but use cache for role
      if (event === "SIGNED_IN" && session?.user) {
        setSession(session);
        setUser(session.user);
        const isAdmin = await checkUserRole(session.user.id);
        if (mounted) setIsAdminUser(isAdmin);
      }
      // Ignore TOKEN_REFRESHED and other events to prevent loops
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
