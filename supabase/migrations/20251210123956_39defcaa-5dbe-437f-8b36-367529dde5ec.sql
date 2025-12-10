
-- Remove 'ops' role completely from the system and update all references to use management

-- Update all RLS policies that reference 'ops' to only use super_admin and management

-- 1. clinics table policies
DROP POLICY IF EXISTS admin_full_access_clinics ON public.clinics;
CREATE POLICY admin_full_access_clinics ON public.clinics
FOR ALL TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role));

DROP POLICY IF EXISTS clinics_insert_admin ON public.clinics;

-- 2. studies table policies
DROP POLICY IF EXISTS admin_full_access_studies ON public.studies;
CREATE POLICY admin_full_access_studies ON public.studies
FOR ALL TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role));

DROP POLICY IF EXISTS studies_update ON public.studies;
CREATE POLICY studies_update ON public.studies
FOR UPDATE TO authenticated
USING ((auth.uid() IS NOT NULL) AND ((owner = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role)));

-- 3. user_roles table policies  
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
CREATE POLICY "Admins can manage roles" ON public.user_roles
FOR ALL TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role));

DROP POLICY IF EXISTS "Admins can view all user roles" ON public.user_roles;
CREATE POLICY "Admins can view all user roles" ON public.user_roles
FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role));

DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
CREATE POLICY "Users can view own roles" ON public.user_roles
FOR SELECT TO authenticated
USING ((user_id = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role));

-- 4. tfa_secrets table
DROP POLICY IF EXISTS tfa_secrets_admin_manage ON public.tfa_secrets;
CREATE POLICY tfa_secrets_admin_manage ON public.tfa_secrets
FOR ALL TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role) OR (user_id = auth.uid()));

-- 5. service_health_logs table
DROP POLICY IF EXISTS admin_health_logs_read ON public.service_health_logs;
CREATE POLICY admin_health_logs_read ON public.service_health_logs
FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role));

DROP POLICY IF EXISTS admin_health_logs_update ON public.service_health_logs;
CREATE POLICY admin_health_logs_update ON public.service_health_logs
FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role));

DROP POLICY IF EXISTS admin_health_logs_write ON public.service_health_logs;
CREATE POLICY admin_health_logs_write ON public.service_health_logs
FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role));

-- 6. support_tickets table
DROP POLICY IF EXISTS support_tickets_admin_select ON public.support_tickets;
CREATE POLICY support_tickets_admin_select ON public.support_tickets
FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role));

DROP POLICY IF EXISTS support_tickets_admin_update ON public.support_tickets;
CREATE POLICY support_tickets_admin_update ON public.support_tickets
FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role));

-- 7. audit_logs table
DROP POLICY IF EXISTS audit_logs_admin_only ON public.audit_logs;
CREATE POLICY audit_logs_admin_only ON public.audit_logs
FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role));

-- 8. canonical_eeg_records table
DROP POLICY IF EXISTS canonical_eeg_delete ON public.canonical_eeg_records;
CREATE POLICY canonical_eeg_delete ON public.canonical_eeg_records
FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role));

DROP POLICY IF EXISTS canonical_eeg_insert ON public.canonical_eeg_records;
CREATE POLICY canonical_eeg_insert ON public.canonical_eeg_records
FOR INSERT TO authenticated
WITH CHECK (EXISTS ( SELECT 1 FROM studies s WHERE ((s.id = canonical_eeg_records.study_id) AND ((s.owner = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role)))));

DROP POLICY IF EXISTS canonical_eeg_update ON public.canonical_eeg_records;
CREATE POLICY canonical_eeg_update ON public.canonical_eeg_records
FOR UPDATE TO authenticated
USING (EXISTS ( SELECT 1 FROM studies s WHERE ((s.id = canonical_eeg_records.study_id) AND ((s.owner = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role)))));

-- 9. withdrawal_requests table
DROP POLICY IF EXISTS withdrawal_requests_admin_update ON public.withdrawal_requests;
CREATE POLICY withdrawal_requests_admin_update ON public.withdrawal_requests
FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role));

-- Migrate any existing 'ops' roles to 'management'
UPDATE user_roles SET role = 'management' WHERE role = 'ops';
