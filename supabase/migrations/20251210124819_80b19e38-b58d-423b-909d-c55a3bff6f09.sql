-- Fix admin_push_eeg_to_user function for management role access
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
  v_caller_id uuid := auth.uid();
BEGIN
  -- Check caller is super_admin or management
  IF NOT (
    has_role(v_caller_id, 'super_admin') OR 
    has_role(v_caller_id, 'management')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Only super_admin or management can push EEG files';
  END IF;

  -- Create study with awaiting_sla state and pending SLA
  INSERT INTO public.studies (
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
    'awaiting_sla',
    'pending',
    'pending'
  )
  RETURNING id INTO v_study_id;

  -- Create corresponding study_files record
  INSERT INTO public.study_files (
    study_id,
    kind,
    path
  ) VALUES (
    v_study_id,
    'raw',
    p_file_path
  );

  -- Log audit event
  INSERT INTO public.audit_logs (user_id, event_type, event_data)
  VALUES (
    v_caller_id,
    'admin_push_eeg',
    jsonb_build_object(
      'study_id', v_study_id,
      'target_user_id', p_user_id,
      'clinic_id', p_clinic_id,
      'file_path', p_file_path
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'study_id', v_study_id
  );
END;
$$;

-- Update wallet RLS policies to recognize management role
DROP POLICY IF EXISTS "wallet_update" ON public.wallets;
CREATE POLICY "wallet_update" ON public.wallets
FOR UPDATE USING (
  (user_id = auth.uid()) OR 
  has_role(auth.uid(), 'super_admin') OR
  has_role(auth.uid(), 'management')
);

-- Add admin wallet insert policy for adjustments
DROP POLICY IF EXISTS "admin_wallet_adjust" ON public.wallets;
CREATE POLICY "admin_wallet_adjust" ON public.wallets
FOR INSERT WITH CHECK (
  has_role(auth.uid(), 'super_admin') OR
  has_role(auth.uid(), 'management')
);

-- Update wallet_transactions policies for management
DROP POLICY IF EXISTS "Admins can insert transactions" ON public.wallet_transactions;
CREATE POLICY "Admins can insert transactions" ON public.wallet_transactions
FOR INSERT WITH CHECK (
  has_role(auth.uid(), 'super_admin') OR
  has_role(auth.uid(), 'management')
);

DROP POLICY IF EXISTS "Admins can view all transactions" ON public.wallet_transactions;
CREATE POLICY "Admins can view all transactions" ON public.wallet_transactions
FOR SELECT USING (
  has_role(auth.uid(), 'super_admin') OR
  has_role(auth.uid(), 'management')
);