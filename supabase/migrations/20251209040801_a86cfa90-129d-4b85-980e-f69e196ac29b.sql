-- Drop the problematic policy that grants access to all non-disabled profiles
DROP POLICY IF EXISTS "Disabled users blocked from select" ON profiles;

-- Drop duplicate update policy
DROP POLICY IF EXISTS "profiles_update_self" ON profiles;

-- Add management role to admin view policy for consistency
DROP POLICY IF EXISTS "profiles_admin_view_all" ON profiles;
CREATE POLICY "profiles_admin_view_all" ON profiles
  FOR SELECT USING (
    has_role(auth.uid(), 'super_admin'::app_role) OR 
    has_role(auth.uid(), 'ops'::app_role) OR
    has_role(auth.uid(), 'management'::app_role)
  );

-- Create a RESTRICTIVE policy that blocks viewing disabled profiles (except by admins or self)
-- This restricts access rather than granting it
CREATE POLICY "Block viewing disabled profiles" ON profiles
  AS RESTRICTIVE
  FOR SELECT USING (
    (is_disabled = false) OR 
    (id = auth.uid()) OR 
    has_role(auth.uid(), 'super_admin'::app_role) OR 
    has_role(auth.uid(), 'ops'::app_role)
  );