-- Add 'refund' to allowed wallet_transactions operations
ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_operation_check;
ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_operation_check 
  CHECK (operation = ANY (ARRAY['add'::text, 'remove'::text, 'set'::text, 'purchase'::text, 'deduct'::text, 'refund'::text]));

-- Create admin function to completely reset a user's data
CREATE OR REPLACE FUNCTION public.admin_full_reset_user(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller_id uuid;
  v_study_ids uuid[];
  v_deleted_studies int := 0;
  v_deleted_files int := 0;
  v_deleted_notes int := 0;
BEGIN
  v_caller_id := auth.uid();
  
  IF NOT (has_role(v_caller_id, 'super_admin') OR has_role(v_caller_id, 'ops') OR has_role(v_caller_id, 'management')) THEN
    RAISE EXCEPTION 'Forbidden: Admin access required';
  END IF;
  
  -- Get all study IDs for this user
  SELECT array_agg(id) INTO v_study_ids FROM studies WHERE owner = p_user_id;
  
  IF v_study_ids IS NOT NULL AND array_length(v_study_ids, 1) > 0 THEN
    -- Delete in correct order for foreign key constraints
    DELETE FROM report_attachments WHERE study_id = ANY(v_study_ids);
    DELETE FROM eeg_markers WHERE study_id = ANY(v_study_ids);
    DELETE FROM review_events WHERE study_id = ANY(v_study_ids);
    DELETE FROM canonical_eeg_records WHERE study_id = ANY(v_study_ids);
    DELETE FROM ai_drafts WHERE study_id = ANY(v_study_ids);
    DELETE FROM reports WHERE study_id = ANY(v_study_ids);
    DELETE FROM study_files WHERE study_id = ANY(v_study_ids);
    GET DIAGNOSTICS v_deleted_files = ROW_COUNT;
    DELETE FROM studies WHERE id = ANY(v_study_ids);
    GET DIAGNOSTICS v_deleted_studies = ROW_COUNT;
  END IF;
  
  -- Delete user notes
  DELETE FROM notes WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_deleted_notes = ROW_COUNT;
  
  -- Delete wallet transactions
  DELETE FROM wallet_transactions WHERE user_id = p_user_id;
  
  -- Log audit event
  INSERT INTO audit_logs (user_id, event_type, event_data)
  VALUES (v_caller_id, 'admin_full_reset', jsonb_build_object(
    'target_user_id', p_user_id,
    'studies_deleted', v_deleted_studies,
    'files_deleted', v_deleted_files,
    'notes_deleted', v_deleted_notes
  ));
  
  RETURN jsonb_build_object(
    'success', true,
    'studies_deleted', v_deleted_studies,
    'files_deleted', v_deleted_files,
    'notes_deleted', v_deleted_notes
  );
END;
$$;

-- Create admin function to restore user to a specific date
CREATE OR REPLACE FUNCTION public.admin_restore_to_date(p_user_id uuid, p_cutoff_date timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller_id uuid;
  v_study_ids uuid[];
  v_deleted_studies int := 0;
  v_deleted_files int := 0;
  v_deleted_notes int := 0;
BEGIN
  v_caller_id := auth.uid();
  
  IF NOT (has_role(v_caller_id, 'super_admin') OR has_role(v_caller_id, 'ops') OR has_role(v_caller_id, 'management')) THEN
    RAISE EXCEPTION 'Forbidden: Admin access required';
  END IF;
  
  -- Get study IDs after the cutoff date
  SELECT array_agg(id) INTO v_study_ids FROM studies WHERE owner = p_user_id AND created_at > p_cutoff_date;
  
  IF v_study_ids IS NOT NULL AND array_length(v_study_ids, 1) > 0 THEN
    -- Delete in correct order for foreign key constraints
    DELETE FROM report_attachments WHERE study_id = ANY(v_study_ids);
    DELETE FROM eeg_markers WHERE study_id = ANY(v_study_ids);
    DELETE FROM review_events WHERE study_id = ANY(v_study_ids);
    DELETE FROM canonical_eeg_records WHERE study_id = ANY(v_study_ids);
    DELETE FROM ai_drafts WHERE study_id = ANY(v_study_ids);
    DELETE FROM reports WHERE study_id = ANY(v_study_ids);
    DELETE FROM study_files WHERE study_id = ANY(v_study_ids);
    GET DIAGNOSTICS v_deleted_files = ROW_COUNT;
    DELETE FROM studies WHERE id = ANY(v_study_ids);
    GET DIAGNOSTICS v_deleted_studies = ROW_COUNT;
  END IF;
  
  -- Delete notes after cutoff
  DELETE FROM notes WHERE user_id = p_user_id AND created_at > p_cutoff_date;
  GET DIAGNOSTICS v_deleted_notes = ROW_COUNT;
  
  -- Log audit event
  INSERT INTO audit_logs (user_id, event_type, event_data)
  VALUES (v_caller_id, 'admin_restore_to_date', jsonb_build_object(
    'target_user_id', p_user_id,
    'cutoff_date', p_cutoff_date,
    'studies_deleted', v_deleted_studies,
    'files_deleted', v_deleted_files,
    'notes_deleted', v_deleted_notes
  ));
  
  RETURN jsonb_build_object(
    'success', true,
    'studies_deleted', v_deleted_studies,
    'files_deleted', v_deleted_files,
    'notes_deleted', v_deleted_notes
  );
END;
$$;

-- Create admin function to delete a single study
CREATE OR REPLACE FUNCTION public.admin_delete_study(p_study_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller_id uuid;
  v_study_owner uuid;
  v_clinic_id uuid;
BEGIN
  v_caller_id := auth.uid();
  
  IF NOT (has_role(v_caller_id, 'super_admin') OR has_role(v_caller_id, 'ops') OR has_role(v_caller_id, 'management')) THEN
    RAISE EXCEPTION 'Forbidden: Admin access required';
  END IF;
  
  -- Get study info
  SELECT owner, clinic_id INTO v_study_owner, v_clinic_id FROM studies WHERE id = p_study_id;
  
  IF v_study_owner IS NULL THEN
    RAISE EXCEPTION 'Study not found';
  END IF;
  
  -- Delete in correct order for foreign key constraints
  DELETE FROM report_attachments WHERE study_id = p_study_id;
  DELETE FROM eeg_markers WHERE study_id = p_study_id;
  DELETE FROM review_events WHERE study_id = p_study_id;
  DELETE FROM canonical_eeg_records WHERE study_id = p_study_id;
  DELETE FROM ai_drafts WHERE study_id = p_study_id;
  DELETE FROM reports WHERE study_id = p_study_id;
  DELETE FROM study_files WHERE study_id = p_study_id;
  DELETE FROM studies WHERE id = p_study_id;
  
  -- Log audit event
  INSERT INTO audit_logs (user_id, event_type, event_data)
  VALUES (v_caller_id, 'admin_delete_study', jsonb_build_object(
    'study_id', p_study_id,
    'owner', v_study_owner,
    'clinic_id', v_clinic_id
  ));
  
  RETURN jsonb_build_object('success', true);
END;
$$;