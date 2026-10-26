-- NSSO empty-project bootstrap, PostgreSQL 17 / Supabase managed schemas.
-- Generated from the rehearsed remediated application schema. DDL/ACLs only:
-- NO customer rows, source corpus, credentials, approved identities or role seeds.
-- NEVER run against an existing project. Existing projects use forward migrations.
-- Run with psql -v ON_ERROR_STOP=1 -f supabase/bootstrap/schema.sql on a fresh
-- Supabase project whose Auth/Storage managed schemas and standard roles exist.
-- Do not replay historical/manual migration files before or after this baseline.
BEGIN;
DO $guard$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname IN ('public','private') AND c.relkind IN ('r','p','v','m')) THEN
   RAISE EXCEPTION 'Bootstrap requires empty application schemas; use forward migrations for existing projects';
 END IF;
 IF EXISTS(SELECT 1 FROM auth.users) OR EXISTS(SELECT 1 FROM storage.objects)
   OR EXISTS(SELECT 1 FROM storage.buckets WHERE id IN ('avatars','portfolio-assets','razinflix_posters')) THEN
   RAISE EXCEPTION 'Bootstrap requires empty Auth and application storage; existing data is never reset';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='vector' AND n.nspname<>'public') THEN
   RAISE EXCEPTION 'Expected vector in public schema or absent; review this project before bootstrapping';
 END IF;
END $guard$;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
REVOKE CREATE ON SCHEMA public FROM PUBLIC,anon,authenticated;
--
-- PostgreSQL database dump
--


-- Dumped from database version 17.11
-- Dumped by pg_dump version 17.11

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: private; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA private;


--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- Supabase provides public; application schemas were checked empty above.


--
-- Name: account_dto(uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.account_dto(p_user_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
 SELECT jsonb_build_object('id',u.id,'username',u.username,'email',a.email,
   'auth_provider',coalesce(a.raw_app_meta_data->>'provider',s.auth_provider,'email'),
   'user_type',CASE WHEN EXISTS(SELECT 1 FROM private.app_permissions ap WHERE ap.user_id=u.id AND ap.permission='nsso:admin') THEN 'admin' ELSE 'standard' END,
   'permissions',coalesce((SELECT jsonb_agg(ap.permission ORDER BY ap.permission) FROM private.app_permissions ap WHERE ap.user_id=u.id),'[]'::jsonb),
   'is_premium',true,'created_at',u.created_at,'referral_code',s.referral_code,
   'paypal_me_slug',s.paypal_me_slug,'referred_by_code',s.referred_by_code,'deity_fast_mode',s.deity_fast_mode)
 FROM public.users u JOIN auth.users a ON a.id=u.id JOIN private.account_settings s ON s.user_id=u.id WHERE u.id=p_user_id
$$;


--
-- Name: admin_list_accounts(uuid, integer, integer); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.admin_list_accounts(p_actor_id uuid, p_offset integer, p_limit integer) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$ DECLARE result jsonb; BEGIN
 IF NOT EXISTS(SELECT 1 FROM private.app_permissions WHERE user_id=p_actor_id AND permission='nsso:admin') THEN
   RAISE EXCEPTION 'Administrator permission required' USING ERRCODE='42501'; END IF;
 IF p_offset IS NULL OR p_offset<0 OR p_offset>1000000 OR p_limit IS NULL OR p_limit<1 OR p_limit>100 THEN
   RAISE EXCEPTION 'Invalid pagination' USING ERRCODE='22023'; END IF;
 SELECT coalesce(jsonb_agg(x.item),'[]'::jsonb) INTO result FROM (
   SELECT jsonb_build_object('id',u.id,'username',u.username,'created_at',u.created_at,'is_premium',true,'email',a.email,
     'auth_provider',coalesce(a.raw_app_meta_data->>'provider',s.auth_provider,'email'),
     'user_type',CASE WHEN ap.user_id IS NOT NULL THEN 'admin' ELSE 'standard' END,
     'permissions',coalesce((SELECT jsonb_agg(m.permission ORDER BY m.permission) FROM private.app_permissions m WHERE m.user_id=u.id),'[]'::jsonb),
     'profiles',jsonb_build_object('full_name',p.full_name)) AS item
   FROM public.users u JOIN auth.users a ON a.id=u.id LEFT JOIN private.account_settings s ON s.user_id=u.id
   LEFT JOIN public.profiles p ON p.user_id=u.id LEFT JOIN private.app_permissions ap ON ap.user_id=u.id AND ap.permission='nsso:admin'
   ORDER BY u.created_at DESC NULLS LAST,u.id LIMIT p_limit OFFSET p_offset
 ) x; RETURN result;
END $$;


--
-- Name: admin_set_permission(uuid, uuid, text, boolean); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.admin_set_permission(p_actor_id uuid, p_user_id uuid, p_permission text, p_granted boolean) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$ BEGIN
 -- One lock serializes removals, preventing concurrent deletion of both final admins.
 PERFORM pg_catalog.pg_advisory_xact_lock(719,721);
 IF NOT EXISTS(SELECT 1 FROM private.app_permissions WHERE user_id=p_actor_id AND permission='nsso:admin') THEN
   RAISE EXCEPTION 'Administrator permission required' USING ERRCODE='42501'; END IF;
 IF p_permission NOT IN ('nsso:admin','razinflix:manage') OR p_granted IS NULL THEN
   RAISE EXCEPTION 'Invalid permission' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user_id) THEN RAISE EXCEPTION 'Account not found' USING ERRCODE='23503'; END IF;
 IF NOT p_granted AND p_permission='nsso:admin' AND EXISTS(SELECT 1 FROM private.app_permissions WHERE user_id=p_user_id AND permission=p_permission)
   AND (SELECT count(*) FROM private.app_permissions WHERE permission='nsso:admin')<=1 THEN
   RAISE EXCEPTION 'Cannot remove the last administrator' USING ERRCODE='23514'; END IF;
 IF p_granted THEN
   INSERT INTO private.app_permissions(user_id,permission,granted_by) VALUES(p_user_id,p_permission,p_actor_id) ON CONFLICT DO NOTHING;
 ELSE DELETE FROM private.app_permissions WHERE user_id=p_user_id AND permission=p_permission; END IF;
 INSERT INTO private.permission_audit(actor_id,target_user_id,permission,granted) VALUES(p_actor_id,p_user_id,p_permission,p_granted);
 RETURN jsonb_build_object('success',true);
END $$;


--
-- Name: claim_profile_username(text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.claim_profile_username(p_username text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$ DECLARE v_username text:=lower(p_username); BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF p_username IS NULL OR p_username !~ '^[a-zA-Z0-9_-]{3,30}$' OR v_username=ANY(ARRAY[
 'admin','api','app','assets','auth','dashboard','deity','docs','dreamsea','earnings','film','news','places','preview','products','profile','reset-password','set-password','settings','sign-in','sign-up','www']) THEN
   RAISE EXCEPTION 'Invalid or reserved username' USING ERRCODE='22023'; END IF;
 PERFORM private.ensure_account_for(auth.uid());
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_username,720));
 IF EXISTS(SELECT 1 FROM public.users WHERE lower(username)=v_username AND id<>auth.uid()) THEN
   RAISE EXCEPTION 'Username already taken' USING ERRCODE='23505'; END IF;
 UPDATE public.users SET username=v_username,is_premium=true WHERE id=auth.uid();
 RETURN jsonb_build_object('success',true,'username',v_username);
END $_$;


--
-- Name: connect_my_nsso(uuid, text, double precision, double precision); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.connect_my_nsso(p_connected_user_id uuid, p_location_name text, p_location_lat double precision, p_location_long double precision) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$ DECLARE v_new boolean; v_username text; BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF p_connected_user_id IS NULL OR p_connected_user_id=auth.uid() OR length(coalesce(p_location_name,''))>500
    OR (p_location_lat IS NOT NULL AND NOT(p_location_lat BETWEEN -90 AND 90))
    OR (p_location_long IS NOT NULL AND NOT(p_location_long BETWEEN -180 AND 180)) THEN
   RAISE EXCEPTION 'Invalid connection' USING ERRCODE='22023'; END IF;
 SELECT username INTO v_username FROM public.users WHERE id=p_connected_user_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found' USING ERRCODE='P0002'; END IF;
 PERFORM private.ensure_account_for(auth.uid());
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(least(auth.uid()::text,p_connected_user_id::text)||greatest(auth.uid()::text,p_connected_user_id::text),722));
 SELECT NOT EXISTS(SELECT 1 FROM public.my_nsso WHERE user_id=auth.uid() AND connected_user_id=p_connected_user_id) INTO v_new;
 INSERT INTO public.my_nsso(user_id,connected_user_id,date_met,location_name,location_lat,location_long)
 VALUES(auth.uid(),p_connected_user_id,now(),coalesce(p_location_name,''),p_location_lat,p_location_long)
 ON CONFLICT(user_id,connected_user_id) DO UPDATE SET date_met=excluded.date_met,location_name=excluded.location_name,
   location_lat=excluded.location_lat,location_long=excluded.location_long,updated_at=now();
 -- Reverse identity is created once; scanner cannot edit the recipient's notes/location.
 INSERT INTO public.my_nsso(user_id,connected_user_id) VALUES(p_connected_user_id,auth.uid()) ON CONFLICT(user_id,connected_user_id) DO NOTHING;
 RETURN jsonb_build_object('success',true,'isNewConnection',v_new,'scannedUser',jsonb_build_object('username',v_username));
END $$;


