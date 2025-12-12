-- Lifecycle policy table for managing storage cleanup
CREATE TABLE IF NOT EXISTS public.storage_lifecycle_policies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bucket_id TEXT NOT NULL,
  retention_days INTEGER NOT NULL DEFAULT 90,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Insert default policy for eeg-raw bucket (90 days retention)
INSERT INTO public.storage_lifecycle_policies (bucket_id, retention_days, is_active)
VALUES 
  ('eeg-raw', 90, true),
  ('eeg-uploads', 90, true)
ON CONFLICT DO NOTHING;

-- Enable RLS
ALTER TABLE public.storage_lifecycle_policies ENABLE ROW LEVEL SECURITY;

-- Only admins can manage lifecycle policies
CREATE POLICY "lifecycle_policies_admin_only" ON public.storage_lifecycle_policies
  FOR ALL USING (
    has_role(auth.uid(), 'super_admin'::app_role) OR 
    has_role(auth.uid(), 'management'::app_role)
  );

-- Create function to get files for cleanup (older than retention period)
CREATE OR REPLACE FUNCTION public.get_files_for_cleanup()
RETURNS TABLE (
  file_id UUID,
  study_id UUID,
  file_path TEXT,
  bucket_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  retention_days INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only super_admin and management can run this
  IF NOT (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role)) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  RETURN QUERY
  SELECT 
    sf.id as file_id,
    sf.study_id,
    sf.path as file_path,
    CASE 
      WHEN sf.kind = 'raw' THEN 'eeg-raw'
      WHEN sf.kind = 'upload' THEN 'eeg-uploads'
      ELSE 'eeg-raw'
    END as bucket_id,
    sf.created_at,
    lp.retention_days
  FROM study_files sf
  LEFT JOIN storage_lifecycle_policies lp ON lp.bucket_id = 
    CASE 
      WHEN sf.kind = 'raw' THEN 'eeg-raw'
      WHEN sf.kind = 'upload' THEN 'eeg-uploads'
      ELSE 'eeg-raw'
    END
  WHERE lp.is_active = true
    AND sf.created_at < (NOW() - (lp.retention_days || ' days')::INTERVAL)
  ORDER BY sf.created_at ASC;
END;
$$;

-- Strengthen RLS: Require authentication for profiles table
DROP POLICY IF EXISTS "profiles_view_own" ON public.profiles;
CREATE POLICY "profiles_view_own" ON public.profiles
  FOR SELECT USING (auth.uid() IS NOT NULL AND auth.uid() = id);

-- Strengthen RLS: Prevent direct wallet updates by users (only through functions)
DROP POLICY IF EXISTS "wallets_update_own" ON public.wallets;
DROP POLICY IF EXISTS "wallets_update" ON public.wallets;

-- Only allow admin updates to wallets (user updates go through RPC functions)
CREATE POLICY "wallets_admin_update" ON public.wallets
  FOR UPDATE USING (
    has_role(auth.uid(), 'super_admin'::app_role) OR 
    has_role(auth.uid(), 'management'::app_role)
  );

-- Remove sample studies public access - require authentication
DROP POLICY IF EXISTS "studies_select_sample" ON public.studies;

-- All studies require authentication
CREATE POLICY "studies_select_authenticated" ON public.studies
  FOR SELECT USING (
    auth.uid() IS NOT NULL AND (
      owner = auth.uid() OR
      EXISTS (
        SELECT 1 FROM clinic_memberships cm
        WHERE cm.clinic_id = studies.clinic_id AND cm.user_id = auth.uid()
      ) OR
      has_role(auth.uid(), 'super_admin'::app_role) OR
      has_role(auth.uid(), 'management'::app_role)
    )
  );

-- Restrict TFA admin access to only reset, not view secrets
DROP POLICY IF EXISTS "tfa_secrets_admin_manage" ON public.tfa_secrets;
CREATE POLICY "tfa_secrets_admin_reset_only" ON public.tfa_secrets
  FOR DELETE USING (
    has_role(auth.uid(), 'super_admin'::app_role) OR 
    has_role(auth.uid(), 'management'::app_role)
  );

-- Add trigger for updated_at on lifecycle policies
CREATE TRIGGER update_storage_lifecycle_policies_updated_at
  BEFORE UPDATE ON public.storage_lifecycle_policies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();