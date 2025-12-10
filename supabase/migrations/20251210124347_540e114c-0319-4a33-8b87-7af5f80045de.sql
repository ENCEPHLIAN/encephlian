
-- Drop and recreate admin_get_all_wallets with correct return type
DROP FUNCTION IF EXISTS public.admin_get_all_wallets();

CREATE FUNCTION public.admin_get_all_wallets() 
RETURNS TABLE(user_id uuid, full_name text, email text, tokens integer, updated_at timestamp with time zone) 
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NOT (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role)) THEN 
    RAISE EXCEPTION 'Unauthorized: Admin access required'; 
  END IF;
  RETURN QUERY SELECT w.user_id, p.full_name, p.email, w.tokens, w.updated_at FROM wallets w JOIN profiles p ON p.id = w.user_id ORDER BY w.updated_at DESC;
END;
$function$;

-- Now update all the other functions
CREATE OR REPLACE FUNCTION public.admin_full_reset_user(p_user_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_caller_id uuid; v_study_ids uuid[]; v_deleted_studies int := 0; v_deleted_files int := 0; v_deleted_notes int := 0;
BEGIN
  v_caller_id := auth.uid();
  IF NOT (has_role(v_caller_id, 'super_admin'::app_role) OR has_role(v_caller_id, 'management'::app_role)) THEN RAISE EXCEPTION 'Forbidden: Admin access required'; END IF;
  SELECT array_agg(id) INTO v_study_ids FROM studies WHERE owner = p_user_id;
  IF v_study_ids IS NOT NULL AND array_length(v_study_ids, 1) > 0 THEN
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
  DELETE FROM notes WHERE user_id = p_user_id; GET DIAGNOSTICS v_deleted_notes = ROW_COUNT;
  DELETE FROM wallet_transactions WHERE user_id = p_user_id;
  INSERT INTO audit_logs (user_id, event_type, event_data) VALUES (v_caller_id, 'admin_full_reset', jsonb_build_object('target_user_id', p_user_id, 'studies_deleted', v_deleted_studies, 'files_deleted', v_deleted_files, 'notes_deleted', v_deleted_notes));
  RETURN jsonb_build_object('success', true, 'studies_deleted', v_deleted_studies, 'files_deleted', v_deleted_files, 'notes_deleted', v_deleted_notes);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_restore_to_date(p_user_id uuid, p_cutoff_date timestamp with time zone) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_caller_id uuid; v_study_ids uuid[]; v_deleted_studies int := 0; v_deleted_files int := 0; v_deleted_notes int := 0;
BEGIN
  v_caller_id := auth.uid();
  IF NOT (has_role(v_caller_id, 'super_admin'::app_role) OR has_role(v_caller_id, 'management'::app_role)) THEN RAISE EXCEPTION 'Forbidden: Admin access required'; END IF;
  SELECT array_agg(id) INTO v_study_ids FROM studies WHERE owner = p_user_id AND created_at > p_cutoff_date;
  IF v_study_ids IS NOT NULL AND array_length(v_study_ids, 1) > 0 THEN
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
  DELETE FROM notes WHERE user_id = p_user_id AND created_at > p_cutoff_date; GET DIAGNOSTICS v_deleted_notes = ROW_COUNT;
  INSERT INTO audit_logs (user_id, event_type, event_data) VALUES (v_caller_id, 'admin_restore_to_date', jsonb_build_object('target_user_id', p_user_id, 'cutoff_date', p_cutoff_date, 'studies_deleted', v_deleted_studies, 'files_deleted', v_deleted_files, 'notes_deleted', v_deleted_notes));
  RETURN jsonb_build_object('success', true, 'studies_deleted', v_deleted_studies, 'files_deleted', v_deleted_files, 'notes_deleted', v_deleted_notes);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_delete_study(p_study_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_caller_id uuid; v_study_owner uuid; v_clinic_id uuid;
BEGIN
  v_caller_id := auth.uid();
  IF NOT (has_role(v_caller_id, 'super_admin'::app_role) OR has_role(v_caller_id, 'management'::app_role)) THEN RAISE EXCEPTION 'Forbidden: Admin access required'; END IF;
  SELECT owner, clinic_id INTO v_study_owner, v_clinic_id FROM studies WHERE id = p_study_id;
  IF v_study_owner IS NULL THEN RAISE EXCEPTION 'Study not found'; END IF;
  DELETE FROM report_attachments WHERE study_id = p_study_id;
  DELETE FROM eeg_markers WHERE study_id = p_study_id;
  DELETE FROM review_events WHERE study_id = p_study_id;
  DELETE FROM canonical_eeg_records WHERE study_id = p_study_id;
  DELETE FROM ai_drafts WHERE study_id = p_study_id;
  DELETE FROM reports WHERE study_id = p_study_id;
  DELETE FROM study_files WHERE study_id = p_study_id;
  DELETE FROM studies WHERE id = p_study_id;
  INSERT INTO audit_logs (user_id, event_type, event_data) VALUES (v_caller_id, 'admin_delete_study', jsonb_build_object('study_id', p_study_id, 'owner', v_study_owner, 'clinic_id', v_clinic_id));
  RETURN jsonb_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_delete_user(p_user_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_deleted_email text; v_caller_id uuid;
BEGIN
  v_caller_id := auth.uid();
  IF NOT (has_role(v_caller_id, 'super_admin'::app_role) OR has_role(v_caller_id, 'management'::app_role)) THEN RAISE EXCEPTION 'Forbidden: Admin access required'; END IF;
  IF has_role(p_user_id, 'super_admin'::app_role) THEN RAISE EXCEPTION 'Cannot delete super_admin users'; END IF;
  SELECT email INTO v_deleted_email FROM profiles WHERE id = p_user_id;
  DELETE FROM wallet_transactions WHERE user_id = p_user_id;
  DELETE FROM wallets WHERE user_id = p_user_id;
  DELETE FROM earnings_wallets WHERE user_id = p_user_id;
  DELETE FROM bank_accounts WHERE user_id = p_user_id;
  DELETE FROM tfa_secrets WHERE user_id = p_user_id;
  DELETE FROM notes WHERE user_id = p_user_id;
  DELETE FROM support_tickets WHERE user_id = p_user_id;
  DELETE FROM eeg_markers WHERE user_id = p_user_id;
  DELETE FROM clinic_memberships WHERE user_id = p_user_id;
  DELETE FROM user_roles WHERE user_id = p_user_id;
  DELETE FROM payments WHERE user_id = p_user_id;
  DELETE FROM withdrawal_requests WHERE user_id = p_user_id;
  DELETE FROM tds_records WHERE user_id = p_user_id;
  DELETE FROM commissions WHERE neurologist_id = p_user_id;
  DELETE FROM study_files WHERE study_id IN (SELECT id FROM studies WHERE owner = p_user_id);
  DELETE FROM reports WHERE study_id IN (SELECT id FROM studies WHERE owner = p_user_id);
  DELETE FROM ai_drafts WHERE study_id IN (SELECT id FROM studies WHERE owner = p_user_id);
  DELETE FROM canonical_eeg_records WHERE study_id IN (SELECT id FROM studies WHERE owner = p_user_id);
  DELETE FROM review_events WHERE study_id IN (SELECT id FROM studies WHERE owner = p_user_id);
  DELETE FROM report_attachments WHERE study_id IN (SELECT id FROM studies WHERE owner = p_user_id);
  DELETE FROM studies WHERE owner = p_user_id;
  DELETE FROM profiles WHERE id = p_user_id;
  DELETE FROM auth.users WHERE id = p_user_id;
  INSERT INTO audit_logs (user_id, event_type, event_data) VALUES (v_caller_id, 'user_deleted', jsonb_build_object('deleted_user_id', p_user_id, 'deleted_email', v_deleted_email));
  RETURN jsonb_build_object('success', true, 'deleted_email', v_deleted_email);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_grant_role(p_user_id uuid, p_role app_role, p_clinic_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_caller_id uuid;
BEGIN
  v_caller_id := auth.uid();
  IF NOT (has_role(v_caller_id, 'super_admin'::app_role) OR has_role(v_caller_id, 'management'::app_role)) THEN RAISE EXCEPTION 'Forbidden: Admin access required'; END IF;
  IF has_role(v_caller_id, 'management'::app_role) AND NOT has_role(v_caller_id, 'super_admin'::app_role) THEN
    IF p_role IN ('management'::app_role, 'super_admin'::app_role) THEN RAISE EXCEPTION 'Management users cannot grant system-level roles'; END IF;
  END IF;
  INSERT INTO user_roles (user_id, role, clinic_id) VALUES (p_user_id, p_role, p_clinic_id) ON CONFLICT (user_id, role) DO NOTHING;
  INSERT INTO audit_logs (user_id, event_type, event_data) VALUES (v_caller_id, 'role_granted', jsonb_build_object('target_user', p_user_id, 'role', p_role::text, 'clinic_id', p_clinic_id));
  RETURN jsonb_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_revoke_role(p_user_id uuid, p_role app_role) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NOT (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role)) THEN RAISE EXCEPTION 'Unauthorized: Admin access required'; END IF;
  IF p_user_id = auth.uid() AND p_role = 'super_admin'::app_role THEN RAISE EXCEPTION 'Cannot revoke your own super_admin role'; END IF;
  IF has_role(auth.uid(), 'management'::app_role) AND NOT has_role(auth.uid(), 'super_admin'::app_role) AND (p_role = 'management'::app_role OR p_role = 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Management users cannot revoke management or super_admin roles';
  END IF;
  DELETE FROM user_roles WHERE user_id = p_user_id AND role = p_role;
  INSERT INTO audit_logs (user_id, event_type, event_data) VALUES (auth.uid(), 'admin_role_revoked', jsonb_build_object('target_user_id', p_user_id, 'role', p_role));
  RETURN jsonb_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_suspend_user(p_user_id uuid, p_suspend boolean DEFAULT true) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NOT (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role)) THEN RAISE EXCEPTION 'Unauthorized: Admin access required'; END IF;
  IF p_user_id = auth.uid() THEN RAISE EXCEPTION 'Cannot suspend your own account'; END IF;
  UPDATE profiles SET is_disabled = p_suspend WHERE id = p_user_id;
  INSERT INTO audit_logs (user_id, event_type, event_data) VALUES (auth.uid(), CASE WHEN p_suspend THEN 'user_suspended' ELSE 'user_unsuspended' END, jsonb_build_object('target_user_id', p_user_id));
  RETURN jsonb_build_object('success', true, 'is_disabled', p_suspend);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_update_profile(p_user_id uuid, p_updates jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NOT (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role)) THEN RAISE EXCEPTION 'Unauthorized: Admin access required'; END IF;
  UPDATE profiles SET full_name = COALESCE(p_updates->>'full_name', full_name), phone_number = COALESCE(p_updates->>'phone_number', phone_number), department = COALESCE(p_updates->>'department', department), hospital_affiliation = COALESCE(p_updates->>'hospital_affiliation', hospital_affiliation), credentials = COALESCE(p_updates->>'credentials', credentials), specialization = COALESCE(p_updates->>'specialization', specialization), medical_license_number = COALESCE(p_updates->>'medical_license_number', medical_license_number), company_name = COALESCE(p_updates->>'company_name', company_name) WHERE id = p_user_id;
  INSERT INTO audit_logs (user_id, event_type, event_data) VALUES (auth.uid(), 'admin_profile_update', jsonb_build_object('target_user_id', p_user_id, 'updates', p_updates));
  RETURN jsonb_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_adjust_tokens(p_user_id uuid, p_amount integer, p_operation text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_caller_id uuid; v_old_balance integer; v_new_balance integer;
BEGIN
  v_caller_id := auth.uid();
  IF NOT (has_role(v_caller_id, 'super_admin'::app_role) OR has_role(v_caller_id, 'management'::app_role)) THEN RAISE EXCEPTION 'Forbidden: Admin access required'; END IF;
  SELECT tokens INTO v_old_balance FROM wallets WHERE user_id = p_user_id;
  IF v_old_balance IS NULL THEN INSERT INTO wallets (user_id, tokens) VALUES (p_user_id, 0); v_old_balance := 0; END IF;
  IF p_operation = 'add' THEN v_new_balance := v_old_balance + p_amount;
  ELSIF p_operation = 'remove' THEN v_new_balance := GREATEST(0, v_old_balance - p_amount);
  ELSIF p_operation = 'set' THEN v_new_balance := GREATEST(0, p_amount);
  ELSE RAISE EXCEPTION 'Invalid operation: %', p_operation; END IF;
  UPDATE wallets SET tokens = v_new_balance, updated_at = now() WHERE user_id = p_user_id;
  INSERT INTO wallet_transactions (user_id, amount, operation, balance_before, balance_after, performed_by, reason) VALUES (p_user_id, p_amount, p_operation, v_old_balance, v_new_balance, v_caller_id, 'Admin adjustment');
  INSERT INTO audit_logs (user_id, event_type, event_data) VALUES (v_caller_id, 'tokens_adjusted', jsonb_build_object('target_user', p_user_id, 'operation', p_operation, 'amount', p_amount, 'old_balance', v_old_balance, 'new_balance', v_new_balance));
  RETURN jsonb_build_object('success', true, 'old_balance', v_old_balance, 'new_balance', v_new_balance);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_reset_user_tfa(p_user_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NOT (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role)) THEN RAISE EXCEPTION 'Unauthorized: Admin access required'; END IF;
  DELETE FROM tfa_secrets WHERE user_id = p_user_id;
  INSERT INTO audit_logs (user_id, event_type, event_data) VALUES (auth.uid(), 'tfa_reset', jsonb_build_object('target_user_id', p_user_id));
  RETURN jsonb_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_tfa_status() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_is_enabled boolean; v_needs_setup boolean;
BEGIN
  SELECT is_enabled INTO v_is_enabled FROM tfa_secrets WHERE user_id = auth.uid();
  v_needs_setup := (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role)) AND (v_is_enabled IS NULL OR v_is_enabled = false);
  RETURN jsonb_build_object('is_enabled', COALESCE(v_is_enabled, false), 'needs_setup', v_needs_setup);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_setup_tfa(p_secret text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NOT (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'management'::app_role)) THEN RAISE EXCEPTION 'TFA is only required for admin users'; END IF;
  INSERT INTO tfa_secrets (user_id, encrypted_secret, is_enabled) VALUES (auth.uid(), p_secret, false)
  ON CONFLICT (user_id) DO UPDATE SET encrypted_secret = p_secret, is_enabled = false, verified_at = NULL;
  INSERT INTO audit_logs (user_id, event_type, event_data) VALUES (auth.uid(), 'tfa_setup_initiated', jsonb_build_object('user_id', auth.uid()));
  RETURN jsonb_build_object('success', true);
END;
$function$;
