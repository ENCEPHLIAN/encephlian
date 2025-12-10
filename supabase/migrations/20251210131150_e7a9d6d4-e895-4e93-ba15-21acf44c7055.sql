-- Update existing data to use 'clinician'
UPDATE public.clinic_memberships SET role = 'clinician' WHERE role NOT IN ('clinician', 'admin');

-- Add new constraint
ALTER TABLE public.clinic_memberships ADD CONSTRAINT clinic_memberships_role_check 
  CHECK (role IN ('clinician', 'admin'));

-- Fix admin_create_clinic function (remove clinic_admin references)
CREATE OR REPLACE FUNCTION public.admin_create_clinic(p_name text, p_city text DEFAULT NULL, p_admin_user_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid;
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin') AND NOT has_role(auth.uid(), 'management') THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  INSERT INTO clinics (name, city) VALUES (p_name, p_city) RETURNING id INTO v_clinic_id;

  IF p_admin_user_id IS NOT NULL THEN
    INSERT INTO clinic_memberships (user_id, clinic_id, role) VALUES (p_admin_user_id, v_clinic_id, 'clinician') ON CONFLICT (clinic_id, user_id) DO NOTHING;
  END IF;

  INSERT INTO audit_logs (user_id, event_type, event_data) VALUES (auth.uid(), 'clinic_created', jsonb_build_object('clinic_id', v_clinic_id, 'name', p_name, 'city', p_city, 'assigned_user_id', p_admin_user_id));

  RETURN jsonb_build_object('success', true, 'clinic_id', v_clinic_id);
END;
$$;

-- Fix admin_manage_clinic_membership function
CREATE OR REPLACE FUNCTION public.admin_manage_clinic_membership(p_user_id uuid, p_clinic_id uuid, p_action text, p_role text DEFAULT 'clinician')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin') AND NOT has_role(auth.uid(), 'management') THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  IF p_action = 'assign' THEN
    INSERT INTO clinic_memberships (user_id, clinic_id, role) VALUES (p_user_id, p_clinic_id, 'clinician') ON CONFLICT (clinic_id, user_id) DO UPDATE SET role = 'clinician';
  ELSIF p_action = 'unassign' THEN
    DELETE FROM clinic_memberships WHERE user_id = p_user_id AND clinic_id = p_clinic_id;
  ELSE
    RAISE EXCEPTION 'Invalid action: must be assign or unassign';
  END IF;

  INSERT INTO audit_logs (user_id, event_type, event_data) VALUES (auth.uid(), 'user_clinic_' || p_action, jsonb_build_object('target_user_id', p_user_id, 'clinic_id', p_clinic_id, 'role', 'clinician'));

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Fix admin_push_eeg_to_user function
CREATE OR REPLACE FUNCTION public.admin_push_eeg_to_user(p_user_id uuid, p_clinic_id uuid, p_file_path text, p_meta jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_study_id uuid;
  v_caller_id uuid := auth.uid();
BEGIN
  IF NOT (has_role(v_caller_id, 'super_admin') OR has_role(v_caller_id, 'management')) THEN
    RAISE EXCEPTION 'Unauthorized: Only super_admin or management can push EEG files';
  END IF;

  INSERT INTO public.studies (owner, clinic_id, uploaded_file_path, meta, state, triage_status, sla)
  VALUES (p_user_id, p_clinic_id, p_file_path, p_meta, 'awaiting_sla', 'pending', 'pending')
  RETURNING id INTO v_study_id;

  INSERT INTO public.study_files (study_id, kind, path) VALUES (v_study_id, 'raw', p_file_path);

  INSERT INTO public.audit_logs (user_id, event_type, event_data)
  VALUES (v_caller_id, 'admin_push_eeg', jsonb_build_object('study_id', v_study_id, 'target_user_id', p_user_id, 'clinic_id', p_clinic_id, 'file_path', p_file_path));

  RETURN jsonb_build_object('success', true, 'study_id', v_study_id);
END;
$$;