import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Session, User } from '@supabase/supabase-js';

// Simple user session - one source of truth
interface UserSession {
  user: User | null;
  session: Session | null;
  userId: string | null;
  profile: {
    id: string;
    full_name: string | null;
    email: string;
    phone_number: string | null;
    medical_license_number: string | null;
    specialization: string | null;
    department: string | null;
    hospital_affiliation: string | null;
    credentials: string | null;
    role: string;
  } | null;
  clinicContext: {
    clinic_id: string | null;
    clinic_name: string | null;
    brand_name: string | null;
    logo_url: string | null;
    primary_color: string | null;
    secondary_color: string | null;
    role: string | null;
  } | null;
  roles: string[];
  isAdmin: boolean;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface UserSessionContextType extends UserSession {
  refreshSession: () => Promise<void>;
  signOut: () => Promise<void>;
}

const UserSessionContext = createContext<UserSessionContextType | undefined>(undefined);

const ADMIN_ROLES = ['super_admin', 'management'];

export function UserSessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<UserSession>({
    user: null,
    session: null,
    userId: null,
    profile: null,
    clinicContext: null,
    roles: [],
    isAdmin: false,
    isLoading: true,
    isAuthenticated: false,
  });

  const loadUserData = useCallback(async (user: User) => {
    try {
      // Parallel fetch all user data
      const [profileResult, clinicResult, rolesResult] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
        supabase.from('user_clinic_context').select('*').maybeSingle(),
        supabase.from('user_roles').select('role').eq('user_id', user.id),
      ]);

      const profile = profileResult.data;
      const clinicContext = clinicResult.data;
      const rolesArray = (rolesResult.data || []).map(r => r.role);
      const isAdmin = rolesArray.some(r => ADMIN_ROLES.includes(r));

      setState({
        user,
        session: null,
        userId: user.id,
        profile,
        clinicContext,
        roles: rolesArray,
        isAdmin,
        isLoading: false,
        isAuthenticated: true,
      });
    } catch (error) {
      console.error('Failed to load user data:', error);
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  const clearSession = useCallback(() => {
    setState({
      user: null,
      session: null,
      userId: null,
      profile: null,
      clinicContext: null,
      roles: [],
      isAdmin: false,
      isLoading: false,
      isAuthenticated: false,
    });
  }, []);

  useEffect(() => {
    let mounted = true;

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      
      if (session?.user) {
        loadUserData(session.user);
      } else {
        setState(prev => ({ ...prev, isLoading: false }));
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      if (event === 'SIGNED_OUT') {
        clearSession();
        return;
      }

      if (event === 'SIGNED_IN' && session?.user) {
        loadUserData(session.user);
        return;
      }

      if (event === 'TOKEN_REFRESHED' && session) {
        setState(prev => ({ ...prev, session }));
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadUserData, clearSession]);

  const refreshSession = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      await loadUserData(session.user);
    }
  }, [loadUserData]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    clearSession();
  }, [clearSession]);

  return (
    <UserSessionContext.Provider value={{ ...state, refreshSession, signOut }}>
      {children}
    </UserSessionContext.Provider>
  );
}

export function useUserSession() {
  const context = useContext(UserSessionContext);
  if (context === undefined) {
    throw new Error('useUserSession must be used within a UserSessionProvider');
  }
  return context;
}

// Convenience hooks
export function useUserId(): string | null {
  const { userId } = useUserSession();
  return userId;
}

export function useIsAuthenticated(): boolean {
  const { isAuthenticated } = useUserSession();
  return isAuthenticated;
}

export function useIsAdmin(): boolean {
  const { isAdmin } = useUserSession();
  return isAdmin;
}
