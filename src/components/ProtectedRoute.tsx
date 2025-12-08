import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Session, User } from "@supabase/supabase-js";
import { Loader2 } from "lucide-react";

export default function ProtectedRoute() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdminUser, setIsAdminUser] = useState<boolean | null>(null);

  useEffect(() => {
    const checkUserRole = async (userId: string) => {
      try {
        const { data: roles, error } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId);

        if (error) {
          console.error("Error checking user roles:", error);
          setIsAdminUser(false);
          return;
        }

        // Check if user has any admin roles
        const adminRoles = ["super_admin", "ops", "management"];
        const hasAdminRole = roles?.some(r => adminRoles.includes(r.role)) || false;
        console.log("User roles check:", roles, "Is admin:", hasAdminRole);
        setIsAdminUser(hasAdminRole);
      } catch (err) {
        console.error("Role check failed:", err);
        setIsAdminUser(false);
      }
    };

    const initializeAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        await checkUserRole(session.user.id);
      } else {
        setIsAdminUser(false);
      }
      setLoading(false);
    };

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        await checkUserRole(session.user.id);
      } else {
        setIsAdminUser(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Still loading auth state or role check
  if (loading || isAdminUser === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
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
