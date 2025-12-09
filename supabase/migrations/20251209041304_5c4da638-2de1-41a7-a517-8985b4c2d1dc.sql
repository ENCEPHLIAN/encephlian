-- First, force RLS on the profiles table (prevents bypass by table owner)
ALTER TABLE profiles FORCE ROW LEVEL SECURITY;

-- Drop ALL existing SELECT policies on profiles to start clean
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
DROP POLICY IF EXISTS "profiles_admin_view_all" ON profiles;
DROP POLICY IF EXISTS "Block viewing disabled profiles" ON profiles;

-- Policy 1: Users can ONLY view their OWN profile (not others)
CREATE POLICY "profiles_select_own" ON profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- Policy 2: Admins can view ALL profiles (including disabled)
CREATE POLICY "profiles_select_admin" ON profiles
  FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin'::app_role) OR 
    has_role(auth.uid(), 'ops'::app_role) OR
    has_role(auth.uid(), 'management'::app_role)
  );

-- Policy 3: Clinic members can view other members in their clinic (for collaboration)
-- But only non-disabled profiles and only basic info is exposed via the query
CREATE POLICY "profiles_select_clinic_members" ON profiles
  FOR SELECT
  TO authenticated
  USING (
    is_disabled = false AND
    EXISTS (
      SELECT 1 FROM clinic_memberships cm1
      WHERE cm1.user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM clinic_memberships cm2
        WHERE cm2.user_id = profiles.id
        AND cm2.clinic_id = cm1.clinic_id
      )
    )
  );

-- Ensure no anonymous access
DROP POLICY IF EXISTS "profiles_anon_select" ON profiles;

-- Verify: No INSERT policy (profiles are created by trigger on auth.users creation)
-- Verify: UPDATE policies remain for self-update only