-- Fix search_path for security definer functions to prevent potential security warnings
ALTER FUNCTION get_current_fy() SET search_path = public;
ALTER FUNCTION get_current_quarter() SET search_path = public;
