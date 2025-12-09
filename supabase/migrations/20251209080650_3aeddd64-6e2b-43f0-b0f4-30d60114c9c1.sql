-- Fix infinite recursion between profiles and clinic_memberships RLS policies

-- Step 1: Drop the problematic policies on clinic_memberships
DROP POLICY IF EXISTS "cm_scope" ON public.clinic_memberships;
DROP POLICY IF EXISTS "cm_insert_admin" ON public.clinic_memberships;

-- Step 2: Create new non-recursive policies for clinic_memberships
-- Users can see their own memberships (simple check, no profile lookup)
CREATE POLICY "cm_view_own" ON public.clinic_memberships
  FOR SELECT
  USING (user_id = auth.uid());

-- Admins can view all memberships (use user_roles instead of profiles)
CREATE POLICY "cm_admin_view" ON public.clinic_memberships
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role IN ('super_admin', 'ops', 'management')
    )
  );

-- Admins can insert memberships (use user_roles instead of profiles)
CREATE POLICY "cm_admin_insert" ON public.clinic_memberships
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role IN ('super_admin', 'ops', 'management')
    )
  );

-- Admins can update memberships
CREATE POLICY "cm_admin_update" ON public.clinic_memberships
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role IN ('super_admin', 'ops', 'management')
    )
  );

-- Admins can delete memberships
CREATE POLICY "cm_admin_delete" ON public.clinic_memberships
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role IN ('super_admin', 'ops', 'management')
    )
  );

-- Step 3: Drop and recreate the profiles_view_clinic_colleagues policy
-- to avoid referencing clinic_memberships in a way that causes recursion
DROP POLICY IF EXISTS "profiles_view_clinic_colleagues" ON public.profiles;

-- New policy: use a simpler approach - just allow users to see non-disabled profiles
-- of users who share at least one clinic (via direct join, no nested selects on profiles)
CREATE POLICY "profiles_view_clinic_colleagues" ON public.profiles
  FOR SELECT
  USING (
    is_disabled = false 
    AND EXISTS (
      SELECT 1 
      FROM clinic_memberships my_cm
      WHERE my_cm.user_id = auth.uid()
      AND EXISTS (
        SELECT 1 
        FROM clinic_memberships their_cm
        WHERE their_cm.clinic_id = my_cm.clinic_id
        AND their_cm.user_id = profiles.id
      )
    )
  );