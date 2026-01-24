-- Fix user creation: profiles AFTER INSERT trigger calls ensure_wallets(),
-- which currently references a dropped table (earnings_wallets) and aborts auth user creation.
-- This revision keeps the required wallet init, without referencing removed billing tables.
CREATE OR REPLACE FUNCTION public.ensure_wallets()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.wallets(user_id, tokens)
  VALUES (NEW.id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Fix SKU editing from /admin/clinics: admin_update_clinic previously ignored sku.
CREATE OR REPLACE FUNCTION public.admin_update_clinic(p_clinic_id uuid, p_updates jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sku text;
BEGIN
  IF NOT (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'management'::app_role)
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  v_sku := NULLIF(p_updates->>'sku', '');
  IF v_sku IS NOT NULL AND v_sku NOT IN ('internal', 'pilot', 'prod') THEN
    RAISE EXCEPTION 'Invalid SKU tier: %', v_sku;
  END IF;

  UPDATE public.clinics
  SET
    is_active = COALESCE((p_updates->>'is_active')::boolean, is_active),
    name = COALESCE(NULLIF(p_updates->>'name', ''), name),
    city = COALESCE(NULLIF(p_updates->>'city', ''), city),
    sku = COALESCE(v_sku, sku)
  WHERE id = p_clinic_id;

  INSERT INTO public.audit_logs (user_id, event_type, event_data)
  VALUES (
    auth.uid(),
    'admin_clinic_update',
    jsonb_build_object(
      'clinic_id', p_clinic_id,
      'updates', p_updates
    )
  );

  RETURN jsonb_build_object('success', true);
END;
$$;
