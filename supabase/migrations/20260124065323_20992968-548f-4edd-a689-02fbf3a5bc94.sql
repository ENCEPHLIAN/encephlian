-- Fix admin user deletion: remove references to dropped tables (earnings_wallets, commissions, etc.)
-- and ensure deletion is atomic (any failure rolls back everything).

CREATE OR REPLACE FUNCTION public.admin_delete_user(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_deleted_email text;
  v_caller_id uuid;
BEGIN
  v_caller_id := auth.uid();

  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF NOT (
    has_role(v_caller_id, 'super_admin'::app_role)
    OR has_role(v_caller_id, 'management'::app_role)
  ) THEN
    RAISE EXCEPTION 'Forbidden: Admin access required';
  END IF;

  -- Protect super_admin accounts
  IF has_role(p_user_id, 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Cannot delete super_admin users';
  END IF;

  SELECT email
  INTO v_deleted_email
  FROM public.profiles
  WHERE id = p_user_id;

  -- Break optional actor references (keep system integrity; we still remove user-owned rows below)
  UPDATE public.wallet_transactions SET performed_by = NULL WHERE performed_by = p_user_id;
  UPDATE public.review_events       SET actor        = NULL WHERE actor        = p_user_id;
  UPDATE public.reports             SET interpreter  = NULL WHERE interpreter  = p_user_id;
  UPDATE public.report_attachments  SET uploaded_by  = NULL WHERE uploaded_by  = p_user_id;

  -- Delete user-owned rows
  DELETE FROM public.wallet_transactions WHERE user_id = p_user_id;
  DELETE FROM public.wallets             WHERE user_id = p_user_id;
  DELETE FROM public.tfa_secrets          WHERE user_id = p_user_id;
  DELETE FROM public.notes               WHERE user_id = p_user_id;
  DELETE FROM public.support_tickets     WHERE user_id = p_user_id;
  DELETE FROM public.eeg_markers         WHERE user_id = p_user_id;
  DELETE FROM public.clinic_memberships  WHERE user_id = p_user_id;
  DELETE FROM public.user_roles          WHERE user_id = p_user_id;
  DELETE FROM public.payments            WHERE user_id = p_user_id;

  -- Delete study graph owned by this user
  DELETE FROM public.study_files
  WHERE study_id IN (SELECT id FROM public.studies WHERE owner = p_user_id);

  DELETE FROM public.report_attachments
  WHERE study_id IN (SELECT id FROM public.studies WHERE owner = p_user_id);

  DELETE FROM public.ai_drafts
  WHERE study_id IN (SELECT id FROM public.studies WHERE owner = p_user_id);

  DELETE FROM public.canonical_eeg_records
  WHERE study_id IN (SELECT id FROM public.studies WHERE owner = p_user_id);

  DELETE FROM public.review_events
  WHERE study_id IN (SELECT id FROM public.studies WHERE owner = p_user_id);

  DELETE FROM public.reports
  WHERE study_id IN (SELECT id FROM public.studies WHERE owner = p_user_id);

  DELETE FROM public.studies WHERE owner = p_user_id;

  -- Finally remove user profile + auth user
  DELETE FROM public.profiles WHERE id = p_user_id;
  DELETE FROM auth.users      WHERE id = p_user_id;

  -- Audit (kept for CDSCO-style audit trails)
  INSERT INTO public.audit_logs (user_id, event_type, event_data)
  VALUES (
    v_caller_id,
    'user_deleted',
    jsonb_build_object(
      'deleted_user_id', p_user_id,
      'deleted_email', v_deleted_email
    )
  );

  RETURN jsonb_build_object('success', true, 'deleted_email', v_deleted_email);
END;
$$;
