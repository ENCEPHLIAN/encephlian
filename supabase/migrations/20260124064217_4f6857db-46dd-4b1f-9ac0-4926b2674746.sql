-- Fix linter: convert views to SECURITY INVOKER so they don't run with creator privileges.
ALTER VIEW public.my_memberships SET (security_invoker = true);
ALTER VIEW public.user_clinic_context SET (security_invoker = true);