--
-- Name: ensure_account_for(uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.ensure_account_for(p_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$ DECLARE a auth.users%ROWTYPE; v_code text; BEGIN
 SELECT * INTO a FROM auth.users WHERE id=p_user_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Account identity missing' USING ERRCODE='23503'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,719));
 INSERT INTO public.users(id,username,is_premium)
 VALUES(a.id,'user_'||substr(replace(a.id::text,'-',''),1,24),true) ON CONFLICT(id) DO NOTHING;
 INSERT INTO public.profiles(user_id) VALUES(a.id) ON CONFLICT(user_id) DO NOTHING;
 v_code:='NS'||upper(replace(a.id::text,'-',''));
 INSERT INTO private.account_settings(user_id,email,auth_provider,referral_code)
 VALUES(a.id,a.email,coalesce(a.raw_app_meta_data->>'provider','email'),v_code)
 ON CONFLICT(user_id) DO UPDATE SET email=excluded.email,auth_provider=excluded.auth_provider,
   referral_code=coalesce(private.account_settings.referral_code,excluded.referral_code),updated_at=now();
END $$;


--
-- Name: ensure_current_account(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.ensure_current_account() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$ BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 PERFORM private.ensure_account_for(auth.uid()); RETURN private.account_dto(auth.uid());
END $$;


--
-- Name: get_current_account(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.get_current_account() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$ BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 RETURN private.account_dto(auth.uid());
END $$;


--
-- Name: own_products(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.own_products() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$ DECLARE result jsonb; BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(private.product_details(p.id) ORDER BY p.created_at),'[]'::jsonb) INTO result FROM public.products p WHERE user_id=auth.uid();
 RETURN result;
END $$;


--
-- Name: product_details(uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.product_details(p_product_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$ DECLARE p public.products%ROWTYPE; v_owner boolean; result jsonb; BEGIN
 SELECT * INTO p FROM public.products WHERE id=p_product_id;
 IF NOT FOUND THEN RETURN NULL; END IF;
 v_owner:=auth.uid() IS NOT NULL AND auth.uid()=p.user_id;
 IF NOT v_owner AND p.sales_page_published IS FALSE THEN RETURN NULL; END IF;
 -- Enumerate the public contract so future internal columns cannot leak by default.
 result:=jsonb_build_object('id',p.id,'user_id',p.user_id,'name',p.name,'price',p.price,'image_url',p.image_url,
   'description',p.description,'purchase_link',p.purchase_link,'purchase_link_active',p.purchase_link_active,
   'paypal_active',p.paypal_active,'created_at',p.created_at,'sales_page_active',p.sales_page_active,
   'sales_page_published',p.sales_page_published,'payment_config',p.payment_config,'headline',p.headline,
   'tagline',p.tagline,'intro_text',p.intro_text,'value_proposition',p.value_proposition,'video_url',p.video_url,
   'benefits',p.benefits,'testimonials',p.testimonials);
 IF v_owner THEN result:=result||jsonb_build_object('paypal_html',p.paypal_html,'success_url',p.success_url); END IF;
 RETURN result;
END $$;


--
-- Name: register_referral(text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.register_referral(p_referral_code text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$ DECLARE v_referrer uuid; BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF p_referral_code IS NULL OR length(p_referral_code)>100 THEN RAISE EXCEPTION 'Invalid referral code' USING ERRCODE='22023'; END IF;
 PERFORM private.ensure_account_for(auth.uid());
 SELECT user_id INTO v_referrer FROM private.account_settings WHERE referral_code=p_referral_code;
 IF v_referrer IS NULL OR v_referrer=auth.uid() THEN RAISE EXCEPTION 'Invalid referral code' USING ERRCODE='22023'; END IF;
 INSERT INTO public.referrals(referrer_user_id,referred_user_id,referral_code,subscription_status)
 VALUES(v_referrer,auth.uid(),p_referral_code,'pending') ON CONFLICT(referred_user_id) DO NOTHING;
 UPDATE private.account_settings s SET referred_by_code=r.referral_code,updated_at=now()
 FROM public.referrals r WHERE r.referred_user_id=auth.uid() AND s.user_id=auth.uid() AND s.referred_by_code IS NULL;
 RETURN jsonb_build_object('success',true);
END $$;


--
-- Name: update_account_settings(jsonb); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.update_account_settings(p_patch jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$ BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF p_patch IS NULL OR jsonb_typeof(p_patch)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_patch) k WHERE k NOT IN ('paypal_me_slug','deity_fast_mode')) THEN
   RAISE EXCEPTION 'Unsupported account setting' USING ERRCODE='22023'; END IF;
 IF p_patch ? 'deity_fast_mode' AND jsonb_typeof(p_patch->'deity_fast_mode')<>'boolean' THEN RAISE EXCEPTION 'Invalid preference' USING ERRCODE='22023'; END IF;
 IF p_patch ? 'paypal_me_slug' AND NOT(p_patch->'paypal_me_slug'='null'::jsonb OR (jsonb_typeof(p_patch->'paypal_me_slug')='string' AND (p_patch->>'paypal_me_slug') ~ '^[A-Za-z0-9_-]{0,50}$')) THEN
   RAISE EXCEPTION 'Invalid PayPal username' USING ERRCODE='22023'; END IF;
 PERFORM private.ensure_account_for(auth.uid());
 UPDATE private.account_settings SET
   paypal_me_slug=CASE WHEN p_patch ? 'paypal_me_slug' THEN nullif(p_patch->>'paypal_me_slug','') ELSE paypal_me_slug END,
   deity_fast_mode=CASE WHEN p_patch ? 'deity_fast_mode' THEN (p_patch->>'deity_fast_mode')::boolean ELSE deity_fast_mode END,
   updated_at=now() WHERE user_id=auth.uid();
 RETURN private.account_dto(auth.uid());
END $_$;


--
-- Name: valid_paypal_config(jsonb); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.valid_paypal_config(p jsonb) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO ''
    AS $_$
DECLARE f jsonb; n text; v text; seen text[]:='{}'; vals jsonb:='{}'; currencies text[]:=ARRAY[
 'AUD','BRL','CAD','CZK','DKK','EUR','HKD','HUF','ILS','JPY','MYR','MXN','TWD','NZD','NOK','PHP','PLN','GBP','RUB','SGD','SEK','CHF','THB','USD'];
BEGIN
 IF p IS NULL THEN RETURN true; END IF;
 IF jsonb_typeof(p)<>'object' OR p->'version' IS DISTINCT FROM '1'::jsonb THEN RETURN false; END IF;
 IF p->>'kind'='hosted-button' THEN
   RETURN (SELECT count(*)=4 AND bool_and(k=ANY(ARRAY['version','kind','hostedButtonId','currency'])) FROM jsonb_object_keys(p) k)
     AND jsonb_typeof(p->'hostedButtonId')='string' AND p->>'hostedButtonId' ~ '^[A-Z0-9]{1,64}$'
     AND jsonb_typeof(p->'currency')='string' AND p->>'currency'=ANY(currencies);
 END IF;
 IF p->>'kind' IS DISTINCT FROM 'payment-form' OR NOT (SELECT count(*)=5 AND bool_and(k=ANY(ARRAY['version','kind','action','fields','label'])) FROM jsonb_object_keys(p) k)
   OR jsonb_typeof(p->'action') IS DISTINCT FROM 'string'
   OR NOT (p->>'action' ~ '^https://www[.]paypal[.]com/ncp/payment/[A-Z0-9]{1,64}$' OR p->>'action'='https://www.paypal.com/cgi-bin/webscr')
   OR jsonb_typeof(p->'label') IS DISTINCT FROM 'string' OR length(btrim(p->>'label'))=0 OR length(p->>'label')>80 OR p->>'label' ~ '[[:cntrl:]]'
   OR jsonb_typeof(p->'fields') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
 IF jsonb_array_length(p->'fields')>32 THEN RETURN false; END IF;
 FOR f IN SELECT value FROM jsonb_array_elements(p->'fields') LOOP
   IF jsonb_typeof(f)<>'object' OR NOT (SELECT count(*)=2 AND bool_and(k=ANY(ARRAY['name','value'])) FROM jsonb_object_keys(f) k)
     OR jsonb_typeof(f->'name') IS DISTINCT FROM 'string' OR jsonb_typeof(f->'value') IS DISTINCT FROM 'string' THEN RETURN false; END IF;
   n:=f->>'name'; v:=f->>'value';
   IF n=ANY(seen) OR NOT(n=ANY(ARRAY['cmd','business','hosted_button_id','item_name','item_number','amount','currency_code','quantity','no_shipping','no_note','return','cancel_return','notify_url','rm','charset','custom','invoice','lc','bn']))
      OR length(v)>2048 OR v ~ '[[:cntrl:]]' THEN RETURN false; END IF;
   seen:=array_append(seen,n); vals:=vals||jsonb_build_object(n,v);
   IF n='cmd' AND NOT(v=ANY(ARRAY['_xclick','_s-xclick','_cart'])) THEN RETURN false; END IF;
   IF n='hosted_button_id' AND v !~ '^[A-Z0-9]{1,64}$' THEN RETURN false; END IF;
   IF n='currency_code' AND NOT(v=ANY(currencies)) THEN RETURN false; END IF;
   IF n='amount' THEN
     IF v !~ '^[0-9]{1,10}([.][0-9]{1,2})?$' THEN RETURN false; END IF;
     IF v::numeric>1000000000 THEN RETURN false; END IF;
   END IF;
   IF n='quantity' AND v !~ '^[1-9][0-9]{0,3}$' THEN RETURN false; END IF;
   IF n=ANY(ARRAY['return','cancel_return','notify_url']) AND v !~ '^https://[^/?#@[:space:]]+([/?#][^[:cntrl:]]*)?$' THEN RETURN false; END IF;
 END LOOP;
 IF p->>'action'='https://www.paypal.com/cgi-bin/webscr' AND
   (coalesce(vals->>'cmd','')='' OR (coalesce(vals->>'hosted_button_id','')='' AND
     (coalesce(vals->>'business','')='' OR coalesce(vals->>'amount','')='' OR coalesce(vals->>'currency_code','')=''))) THEN RETURN false; END IF;
 RETURN true;
END $_$;


--
-- Name: admin_list_accounts(uuid, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_list_accounts(p_actor_id uuid, p_offset integer DEFAULT 0, p_limit integer DEFAULT 100) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$ SELECT private.admin_list_accounts(p_actor_id,p_offset,p_limit) $$;


--
-- Name: admin_set_permission(uuid, uuid, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_set_permission(p_actor_id uuid, p_user_id uuid, p_permission text, p_granted boolean) RETURNS jsonb
    LANGUAGE sql
    SET search_path TO ''
    AS $$ SELECT private.admin_set_permission(p_actor_id,p_user_id,p_permission,p_granted) $$;


--
-- Name: claim_profile_username(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_profile_username(p_username text) RETURNS jsonb
    LANGUAGE sql
    SET search_path TO ''
    AS $$ SELECT private.claim_profile_username(p_username) $$;


--
-- Name: connect_my_nsso(uuid, text, double precision, double precision); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.connect_my_nsso(p_connected_user_id uuid, p_location_name text DEFAULT ''::text, p_location_lat double precision DEFAULT NULL::double precision, p_location_long double precision DEFAULT NULL::double precision) RETURNS jsonb
    LANGUAGE sql
    SET search_path TO ''
    AS $$ SELECT private.connect_my_nsso(p_connected_user_id,p_location_name,p_location_lat,p_location_long) $$;


--
-- Name: ensure_current_account(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_current_account() RETURNS jsonb
    LANGUAGE sql
    SET search_path TO ''
    AS $$ SELECT private.ensure_current_account() $$;


--
-- Name: finish_nsso_chat_budget(uuid, bigint, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.finish_nsso_chat_budget(p_request_id uuid, p_micros bigint, p_confirmed boolean) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare r public.nsso_chat_budget_requests%rowtype; charged bigint;
begin
  if p_micros is null or p_micros < 0 or p_micros > 100000 then raise exception 'Invalid budget settlement'; end if;
  perform pg_catalog.pg_advisory_xact_lock(739204,1);
  select * into r from public.nsso_chat_budget_requests where id=p_request_id;
  if not found or r.settled then return; end if;
  charged := case when p_confirmed then p_micros else r.reserved_micros end;
  update public.nsso_chat_budget_daily set used_micros=greatest(0,used_micros+charged-r.reserved_micros)
    where usage_day=r.usage_day and subject in ('global',r.ip_hash);
  update public.nsso_chat_budget_requests set settled=true, confirmed=coalesce(p_confirmed,false),charged_micros=charged where id=p_request_id;
end;
$$;


--
-- Name: get_agent_context(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_agent_context(user_uuid uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'profile', (
            SELECT json_build_object(
                'full_name', full_name,
                'headline', headline,
                'bio', bio
            )
            FROM profiles
            WHERE user_id = user_uuid
        ),
        'experiences', (
            SELECT COALESCE(json_agg(json_build_object(
                'job_title', job_title,
                'company_name', company_name,
                'start_year', start_year,
                'end_year', end_year
            )), '[]'::json)
            FROM experiences WHERE user_id = user_uuid
        ),
        'projects', (
            SELECT COALESCE(json_agg(json_build_object(
                'project_name', project_name,
                'description', description,
                'contribution', contribution
            )), '[]'::json)
            FROM projects WHERE user_id = user_uuid
        ),
        'products', (
            SELECT COALESCE(json_agg(json_build_object(
                'name', name,
                'description', description,
                'price', price,
                'purchase_link', purchase_link
            )), '[]'::json)
            FROM products WHERE user_id = user_uuid
        ),
        'links', (
            SELECT COALESCE(json_agg(json_build_object(
                'link_name', link_name,
                'link_url', link_url
            )), '[]'::json)
            FROM links WHERE user_id = user_uuid
        ),
        'qualifications', (
            SELECT COALESCE(json_agg(json_build_object(
                'qualification_name', qualification_name,
                'institution', institution,
                'start_year', start_year,
                'end_year', end_year
            )), '[]'::json)
            FROM qualifications WHERE user_id = user_uuid
        ),
        'contacts', (
            SELECT COALESCE(json_agg(json_build_object(
                'method', method,
                'value', value,
                'custom_method_name', custom_method_name
            )), '[]'::json)
            FROM contacts WHERE user_id = user_uuid
        )
    ) INTO result;
    
    RETURN result;
END;
$$;


--
-- Name: get_current_account(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_current_account() RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$ SELECT private.get_current_account() $$;


--
-- Name: get_own_products(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_own_products() RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$ SELECT private.own_products() $$;


--
-- Name: get_product_details(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_product_details(p_product_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$ SELECT private.product_details(p_product_id) $$;


--
-- Name: get_referred_users_details(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_referred_users_details() RETURNS TABLE(full_name text, username text, status text, activated_at timestamp with time zone, is_premium boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$ BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT p.full_name,u.username,r.subscription_status,coalesce(r.activated_at,r.created_at),true
 FROM public.referrals r JOIN public.users u ON u.id=r.referred_user_id LEFT JOIN public.profiles p ON p.user_id=u.id
 WHERE r.referrer_user_id=auth.uid() ORDER BY r.created_at DESC;
END $$;


--
-- Name: get_user_earnings_stats(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_earnings_stats(user_uuid uuid) RETURNS TABLE(referral_code text, active_referrals bigint, expected_earnings numeric, paypal_me_slug text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$ BEGIN
 IF auth.uid() IS NULL OR auth.uid()<>user_uuid THEN RAISE EXCEPTION 'Own account required' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT s.referral_code,count(r.id) FILTER(WHERE r.subscription_status='active'),0::numeric,s.paypal_me_slug
 FROM private.account_settings s LEFT JOIN public.referrals r ON r.referrer_user_id=s.user_id
 WHERE s.user_id=auth.uid() GROUP BY s.user_id,s.referral_code,s.paypal_me_slug;
END $$;


--
-- Name: handle_new_product(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_product() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
    INSERT INTO public.feed_pending_updates (user_id, type, reference_id, metadata)
    VALUES (
        NEW.user_id,
        'product_added',
        NEW.id,
        jsonb_build_object(
            'name', NEW.name,
            'price', NEW.price,
            'image_url', NEW.image_url
        )
    );
    RETURN NEW;
END;
$$;


--
-- Name: handle_new_project(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_project() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
    INSERT INTO public.feed_pending_updates (user_id, type, reference_id, metadata)
    VALUES (
        NEW.user_id,
        'project_added',
        NEW.id,
        jsonb_build_object(
            'project_name', NEW.project_name,
            'description', NEW.description,
            'project_photo_url', NEW.project_photo_url
        )
    );
    RETURN NEW;
END;
$$;


--
-- Name: handle_new_qualification(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_qualification() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
    INSERT INTO public.feed_pending_updates (user_id, type, reference_id, metadata)
    VALUES (
        NEW.user_id,
        'qualification_added',
        NEW.id,
        jsonb_build_object(
            'institution', NEW.institution,
            'qualification_name', NEW.qualification_name
        )
    );
    RETURN NEW;
END;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$ BEGIN PERFORM private.ensure_account_for(NEW.id); RETURN NEW; END $$;


--
-- Name: has_app_permission(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_app_permission(p_user_id uuid, p_permission text) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$ SELECT EXISTS(SELECT 1 FROM private.app_permissions WHERE user_id=p_user_id AND permission=p_permission) $$;


--
-- Name: hybrid_search(public.vector, text, double precision, integer, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.hybrid_search(query_embedding public.vector, query_text text, match_threshold double precision, match_count integer, filter_files text[] DEFAULT NULL::text[]) RETURNS TABLE(id uuid, content text, metadata jsonb, similarity double precision, keyword_score double precision, combined_score double precision)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    RETURN QUERY
    WITH vector_results AS (
        SELECT 
            ak.id,
            ak.content,
            ak.metadata,
            (1 - (ak.embedding <=> query_embedding))::double precision as similarity
        FROM agent_knowledge ak
        WHERE (filter_files IS NULL OR (ak.metadata->>'source') = ANY(filter_files))
    ),
    keyword_results AS (
        SELECT 
            ak.id,
            ts_rank(ak.content_tsvector, plainto_tsquery('english', query_text))::double precision as keyword_score
        FROM agent_knowledge ak
        WHERE (filter_files IS NULL OR (ak.metadata->>'source') = ANY(filter_files))
          AND ak.content_tsvector @@ plainto_tsquery('english', query_text)
    )
    SELECT 
        vr.id,
        vr.content,
        vr.metadata,
        vr.similarity,
        COALESCE(kr.keyword_score, 0.0)::double precision as keyword_score,
        ((vr.similarity * 0.7) + (COALESCE(kr.keyword_score, 0.0) * 0.3))::double precision as combined_score
    FROM vector_results vr
    LEFT JOIN keyword_results kr ON vr.id = kr.id
    WHERE vr.similarity > match_threshold
    ORDER BY combined_score DESC
    LIMIT match_count;
END;
$$;


--
-- Name: intelligent_search(public.vector, text, public.vector, double precision, integer, text[], integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.intelligent_search(query_embedding public.vector, query_text text, profile_embedding public.vector DEFAULT NULL::public.vector, match_threshold double precision DEFAULT 0.5, match_count integer DEFAULT 8, filter_files text[] DEFAULT NULL::text[], candidate_count integer DEFAULT 40) RETURNS TABLE(id uuid, content text, metadata jsonb, similarity double precision, profile_similarity double precision, keyword_score double precision, combined_score double precision)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    RETURN QUERY
    WITH vector_candidates AS (
        SELECT 
            ak.id,
            ak.content,
            ak.metadata,
            ak.embedding,
            ak.content_tsvector,
            (1 - (ak.embedding <=> query_embedding))::double precision as similarity
        FROM agent_knowledge ak
        WHERE (filter_files IS NULL OR (ak.metadata->>'source') = ANY(filter_files))
          AND (1 - (ak.embedding <=> query_embedding)) > (match_threshold - 0.1) 
        ORDER BY similarity DESC
        LIMIT candidate_count
    ),
    keyword_scores AS (
        SELECT 
            vc.id,
            ts_rank(vc.content_tsvector, plainto_tsquery('english', query_text))::double precision as kw_score
        FROM vector_candidates vc
        WHERE vc.content_tsvector @@ plainto_tsquery('english', query_text)
    )
    SELECT 
        vc.id,
        vc.content,
        vc.metadata,
        vc.similarity,
        CASE 
            WHEN profile_embedding IS NOT NULL THEN (1 - (vc.embedding <=> profile_embedding))::double precision
            ELSE 0::double precision
        END as profile_similarity,
        COALESCE(ks.kw_score, 0.0)::double precision as keyword_score,
        CASE 
            WHEN profile_embedding IS NOT NULL THEN
                ((vc.similarity * 0.6) + 
                 ((1 - (vc.embedding <=> profile_embedding)) * 0.2) + 
                 (COALESCE(ks.kw_score, 0.0) * 0.2))::double precision
            ELSE
                ((vc.similarity * 0.7) + (COALESCE(ks.kw_score, 0.0) * 0.3))::double precision
        END as combined_score
    FROM vector_candidates vc
    LEFT JOIN keyword_scores ks ON vc.id = ks.id
    WHERE 
        vc.similarity > (match_threshold - 0.05)
    ORDER BY combined_score DESC
    LIMIT match_count;
END;
$$;


--
-- Name: match_documents(public.vector, double precision, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.match_documents(query_embedding public.vector, match_threshold double precision, match_count integer) RETURNS TABLE(id uuid, content text, metadata jsonb, similarity double precision)
    LANGUAGE plpgsql STABLE
    AS $$
begin
  return query
  select
    agent_knowledge.id,
    agent_knowledge.content,
    agent_knowledge.metadata,
    1 - (agent_knowledge.embedding <=> query_embedding) as similarity
  from agent_knowledge
  where 1 - (agent_knowledge.embedding <=> query_embedding) > match_threshold
  order by agent_knowledge.embedding <=> query_embedding
  limit match_count;
end;
$$;


--
-- Name: match_documents(public.vector, double precision, integer, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.match_documents(query_embedding public.vector, match_threshold double precision, match_count integer, filter_files text[] DEFAULT NULL::text[]) RETURNS TABLE(id uuid, content text, metadata jsonb, similarity double precision)
    LANGUAGE plpgsql STABLE
    AS $$
begin
  return query
  select
    agent_knowledge.id,
    agent_knowledge.content,
    agent_knowledge.metadata,
    1 - (agent_knowledge.embedding <=> query_embedding) as similarity
  from agent_knowledge
  where 1 - (agent_knowledge.embedding <=> query_embedding) > match_threshold
  and (
    filter_files is null 
    or 
    (metadata->>'source') = any(filter_files)
  )
  order by agent_knowledge.embedding <=> query_embedding
  limit match_count;
end;
$$;


--
-- Name: process_daily_feed_aggregation(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.process_daily_feed_aggregation(target_user_id uuid) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$ BEGIN
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_user_id::text,723));
 WITH captured AS (DELETE FROM public.feed_pending_updates WHERE user_id=target_user_id RETURNING type,metadata)
 INSERT INTO public.feed_posts(user_id,type,content,metadata)
 SELECT target_user_id,'daily_summary','Daily Profile Updates',jsonb_build_object(
   'qualifications',jsonb_agg(metadata) FILTER(WHERE type='qualification_added'),
   'projects',jsonb_agg(metadata) FILTER(WHERE type='project_added'),
   'products',jsonb_agg(metadata) FILTER(WHERE type='product_added'))
 FROM captured HAVING count(*)>0;
END $$;


--
-- Name: register_referral(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.register_referral(p_referral_code text) RETURNS jsonb
    LANGUAGE sql
    SET search_path TO ''
    AS $$ SELECT private.register_referral(p_referral_code) $$;


--
-- Name: reserve_nsso_chat_budget(text, uuid, text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reserve_nsso_chat_budget(p_ip_hash text, p_request_id uuid, p_route text, p_micros bigint) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $_$
declare
  d date := (now() at time zone 'Asia/Dubai')::date;
  reset_at timestamptz;
  r public.nsso_chat_budget_requests%rowtype;
  delta bigint;
  ip_used bigint;
  global_used bigint;
begin
  if p_ip_hash is null or p_ip_hash !~ '^[a-f0-9]{64}$' or p_request_id is null
    or p_route is null or p_route not in ('chat','places','editorial') or p_micros is null or p_micros not between 1 and 100000 then
    raise exception 'Invalid budget reservation';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(739204, 1);
  select * into r from public.nsso_chat_budget_requests where id = p_request_id;
  if found then
    if r.ip_hash <> p_ip_hash or r.route <> p_route or r.settled then
      return jsonb_build_object('allowed',false,'code','chat_budget_unavailable');
    end if;
    d := r.usage_day;
  end if;
  reset_at := (d + 1)::timestamp at time zone 'Asia/Dubai';
  delta := greatest(0, p_micros - coalesce(r.reserved_micros,0));
  select coalesce(max(used_micros),0) into global_used from public.nsso_chat_budget_daily where usage_day=d and subject='global';
  select coalesce(max(used_micros),0) into ip_used from public.nsso_chat_budget_daily where usage_day=d and subject=p_ip_hash;
  if ip_used + delta > 300000 then
    return jsonb_build_object('allowed',false,'code','daily_ip_allowance_exhausted','reset_at',reset_at);
  end if;
  -- A $3 shared backstop limits distributed/IP-rotation abuse; it is not a per-key Google cap.
  if global_used + delta > 3000000 then
    return jsonb_build_object('allowed',false,'code','daily_shared_allowance_exhausted','reset_at',reset_at);
  end if;
  if r.id is null then
    if (select count(*) from public.nsso_chat_budget_requests where ip_hash=p_ip_hash and created_at>now()-interval '1 minute') >= 6
      or (select count(*) from public.nsso_chat_budget_requests where ip_hash=p_ip_hash and not settled and created_at>now()-interval '2 minutes') >= 2
      or (select count(*) from public.nsso_chat_budget_requests where not settled and created_at>now()-interval '2 minutes') >= 8 then
      return jsonb_build_object('allowed',false,'code','chat_busy');
    end if;
    insert into public.nsso_chat_budget_requests(id,usage_day,ip_hash,route,reserved_micros) values(p_request_id,d,p_ip_hash,p_route,p_micros);
    -- Technical accounting only: retain 30 days, never alter application/user data.
    delete from public.nsso_chat_budget_requests where created_at < now()-interval '30 days';
    delete from public.nsso_chat_budget_daily where usage_day < d-30;
  else
    update public.nsso_chat_budget_requests set reserved_micros=greatest(reserved_micros,p_micros) where id=p_request_id;
  end if;
  insert into public.nsso_chat_budget_daily(usage_day,subject,used_micros) values(d,'global',delta),(d,p_ip_hash,delta)
    on conflict(usage_day,subject) do update set used_micros=public.nsso_chat_budget_daily.used_micros+excluded.used_micros;
  return jsonb_build_object('allowed',true,'reset_at',reset_at);
end;
$_$;


--
-- Name: update_account_settings(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_account_settings(p_patch jsonb) RETURNS jsonb
    LANGUAGE sql
    SET search_path TO ''
    AS $$ SELECT private.update_account_settings(p_patch) $$;


--
-- Name: update_content_tsvector(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_content_tsvector() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.content_tsvector = to_tsvector('english', NEW.content);
    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: account_settings; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.account_settings (
    user_id uuid NOT NULL,
    email text,
    auth_provider text,
    referral_code text,
    referred_by_code text,
    paypal_me_slug text,
    deity_fast_mode boolean DEFAULT false NOT NULL,
    legacy_user_type text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: app_permissions; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.app_permissions (
    user_id uuid NOT NULL,
    permission text NOT NULL,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    granted_by uuid,
    CONSTRAINT app_permissions_permission_check CHECK ((permission = ANY (ARRAY['nsso:admin'::text, 'razinflix:manage'::text])))
);


--
-- Name: permission_audit; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.permission_audit (
    id bigint NOT NULL,
    actor_id uuid,
    target_user_id uuid NOT NULL,
    permission text NOT NULL,
    granted boolean NOT NULL,
    changed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: permission_audit_id_seq; Type: SEQUENCE; Schema: private; Owner: -
--

ALTER TABLE private.permission_audit ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME private.permission_audit_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: agent_knowledge; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_knowledge (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    content text NOT NULL,
    metadata jsonb,
    embedding public.vector(768),
    content_tsvector tsvector
);


--
-- Name: contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contacts (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    method text NOT NULL,
    custom_method_name text,
    value text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT contacts_method_check CHECK ((method = ANY (ARRAY['Email'::text, 'WhatsApp'::text, 'Phone'::text, 'Telegram'::text, 'Location'::text, 'Other'::text])))
);


--
-- Name: experiences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.experiences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    company_name text NOT NULL,
    job_title text NOT NULL,
    start_year integer,
    end_year integer,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    description text,
    display_order integer DEFAULT 0
);


--
-- Name: feed_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feed_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid NOT NULL,
    user_id uuid NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT feed_comments_content_check CHECK (((length(content) > 0) AND (length(content) <= 1000)))
);


--
-- Name: feed_likes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feed_likes (
    post_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: feed_pending_updates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feed_pending_updates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type text NOT NULL,
    reference_id uuid NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT feed_pending_updates_type_check CHECK ((type = ANY (ARRAY['qualification_added'::text, 'project_added'::text, 'product_added'::text])))
);


--
-- Name: feed_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feed_posts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type text NOT NULL,
    content text,
    reference_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT feed_posts_type_check CHECK ((type = ANY (ARRAY['manual'::text, 'qualification_added'::text, 'project_added'::text, 'product_added'::text, 'daily_summary'::text])))
);


--
-- Name: links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.links (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    link_name text NOT NULL,
    link_url text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    display_order integer DEFAULT 0
);


--
-- Name: my_nsso; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.my_nsso (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    connected_user_id uuid NOT NULL,
    date_met timestamp with time zone DEFAULT now() NOT NULL,
    location_name text DEFAULT ''::text,
    location_lat double precision,
    location_long double precision,
    notes text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT my_nsso_check CHECK ((user_id <> connected_user_id)),
    CONSTRAINT my_nsso_notes_check CHECK ((length(notes) <= 3333))
);


--
-- Name: nsso_chat_budget_daily; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nsso_chat_budget_daily (
    usage_day date NOT NULL,
    subject text NOT NULL,
    used_micros bigint DEFAULT 0 NOT NULL,
    CONSTRAINT nsso_chat_budget_daily_used_micros_check CHECK ((used_micros >= 0))
);


--
-- Name: nsso_chat_budget_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nsso_chat_budget_requests (
    id uuid NOT NULL,
    usage_day date NOT NULL,
    ip_hash text NOT NULL,
    route text NOT NULL,
    reserved_micros bigint NOT NULL,
    charged_micros bigint,
    settled boolean DEFAULT false NOT NULL,
    confirmed boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT nsso_chat_budget_requests_ip_hash_check CHECK ((ip_hash ~ '^[a-f0-9]{64}$'::text)),
    CONSTRAINT nsso_chat_budget_requests_reserved_micros_check CHECK (((reserved_micros >= 0) AND (reserved_micros <= 100000))),
    CONSTRAINT nsso_chat_budget_requests_route_check CHECK ((route = ANY (ARRAY['chat'::text, 'places'::text, 'editorial'::text])))
);


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    price text,
    image_url text,
    description text,
    purchase_link text,
    purchase_link_active boolean DEFAULT false,
    paypal_html text,
    paypal_active boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    sales_page_active boolean DEFAULT false,
    headline text,
    tagline text,
    intro_text text,
    value_proposition text,
    video_url text,
    benefits jsonb DEFAULT '[]'::jsonb,
    testimonials jsonb DEFAULT '[]'::jsonb,
    success_url text,
    payment_config jsonb,
    sales_page_published boolean DEFAULT false,
    CONSTRAINT products_payment_config_valid CHECK ((private.valid_paypal_config(payment_config) IS TRUE))
);


--
-- Name: COLUMN products.paypal_html; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.paypal_html IS 'Legacy source retained for owner repair and private migration; never public-rendered or browser-writable.';


--
-- Name: COLUMN products.payment_config; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.payment_config IS 'Validated inert PayPal data; writable only by the guarded payment server endpoint.';


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    user_id uuid NOT NULL,
    full_name text,
    headline text,
    bio text,
    profile_pic_url text,
    embedding public.vector(768)
);


--
-- Name: projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    project_name text NOT NULL,
    contribution text NOT NULL,
    description text,
    project_photo_url text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    project_url text,
    display_order integer DEFAULT 0
);


--
-- Name: qualifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.qualifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    institution text NOT NULL,
    qualification_name text NOT NULL,
    start_year integer,
    end_year integer,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    display_order integer DEFAULT 0
);


--
-- Name: razinflix_films; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.razinflix_films (
    id bigint NOT NULL,
    title text NOT NULL,
    year text,
    rating text,
    poster text,
    description text,
    director text,
    categories text[],
    trailer_key text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: razinflix_films_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.razinflix_films_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: razinflix_films_id_seq1; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.razinflix_films ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.razinflix_films_id_seq1
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: referrals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.referrals (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    referrer_user_id uuid NOT NULL,
    referred_user_id uuid NOT NULL,
    referral_code text NOT NULL,
    subscription_status text DEFAULT 'pending'::text,
    created_at timestamp with time zone DEFAULT now(),
    activated_at timestamp with time zone
);


--
-- Name: subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscriptions (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    polar_sub_id text,
    status text DEFAULT 'active'::text,
    created_at timestamp with time zone DEFAULT now(),
    cancel_at_period_end boolean DEFAULT false,
    current_period_end timestamp with time zone,
    original_username text
);


--
-- Name: user_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid NOT NULL,
    contact_type text NOT NULL,
    value text NOT NULL,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: user_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text,
    name text NOT NULL,
    url text NOT NULL,
    "position" integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid NOT NULL,
    username text NOT NULL,
    is_premium boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT users_free_access CHECK ((is_premium IS TRUE))
);


--
-- Name: TABLE users; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.users IS 'Public identity only. Account preferences, contact email and historical referral metadata live in private.account_settings; authority lives in private.app_permissions.';


--
-- Name: webhook_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_type text NOT NULL,
    type text NOT NULL,
    polar_event_id text,
    data jsonb,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    modified_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    error text
);


--
-- Name: account_settings account_settings_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.account_settings
    ADD CONSTRAINT account_settings_pkey PRIMARY KEY (user_id);


--
-- Name: account_settings account_settings_referral_code_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.account_settings
    ADD CONSTRAINT account_settings_referral_code_key UNIQUE (referral_code);


--
-- Name: app_permissions app_permissions_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.app_permissions
    ADD CONSTRAINT app_permissions_pkey PRIMARY KEY (user_id, permission);


--
-- Name: permission_audit permission_audit_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.permission_audit
    ADD CONSTRAINT permission_audit_pkey PRIMARY KEY (id);


--
-- Name: agent_knowledge agent_knowledge_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_knowledge
    ADD CONSTRAINT agent_knowledge_pkey PRIMARY KEY (id);


--
-- Name: contacts contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);


--
-- Name: experiences experiences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.experiences
    ADD CONSTRAINT experiences_pkey PRIMARY KEY (id);


--
-- Name: feed_comments feed_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feed_comments
    ADD CONSTRAINT feed_comments_pkey PRIMARY KEY (id);


--
-- Name: feed_likes feed_likes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feed_likes
    ADD CONSTRAINT feed_likes_pkey PRIMARY KEY (post_id, user_id);


--
-- Name: feed_pending_updates feed_pending_updates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feed_pending_updates
    ADD CONSTRAINT feed_pending_updates_pkey PRIMARY KEY (id);


--
-- Name: feed_posts feed_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feed_posts
    ADD CONSTRAINT feed_posts_pkey PRIMARY KEY (id);


--
-- Name: links links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.links
    ADD CONSTRAINT links_pkey PRIMARY KEY (id);


--
-- Name: my_nsso my_nsso_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.my_nsso
    ADD CONSTRAINT my_nsso_pkey PRIMARY KEY (id);


--
-- Name: my_nsso my_nsso_user_id_connected_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.my_nsso
    ADD CONSTRAINT my_nsso_user_id_connected_user_id_key UNIQUE (user_id, connected_user_id);


--
-- Name: nsso_chat_budget_daily nsso_chat_budget_daily_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nsso_chat_budget_daily
    ADD CONSTRAINT nsso_chat_budget_daily_pkey PRIMARY KEY (usage_day, subject);


--
-- Name: nsso_chat_budget_requests nsso_chat_budget_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nsso_chat_budget_requests
    ADD CONSTRAINT nsso_chat_budget_requests_pkey PRIMARY KEY (id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (user_id);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: qualifications qualifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qualifications
    ADD CONSTRAINT qualifications_pkey PRIMARY KEY (id);


--
-- Name: razinflix_films razinflix_films_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.razinflix_films
    ADD CONSTRAINT razinflix_films_pkey PRIMARY KEY (id);


--
-- Name: referrals referrals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_pkey PRIMARY KEY (id);


--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);


--
-- Name: subscriptions subscriptions_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_user_id_key UNIQUE (user_id);


--
-- Name: referrals unique_referred_user; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT unique_referred_user UNIQUE (referred_user_id);


--
-- Name: user_contacts user_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_contacts
    ADD CONSTRAINT user_contacts_pkey PRIMARY KEY (id);


--
-- Name: user_links user_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_links
    ADD CONSTRAINT user_links_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: webhook_events webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_events
    ADD CONSTRAINT webhook_events_pkey PRIMARY KEY (id);


--
-- Name: agent_knowledge_embedding_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_knowledge_embedding_idx ON public.agent_knowledge USING ivfflat (embedding public.vector_cosine_ops) WITH (lists='100');


--
-- Name: agent_knowledge_fts_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_knowledge_fts_idx ON public.agent_knowledge USING gin (content_tsvector);


--
-- Name: idx_contacts_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_user_id ON public.contacts USING btree (user_id);


--
-- Name: idx_feed_comments_post_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_feed_comments_post_id ON public.feed_comments USING btree (post_id);


--
-- Name: idx_feed_likes_post_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_feed_likes_post_id ON public.feed_likes USING btree (post_id);


--
-- Name: idx_feed_posts_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_feed_posts_created_at ON public.feed_posts USING btree (created_at DESC);


--
-- Name: idx_feed_posts_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_feed_posts_user_id ON public.feed_posts USING btree (user_id);


--
-- Name: idx_links_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_links_user_id ON public.links USING btree (user_id);


--
-- Name: idx_my_nsso_connected_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_my_nsso_connected_user_id ON public.my_nsso USING btree (connected_user_id);


--
-- Name: idx_my_nsso_timeline; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_my_nsso_timeline ON public.my_nsso USING btree (user_id, date_met DESC);


--
-- Name: idx_my_nsso_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_my_nsso_user_id ON public.my_nsso USING btree (user_id);


--
-- Name: idx_referrals_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_referrals_code ON public.referrals USING btree (referral_code);


--
-- Name: idx_referrals_referrer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_referrals_referrer ON public.referrals USING btree (referrer_user_id);


--
-- Name: idx_referrals_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_referrals_status ON public.referrals USING btree (subscription_status);


--
-- Name: idx_subscriptions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscriptions_user_id ON public.subscriptions USING btree (user_id);


--
-- Name: idx_users_username; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_username ON public.users USING btree (username);


--
-- Name: nsso_chat_budget_requests_ip_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX nsso_chat_budget_requests_ip_time ON public.nsso_chat_budget_requests USING btree (ip_hash, created_at);


--
-- Name: nsso_chat_budget_requests_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX nsso_chat_budget_requests_time ON public.nsso_chat_budget_requests USING btree (created_at);


--
-- Name: user_contacts_profile_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_contacts_profile_id_idx ON public.user_contacts USING btree (profile_id);


--
-- Name: user_links_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_links_user_id_idx ON public.user_links USING btree (user_id);


--
-- Name: webhook_events_event_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX webhook_events_event_type_idx ON public.webhook_events USING btree (event_type);


--
-- Name: webhook_events_polar_event_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX webhook_events_polar_event_id_idx ON public.webhook_events USING btree (polar_event_id);


--
-- Name: webhook_events_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX webhook_events_type_idx ON public.webhook_events USING btree (type);


--
-- Name: agent_knowledge agent_knowledge_tsvector_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER agent_knowledge_tsvector_update BEFORE INSERT OR UPDATE ON public.agent_knowledge FOR EACH ROW EXECUTE FUNCTION public.update_content_tsvector();


--
-- Name: products on_product_added; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_product_added AFTER INSERT ON public.products FOR EACH ROW EXECUTE FUNCTION public.handle_new_product();


--
-- Name: projects on_project_added; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_project_added AFTER INSERT ON public.projects FOR EACH ROW EXECUTE FUNCTION public.handle_new_project();


--
-- Name: qualifications on_qualification_added; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_qualification_added AFTER INSERT ON public.qualifications FOR EACH ROW EXECUTE FUNCTION public.handle_new_qualification();


--
-- Name: account_settings account_settings_user_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.account_settings
    ADD CONSTRAINT account_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: app_permissions app_permissions_granted_by_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.app_permissions
    ADD CONSTRAINT app_permissions_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: app_permissions app_permissions_user_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.app_permissions
    ADD CONSTRAINT app_permissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: contacts contacts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: experiences experiences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.experiences
    ADD CONSTRAINT experiences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: feed_comments feed_comments_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feed_comments
    ADD CONSTRAINT feed_comments_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.feed_posts(id) ON DELETE CASCADE;


--
-- Name: feed_comments feed_comments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feed_comments
    ADD CONSTRAINT feed_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: feed_likes feed_likes_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feed_likes
    ADD CONSTRAINT feed_likes_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.feed_posts(id) ON DELETE CASCADE;


--
-- Name: feed_likes feed_likes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feed_likes
    ADD CONSTRAINT feed_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: feed_pending_updates feed_pending_updates_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feed_pending_updates
    ADD CONSTRAINT feed_pending_updates_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: feed_posts feed_posts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feed_posts
    ADD CONSTRAINT feed_posts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: links links_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.links
    ADD CONSTRAINT links_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: my_nsso my_nsso_connected_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.my_nsso
    ADD CONSTRAINT my_nsso_connected_user_id_fkey FOREIGN KEY (connected_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: my_nsso my_nsso_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.my_nsso
    ADD CONSTRAINT my_nsso_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: products products_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: projects projects_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: qualifications qualifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qualifications
    ADD CONSTRAINT qualifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: referrals referrals_referred_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_referred_user_id_fkey FOREIGN KEY (referred_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: referrals referrals_referrer_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_referrer_user_id_fkey FOREIGN KEY (referrer_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: subscriptions subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: users users_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: account_settings; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.account_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: app_permissions; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.app_permissions ENABLE ROW LEVEL SECURITY;

--
-- Name: permission_audit; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.permission_audit ENABLE ROW LEVEL SECURITY;

--
-- Name: feed_comments Comments are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Comments are viewable by everyone" ON public.feed_comments FOR SELECT USING (true);


--
-- Name: experiences Experiences are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Experiences are viewable by everyone" ON public.experiences FOR SELECT USING (true);


--
-- Name: feed_posts Feed posts are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Feed posts are viewable by everyone" ON public.feed_posts FOR SELECT USING (true);


--
-- Name: feed_likes Likes are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Likes are viewable by everyone" ON public.feed_likes FOR SELECT USING (true);


--
-- Name: products Products are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Products are viewable by everyone" ON public.products FOR SELECT USING (true);


--
-- Name: projects Projects are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Projects are viewable by everyone" ON public.projects FOR SELECT USING (true);


--
-- Name: user_links Public can view links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can view links" ON public.user_links FOR SELECT USING (true);


--
-- Name: qualifications Qualifications are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Qualifications are viewable by everyone" ON public.qualifications FOR SELECT USING (true);


--
-- Name: user_contacts User contacts are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "User contacts are viewable by everyone" ON public.user_contacts FOR SELECT USING (true);


--
-- Name: feed_comments Users can comment on posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can comment on posts" ON public.feed_comments FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: feed_posts Users can create their own posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own posts" ON public.feed_posts FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: user_links Users can delete own links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own links" ON public.user_links FOR DELETE USING (((auth.uid())::text = user_id));


--
-- Name: feed_comments Users can delete their own comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own comments" ON public.feed_comments FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: my_nsso Users can delete their own connections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own connections" ON public.my_nsso FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: experiences Users can delete their own experiences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own experiences" ON public.experiences FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: products Users can delete their own products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own products" ON public.products FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: projects Users can delete their own projects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own projects" ON public.projects FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: qualifications Users can delete their own qualifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own qualifications" ON public.qualifications FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: user_contacts Users can delete their own user contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own user contacts" ON public.user_contacts FOR DELETE USING ((auth.uid() = profile_id));


--
-- Name: user_links Users can insert own links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own links" ON public.user_links FOR INSERT WITH CHECK (((auth.uid())::text = user_id));


--
-- Name: feed_pending_updates Users can insert pending updates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert pending updates" ON public.feed_pending_updates FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: my_nsso Users can insert their own connections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own connections" ON public.my_nsso FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: experiences Users can insert their own experiences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own experiences" ON public.experiences FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: products Users can insert their own products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own products" ON public.products FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: projects Users can insert their own projects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own projects" ON public.projects FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: qualifications Users can insert their own qualifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own qualifications" ON public.qualifications FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: user_contacts Users can insert their own user contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own user contacts" ON public.user_contacts FOR INSERT WITH CHECK ((auth.uid() = profile_id));


--
-- Name: feed_likes Users can like posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can like posts" ON public.feed_likes FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: feed_likes Users can unlike posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can unlike posts" ON public.feed_likes FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: user_links Users can update own links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own links" ON public.user_links FOR UPDATE USING (((auth.uid())::text = user_id));


--
-- Name: my_nsso Users can update their own connections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own connections" ON public.my_nsso FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: experiences Users can update their own experiences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own experiences" ON public.experiences FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: products Users can update their own products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own products" ON public.products FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: projects Users can update their own projects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own projects" ON public.projects FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: qualifications Users can update their own qualifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own qualifications" ON public.qualifications FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: user_contacts Users can update their own user contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own user contacts" ON public.user_contacts FOR UPDATE USING ((auth.uid() = profile_id));


--
-- Name: user_links Users can view own links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own links" ON public.user_links FOR SELECT USING (((auth.uid())::text = user_id));


--
-- Name: feed_pending_updates Users can view own pending updates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own pending updates" ON public.feed_pending_updates FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: my_nsso Users can view their own connections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own connections" ON public.my_nsso FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: agent_knowledge; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_knowledge ENABLE ROW LEVEL SECURITY;

--
-- Name: contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: contacts contacts_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contacts_delete ON public.contacts FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: contacts contacts_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contacts_insert ON public.contacts FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: contacts contacts_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contacts_select ON public.contacts FOR SELECT USING (true);


--
-- Name: contacts contacts_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contacts_update ON public.contacts FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: experiences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.experiences ENABLE ROW LEVEL SECURITY;

--
-- Name: feed_comments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.feed_comments ENABLE ROW LEVEL SECURITY;

--
-- Name: feed_likes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.feed_likes ENABLE ROW LEVEL SECURITY;

--
-- Name: feed_pending_updates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.feed_pending_updates ENABLE ROW LEVEL SECURITY;

--
-- Name: feed_posts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.feed_posts ENABLE ROW LEVEL SECURITY;

--
-- Name: links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.links ENABLE ROW LEVEL SECURITY;

--
-- Name: links links_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY links_delete ON public.links FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: links links_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY links_insert ON public.links FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: links links_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY links_select ON public.links FOR SELECT USING (true);


--
-- Name: links links_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY links_update ON public.links FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: my_nsso; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.my_nsso ENABLE ROW LEVEL SECURITY;

--
-- Name: nsso_chat_budget_daily; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.nsso_chat_budget_daily ENABLE ROW LEVEL SECURITY;

--
-- Name: nsso_chat_budget_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.nsso_chat_budget_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: razinflix_films nsso_films_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nsso_films_public_read ON public.razinflix_films FOR SELECT TO authenticated, anon USING (true);


--
-- Name: products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_insert ON public.profiles FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: profiles profiles_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_select ON public.profiles FOR SELECT USING (true);


--
-- Name: profiles profiles_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_update ON public.profiles FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: projects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

--
-- Name: qualifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.qualifications ENABLE ROW LEVEL SECURITY;

--
-- Name: razinflix_films; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.razinflix_films ENABLE ROW LEVEL SECURITY;

--
-- Name: referrals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

--
-- Name: referrals referrals_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY referrals_select_own ON public.referrals FOR SELECT USING ((auth.uid() = referrer_user_id));


--
-- Name: subscriptions subs_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subs_select ON public.subscriptions FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: user_contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: user_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_links ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- Name: users users_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_select ON public.users FOR SELECT USING (true);


--
-- Name: webhook_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA private; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA private TO authenticated;
GRANT USAGE ON SCHEMA private TO service_role;
GRANT USAGE ON SCHEMA private TO anon;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

REVOKE USAGE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION account_dto(p_user_id uuid); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.account_dto(p_user_id uuid) FROM PUBLIC;


--
-- Name: FUNCTION admin_list_accounts(p_actor_id uuid, p_offset integer, p_limit integer); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.admin_list_accounts(p_actor_id uuid, p_offset integer, p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION private.admin_list_accounts(p_actor_id uuid, p_offset integer, p_limit integer) TO service_role;


--
-- Name: FUNCTION admin_set_permission(p_actor_id uuid, p_user_id uuid, p_permission text, p_granted boolean); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.admin_set_permission(p_actor_id uuid, p_user_id uuid, p_permission text, p_granted boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION private.admin_set_permission(p_actor_id uuid, p_user_id uuid, p_permission text, p_granted boolean) TO service_role;


--
-- Name: FUNCTION claim_profile_username(p_username text); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.claim_profile_username(p_username text) FROM PUBLIC;
GRANT ALL ON FUNCTION private.claim_profile_username(p_username text) TO authenticated;


--
-- Name: FUNCTION connect_my_nsso(p_connected_user_id uuid, p_location_name text, p_location_lat double precision, p_location_long double precision); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.connect_my_nsso(p_connected_user_id uuid, p_location_name text, p_location_lat double precision, p_location_long double precision) FROM PUBLIC;
GRANT ALL ON FUNCTION private.connect_my_nsso(p_connected_user_id uuid, p_location_name text, p_location_lat double precision, p_location_long double precision) TO authenticated;


--
-- Name: FUNCTION ensure_account_for(p_user_id uuid); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.ensure_account_for(p_user_id uuid) FROM PUBLIC;


--
-- Name: FUNCTION ensure_current_account(); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.ensure_current_account() FROM PUBLIC;
GRANT ALL ON FUNCTION private.ensure_current_account() TO authenticated;


--
-- Name: FUNCTION get_current_account(); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.get_current_account() FROM PUBLIC;
GRANT ALL ON FUNCTION private.get_current_account() TO authenticated;


--
-- Name: FUNCTION own_products(); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.own_products() FROM PUBLIC;
GRANT ALL ON FUNCTION private.own_products() TO authenticated;
GRANT ALL ON FUNCTION private.own_products() TO service_role;


--
-- Name: FUNCTION product_details(p_product_id uuid); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.product_details(p_product_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION private.product_details(p_product_id uuid) TO anon;
GRANT ALL ON FUNCTION private.product_details(p_product_id uuid) TO authenticated;
GRANT ALL ON FUNCTION private.product_details(p_product_id uuid) TO service_role;


--
-- Name: FUNCTION register_referral(p_referral_code text); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.register_referral(p_referral_code text) FROM PUBLIC;
GRANT ALL ON FUNCTION private.register_referral(p_referral_code text) TO authenticated;


--
-- Name: FUNCTION update_account_settings(p_patch jsonb); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.update_account_settings(p_patch jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION private.update_account_settings(p_patch jsonb) TO authenticated;


--
-- Name: FUNCTION valid_paypal_config(p jsonb); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.valid_paypal_config(p jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION private.valid_paypal_config(p jsonb) TO authenticated;
GRANT ALL ON FUNCTION private.valid_paypal_config(p jsonb) TO service_role;


--
-- Name: FUNCTION admin_list_accounts(p_actor_id uuid, p_offset integer, p_limit integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_list_accounts(p_actor_id uuid, p_offset integer, p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_list_accounts(p_actor_id uuid, p_offset integer, p_limit integer) TO service_role;


--
-- Name: FUNCTION admin_set_permission(p_actor_id uuid, p_user_id uuid, p_permission text, p_granted boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_set_permission(p_actor_id uuid, p_user_id uuid, p_permission text, p_granted boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_set_permission(p_actor_id uuid, p_user_id uuid, p_permission text, p_granted boolean) TO service_role;


--
-- Name: FUNCTION claim_profile_username(p_username text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.claim_profile_username(p_username text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.claim_profile_username(p_username text) TO authenticated;


--
-- Name: FUNCTION connect_my_nsso(p_connected_user_id uuid, p_location_name text, p_location_lat double precision, p_location_long double precision); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.connect_my_nsso(p_connected_user_id uuid, p_location_name text, p_location_lat double precision, p_location_long double precision) FROM PUBLIC;
GRANT ALL ON FUNCTION public.connect_my_nsso(p_connected_user_id uuid, p_location_name text, p_location_lat double precision, p_location_long double precision) TO authenticated;


--
-- Name: FUNCTION ensure_current_account(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.ensure_current_account() FROM PUBLIC;
GRANT ALL ON FUNCTION public.ensure_current_account() TO authenticated;


--
-- Name: FUNCTION finish_nsso_chat_budget(p_request_id uuid, p_micros bigint, p_confirmed boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.finish_nsso_chat_budget(p_request_id uuid, p_micros bigint, p_confirmed boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.finish_nsso_chat_budget(p_request_id uuid, p_micros bigint, p_confirmed boolean) TO service_role;


--
-- Name: FUNCTION get_agent_context(user_uuid uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_agent_context(user_uuid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_agent_context(user_uuid uuid) TO service_role;


--
-- Name: FUNCTION get_current_account(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_current_account() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_current_account() TO authenticated;


--
-- Name: FUNCTION get_own_products(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_own_products() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_own_products() TO authenticated;
GRANT ALL ON FUNCTION public.get_own_products() TO service_role;


--
-- Name: FUNCTION get_product_details(p_product_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_product_details(p_product_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_product_details(p_product_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_product_details(p_product_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_product_details(p_product_id uuid) TO service_role;


--
-- Name: FUNCTION get_referred_users_details(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_referred_users_details() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_referred_users_details() TO authenticated;
GRANT ALL ON FUNCTION public.get_referred_users_details() TO service_role;


--
-- Name: FUNCTION get_user_earnings_stats(user_uuid uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_user_earnings_stats(user_uuid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_user_earnings_stats(user_uuid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_user_earnings_stats(user_uuid uuid) TO service_role;


--
-- Name: FUNCTION handle_new_product(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.handle_new_product() FROM PUBLIC;
GRANT ALL ON FUNCTION public.handle_new_product() TO service_role;


--
-- Name: FUNCTION handle_new_project(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.handle_new_project() FROM PUBLIC;
GRANT ALL ON FUNCTION public.handle_new_project() TO service_role;


--
-- Name: FUNCTION handle_new_qualification(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.handle_new_qualification() FROM PUBLIC;
GRANT ALL ON FUNCTION public.handle_new_qualification() TO service_role;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;


--
-- Name: FUNCTION has_app_permission(p_user_id uuid, p_permission text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.has_app_permission(p_user_id uuid, p_permission text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.has_app_permission(p_user_id uuid, p_permission text) TO service_role;


--
-- Name: FUNCTION hybrid_search(query_embedding public.vector, query_text text, match_threshold double precision, match_count integer, filter_files text[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.hybrid_search(query_embedding public.vector, query_text text, match_threshold double precision, match_count integer, filter_files text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.hybrid_search(query_embedding public.vector, query_text text, match_threshold double precision, match_count integer, filter_files text[]) TO service_role;


--
-- Name: FUNCTION intelligent_search(query_embedding public.vector, query_text text, profile_embedding public.vector, match_threshold double precision, match_count integer, filter_files text[], candidate_count integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.intelligent_search(query_embedding public.vector, query_text text, profile_embedding public.vector, match_threshold double precision, match_count integer, filter_files text[], candidate_count integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.intelligent_search(query_embedding public.vector, query_text text, profile_embedding public.vector, match_threshold double precision, match_count integer, filter_files text[], candidate_count integer) TO service_role;


--
-- Name: FUNCTION match_documents(query_embedding public.vector, match_threshold double precision, match_count integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.match_documents(query_embedding public.vector, match_threshold double precision, match_count integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.match_documents(query_embedding public.vector, match_threshold double precision, match_count integer) TO service_role;


--
-- Name: FUNCTION match_documents(query_embedding public.vector, match_threshold double precision, match_count integer, filter_files text[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.match_documents(query_embedding public.vector, match_threshold double precision, match_count integer, filter_files text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.match_documents(query_embedding public.vector, match_threshold double precision, match_count integer, filter_files text[]) TO service_role;


--
-- Name: FUNCTION process_daily_feed_aggregation(target_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.process_daily_feed_aggregation(target_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.process_daily_feed_aggregation(target_user_id uuid) TO service_role;


--
-- Name: FUNCTION register_referral(p_referral_code text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.register_referral(p_referral_code text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.register_referral(p_referral_code text) TO authenticated;


--
-- Name: FUNCTION reserve_nsso_chat_budget(p_ip_hash text, p_request_id uuid, p_route text, p_micros bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.reserve_nsso_chat_budget(p_ip_hash text, p_request_id uuid, p_route text, p_micros bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reserve_nsso_chat_budget(p_ip_hash text, p_request_id uuid, p_route text, p_micros bigint) TO service_role;


--
-- Name: FUNCTION update_account_settings(p_patch jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_account_settings(p_patch jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_account_settings(p_patch jsonb) TO authenticated;


--
-- Name: FUNCTION update_content_tsvector(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_content_tsvector() FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_content_tsvector() TO service_role;


--
-- Name: TABLE account_settings; Type: ACL; Schema: private; Owner: -
--

GRANT ALL ON TABLE private.account_settings TO service_role;


--
-- Name: TABLE app_permissions; Type: ACL; Schema: private; Owner: -
--

GRANT ALL ON TABLE private.app_permissions TO service_role;


--
-- Name: TABLE permission_audit; Type: ACL; Schema: private; Owner: -
--

GRANT ALL ON TABLE private.permission_audit TO service_role;


--
-- Name: SEQUENCE permission_audit_id_seq; Type: ACL; Schema: private; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE private.permission_audit_id_seq TO service_role;


--
-- Name: TABLE agent_knowledge; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.agent_knowledge TO service_role;


--
-- Name: TABLE contacts; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.contacts TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.contacts TO authenticated;
GRANT ALL ON TABLE public.contacts TO service_role;


--
-- Name: TABLE experiences; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.experiences TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.experiences TO authenticated;
GRANT ALL ON TABLE public.experiences TO service_role;


--
-- Name: TABLE feed_comments; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.feed_comments TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.feed_comments TO authenticated;
GRANT ALL ON TABLE public.feed_comments TO service_role;


--
-- Name: TABLE feed_likes; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.feed_likes TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.feed_likes TO authenticated;
GRANT ALL ON TABLE public.feed_likes TO service_role;


--
-- Name: TABLE feed_pending_updates; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.feed_pending_updates TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.feed_pending_updates TO authenticated;
GRANT ALL ON TABLE public.feed_pending_updates TO service_role;


--
-- Name: TABLE feed_posts; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.feed_posts TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.feed_posts TO authenticated;
GRANT ALL ON TABLE public.feed_posts TO service_role;


--
-- Name: TABLE links; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.links TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.links TO authenticated;
GRANT ALL ON TABLE public.links TO service_role;


--
-- Name: TABLE my_nsso; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.my_nsso TO service_role;
GRANT SELECT,DELETE ON TABLE public.my_nsso TO authenticated;


--
-- Name: COLUMN my_nsso.location_name; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(location_name) ON TABLE public.my_nsso TO authenticated;


--
-- Name: COLUMN my_nsso.location_lat; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(location_lat) ON TABLE public.my_nsso TO authenticated;


--
-- Name: COLUMN my_nsso.location_long; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(location_long) ON TABLE public.my_nsso TO authenticated;


--
-- Name: COLUMN my_nsso.notes; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(notes) ON TABLE public.my_nsso TO authenticated;


--
-- Name: COLUMN my_nsso.updated_at; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(updated_at) ON TABLE public.my_nsso TO authenticated;


--
-- Name: TABLE nsso_chat_budget_daily; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.nsso_chat_budget_daily TO service_role;


--
-- Name: TABLE nsso_chat_budget_requests; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.nsso_chat_budget_requests TO service_role;


--
-- Name: TABLE products; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.products TO service_role;
GRANT DELETE ON TABLE public.products TO authenticated;


--
-- Name: COLUMN products.id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(id) ON TABLE public.products TO anon;
GRANT SELECT(id),INSERT(id) ON TABLE public.products TO authenticated;


--
-- Name: COLUMN products.user_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(user_id) ON TABLE public.products TO anon;
GRANT SELECT(user_id),INSERT(user_id) ON TABLE public.products TO authenticated;


--
-- Name: COLUMN products.name; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(name) ON TABLE public.products TO anon;
GRANT SELECT(name),INSERT(name),UPDATE(name) ON TABLE public.products TO authenticated;


--
-- Name: COLUMN products.price; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(price) ON TABLE public.products TO anon;
GRANT SELECT(price),INSERT(price),UPDATE(price) ON TABLE public.products TO authenticated;


--
-- Name: COLUMN products.image_url; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(image_url) ON TABLE public.products TO anon;
GRANT SELECT(image_url),INSERT(image_url),UPDATE(image_url) ON TABLE public.products TO authenticated;


--
-- Name: COLUMN products.description; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(description) ON TABLE public.products TO anon;
GRANT SELECT(description),INSERT(description),UPDATE(description) ON TABLE public.products TO authenticated;


--
-- Name: COLUMN products.purchase_link; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(purchase_link) ON TABLE public.products TO anon;
GRANT SELECT(purchase_link),INSERT(purchase_link),UPDATE(purchase_link) ON TABLE public.products TO authenticated;


--
-- Name: COLUMN products.purchase_link_active; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(purchase_link_active) ON TABLE public.products TO anon;
GRANT SELECT(purchase_link_active),INSERT(purchase_link_active),UPDATE(purchase_link_active) ON TABLE public.products TO authenticated;


--
-- Name: COLUMN products.paypal_active; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(paypal_active) ON TABLE public.products TO anon;
GRANT SELECT(paypal_active),INSERT(paypal_active),UPDATE(paypal_active) ON TABLE public.products TO authenticated;


--
-- Name: COLUMN products.created_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(created_at) ON TABLE public.products TO anon;
GRANT SELECT(created_at) ON TABLE public.products TO authenticated;


--
-- Name: COLUMN products.sales_page_active; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(sales_page_active) ON TABLE public.products TO anon;
GRANT SELECT(sales_page_active),INSERT(sales_page_active),UPDATE(sales_page_active) ON TABLE public.products TO authenticated;


--
-- Name: COLUMN products.headline; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT(headline),UPDATE(headline) ON TABLE public.products TO authenticated;


--
-- Name: COLUMN products.tagline; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT(tagline),UPDATE(tagline) ON TABLE public.products TO authenticated;


--
-- Name: COLUMN products.intro_text; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT(intro_text),UPDATE(intro_text) ON TABLE public.products TO authenticated;


--
-- Name: COLUMN products.value_proposition; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT(value_proposition),UPDATE(value_proposition) ON TABLE public.products TO authenticated;


--
-- Name: COLUMN products.video_url; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT(video_url),UPDATE(video_url) ON TABLE public.products TO authenticated;


--
-- Name: COLUMN products.benefits; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT(benefits),UPDATE(benefits) ON TABLE public.products TO authenticated;


--
-- Name: COLUMN products.testimonials; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT(testimonials),UPDATE(testimonials) ON TABLE public.products TO authenticated;


--
-- Name: COLUMN products.success_url; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT(success_url),UPDATE(success_url) ON TABLE public.products TO authenticated;


--
-- Name: COLUMN products.payment_config; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(payment_config) ON TABLE public.products TO anon;
GRANT SELECT(payment_config) ON TABLE public.products TO authenticated;


--
-- Name: COLUMN products.sales_page_published; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(sales_page_published) ON TABLE public.products TO anon;
GRANT SELECT(sales_page_published),INSERT(sales_page_published),UPDATE(sales_page_published) ON TABLE public.products TO authenticated;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: COLUMN profiles.user_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(user_id) ON TABLE public.profiles TO anon;
GRANT SELECT(user_id),INSERT(user_id) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.full_name; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(full_name) ON TABLE public.profiles TO anon;
GRANT SELECT(full_name),INSERT(full_name),UPDATE(full_name) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.headline; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(headline) ON TABLE public.profiles TO anon;
GRANT SELECT(headline),INSERT(headline),UPDATE(headline) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.bio; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(bio) ON TABLE public.profiles TO anon;
GRANT SELECT(bio),INSERT(bio),UPDATE(bio) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.profile_pic_url; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(profile_pic_url) ON TABLE public.profiles TO anon;
GRANT SELECT(profile_pic_url),INSERT(profile_pic_url),UPDATE(profile_pic_url) ON TABLE public.profiles TO authenticated;


--
-- Name: TABLE projects; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.projects TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.projects TO authenticated;
GRANT ALL ON TABLE public.projects TO service_role;


--
-- Name: TABLE qualifications; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.qualifications TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.qualifications TO authenticated;
GRANT ALL ON TABLE public.qualifications TO service_role;


--
-- Name: TABLE razinflix_films; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.razinflix_films TO service_role;
GRANT SELECT ON TABLE public.razinflix_films TO anon;
GRANT SELECT ON TABLE public.razinflix_films TO authenticated;


--
-- Name: TABLE referrals; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.referrals TO anon;
GRANT SELECT ON TABLE public.referrals TO authenticated;
GRANT ALL ON TABLE public.referrals TO service_role;


--
-- Name: TABLE subscriptions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.subscriptions TO anon;
GRANT SELECT ON TABLE public.subscriptions TO authenticated;
GRANT ALL ON TABLE public.subscriptions TO service_role;


--
-- Name: TABLE user_contacts; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.user_contacts TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_contacts TO authenticated;
GRANT ALL ON TABLE public.user_contacts TO service_role;


--
-- Name: TABLE user_links; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.user_links TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_links TO authenticated;
GRANT ALL ON TABLE public.user_links TO service_role;


--
-- Name: TABLE users; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.users TO service_role;


--
-- Name: COLUMN users.id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(id) ON TABLE public.users TO anon;
GRANT SELECT(id) ON TABLE public.users TO authenticated;


--
-- Name: COLUMN users.username; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(username) ON TABLE public.users TO anon;
GRANT SELECT(username) ON TABLE public.users TO authenticated;


--
-- Name: COLUMN users.is_premium; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(is_premium) ON TABLE public.users TO anon;
GRANT SELECT(is_premium) ON TABLE public.users TO authenticated;


--
-- Name: COLUMN users.created_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(created_at) ON TABLE public.users TO anon;
GRANT SELECT(created_at) ON TABLE public.users TO authenticated;


--
-- Name: TABLE webhook_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.webhook_events TO service_role;


--
-- PostgreSQL database dump complete
--


-- Storage ownership policies (managed storage schema itself is not recreated).
CREATE POLICY "Public Access" ON storage.objects AS PERMISSIVE FOR SELECT TO PUBLIC USING ((bucket_id = 'avatars'::text));
CREATE POLICY "Avatar images are publicly accessible" ON storage.objects AS PERMISSIVE FOR SELECT TO PUBLIC USING ((bucket_id = 'avatars'::text));
CREATE POLICY "Portfolio Assets are publicly accessible" ON storage.objects AS PERMISSIVE FOR SELECT TO PUBLIC USING ((bucket_id = 'portfolio-assets'::text));
CREATE POLICY "nsso_avatar_insert" ON storage.objects AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));
CREATE POLICY "nsso_avatar_update" ON storage.objects AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text) AND ((( SELECT auth.uid() AS uid) = owner) OR ((( SELECT auth.uid() AS uid))::text = owner_id)))) WITH CHECK (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text) AND ((( SELECT auth.uid() AS uid) = owner) OR ((( SELECT auth.uid() AS uid))::text = owner_id))));
CREATE POLICY "nsso_avatar_delete" ON storage.objects AS PERMISSIVE FOR DELETE TO "authenticated" USING (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text) AND ((( SELECT auth.uid() AS uid) = owner) OR ((( SELECT auth.uid() AS uid))::text = owner_id))));
CREATE POLICY "nsso_portfolio_insert" ON storage.objects AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((bucket_id = 'portfolio-assets'::text) AND (((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text) OR (EXISTS ( SELECT 1
   FROM storage.objects existing
  WHERE ((existing.bucket_id = objects.bucket_id) AND (existing.name = objects.name) AND ((existing.owner = ( SELECT auth.uid() AS uid)) OR (existing.owner_id = (( SELECT auth.uid() AS uid))::text))))))));
CREATE POLICY "nsso_portfolio_update" ON storage.objects AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((bucket_id = 'portfolio-assets'::text) AND ((owner = ( SELECT auth.uid() AS uid)) OR (owner_id = (( SELECT auth.uid() AS uid))::text)))) WITH CHECK (((bucket_id = 'portfolio-assets'::text) AND ((owner = ( SELECT auth.uid() AS uid)) OR (owner_id = (( SELECT auth.uid() AS uid))::text)) AND (((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text) OR (EXISTS ( SELECT 1
   FROM storage.objects existing
  WHERE ((existing.bucket_id = objects.bucket_id) AND (existing.name = objects.name) AND ((existing.owner = ( SELECT auth.uid() AS uid)) OR (existing.owner_id = (( SELECT auth.uid() AS uid))::text))))))));
CREATE POLICY "nsso_portfolio_delete" ON storage.objects AS PERMISSIVE FOR DELETE TO "authenticated" USING (((bucket_id = 'portfolio-assets'::text) AND ((owner = ( SELECT auth.uid() AS uid)) OR (owner_id = (( SELECT auth.uid() AS uid))::text))));
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('avatars','avatars',true,5242880,ARRAY['image/jpeg','image/png','image/webp','image/gif','image/avif']);
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('portfolio-assets','portfolio-assets',true,10485760,ARRAY['image/jpeg','image/png','image/webp','image/gif','image/avif']);
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('razinflix_posters','razinflix_posters',true,5242880,ARRAY['image/jpeg','image/png','image/webp','image/gif','image/avif']);
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
ALTER DEFAULT PRIVILEGES IN SCHEMA private REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
