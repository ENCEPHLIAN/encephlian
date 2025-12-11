-- Phase 1: Fix user_clinic_context view - remove role filter entirely
-- This view should return clinic context for ALL users, not just specific roles

DROP VIEW IF EXISTS public.user_clinic_context;

CREATE VIEW public.user_clinic_context AS
SELECT 
  ur.user_id,
  ur.role,
  ur.clinic_id,
  c.name as clinic_name,
  c.brand_name,
  c.logo_url,
  c.primary_color,
  c.secondary_color
FROM public.user_roles ur
JOIN public.clinics c ON c.id = ur.clinic_id
WHERE ur.clinic_id IS NOT NULL;

-- Fix get_user_clinic_id function - remove role filter, get any clinic for user
CREATE OR REPLACE FUNCTION public.get_user_clinic_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT clinic_id 
  FROM public.user_roles
  WHERE user_id = _user_id AND clinic_id IS NOT NULL
  LIMIT 1
$$;

-- Migrate any neurologist roles to clinician (if any exist from old data)
UPDATE public.user_roles 
SET role = 'clinician' 
WHERE role = 'neurologist';

-- Fix clinic_memberships role to use clinician instead of neurologist
UPDATE public.clinic_memberships 
SET role = 'clinician' 
WHERE role = 'neurologist';

-- Update profiles default role constraint to only allow valid roles
-- First update any existing neurologist profiles to clinician
UPDATE public.profiles 
SET role = 'clinician' 
WHERE role = 'neurologist';

-- Add storage RLS policies for super_admin and management to upload files
-- First check if policies exist and drop if they do to recreate them

-- Drop existing policies if they exist (ignore errors if they don't exist)
DO $$
BEGIN
    DROP POLICY IF EXISTS "admin_full_storage_access" ON storage.objects;
EXCEPTION
    WHEN undefined_object THEN NULL;
END $$;

-- Create comprehensive admin storage policy
CREATE POLICY "admin_full_storage_access"
ON storage.objects
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'super_admin'::app_role) OR 
  has_role(auth.uid(), 'management'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'super_admin'::app_role) OR 
  has_role(auth.uid(), 'management'::app_role)
);