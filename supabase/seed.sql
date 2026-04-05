-- ============================================================
-- Encephlian Bootstrap Seed
-- Run in Supabase SQL Editor: https://app.supabase.com/project/vxlrqfrisowqfuscodzt/sql
--
-- USAGE:
--   1. Sign up at the Encephlian frontend to create your auth user
--   2. Replace YOUR_USER_UUID below with the UUID from auth.users
--   3. Run this script in the Supabase SQL editor
-- ============================================================

-- Step 0: Get your user ID
-- SELECT id, email FROM auth.users;

-- ============================================================
-- CONFIGURATION — replace with your values
-- ============================================================
DO $$
DECLARE
  v_user_id UUID := 'YOUR_USER_UUID'; -- <-- replace this

  -- Internal clinic (for admin/dev use)
  v_internal_clinic_id UUID := gen_random_uuid();

  -- Pilot clinic (for clinician-facing testing)
  v_pilot_clinic_id UUID := gen_random_uuid();

  -- Test study ID matching the blob data uploaded in E2E test
  v_test_study_id UUID := '0918b2e1-d3ac-4728-a248-f627f503b4f9';

BEGIN
  -- Skip if user ID is placeholder
  IF v_user_id = 'YOUR_USER_UUID' THEN
    RAISE EXCEPTION 'Replace YOUR_USER_UUID with your actual user ID from auth.users';
  END IF;

  -- ============================================================
  -- 1. Ensure profile exists
  -- ============================================================
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (v_user_id, 'Admin User', 'admin')
  ON CONFLICT (id) DO NOTHING;

  -- ============================================================
  -- 2. Grant super_admin role
  -- ============================================================
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'super_admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  -- ============================================================
  -- 3. Create Internal clinic (SKU: internal)
  -- ============================================================
  INSERT INTO public.clinics (id, name, brand_name, city, sku, is_active)
  VALUES (v_internal_clinic_id, 'Encephlian Internal', 'Encephlian', 'Mumbai', 'internal', true)
  ON CONFLICT DO NOTHING;

  -- Assign user to internal clinic as owner
  INSERT INTO public.clinic_members (clinic_id, user_id, role)
  VALUES (v_internal_clinic_id, v_user_id, 'owner')
  ON CONFLICT DO NOTHING;

  -- ============================================================
  -- 4. Create Pilot clinic (SKU: pilot)
  -- ============================================================
  INSERT INTO public.clinics (id, name, brand_name, city, sku, is_active)
  VALUES (v_pilot_clinic_id, 'Demo Clinic', 'Demo', 'Mumbai', 'pilot', true)
  ON CONFLICT DO NOTHING;

  -- Assign user to pilot clinic as owner
  INSERT INTO public.clinic_members (clinic_id, user_id, role)
  VALUES (v_pilot_clinic_id, v_user_id, 'owner')
  ON CONFLICT DO NOTHING;

  -- ============================================================
  -- 5. Seed test study (TUH blob data: 0918b2e1)
  --    This study exists in Azure Blob and has been processed by MIND® v1.2.0
  --    The EEG Viewer and Report will work for this study ID.
  -- ============================================================
  INSERT INTO public.studies (
    id,
    owner,
    clinic_id,
    state,
    sla,
    storage_backend,
    uploaded_file_path,
    meta
  ) VALUES (
    v_test_study_id,
    v_user_id,
    v_internal_clinic_id,
    'ai_draft',
    '24H',
    'azure_blob',
    'blob:eeg-raw/0918b2e1-d3ac-4728-a248-f627f503b4f9.edf',
    jsonb_build_object(
      'patient_name', 'TUH Test Patient',
      'patient_id', 'aaaaakqg_s001',
      'patient_age', 35,
      'patient_gender', 'M',
      'notes', 'TUH corpus test file — aaaaakqg_s001_t001.edf',
      'original_filename', 'aaaaakqg_s001_t001.edf',
      'edf_num_channels', 34,
      'edf_sample_rate', 250,
      'edf_duration_sec', 1180
    )
  ) ON CONFLICT (id) DO NOTHING;

  RAISE NOTICE 'Seed complete.';
  RAISE NOTICE 'Internal clinic: %', v_internal_clinic_id;
  RAISE NOTICE 'Pilot clinic: %', v_pilot_clinic_id;
  RAISE NOTICE 'Test study: %', v_test_study_id;
END $$;
