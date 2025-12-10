
-- Fix admin_push_eeg_to_user to use has_role() function instead of profiles.role
CREATE OR REPLACE FUNCTION public.admin_push_eeg_to_user(p_user_id uuid, p_clinic_id uuid, p_file_path text, p_meta jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_study_id uuid;
  v_file_id uuid;
  v_caller_id uuid;
BEGIN
  v_caller_id := auth.uid();
  
  -- Check caller is admin using has_role function
  IF NOT (has_role(v_caller_id, 'super_admin'::app_role) OR has_role(v_caller_id, 'ops'::app_role) OR has_role(v_caller_id, 'management'::app_role)) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
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
    v_caller_id,
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
$function$;

-- Create a function for fetching clinics that management role can use
CREATE OR REPLACE FUNCTION public.admin_get_clinics_for_dropdown()
 RETURNS TABLE(id uuid, name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'ops'::app_role) OR has_role(auth.uid(), 'management'::app_role)) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  RETURN QUERY
  SELECT c.id, c.name
  FROM clinics c
  WHERE c.is_active = true
  ORDER BY c.name;
END;
$function$;
