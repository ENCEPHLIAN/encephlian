-- =============================================
-- FIX #1: PROFILES - Ensure all policies require authentication
-- =============================================
-- Profiles policies are already set to 'authenticated' role, but let's add explicit auth check

-- =============================================
-- FIX #2: BANK_ACCOUNTS - Add explicit authentication requirement
-- =============================================
DROP POLICY IF EXISTS "Users can manage own bank accounts" ON bank_accounts;

-- Split into separate policies with explicit auth checks
CREATE POLICY "bank_accounts_select_own" ON bank_accounts
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL AND user_id = auth.uid());

CREATE POLICY "bank_accounts_insert_own" ON bank_accounts
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());

CREATE POLICY "bank_accounts_update_own" ON bank_accounts
  FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL AND user_id = auth.uid());

CREATE POLICY "bank_accounts_delete_own" ON bank_accounts
  FOR DELETE
  TO authenticated
  USING (auth.uid() IS NOT NULL AND user_id = auth.uid());

-- =============================================
-- FIX #3: STUDIES - Remove unauthenticated sample access
-- =============================================
DROP POLICY IF EXISTS "studies_scope" ON studies;
DROP POLICY IF EXISTS "studies_insert" ON studies;
DROP POLICY IF EXISTS "studies_update" ON studies;

-- Studies SELECT: Require authentication, sample studies only visible to authenticated users
CREATE POLICY "studies_select" ON studies
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IS NOT NULL AND (
      sample = true OR 
      owner = auth.uid() OR 
      EXISTS (SELECT 1 FROM my_memberships m WHERE m.clinic_id = studies.clinic_id) OR
      has_role(auth.uid(), 'super_admin'::app_role) OR
      has_role(auth.uid(), 'ops'::app_role)
    )
  );

-- Studies INSERT: Require authentication
CREATE POLICY "studies_insert" ON studies
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL AND
    owner = auth.uid() AND
    EXISTS (SELECT 1 FROM my_memberships m WHERE m.clinic_id = studies.clinic_id)
  );

-- Studies UPDATE: Require authentication
CREATE POLICY "studies_update" ON studies
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IS NOT NULL AND (
      owner = auth.uid() OR
      has_role(auth.uid(), 'super_admin'::app_role) OR
      has_role(auth.uid(), 'ops'::app_role)
    )
  );

-- Force RLS on these tables
ALTER TABLE bank_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE studies FORCE ROW LEVEL SECURITY;