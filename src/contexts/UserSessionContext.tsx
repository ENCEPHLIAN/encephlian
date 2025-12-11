import { createContext, useContext, useEffect, useState, useRef, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Session, User } from '@supabase/supabase-js';

// Unified user session - loads ONCE on auth, used by all pages
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

// Cache to prevent duplicate loads
let sessionCache: { userId: string; data: Partial<UserSession>; timestamp: number } | null = null;
const CACHE_DURATION = 60000; // 1 minute

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

  const mountedRef = useRef(true);
  const loadingRef = useRef(false);
  const initRef = useRef(false);

  const loadUserData = useCallback(async (user: User) => {
    // Check cache first
    if (sessionCache && sessionCache.userId === user.id && Date.now() - sessionCache.timestamp < CACHE_DURATION) {
      if (mountedRef.current) {
        setState(prev => ({
          ...prev,
          ...sessionCache!.data,
          user,
          userId: user.id,
          isLoading: false,
          isAuthenticated: true,
        }));
      }
      return;
    }

    // Prevent concurrent loads
    if (loadingRef.current) return;
    loadingRef.current = true;

    try {
      // Parallel fetch all user data in ONE go
      const [profileResult, clinicResult, rolesResult] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
        supabase.from('user_clinic_context').select('*').maybeSingle(),
        supabase.from('user_roles').select('role').eq('user_id', user.id),
      ]);

      if (!mountedRef.current) return;

      const profile = profileResult.data;
      const clinicContext = clinicResult.data;
      const rolesArray = (rolesResult.data || []).map(r => r.role);
      const adminRoles = ['super_admin', 'management'];
      const isAdmin = rolesArray.some(r => adminRoles.includes(r));

      // Cache the result
      sessionCache = {
        userId: user.id,
        data: { profile, clinicContext, roles: rolesArray, isAdmin },
        timestamp: Date.now(),
      };

      setState({
        user,
        session: null, // Will be set by auth state
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
      if (mountedRef.current) {
        setState(prev => ({ ...prev, isLoading: false }));
      }
    } finally {
      loadingRef.current = false;
    }
  }, []);

  const clearSession = useCallback(() => {
    sessionCache = null;
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
    mountedRef.current = true;

    // Prevent double initialization in strict mode
    if (initRef.current) return;
    initRef.current = true;

    const initSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Session error:', error);
          if (mountedRef.current) {
            setState(prev => ({ ...prev, isLoading: false }));
          }
          return;
        }

        if (!mountedRef.current) return;

        if (session?.user) {
          setState(prev => ({ ...prev, session }));
          await loadUserData(session.user);
        } else {
          // No session - done loading
          setState(prev => ({ ...prev, isLoading: false }));
        }
      } catch (error) {
        console.error('Session init error:', error);
        if (mountedRef.current) {
          setState(prev => ({ ...prev, isLoading: false }));
        }
      }
    };

    // Set up auth listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mountedRef.current) return;

      if (event === 'SIGNED_OUT') {
        clearSession();
      } else if (event === 'SIGNED_IN' && session?.user) {
        setState(prev => ({ ...prev, session, isLoading: true }));
        // Only reload if different user or no cache
        if (!sessionCache || sessionCache.userId !== session.user.id) {
          loadUserData(session.user);
        } else {
          // Use cached data
          setState(prev => ({
            ...prev,
            ...sessionCache!.data,
            user: session.user,
            userId: session.user.id,
            isLoading: false,
            isAuthenticated: true,
          }));
        }
      } else if (event === 'TOKEN_REFRESHED' && session?.user) {
        // Just update the session, don't reload data
        setState(prev => ({ ...prev, session }));
      } else if (event === 'INITIAL_SESSION') {
        // Handled by initSession
      }
    });

    // THEN check for existing session
    initSession();

    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
    };
  }, [loadUserData, clearSession]);

  const refreshSession = useCallback(async () => {
    sessionCache = null; // Clear cache to force refresh
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user && mountedRef.current) {
      loadingRef.current = false;
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

// Convenience hooks that derive from session
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
