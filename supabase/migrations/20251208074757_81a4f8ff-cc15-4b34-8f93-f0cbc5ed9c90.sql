-- Update service_health_logs policies to include management role
DROP POLICY IF EXISTS "admin_health_logs_read" ON public.service_health_logs;
DROP POLICY IF EXISTS "admin_health_logs_update" ON public.service_health_logs;
DROP POLICY IF EXISTS "admin_health_logs_write" ON public.service_health_logs;

CREATE POLICY "admin_health_logs_read" ON public.service_health_logs
FOR SELECT USING (
  has_role(auth.uid(), 'super_admin'::app_role) 
  OR has_role(auth.uid(), 'ops'::app_role)
  OR has_role(auth.uid(), 'management'::app_role)
);

CREATE POLICY "admin_health_logs_update" ON public.service_health_logs
FOR UPDATE USING (
  has_role(auth.uid(), 'super_admin'::app_role) 
  OR has_role(auth.uid(), 'ops'::app_role)
  OR has_role(auth.uid(), 'management'::app_role)
);

CREATE POLICY "admin_health_logs_write" ON public.service_health_logs
FOR INSERT WITH CHECK (
  has_role(auth.uid(), 'super_admin'::app_role) 
  OR has_role(auth.uid(), 'ops'::app_role)
  OR has_role(auth.uid(), 'management'::app_role)
);