-- Update admin_get_dashboard_stats to exclude super_admin from active_users count
CREATE OR REPLACE FUNCTION public.admin_get_dashboard_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_stats jsonb;
BEGIN
  IF NOT (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'ops'::app_role) OR has_role(auth.uid(), 'management'::app_role)) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  SELECT jsonb_build_object(
    'total_clinics', (SELECT COUNT(*) FROM clinics),
    'total_studies', (SELECT COUNT(*) FROM studies),
    'studies_by_state', (
      SELECT jsonb_object_agg(COALESCE(state, 'unknown'), cnt)
      FROM (SELECT state, COUNT(*) as cnt FROM studies GROUP BY state) sub
    ),
    'total_tokens_sold', (SELECT COALESCE(SUM(credits_purchased), 0) FROM payments WHERE status = 'captured'),
    'total_tokens_consumed', (SELECT COALESCE(SUM(c.amount_inr / 200), 0) FROM commissions c),
    'active_users', (
      SELECT COUNT(DISTINCT w.user_id) 
      FROM wallets w 
      WHERE w.updated_at > NOW() - INTERVAL '30 days'
        AND NOT EXISTS (
          SELECT 1 FROM user_roles ur 
          WHERE ur.user_id = w.user_id AND ur.role = 'super_admin'
        )
    )
  ) INTO v_stats;

  RETURN v_stats;
END;
$function$;