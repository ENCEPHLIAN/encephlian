-- Add report_locked column to studies for admin control
ALTER TABLE public.studies ADD COLUMN IF NOT EXISTS report_locked boolean DEFAULT false;

-- Add is_active column to clinics for soft-disable
ALTER TABLE public.clinics ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Create service_health_logs table for health checks
CREATE TABLE IF NOT EXISTS public.service_health_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  service_name text NOT NULL,
  status text NOT NULL DEFAULT 'unknown', -- unknown, healthy, degraded, down
  last_success_at timestamp with time zone,
  last_error_at timestamp with time zone,
  last_error_message text,
  checked_at timestamp with time zone DEFAULT now(),
  checked_by uuid REFERENCES auth.users(id)
);

-- Enable RLS on service_health_logs
ALTER TABLE public.service_health_logs ENABLE ROW LEVEL SECURITY;

-- RLS: Only admins can read/write health logs
CREATE POLICY "admin_health_logs_read" ON public.service_health_logs
  FOR SELECT USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'ops'::app_role));

CREATE POLICY "admin_health_logs_write" ON public.service_health_logs
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'ops'::app_role));

CREATE POLICY "admin_health_logs_update" ON public.service_health_logs
  FOR UPDATE USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'ops'::app_role));

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_studies_state ON public.studies(state);
CREATE INDEX IF NOT EXISTS idx_studies_clinic_id ON public.studies(clinic_id);
CREATE INDEX IF NOT EXISTS idx_review_events_study_id ON public.review_events(study_id);
CREATE INDEX IF NOT EXISTS idx_service_health_logs_service ON public.service_health_logs(service_name);

-- Create admin studies view function for bypassing RLS
CREATE OR REPLACE FUNCTION public.admin_get_all_studies()
RETURNS SETOF studies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'ops'::app_role)) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;
  
  RETURN QUERY SELECT * FROM studies ORDER BY created_at DESC;
END;
$$;

-- Create admin clinics update function
CREATE OR REPLACE FUNCTION public.admin_update_clinic(
  p_clinic_id uuid,
  p_updates jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'ops'::app_role)) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  UPDATE clinics
  SET
    is_active = COALESCE((p_updates->>'is_active')::boolean, is_active),
    name = COALESCE(p_updates->>'name', name),
    city = COALESCE(p_updates->>'city', city)
  WHERE id = p_clinic_id;

  -- Log audit event
  INSERT INTO audit_logs (user_id, event_type, event_data)
  VALUES (
    auth.uid(),
    'admin_clinic_update',
    jsonb_build_object(
      'clinic_id', p_clinic_id,
      'updates', p_updates
    )
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Create admin study update function
CREATE OR REPLACE FUNCTION public.admin_update_study(
  p_study_id uuid,
  p_updates jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'ops'::app_role)) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  UPDATE studies
  SET
    report_locked = COALESCE((p_updates->>'report_locked')::boolean, report_locked),
    state = COALESCE(p_updates->>'state', state),
    sla = COALESCE(p_updates->>'sla', sla)
  WHERE id = p_study_id;

  -- Log audit event
  INSERT INTO audit_logs (user_id, event_type, event_data)
  VALUES (
    auth.uid(),
    'admin_study_update',
    jsonb_build_object(
      'study_id', p_study_id,
      'updates', p_updates
    )
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Function to log admin actions to review_events
CREATE OR REPLACE FUNCTION public.admin_log_event(
  p_study_id uuid,
  p_event text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'ops'::app_role)) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  INSERT INTO review_events (study_id, actor, event, payload)
  VALUES (p_study_id, auth.uid(), p_event, p_payload);

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Function to get all clinics for admin
CREATE OR REPLACE FUNCTION public.admin_get_all_clinics()
RETURNS TABLE (
  id uuid,
  name text,
  city text,
  is_active boolean,
  created_at timestamp with time zone,
  study_count bigint,
  member_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'ops'::app_role)) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  RETURN QUERY
  SELECT 
    c.id,
    c.name,
    c.city,
    c.is_active,
    c.created_at,
    (SELECT COUNT(*) FROM studies s WHERE s.clinic_id = c.id) as study_count,
    (SELECT COUNT(*) FROM clinic_memberships cm WHERE cm.clinic_id = c.id) as member_count
  FROM clinics c
  ORDER BY c.created_at DESC;
END;
$$;

-- Function to get admin dashboard stats
CREATE OR REPLACE FUNCTION public.admin_get_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stats jsonb;
BEGIN
  IF NOT (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'ops'::app_role)) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  SELECT jsonb_build_object(
    'total_clinics', (SELECT COUNT(*) FROM clinics),
    'total_studies', (SELECT COUNT(*) FROM studies),
    'studies_by_state', (
      SELECT jsonb_object_agg(COALESCE(state, 'unknown'), cnt)
      FROM (SELECT state, COUNT(*) as cnt FROM studies GROUP BY state) sub
    ),
    'total_tokens_sold', (SELECT COALESCE(SUM(credits_purchased), 0) FROM payments WHERE status = 'captured'),
    'total_tokens_consumed', (SELECT COALESCE(SUM(c.amount_inr / 200), 0) FROM commissions c),
    'active_users', (SELECT COUNT(DISTINCT user_id) FROM wallets WHERE updated_at > NOW() - INTERVAL '30 days')
  ) INTO v_stats;

  RETURN v_stats;
END;
$$;