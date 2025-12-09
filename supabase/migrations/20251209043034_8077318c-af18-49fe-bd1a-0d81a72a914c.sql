-- =============================================
-- FIX INFINITE RECURSION IN PROFILES RLS POLICIES
-- The circular reference: profiles -> my_memberships -> clinic_memberships -> profiles
-- =============================================

-- Drop the problematic policies
DROP POLICY IF EXISTS "profiles_select_clinic_members" ON profiles;
DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
DROP POLICY IF EXISTS "profiles_select_admin" ON profiles;

-- Create simple, non-recursive policies
-- Policy 1: Users can always view their own profile
CREATE POLICY "profiles_view_own" ON profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- Policy 2: Admins can view all profiles (no subquery that could recurse)
CREATE POLICY "profiles_admin_view" ON profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur 
      WHERE ur.user_id = auth.uid() 
      AND ur.role IN ('super_admin', 'ops', 'management')
    )
  );

-- Policy 3: Clinic members can view colleagues - use direct clinic_memberships join (not my_memberships view)
-- This avoids the recursion by not going through views that might reference profiles
CREATE POLICY "profiles_view_clinic_colleagues" ON profiles
  FOR SELECT
  TO authenticated
  USING (
    is_disabled = false AND
    EXISTS (
      SELECT 1 FROM clinic_memberships cm1
      JOIN clinic_memberships cm2 ON cm1.clinic_id = cm2.clinic_id
      WHERE cm1.user_id = auth.uid()
      AND cm2.user_id = profiles.id
    )
  );

-- Also fix the studies policy that might be causing issues via my_memberships
DROP POLICY IF EXISTS "studies_select" ON studies;

CREATE POLICY "studies_select" ON studies
  FOR SELECT
  TO authenticated
  USING (
    sample = true OR 
    owner = auth.uid() OR 
    EXISTS (
      SELECT 1 FROM clinic_memberships cm 
      WHERE cm.user_id = auth.uid() 
      AND cm.clinic_id = studies.clinic_id
    ) OR
    EXISTS (
      SELECT 1 FROM user_roles ur 
      WHERE ur.user_id = auth.uid() 
      AND ur.role IN ('super_admin', 'ops', 'management')
    )
  );