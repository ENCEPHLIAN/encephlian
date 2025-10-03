-- Clean drop of old schema - only drop what exists
DO $$ 
BEGIN
  -- Drop triggers first (only if they exist)
  DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
  
  -- Drop tables in correct dependency order
  DROP TABLE IF EXISTS public.audit_log CASCADE;
  DROP TABLE IF EXISTS public.reports CASCADE;
  DROP TABLE IF EXISTS public.study_files CASCADE;
  DROP TABLE IF EXISTS public.studies CASCADE;
  DROP TABLE IF EXISTS public.payments CASCADE;
  DROP TABLE IF EXISTS public.credits_wallets CASCADE;
  DROP TABLE IF EXISTS public.clinic_memberships CASCADE;
  DROP TABLE IF EXISTS public.clinics CASCADE;
  DROP TABLE IF EXISTS public.user_roles CASCADE;
  DROP TABLE IF EXISTS public.billing_records CASCADE;
  DROP TABLE IF EXISTS public.qa_items CASCADE;
  DROP TABLE IF EXISTS public.profiles CASCADE;
  
  -- Drop functions
  DROP FUNCTION IF EXISTS public.handle_updated_at CASCADE;
  DROP FUNCTION IF EXISTS public.handle_new_user CASCADE;
  DROP FUNCTION IF EXISTS public.has_role CASCADE;
  DROP FUNCTION IF EXISTS public.user_belongs_to_clinic CASCADE;
  
  -- Drop types
  DROP TYPE IF EXISTS public.payment_status CASCADE;
  DROP TYPE IF EXISTS public.sla_type CASCADE;
  DROP TYPE IF EXISTS public.study_state CASCADE;
  DROP TYPE IF EXISTS public.app_role CASCADE;
END $$;

-- Delete storage bucket
DELETE FROM storage.buckets WHERE id = 'eeg-files';