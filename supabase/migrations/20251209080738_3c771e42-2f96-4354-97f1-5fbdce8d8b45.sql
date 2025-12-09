-- Update admin_push_eeg_to_user to also create a study_files record
CREATE OR REPLACE FUNCTION public.admin_push_eeg_to_user(
  p_user_id uuid,
  p_clinic_id uuid,
  p_file_path text,
  p_meta jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid;
  v_study_id uuid;
BEGIN
  v_caller_id := auth.uid();
  
  IF NOT (has_role(v_caller_id, 'super_admin') OR has_role(v_caller_id, 'ops') OR has_role(v_caller_id, 'management')) THEN
    RAISE EXCEPTION 'Forbidden: Admin access required';
  END IF;
  
  -- Create study for user
  INSERT INTO studies (
    owner,
    clinic_id,
    uploaded_file_path,
    meta,
    state,
    triage_status,
    sla
  ) VALUES (
    p_user_id,
    p_clinic_id,
    p_file_path,
    p_meta,
    'uploaded',
    'awaiting_sla',
    'TAT'
  )
  RETURNING id INTO v_study_id;
  
  -- Create study_files record so file shows in Files page
  INSERT INTO study_files (study_id, path, kind, size_bytes)
  VALUES (v_study_id, p_file_path, 'edf', 0);
  
  -- Log audit
  INSERT INTO audit_logs (user_id, event_type, event_data)
  VALUES (v_caller_id, 'admin_push_eeg', jsonb_build_object(
    'target_user', p_user_id,
    'clinic_id', p_clinic_id,
    'study_id', v_study_id,
    'file_path', p_file_path
  ));
  
  RETURN jsonb_build_object(
    'success', true,
    'study_id', v_study_id
  );
END;
$$;