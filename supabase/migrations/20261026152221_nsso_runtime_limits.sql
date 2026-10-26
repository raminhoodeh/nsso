BEGIN;
CREATE TABLE private.request_limits (
 scope text NOT NULL, subject_hash text NOT NULL, window_start timestamptz NOT NULL,
 requests integer NOT NULL CHECK(requests>=0), PRIMARY KEY(scope,subject_hash,window_start)
);
ALTER TABLE private.request_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.request_limits FROM PUBLIC,anon,authenticated;
CREATE TABLE private.runtime_signals (
 code text NOT NULL, window_start timestamptz NOT NULL, count bigint NOT NULL DEFAULT 0,
 PRIMARY KEY(code,window_start)
);
ALTER TABLE private.runtime_signals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.runtime_signals FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.record_nsso_runtime_signal(p_code text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF p_code NOT IN ('rate_denied','rate_unavailable','privilege_denied','mfa_required','payment_rejected','budget_unavailable','upstream_failed','request_rejected') THEN RAISE EXCEPTION 'Invalid signal' USING ERRCODE='22023'; END IF;
 INSERT INTO private.runtime_signals VALUES(p_code,date_trunc('hour',now()),1) ON CONFLICT(code,window_start) DO UPDATE SET count=private.runtime_signals.count+1;
 DELETE FROM private.runtime_signals WHERE window_start<now()-interval '30 days';
END $$;
REVOKE ALL ON FUNCTION public.record_nsso_runtime_signal(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_nsso_runtime_signal(text) TO service_role;
CREATE FUNCTION public.consume_nsso_request_limit(p_scope text,p_subject_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_min timestamptz:=date_trunc('minute',now()); v_day timestamptz:=date_trunc('day',now());
 v_user_min int;v_user_day int;v_site_min int;v_site_day int;v_bad boolean;
BEGIN
 IF p_subject_hash IS NULL OR p_subject_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid limiter identity' USING ERRCODE='22023'; END IF;
 CASE p_scope
 WHEN 'photo' THEN v_user_min:=120;v_user_day:=1500;v_site_min:=600;v_site_day:=10000;
 WHEN 'film_media' THEN v_user_min:=120;v_user_day:=1500;v_site_min:=600;v_site_day:=10000;
 WHEN 'film_write' THEN v_user_min:=12;v_user_day:=100;v_site_min:=30;v_site_day:=300;
 WHEN 'chat' THEN v_user_min:=30;v_user_day:=300;v_site_min:=120;v_site_day:=3000;
 WHEN 'upload_actor' THEN v_user_min:=12;v_user_day:=100;v_site_min:=60;v_site_day:=1000;
 WHEN 'upload' THEN v_user_min:=12;v_user_day:=100;v_site_min:=60;v_site_day:=1000;
 WHEN 'mutation' THEN v_user_min:=240;v_user_day:=6000;v_site_min:=1000;v_site_day:=30000;
 WHEN 'lookup' THEN v_user_min:=60;v_user_day:=1000;v_site_min:=300;v_site_day:=10000;
 WHEN 'health' THEN v_user_min:=30;v_user_day:=1000;v_site_min:=300;v_site_day:=10000;
 ELSE RAISE EXCEPTION 'Invalid limiter scope' USING ERRCODE='22023'; END CASE;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('nsso-runtime/'||p_scope,0));
 SELECT EXISTS(SELECT 1 FROM (VALUES(p_scope||'/minute',p_subject_hash,v_min,v_user_min),(p_scope||'/day',p_subject_hash,v_day,v_user_day),(p_scope||'/minute','site',v_min,v_site_min),(p_scope||'/day','site',v_day,v_site_day)) AS b(scope,subject_hash,window_start,maximum) JOIN private.request_limits l USING(scope,subject_hash,window_start) WHERE l.requests>=b.maximum) INTO v_bad;
 IF v_bad THEN PERFORM public.record_nsso_runtime_signal('rate_denied'); RETURN jsonb_build_object('allowed',false,'retryAfter',60); END IF;
 INSERT INTO private.request_limits(scope,subject_hash,window_start,requests) VALUES
 (p_scope||'/minute',p_subject_hash,v_min,1),(p_scope||'/day',p_subject_hash,v_day,1),(p_scope||'/minute','site',v_min,1),(p_scope||'/day','site',v_day,1)
 ON CONFLICT(scope,subject_hash,window_start) DO UPDATE SET requests=private.request_limits.requests+1;
 DELETE FROM private.request_limits WHERE window_start<v_day-interval '2 days';
 RETURN jsonb_build_object('allowed',true);
END $$;
REVOKE ALL ON FUNCTION public.consume_nsso_request_limit(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.consume_nsso_request_limit(text,text) TO service_role;
COMMENT ON TABLE private.request_limits IS 'HMAC-only endpoint counters, no IPs or content; two-day rolling retention. Service-only atomic per-subject and shared limits.';
COMMENT ON TABLE private.runtime_signals IS 'Hourly aggregate operational counts; no actor IDs, URLs, prompts or payloads; thirty-day rolling retention.';
NOTIFY pgrst,'reload schema';
COMMIT;

BEGIN;
CREATE FUNCTION public.nsso_security_health()
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
  AND NOT EXISTS(SELECT 1 FROM private.runtime_signals WHERE window_start>=date_trunc('hour',now()) AND ((code='rate_denied' AND count>1000) OR (code IN ('payment_rejected','privilege_denied','budget_unavailable','upstream_failed') AND count>50))))
 $$;
REVOKE ALL ON FUNCTION public.nsso_security_health() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.nsso_security_health() TO service_role;
COMMIT;
