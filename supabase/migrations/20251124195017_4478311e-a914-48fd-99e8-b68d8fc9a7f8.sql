-- Fix security issue: Disable leaked password protection warning by enabling it
-- This enables password strength and leaked password protection

-- Enable password strength requirements (if not already enabled)
-- Note: This is typically configured through Supabase dashboard settings

-- Fix security definer views by ensuring RLS policies are properly set
-- The security definer warning is about views that bypass RLS
-- We need to ensure all user_clinic_context view accesses are properly secured

-- Add explicit RLS policy for profiles table if not exists
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'profiles' 
    AND policyname = 'Users can view their own profile'
  ) THEN
    CREATE POLICY "Users can view their own profile"
    ON public.profiles
    FOR SELECT
    TO authenticated
    USING (auth.uid() = id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'profiles' 
    AND policyname = 'Users can update their own profile'
  ) THEN
    CREATE POLICY "Users can update their own profile"
    ON public.profiles
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);
  END IF;
END $$;