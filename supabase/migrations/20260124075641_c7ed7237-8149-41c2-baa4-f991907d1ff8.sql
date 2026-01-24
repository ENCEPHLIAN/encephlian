-- Update admin_update_clinic to accept 'demo' SKU instead of 'prod'
CREATE OR REPLACE FUNCTION public.admin_update_clinic(p_clinic_id uuid, p_updates jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller_id uuid;
  v_sku text;
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

  -- Validate SKU if provided
  IF p_updates ? 'sku' THEN
    v_sku := p_updates->>'sku';
    IF v_sku NOT IN ('internal', 'pilot', 'demo') THEN
      RAISE EXCEPTION 'Invalid SKU: %. Must be internal, pilot, or demo', v_sku;
    END IF;
  END IF;

  -- Update the clinic
  UPDATE public.clinics
  SET
    name = COALESCE(p_updates->>'name', name),
    city = COALESCE(p_updates->>'city', city),
    sku = COALESCE(v_sku, sku),
    is_active = COALESCE((p_updates->>'is_active')::boolean, is_active),
    brand_name = COALESCE(p_updates->>'brand_name', brand_name),
    logo_url = COALESCE(p_updates->>'logo_url', logo_url),
    primary_color = COALESCE(p_updates->>'primary_color', primary_color),
    secondary_color = COALESCE(p_updates->>'secondary_color', secondary_color)
  WHERE id = p_clinic_id;

  -- Audit log
  INSERT INTO public.audit_logs (user_id, event_type, event_data)
  VALUES (
    v_caller_id,
    'clinic_updated',
    jsonb_build_object('clinic_id', p_clinic_id, 'updates', p_updates)
  );

  RETURN jsonb_build_object('success', true, 'clinic_id', p_clinic_id);
END;
$$;