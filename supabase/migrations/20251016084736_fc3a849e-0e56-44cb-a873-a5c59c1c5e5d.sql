-- Fix security linter warnings from previous migration

-- Fix 1 & 2: Remove SECURITY DEFINER from view and recreate without it
-- Views should rely on caller's permissions, not view owner's
DROP VIEW IF EXISTS public.user_clinic_context;

CREATE VIEW public.user_clinic_context 
WITH (security_invoker=true)
AS
SELECT 
  ur.user_id,
  ur.role,
  c.id as clinic_id,
  c.name as clinic_name,
  c.brand_name,
  c.logo_url,
  c.primary_color,
  c.secondary_color
FROM public.user_roles ur
JOIN public.clinics c ON c.id = ur.clinic_id
WHERE ur.role = 'neurologist';

-- Grant access to the view
GRANT SELECT ON public.user_clinic_context TO authenticated;

-- Fix 3 & 4: Ensure search_path is set on all functions
-- (Already set on has_role and get_user_clinic_id, but let's verify)

-- Recreate ensure_wallets function with proper search_path
CREATE OR REPLACE FUNCTION public.ensure_wallets()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  INSERT INTO wallets(user_id, tokens) VALUES (NEW.id, 0)
  ON CONFLICT (user_id) DO NOTHING;
  
  INSERT INTO earnings_wallets(user_id, balance_inr, total_earned_inr) 
  VALUES (NEW.id, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;
  
  RETURN NEW;
END;
$function$;

-- Recreate handle_new_user function with proper search_path
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );
  RETURN NEW;
END;
$function$;