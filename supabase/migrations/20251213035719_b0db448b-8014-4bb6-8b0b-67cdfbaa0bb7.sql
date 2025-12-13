-- Create platform_settings table for global configuration
CREATE TABLE public.platform_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can read/write settings
CREATE POLICY "Admins can read platform settings"
ON public.platform_settings
FOR SELECT
USING (
  has_role(auth.uid(), 'super_admin'::app_role) OR
  has_role(auth.uid(), 'management'::app_role)
);

CREATE POLICY "Admins can update platform settings"
ON public.platform_settings
FOR UPDATE
USING (
  has_role(auth.uid(), 'super_admin'::app_role) OR
  has_role(auth.uid(), 'management'::app_role)
);

CREATE POLICY "Admins can insert platform settings"
ON public.platform_settings
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'super_admin'::app_role) OR
  has_role(auth.uid(), 'management'::app_role)
);

-- Insert default email setting (disabled by default)
INSERT INTO public.platform_settings (key, value)
VALUES ('email_notifications_enabled', 'false'::jsonb);

-- Create a security definer function for edge functions to read settings
CREATE OR REPLACE FUNCTION public.get_platform_setting(p_key TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_value JSONB;
BEGIN
  SELECT value INTO v_value FROM platform_settings WHERE key = p_key;
  RETURN COALESCE(v_value, 'null'::jsonb);
END;
$$;

-- Create function for admins to update settings
CREATE OR REPLACE FUNCTION public.admin_update_platform_setting(p_key TEXT, p_value JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role)) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  INSERT INTO platform_settings (key, value, updated_at, updated_by)
  VALUES (p_key, p_value, now(), auth.uid())
  ON CONFLICT (key) DO UPDATE
  SET value = p_value, updated_at = now(), updated_by = auth.uid();

  INSERT INTO audit_logs (user_id, event_type, event_data)
  VALUES (auth.uid(), 'platform_setting_updated', jsonb_build_object('key', p_key, 'value', p_value));

  RETURN jsonb_build_object('success', true);
END;
$$;