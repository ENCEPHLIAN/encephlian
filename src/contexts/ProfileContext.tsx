import { createContext, useContext, useEffect, useState, useRef, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Profile {
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
}

interface ProfileContextType {
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);
  const loadingRef = useRef(false);
  const lastUserIdRef = useRef<string | null>(null);

  const loadProfile = useCallback(async (userId: string) => {
    // Prevent concurrent loads for the same user
    if (loadingRef.current && lastUserIdRef.current === userId) {
      return;
    }

    loadingRef.current = true;
    lastUserIdRef.current = userId;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (!mountedRef.current) return;

      if (error) {
        console.error('Profile fetch error:', error);
        setProfile(null);
      } else {
        setProfile(data);
      }
    } catch (error) {
      console.error('Error loading profile:', error);
      if (mountedRef.current) setProfile(null);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        loadingRef.current = false;
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    let authSubscription: { unsubscribe: () => void } | null = null;

    const initAuth = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!mountedRef.current) return;
        
        if (user) {
          await loadProfile(user.id);
        } else {
          setProfile(null);
          setLoading(false);
        }
      } catch (error) {
        console.error('Auth init error:', error);
        if (mountedRef.current) {
          setProfile(null);
          setLoading(false);
        }
      }
    };

    initAuth();

    // Only listen for SIGNED_OUT to clear profile - avoid recursive loops
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mountedRef.current) return;

      if (event === 'SIGNED_OUT') {
        setProfile(null);
        lastUserIdRef.current = null;
        loadingRef.current = false;
      } else if (event === 'SIGNED_IN' && session?.user) {
        // Only load if it's a different user
        if (lastUserIdRef.current !== session.user.id) {
          loadProfile(session.user.id);
        }
      }
      // Ignore TOKEN_REFRESHED and other events to prevent loops
    });

    authSubscription = subscription;

    return () => {
      mountedRef.current = false;
      authSubscription?.unsubscribe();
    };
  }, [loadProfile]);

  const refreshProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user && mountedRef.current) {
      setLoading(true);
      loadingRef.current = false; // Reset to allow refresh
      await loadProfile(user.id);
    }
  }, [loadProfile]);

  return (
    <ProfileContext.Provider value={{ profile, loading, refreshProfile }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const context = useContext(ProfileContext);
  if (context === undefined) {
    throw new Error('useProfile must be used within a ProfileProvider');
  }
  return context;
}
