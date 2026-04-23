-- Signing must not deduct tokens again when SLA selection already charged the wallet.
-- p_cost = 0: sign only, requires triage paid (tokens_deducted or sla_selected_at).
-- p_cost > 0: legacy path (charge at sign) kept for backwards compatibility.

CREATE OR REPLACE FUNCTION public.consume_credit_and_sign(p_user_id uuid, p_study_id uuid, p_cost integer, p_content jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_report_id uuid;
  v_study_owner uuid;
  v_study_clinic_id uuid;
  v_paid_triage boolean;
  v_current_tokens integer;
  v_balance_after integer;
BEGIN
  SELECT owner, clinic_id INTO v_study_owner, v_study_clinic_id
  FROM public.studies
  WHERE id = p_study_id;

  IF v_study_owner IS NULL THEN
    RAISE EXCEPTION 'Study not found';
  END IF;

  IF NOT (
    v_study_owner = p_user_id
    OR public.has_role(p_user_id, 'super_admin'::public.app_role)
    OR public.has_role(p_user_id, 'management'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.clinic_memberships cm
      WHERE cm.clinic_id = v_study_clinic_id AND cm.user_id = p_user_id
    )
  ) THEN
    RAISE EXCEPTION 'Unauthorized: User does not have access to this study';
  END IF;

  SELECT (COALESCE(s.tokens_deducted, 0) > 0 OR s.sla_selected_at IS NOT NULL)
  INTO v_paid_triage
  FROM public.studies s
  WHERE s.id = p_study_id;

  IF p_cost IS NULL OR p_cost < 0 THEN
    RAISE EXCEPTION 'Invalid token cost';
  END IF;

  IF p_cost = 0 THEN
    IF NOT COALESCE(v_paid_triage, false) THEN
      RAISE EXCEPTION 'SLA must be selected (triage tokens already paid) before signing';
    END IF;

    SELECT COALESCE(w.tokens, 0) INTO v_balance_after
    FROM public.wallets w
    WHERE w.user_id = v_study_owner;

    IF v_balance_after IS NULL THEN
      v_balance_after := 0;
    END IF;
  ELSE
    SELECT w.tokens INTO v_current_tokens
    FROM public.wallets w
    WHERE w.user_id = v_study_owner
    FOR UPDATE;

    IF v_current_tokens IS NULL OR v_current_tokens < p_cost THEN
      RAISE EXCEPTION 'Insufficient tokens. Required: %, Available: %', p_cost, COALESCE(v_current_tokens, 0);
    END IF;

    v_balance_after := v_current_tokens - p_cost;

    UPDATE public.wallets w
    SET tokens = v_balance_after,
        updated_at = NOW()
    WHERE w.user_id = v_study_owner;
  END IF;

  INSERT INTO public.reports (study_id, interpreter, status, content, signed_at)
  VALUES (p_study_id, p_user_id, 'signed', p_content, NOW())
  ON CONFLICT (study_id) DO UPDATE
  SET interpreter = p_user_id,
      status = 'signed',
      content = p_content,
      signed_at = NOW()
  RETURNING id INTO v_report_id;

  UPDATE public.studies SET state = 'signed' WHERE id = p_study_id;

  INSERT INTO public.review_events (study_id, actor, event, payload)
  VALUES (
    p_study_id,
    p_user_id,
    'sign',
    jsonb_build_object(
      'tokens_deducted', p_cost,
      'report_id', v_report_id,
      'triage_pre_paid', p_cost = 0
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'report_id', v_report_id,
    'tokens_remaining', v_balance_after
  );
END;
$function$;
