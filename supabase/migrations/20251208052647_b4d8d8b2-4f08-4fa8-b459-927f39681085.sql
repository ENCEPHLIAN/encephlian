-- Drop the old profiles role check constraint and add a new one with all valid roles
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Add new check constraint with all valid roles including clinician and management
ALTER TABLE public.profiles 
ADD CONSTRAINT profiles_role_check 
CHECK (role IN ('neurologist', 'clinic_admin', 'ops', 'admin', 'super_admin', 'management', 'clinician'));

-- Drop and recreate admin_create_user function
DROP FUNCTION IF EXISTS public.admin_create_user(text, text, text, app_role);

-- The edge function will handle everything now - no DB function needed for user creation
-- We just need validation functions

-- Update has_role to include management
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;