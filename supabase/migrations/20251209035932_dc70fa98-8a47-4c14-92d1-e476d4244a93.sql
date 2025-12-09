-- Fix 1: Support tickets RLS - Drop ALL policy and replace with specific policies
DROP POLICY IF EXISTS support_tickets_own ON support_tickets;
DROP POLICY IF EXISTS support_tickets_admin ON support_tickets;

-- Users can only INSERT their own tickets
CREATE POLICY support_tickets_insert ON support_tickets 
FOR INSERT WITH CHECK (user_id = auth.uid());

-- Users can only SELECT their own tickets
CREATE POLICY support_tickets_select_own ON support_tickets 
FOR SELECT USING (user_id = auth.uid());

-- Admins (including management) can SELECT all tickets
CREATE POLICY support_tickets_admin_select ON support_tickets 
FOR SELECT USING (
  has_role(auth.uid(), 'super_admin'::app_role) OR 
  has_role(auth.uid(), 'ops'::app_role) OR
  has_role(auth.uid(), 'management'::app_role)
);

-- Admins (including management) can UPDATE tickets (for status changes)
CREATE POLICY support_tickets_admin_update ON support_tickets 
FOR UPDATE USING (
  has_role(auth.uid(), 'super_admin'::app_role) OR 
  has_role(auth.uid(), 'ops'::app_role) OR
  has_role(auth.uid(), 'management'::app_role)
);

-- Fix 2: Profiles table - Remove duplicate SELECT policy
DROP POLICY IF EXISTS profiles_view_own ON profiles;

-- Fix 3: Add withdrawal_requests admin policies
CREATE POLICY withdrawal_requests_admin_select ON withdrawal_requests 
FOR SELECT USING (
  has_role(auth.uid(), 'super_admin'::app_role) OR 
  has_role(auth.uid(), 'ops'::app_role) OR
  has_role(auth.uid(), 'management'::app_role)
);

CREATE POLICY withdrawal_requests_admin_update ON withdrawal_requests 
FOR UPDATE USING (
  has_role(auth.uid(), 'super_admin'::app_role) OR 
  has_role(auth.uid(), 'ops'::app_role)
);