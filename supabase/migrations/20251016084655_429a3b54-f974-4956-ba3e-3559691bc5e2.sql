-- Phase 1: Create user_roles system with security definer functions
-- This replaces the insecure role column in profiles table

-- Create enum for roles
CREATE TYPE public.app_role AS ENUM ('neurologist', 'clinic_admin', 'ops', 'super_admin');

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, role, clinic_id)
);

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles (prevents RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Create function to get user's clinic context
CREATE OR REPLACE FUNCTION public.get_user_clinic_id(_user_id UUID)
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT clinic_id 
  FROM public.user_roles
  WHERE user_id = _user_id AND role = 'neurologist'
  LIMIT 1
$$;

-- RLS policies for user_roles
CREATE POLICY "Users can view own roles"
ON public.user_roles
FOR SELECT
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'ops'));

CREATE POLICY "Admins can manage roles"
ON public.user_roles
FOR ALL
USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'ops'));

-- Migrate existing data from profiles.role to user_roles
INSERT INTO public.user_roles (user_id, role, clinic_id)
SELECT 
  p.id,
  p.role::app_role,
  cm.clinic_id
FROM public.profiles p
LEFT JOIN public.clinic_memberships cm ON cm.user_id = p.id
WHERE p.role IS NOT NULL
ON CONFLICT (user_id, role, clinic_id) DO NOTHING;

-- Phase 2: Add clinic branding columns
ALTER TABLE public.clinics ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE public.clinics ADD COLUMN IF NOT EXISTS brand_name TEXT DEFAULT 'Clinic Portal';
ALTER TABLE public.clinics ADD COLUMN IF NOT EXISTS primary_color TEXT DEFAULT '#0ea5e9';
ALTER TABLE public.clinics ADD COLUMN IF NOT EXISTS secondary_color TEXT DEFAULT '#f59e0b';
ALTER TABLE public.clinics ADD COLUMN IF NOT EXISTS custom_domain TEXT;

-- Create index for faster clinic lookups
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_clinic_id ON public.user_roles(clinic_id);

-- Create view for easy access to user's clinic context
CREATE OR REPLACE VIEW public.user_clinic_context AS
SELECT 
  ur.user_id,
  ur.role,
  c.id as clinic_id,
  c.name as clinic_name,
  c.brand_name,
  c.logo_url,
  c.primary_color,
  c.secondary_color
FROM public.user_roles ur
JOIN public.clinics c ON c.id = ur.clinic_id
WHERE ur.role = 'neurologist';

-- Grant access to the view
GRANT SELECT ON public.user_clinic_context TO authenticated;