import { useEffect, useState, useCallback, useRef } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Session, User } from "@supabase/supabase-js";
import { Loader2 } from "lucide-react";

export default function ProtectedRoute() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdminUser, setIsAdminUser] = useState<boolean | null>(null);
  const initialized = useRef(false);

  const checkUserRole = useCallback(async (userId: string) => {
    try {
      const { data: roles, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);

      if (error) {
        console.error("Error checking user roles:", error);
        return false;
      }

      // Check if user has any admin roles
      const adminRoles = ["super_admin", "ops", "management"];
      const hasAdminRole = roles?.some(r => adminRoles.includes(r.role)) || false;
      return hasAdminRole;
    } catch (err) {
      console.error("Role check failed:", err);
      return false;
    }
  }, []);

  useEffect(() => {
    // Prevent double initialization
    if (initialized.current) return;
    initialized.current = true;

    const initializeAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          const isAdmin = await checkUserRole(session.user.id);
          setIsAdminUser(isAdmin);
        } else {
          setIsAdminUser(false);
        }
      } catch (error) {
        console.error("Auth initialization error:", error);
        setIsAdminUser(false);
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        const isAdmin = await checkUserRole(session.user.id);
        setIsAdminUser(isAdmin);
      } else {
        setIsAdminUser(false);
      }
    });

    return () => subscription.unsubscribe();
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
    return <Navigate to="/login" replace />;
  }

  // Block admin users from PaaS - redirect them to admin
  if (isAdminUser) {
    return <Navigate to="/admin" replace />;
  }

  return <Outlet />;
}
