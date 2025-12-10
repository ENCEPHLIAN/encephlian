-- Fix admin_push_eeg_to_user to set awaiting_sla state instead of defaulting to TAT
-- This ensures pushed files go through proper SLA selection workflow

CREATE OR REPLACE FUNCTION public.admin_push_eeg_to_user(
  p_user_id uuid,
  p_clinic_id uuid,
  p_file_path text,
  p_meta jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_study_id uuid;
  v_file_id uuid;
  v_caller_role text;
BEGIN
  -- Check caller is admin
  SELECT role INTO v_caller_role FROM profiles WHERE id = auth.uid();
  IF v_caller_role NOT IN ('super_admin', 'management', 'ops') THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  -- Create study with awaiting_sla state (NOT uploaded with default SLA)
  INSERT INTO studies (
    owner,
    clinic_id,
    uploaded_file_path,
    state,
    sla,
    meta
  ) VALUES (
    p_user_id,
    p_clinic_id,
    p_file_path,
    'awaiting_sla',
    'pending',
    p_meta || jsonb_build_object('admin_pushed', true, 'pushed_at', now())
  )
  RETURNING id INTO v_study_id;

  -- Create study_files record so it appears in Files page correctly
  INSERT INTO study_files (
    study_id,
    path,
    kind,
    size_bytes
  ) VALUES (
    v_study_id,
    p_file_path,
    'eeg_raw',
    NULL
  )
  RETURNING id INTO v_file_id;

  -- Audit log
  INSERT INTO audit_logs (user_id, event_type, event_data)
  VALUES (
    auth.uid(),
    'admin_push_eeg',
    jsonb_build_object(
      'target_user', p_user_id,
      'clinic_id', p_clinic_id,
      'file_path', p_file_path,
      'study_id', v_study_id,
      'file_id', v_file_id
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'study_id', v_study_id,
    'file_id', v_file_id
  );
END;
$$;