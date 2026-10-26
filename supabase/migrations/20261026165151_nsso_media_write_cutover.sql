-- Apply only AFTER server-validated media clients and registry are deployed.
-- Existing public URLs/bytes and verified legacy-owner DELETE remain intact.
-- Browser writes can no longer bypass server raster decoding and actor quotas.
BEGIN;
DROP POLICY IF EXISTS nsso_avatar_insert ON storage.objects;
DROP POLICY IF EXISTS nsso_avatar_update ON storage.objects;
DROP POLICY IF EXISTS nsso_portfolio_insert ON storage.objects;
DROP POLICY IF EXISTS nsso_portfolio_update ON storage.objects;
-- Final-only health checks must not require these grants before adapter deploy.
CREATE OR REPLACE FUNCTION public.nsso_security_health()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('healthy',
  (SELECT array_agg(column_name::text ORDER BY ordinal_position)=ARRAY['id','username','is_premium','created_at'] FROM information_schema.columns WHERE table_schema='public' AND table_name='users')
  AND NOT has_table_privilege('anon','public.users','UPDATE')
  AND NOT has_table_privilege('authenticated','public.users','UPDATE')
  AND NOT has_column_privilege('anon','public.products','paypal_html','SELECT')
  AND NOT has_table_privilege('anon','public.agent_knowledge','SELECT')
  AND NOT has_function_privilege('anon','public.consume_nsso_request_limit(text,text)','EXECUTE')
  AND NOT has_function_privilege('anon','public.reserve_nsso_chat_budget(text,uuid,text,bigint)','EXECUTE')
  AND to_regprocedure('public.apply_profile_operation(jsonb)') IS NOT NULL
  AND (SELECT count(*)=7 AND bool_and(c.relrowsecurity) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('profiles','links','contacts','experiences','qualifications','projects','products'))
  AND NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN (VALUES('anon'::text),('authenticated'::text)) actor(role_name)
   WHERE n.nspname='public' AND c.relname IN ('profiles','links','contacts','experiences','qualifications','projects','products')
   AND (has_table_privilege(actor.role_name,c.oid,'INSERT') OR has_table_privilege(actor.role_name,c.oid,'UPDATE') OR has_table_privilege(actor.role_name,c.oid,'DELETE')
    OR EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped AND (has_column_privilege(actor.role_name,c.oid,a.attnum,'INSERT') OR has_column_privilege(actor.role_name,c.oid,a.attnum,'UPDATE')))))
  AND (SELECT relrowsecurity FROM pg_class WHERE oid='storage.objects'::regclass)
  AND NOT EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid='storage.objects'::regclass AND p.polcmd IN ('a','w','*')
   AND (0=ANY(p.polroles) OR EXISTS(SELECT 1 FROM pg_roles r WHERE r.rolname IN ('anon','authenticated') AND r.oid=ANY(p.polroles))))
  AND NOT EXISTS(SELECT 1 FROM private.runtime_signals WHERE window_start>=date_trunc('hour',now()) AND ((code='rate_denied' AND count>1000) OR (code IN ('payment_rejected','privilege_denied','budget_unavailable','upstream_failed') AND count>50))))
 $$;
REVOKE ALL ON FUNCTION public.nsso_security_health() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.nsso_security_health() TO service_role;
COMMIT;
