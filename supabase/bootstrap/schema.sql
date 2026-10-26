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
-- Supabase defaults grant browser roles all new public tables/sequences. Reset
-- those defaults BEFORE pg_dump's explicit ACLs, which assume empty defaults.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC,anon,authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC,anon,authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC,anon,authenticated;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC,anon,authenticated;
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
-- Name: apply_profile_change(uuid, jsonb); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.apply_profile_change(p_user_id uuid, c jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
DECLARE kind text:=c->>'kind'; entity text; action text; p_id uuid; before_row jsonb; after_row jsonb; patch jsonb;
 ids uuid[]; owned uuid[]; item uuid; pos integer:=0; ord integer; keys text[]; deltas jsonb:='[]'; effects jsonb:='[]';
BEGIN
 IF jsonb_typeof(c)<>'object' OR jsonb_typeof(c->'kind')<>'string' THEN RAISE EXCEPTION 'Invalid change' USING ERRCODE='22023'; END IF;
 IF kind='collection.reorder' THEN
  entity:=c->>'collection';
  IF NOT private.profile_keys(c,ARRAY['kind','collection','order'],ARRAY['kind','collection','order']) OR NOT(entity=ANY(ARRAY['links','contacts','experiences','qualifications','projects']))
   OR jsonb_typeof(c->'order')<>'array' OR jsonb_array_length(c->'order')>500 THEN RAISE EXCEPTION 'Invalid reorder' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(c->'order') v WHERE jsonb_typeof(v)<>'string' OR v#>>'{}' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN RAISE EXCEPTION 'Invalid reorder ID' USING ERRCODE='22023'; END IF;
  SELECT coalesce(array_agg((value#>>'{}')::uuid ORDER BY (value#>>'{}')::uuid),'{}'::uuid[]) INTO ids FROM jsonb_array_elements(c->'order');
  EXECUTE format('SELECT coalesce(array_agg(id ORDER BY id),''{}''::uuid[]) FROM public.%I WHERE user_id=$1',entity) INTO owned USING p_user_id;
  IF ids IS DISTINCT FROM owned OR cardinality(ids)<>(SELECT count(DISTINCT x) FROM unnest(ids) x) THEN RAISE EXCEPTION 'Reorder must contain the exact owned collection' USING ERRCODE='22023'; END IF;
  FOR item IN SELECT (value#>>'{}')::uuid FROM jsonb_array_elements(c->'order') LOOP
   before_row:=private.profile_row(entity,p_user_id,item);
   after_row:=private.profile_write(entity,p_user_id,item,jsonb_build_object('display_order',pos),false);
   effects:=effects||jsonb_build_array(jsonb_build_object('kind','patch','entity',entity,'id',item,'before',jsonb_build_object('display_order',before_row->'display_order'),'after',jsonb_build_object('display_order',pos)));
   deltas:=deltas||jsonb_build_array(private.profile_delta(entity,item,jsonb_build_object('id',item,'user_id',p_user_id,'display_order',pos))); pos:=pos+1;
  END LOOP;
 ELSE
  entity:=CASE split_part(kind,'.',1) WHEN 'profile' THEN 'profile' WHEN 'link' THEN 'links' WHEN 'contact' THEN 'contacts' WHEN 'experience' THEN 'experiences' WHEN 'qualification' THEN 'qualifications' WHEN 'project' THEN 'projects' WHEN 'product' THEN 'products' END;
  action:=split_part(kind,'.',2);
  IF entity IS NULL OR kind<>split_part(kind,'.',1)||'.'||action OR action NOT IN ('add','patch','remove') OR (entity='profile' AND action<>'patch') THEN RAISE EXCEPTION 'Unsupported change' USING ERRCODE='22023'; END IF;
  IF entity='profile' THEN
   IF NOT private.profile_keys(c,ARRAY['kind','patch'],ARRAY['kind','patch']) THEN RAISE EXCEPTION 'Invalid profile change' USING ERRCODE='22023'; END IF; p_id:=p_user_id;
  ELSIF action='add' THEN
   IF NOT private.profile_keys(c,ARRAY['kind','values'],ARRAY['kind','values']) THEN RAISE EXCEPTION 'Invalid add' USING ERRCODE='22023'; END IF; p_id:=gen_random_uuid();
  ELSE
   IF NOT private.profile_keys(c,CASE WHEN action='patch' THEN ARRAY['kind','id','patch'] ELSE ARRAY['kind','id'] END,CASE WHEN action='patch' THEN ARRAY['kind','id','patch'] ELSE ARRAY['kind','id'] END)
    OR jsonb_typeof(c->'id')<>'string' OR c->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'Invalid item ID' USING ERRCODE='22023'; END IF;
   p_id:=(c->>'id')::uuid;
  END IF;
  IF action='add' THEN
   patch:=c->'values'; PERFORM private.validate_profile_values(entity,patch,true);
   patch:=patch||jsonb_build_object('id',p_id,'user_id',p_user_id);
   IF entity<>'products' THEN
    EXECUTE format('SELECT coalesce(max(display_order),-1)+1 FROM public.%I WHERE user_id=$1',entity) INTO ord USING p_user_id;
    patch:=patch||jsonb_build_object('display_order',ord);
   END IF;
   after_row:=private.profile_write(entity,p_user_id,p_id,patch,true);
   IF entity IN ('experiences','qualifications') AND (after_row->>'start_year')::integer>(after_row->>'end_year')::integer THEN RAISE EXCEPTION 'End year precedes start year' USING ERRCODE='22023'; END IF;
   effects:=jsonb_build_array(jsonb_build_object('kind','add','entity',entity,'id',p_id,'before',NULL,'after',after_row));
   deltas:=jsonb_build_array(private.profile_delta(entity,p_id,after_row));
  ELSE
   before_row:=private.profile_row(entity,p_user_id,p_id);
   IF before_row IS NULL THEN RAISE EXCEPTION 'Profile item unavailable' USING ERRCODE='P0002'; END IF;
   IF action='patch' THEN
    patch:=c->'patch'; PERFORM private.validate_profile_values(entity,patch,false);
    SELECT array_agg(k) INTO keys FROM jsonb_object_keys(patch) k;
    after_row:=private.profile_write(entity,p_user_id,p_id,patch,false);
    IF entity IN ('experiences','qualifications') AND (after_row->>'start_year')::integer>(after_row->>'end_year')::integer THEN RAISE EXCEPTION 'End year precedes start year' USING ERRCODE='22023'; END IF;
    effects:=jsonb_build_array(jsonb_build_object('kind','patch','entity',entity,'id',p_id,'before',private.profile_pick(before_row,keys),'after',private.profile_pick(after_row,keys)));
    deltas:=jsonb_build_array(private.profile_delta(entity,p_id,private.profile_pick(after_row,keys)||jsonb_build_object('id',p_id,'user_id',p_user_id)));
   ELSE
    EXECUTE format('DELETE FROM public.%I WHERE id=$1 AND user_id=$2',entity) USING p_id,p_user_id;
    effects:=jsonb_build_array(jsonb_build_object('kind','remove','entity',entity,'id',p_id,'before',before_row,'after',NULL));
    deltas:=jsonb_build_array(private.profile_delta(entity,p_id,NULL));
   END IF;
  END IF;
 END IF;
 RETURN jsonb_build_object('changes',deltas,'effects',effects);
END $_$;


--
-- Name: apply_profile_operation(jsonb); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.apply_profile_operation(p_operation jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
DECLARE u uuid:=auth.uid(); op uuid; expected bigint; rev bigint; h text; previous private.profile_operations%ROWTYPE;
 c jsonb; part jsonb; deltas jsonb:='[]'; effects jsonb:='[]'; result jsonb; state text:='applied'; code text; old_marker text;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF octet_length(p_operation::text)>1048576 OR NOT private.profile_keys(p_operation,ARRAY['version','operationId','expectedRevision','changes'],ARRAY['version','operationId','expectedRevision','changes'])
 OR p_operation->'version' IS DISTINCT FROM '1'::jsonb OR jsonb_typeof(p_operation->'operationId')<>'string'
 OR p_operation->>'operationId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 OR jsonb_typeof(p_operation->'expectedRevision')<>'number' OR p_operation->>'expectedRevision' !~ '^[0-9]{1,16}$'
 OR (p_operation->>'expectedRevision')::numeric>9007199254740991 OR jsonb_typeof(p_operation->'changes')<>'array'
 OR jsonb_array_length(p_operation->'changes') NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Invalid operation envelope' USING ERRCODE='22023'; END IF;
 op:=(p_operation->>'operationId')::uuid; expected:=(p_operation->>'expectedRevision')::bigint;
 h:=encode(sha256(convert_to(jsonb_build_object('kind','apply','operation',p_operation)::text,'UTF8')),'hex');
 rev:=private.profile_lock(u);
 SELECT * INTO previous FROM private.profile_operations WHERE user_id=u AND operation_id=op;
 IF FOUND THEN
  IF previous.request_hash=h THEN RETURN previous.result; END IF;
  RETURN jsonb_build_object('status','conflict','operationId',op,'revision',rev,'changes','[]'::jsonb,'code','OPERATION_ID_REUSED');
 END IF;
 IF NOT private.profile_operation_quota(u) THEN RETURN jsonb_build_object('status','rejected','operationId',op,'revision',rev,'changes','[]'::jsonb,'code','RATE_LIMITED'); END IF;
 IF expected<>rev THEN state:='conflict'; code:='REVISION_CONFLICT';
 ELSE
  old_marker:=current_setting('nsso.journal_actor',true);
  BEGIN
   PERFORM set_config('nsso.journal_actor',u::text,true);
   PERFORM private.ensure_account_for(u);
   FOR c IN SELECT value FROM jsonb_array_elements(p_operation->'changes') LOOP
    part:=private.apply_profile_change(u,c); deltas:=deltas||(part->'changes'); effects:=effects||(part->'effects');
   END LOOP;
   rev:=rev+1; UPDATE private.profile_revisions SET revision=rev WHERE user_id=u;
  EXCEPTION WHEN invalid_parameter_value OR not_null_violation OR check_violation OR unique_violation OR foreign_key_violation OR insufficient_privilege OR no_data_found THEN
   state:='rejected'; code:='INVALID_CHANGE'; deltas:='[]'; effects:='[]';
  END;
  PERFORM set_config('nsso.journal_actor',coalesce(old_marker,''),true);
 END IF;
 result:=jsonb_build_object('status',state,'operationId',op,'revision',rev,'changes',deltas);
 IF code IS NOT NULL THEN result:=result||jsonb_build_object('code',code); END IF;
 INSERT INTO private.profile_operations(user_id,operation_id,request_hash,operation_kind,status,expected_revision,revision,effects,result)
 VALUES(u,op,h,'apply',state,expected,rev,effects,result);
 RETURN result;
END $_$;


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
-- Name: lock_external_profile_write(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.lock_external_profile_write() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$ BEGIN
 IF auth.uid() IS NOT NULL AND current_setting('nsso.journal_actor',true) IS DISTINCT FROM auth.uid()::text THEN PERFORM private.profile_lock(auth.uid()); END IF;
 RETURN NULL;
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
-- Name: profile_delta(text, uuid, jsonb); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.profile_delta(entity text, p_id uuid, p_row jsonb) RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$ SELECT jsonb_build_object('entity',entity,'id',p_id,'row',p_row) $$;


--
-- Name: profile_fields(text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.profile_fields(entity text) RETURNS text[]
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$ SELECT CASE entity
 WHEN 'profile' THEN ARRAY['full_name','headline','bio','profile_pic_url']
 WHEN 'links' THEN ARRAY['link_name','link_url']
 WHEN 'contacts' THEN ARRAY['method','value','custom_method_name']
 WHEN 'experiences' THEN ARRAY['company_name','job_title','start_year','end_year','description']
 WHEN 'qualifications' THEN ARRAY['institution','qualification_name','start_year','end_year']
 WHEN 'projects' THEN ARRAY['project_name','contribution','description','project_photo_url','project_url']
 WHEN 'products' THEN ARRAY['name','price','image_url','description','purchase_link','purchase_link_active','paypal_active','sales_page_active','sales_page_published','headline','tagline','intro_text','value_proposition','video_url','benefits','testimonials'] END $$;


--
-- Name: profile_keys(jsonb, text[], text[]); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.profile_keys(p jsonb, allowed text[], required text[] DEFAULT '{}'::text[]) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$ SELECT CASE WHEN jsonb_typeof(p)='object' THEN
 NOT EXISTS(SELECT 1 FROM jsonb_object_keys(p) k WHERE NOT(k=ANY(allowed))) AND p ?& required ELSE false END $$;


--
-- Name: profile_lock(uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.profile_lock(p_user_id uuid) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$ DECLARE v bigint; BEGIN
 -- Account provisioning already takes719 before its profile INSERT triggers730.
 -- Every journal/status/payment/manual path must take those locks in that order.
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,719));
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,730));
 INSERT INTO private.profile_revisions(user_id) VALUES(p_user_id) ON CONFLICT DO NOTHING;
 SELECT revision INTO v FROM private.profile_revisions WHERE user_id=p_user_id FOR UPDATE; RETURN v;
END $$;


--
-- Name: profile_operation_quota(uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.profile_operation_quota(p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$ SELECT count(*) FILTER(WHERE created_at>=now()-interval '1 minute')<240 AND count(*)<6000
 FROM private.profile_operations WHERE user_id=p_user_id AND created_at>=now()-interval '1 day' $$;


--
-- Name: profile_operation_status(uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.profile_operation_status(p_operation_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$ DECLARE u uuid:=auth.uid(); r jsonb; rev bigint; BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 rev:=private.profile_lock(u); SELECT result INTO r FROM private.profile_operations WHERE user_id=u AND operation_id=p_operation_id;
 RETURN coalesce(r,jsonb_build_object('status','not_found','operationId',p_operation_id,'revision',rev));
END $$;


--
-- Name: profile_pick(jsonb, text[]); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.profile_pick(p jsonb, keys text[]) RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$ SELECT coalesce(jsonb_object_agg(k,p->k),'{}'::jsonb) FROM unnest(keys) k $$;


--
-- Name: profile_row(text, uuid, uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.profile_row(entity text, p_user_id uuid, p_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$ DECLARE r jsonb; tbl text; BEGIN
 IF entity='profile' THEN
  SELECT jsonb_build_object('user_id',user_id,'full_name',full_name,'headline',headline,'bio',bio,'profile_pic_url',profile_pic_url) INTO r FROM public.profiles WHERE user_id=p_user_id FOR UPDATE;
 ELSE
  IF private.profile_fields(entity) IS NULL THEN RAISE EXCEPTION 'Invalid entity' USING ERRCODE='22023'; END IF;
  EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1 AND user_id=$2 FOR UPDATE',entity) INTO r USING p_id,p_user_id;
 END IF; RETURN r;
END $_$;


--
-- Name: profile_snapshot(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.profile_snapshot() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$ DECLARE u uuid:=auth.uid(); rev bigint; result jsonb; entity text; rows jsonb; ordering text; BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 PERFORM private.ensure_account_for(u); rev:=private.profile_lock(u);
 result:=jsonb_build_object('revision',rev,'profile',private.profile_row('profile',u,u));
 FOREACH entity IN ARRAY ARRAY['links','contacts','experiences','qualifications','projects','products'] LOOP
  IF entity='products' THEN
   SELECT coalesce(jsonb_agg(private.product_details(p.id) ORDER BY created_at DESC,id),'[]'::jsonb) INTO rows FROM public.products p WHERE user_id=u;
  ELSE
   ordering:=CASE entity WHEN 'experiences' THEN 'display_order ASC NULLS LAST,start_year DESC NULLS FIRST,created_at,id'
    WHEN 'qualifications' THEN 'display_order ASC NULLS LAST,end_year DESC NULLS FIRST,created_at,id'
    WHEN 'projects' THEN 'display_order ASC NULLS LAST,created_at DESC,id' ELSE 'display_order ASC NULLS LAST,created_at,id' END;
   EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY %s),''[]''::jsonb) FROM public.%I t WHERE user_id=$1',ordering,entity) INTO rows USING u;
  END IF; result:=result||jsonb_build_object(entity,rows);
 END LOOP; RETURN result;
END $_$;


--
-- Name: profile_web_url(text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.profile_web_url(v text) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO ''
    AS $_$ DECLARE authority text; pieces text[]; port text; BEGIN
 IF v='' THEN RETURN true; END IF;
 IF v IS NULL OR length(v)>4096 OR position(chr(92) IN v)>0 OR v ~ '[[:cntrl:]]' OR v !~ '^https?://' THEN RETURN false; END IF;
 authority:=split_part(split_part(split_part(substr(v,strpos(v,'://')+3),'/',1),'?',1),'#',1);
 IF authority LIKE '[%' THEN
  pieces:=regexp_match(authority,'^\[([0-9a-fA-F:.]+)\](:([0-9]{1,5}))?$');
  IF pieces IS NULL THEN RETURN false; END IF;
  BEGIN IF family(pieces[1]::inet)<>6 THEN RETURN false; END IF; EXCEPTION WHEN invalid_text_representation THEN RETURN false; END;
  port:=pieces[3];
 ELSE
  pieces:=regexp_match(authority,'^([[:alnum:]_.-]+)(:([0-9]{1,5}))?$');
  IF pieces IS NULL THEN RETURN false; END IF; port:=pieces[3];
 END IF;
 RETURN port IS NULL OR port::integer BETWEEN 1 AND 65535;
END $_$;


--
-- Name: profile_write(text, uuid, uuid, jsonb, boolean); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.profile_write(entity text, p_user_id uuid, p_id uuid, values_json jsonb, is_insert boolean) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$ DECLARE cols text; assignments text; r jsonb; tbl text:=CASE WHEN entity='profile' THEN 'profiles' ELSE entity END;
BEGIN
 IF private.profile_fields(entity) IS NULL THEN RAISE EXCEPTION 'Invalid entity' USING ERRCODE='22023'; END IF;
 SELECT string_agg(format('%I',k),',' ORDER BY k),string_agg(format('%1$I=x.%1$I',k),',' ORDER BY k) INTO cols,assignments FROM jsonb_object_keys(values_json) k;
 IF is_insert THEN
  EXECUTE format('INSERT INTO public.%1$I(%2$s) SELECT %2$s FROM jsonb_populate_record(NULL::public.%1$I,$1) RETURNING to_jsonb(%1$I)',tbl,cols) INTO r USING values_json;
 ELSIF entity='profile' THEN
  EXECUTE format('UPDATE public.profiles t SET %s FROM jsonb_populate_record(NULL::public.profiles,$1) x WHERE t.user_id=$2 RETURNING to_jsonb(t)',assignments) INTO r USING values_json,p_user_id;
 ELSE
  EXECUTE format('UPDATE public.%1$I t SET %2$s FROM jsonb_populate_record(NULL::public.%1$I,$1) x WHERE t.id=$2 AND t.user_id=$3 RETURNING to_jsonb(t)',tbl,assignments) INTO r USING values_json,p_id,p_user_id;
 END IF;
 IF r IS NULL THEN RAISE EXCEPTION 'Profile item unavailable' USING ERRCODE='P0002'; END IF;
 RETURN r;
END $_$;


--
-- Name: register_profile_media(uuid, text, text, text, bigint); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.register_profile_media(p_actor_id uuid, p_bucket_id text, p_object_name text, p_content_type text, p_bytes bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
DECLARE kind text; stored storage.objects%ROWTYPE; asset private.media_assets%ROWTYPE;
BEGIN
 IF p_actor_id IS NULL OR p_bucket_id IS NULL OR p_object_name IS NULL OR p_content_type IS DISTINCT FROM 'image/jpeg'
 OR p_bytes IS NULL OR p_bytes NOT BETWEEN 1 AND 5242880 OR length(p_object_name)>200
 OR p_object_name !~ ('^'||p_actor_id::text||'/(avatar|project|product)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]jpg$') THEN
  RAISE EXCEPTION 'Invalid media registration' USING ERRCODE='22023'; END IF;
 kind:=split_part(p_object_name,'/',2);
 IF (kind='avatar' AND p_bucket_id<>'avatars') OR (kind<>'avatar' AND p_bucket_id<>'portfolio-assets') THEN RAISE EXCEPTION 'Invalid media bucket' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_actor_id) THEN RAISE EXCEPTION 'Media actor unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO stored FROM storage.objects WHERE bucket_id=p_bucket_id AND name=p_object_name;
 IF NOT FOUND OR stored.metadata->>'mimetype' IS DISTINCT FROM p_content_type OR (stored.metadata->>'size')::bigint IS DISTINCT FROM p_bytes
 OR (stored.owner IS NOT NULL AND stored.owner<>p_actor_id) OR (nullif(stored.owner_id,'') IS NOT NULL AND stored.owner_id<>p_actor_id::text) THEN
  RAISE EXCEPTION 'Stored media did not match registration' USING ERRCODE='22023'; END IF;
 INSERT INTO private.media_assets(user_id,bucket_id,object_name,object_id,content_type,bytes)
 VALUES(p_actor_id,p_bucket_id,p_object_name,stored.id,p_content_type,p_bytes) ON CONFLICT(bucket_id,object_name) DO NOTHING;
 SELECT * INTO asset FROM private.media_assets WHERE bucket_id=p_bucket_id AND object_name=p_object_name;
 IF asset.user_id<>p_actor_id OR asset.object_id<>stored.id OR asset.content_type<>p_content_type OR asset.bytes<>p_bytes THEN
  RAISE EXCEPTION 'Media registration already differs' USING ERRCODE='23505'; END IF;
 RETURN jsonb_build_object('assetId',asset.id,'bucket',asset.bucket_id,'objectName',asset.object_name,'contentType',asset.content_type,'bytes',asset.bytes);
END $_$;


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
-- Name: save_product_payment_operation(uuid, uuid, uuid, bigint, text, jsonb); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.save_product_payment_operation(p_user_id uuid, p_product_id uuid, p_operation_id uuid, p_expected_revision bigint, p_html text, p_config jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE rev bigint; h text; previous private.profile_operations%ROWTYPE; owned uuid;
 result jsonb; state text:='applied'; code text; old_marker text;
BEGIN
 IF p_user_id IS NULL OR p_product_id IS NULL OR p_operation_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision NOT BETWEEN 0 AND 9007199254740991 OR p_html IS NULL OR length(p_html)>32768 OR private.valid_paypal_config(p_config) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Invalid payment operation' USING ERRCODE='22023'; END IF;
 h:=encode(sha256(convert_to(jsonb_build_object('kind','payment','id',p_product_id,'expectedRevision',p_expected_revision,'html',p_html,'config',p_config)::text,'UTF8')),'hex'); rev:=private.profile_lock(p_user_id);
 SELECT * INTO previous FROM private.profile_operations WHERE user_id=p_user_id AND operation_id=p_operation_id;
 IF FOUND THEN
  IF previous.request_hash=h THEN RETURN previous.result; END IF;
  RETURN jsonb_build_object('status','conflict','operationId',p_operation_id,'revision',rev,'changes','[]'::jsonb,'code','OPERATION_ID_REUSED');
 END IF;
 IF NOT private.profile_operation_quota(p_user_id) THEN RETURN jsonb_build_object('status','rejected','operationId',p_operation_id,'revision',rev,'changes','[]'::jsonb,'code','RATE_LIMITED'); END IF;
 SELECT id INTO owned FROM public.products WHERE id=p_product_id AND user_id=p_user_id FOR UPDATE;
 IF owned IS NULL THEN state:='rejected'; code:='ITEM_UNAVAILABLE';
 ELSIF rev<>p_expected_revision THEN state:='conflict'; code:='REVISION_CONFLICT';
 ELSE
  old_marker:=current_setting('nsso.journal_actor',true); PERFORM set_config('nsso.journal_actor',p_user_id::text,true);
  UPDATE public.products SET paypal_html=p_html,payment_config=p_config WHERE id=p_product_id AND user_id=p_user_id;
  PERFORM set_config('nsso.journal_actor',coalesce(old_marker,''),true);
  rev:=rev+1; UPDATE private.profile_revisions SET revision=rev WHERE user_id=p_user_id;
 END IF;
 result:=jsonb_build_object('status',state,'operationId',p_operation_id,'revision',rev,'changes','[]'::jsonb);
 IF code IS NOT NULL THEN result:=result||jsonb_build_object('code',code); END IF;
 INSERT INTO private.profile_operations(user_id,operation_id,request_hash,operation_kind,status,expected_revision,revision,effects,result)
 VALUES(p_user_id,p_operation_id,h,'payment',state,p_expected_revision,rev,'[]'::jsonb,result);
 RETURN result;
END $$;


--
-- Name: track_external_profile_write(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.track_external_profile_write() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE u uuid; entity text:=CASE WHEN TG_TABLE_NAME='profiles' THEN 'profile' ELSE TG_TABLE_NAME END;
 before_row jsonb; after_row jsonb; before_patch jsonb; after_patch jsonb; item uuid; rev bigint; op uuid; effect jsonb; delta jsonb; h text; result jsonb;
BEGIN
 IF TG_OP<>'INSERT' THEN before_row:=to_jsonb(OLD)-'embedding'; END IF;
 IF TG_OP<>'DELETE' THEN after_row:=to_jsonb(NEW)-'embedding'; END IF;
 u:=coalesce((after_row->>'user_id')::uuid,(before_row->>'user_id')::uuid);
 IF TG_OP='UPDATE' AND ((after_row->'user_id') IS DISTINCT FROM (before_row->'user_id') OR (after_row->'id') IS DISTINCT FROM (before_row->'id')) THEN RAISE EXCEPTION 'Profile identity is immutable' USING ERRCODE='42501'; END IF;
 IF before_row IS NOT DISTINCT FROM after_row OR current_setting('nsso.journal_actor',true)=u::text THEN RETURN NULL; END IF;
 rev:=private.profile_lock(u)+1; op:=gen_random_uuid(); item:=CASE WHEN entity='profile' THEN u ELSE coalesce((after_row->>'id')::uuid,(before_row->>'id')::uuid) END;
 IF TG_OP='UPDATE' THEN
  SELECT coalesce(jsonb_object_agg(k,before_row->k),'{}'),coalesce(jsonb_object_agg(k,after_row->k),'{}') INTO before_patch,after_patch
  FROM jsonb_object_keys(after_row) k WHERE after_row->k IS DISTINCT FROM before_row->k;
  effect:=jsonb_build_object('kind','patch','entity',entity,'id',item,'before',before_patch,'after',after_patch);
  delta:=private.profile_delta(entity,item,after_patch||jsonb_build_object('id',item,'user_id',u));
 ELSE
  effect:=jsonb_build_object('kind',CASE WHEN TG_OP='INSERT' THEN 'add' ELSE 'remove' END,'entity',entity,'id',item,'before',before_row,'after',after_row);
  delta:=private.profile_delta(entity,item,after_row);
 END IF;
 h:=encode(sha256(convert_to(effect::text,'UTF8')),'hex');
 result:=jsonb_build_object('status','applied','operationId',op,'revision',rev,'changes',jsonb_build_array(delta));
 UPDATE private.profile_revisions SET revision=rev WHERE user_id=u;
 INSERT INTO private.profile_operations(user_id,operation_id,request_hash,operation_kind,status,expected_revision,revision,effects,result)
 VALUES(u,op,h,'external','applied',rev-1,rev,jsonb_build_array(effect),result);
 RETURN NULL;
END $$;


--
-- Name: undo_profile_operation(uuid, uuid, bigint); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.undo_profile_operation(p_operation_id uuid, p_original_operation_id uuid, p_expected_revision bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
DECLARE u uuid:=auth.uid(); rev bigint; h text; previous private.profile_operations%ROWTYPE; original private.profile_operations%ROWTYPE;
 e jsonb; entity text; item uuid; row_now jsonb; row_new jsonb; keys text[]; deltas jsonb:='[]'; inverse_effects jsonb:='[]';
 result jsonb; state text:='applied'; code text; old_marker text; occupied boolean;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF p_operation_id IS NULL OR p_original_operation_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision NOT BETWEEN 0 AND 9007199254740991 THEN RAISE EXCEPTION 'Invalid undo envelope' USING ERRCODE='22023'; END IF;
 h:=encode(sha256(convert_to(jsonb_build_object('kind','undo','original',p_original_operation_id,'expectedRevision',p_expected_revision)::text,'UTF8')),'hex'); rev:=private.profile_lock(u);
 SELECT * INTO previous FROM private.profile_operations WHERE user_id=u AND operation_id=p_operation_id;
 IF FOUND THEN
  IF previous.request_hash=h THEN RETURN previous.result; END IF;
  RETURN jsonb_build_object('status','conflict','operationId',p_operation_id,'revision',rev,'changes','[]'::jsonb,'code','OPERATION_ID_REUSED');
 END IF;
 IF NOT private.profile_operation_quota(u) THEN RETURN jsonb_build_object('status','rejected','operationId',p_operation_id,'revision',rev,'changes','[]'::jsonb,'code','RATE_LIMITED'); END IF;
 SELECT * INTO original FROM private.profile_operations WHERE user_id=u AND operation_id=p_original_operation_id;
 IF NOT FOUND OR original.status<>'applied' OR original.operation_kind NOT IN ('apply','external') THEN state:='rejected'; code:='NOT_UNDOABLE';
 ELSIF original.undone_by IS NOT NULL THEN state:='rejected'; code:='ALREADY_UNDONE';
 ELSIF p_expected_revision<>rev THEN state:='conflict'; code:='REVISION_CONFLICT';
 ELSE
  old_marker:=current_setting('nsso.journal_actor',true);
  BEGIN
   PERFORM set_config('nsso.journal_actor',u::text,true);
   FOR e IN SELECT value FROM jsonb_array_elements(original.effects) WITH ORDINALITY v(value,n) ORDER BY n DESC LOOP
    entity:=e->>'entity'; item:=(e->>'id')::uuid; row_now:=private.profile_row(entity,u,item);
    IF e->>'kind'='patch' THEN
     SELECT array_agg(k) INTO keys FROM jsonb_object_keys(e->'after') k;
     IF row_now IS NULL OR private.profile_pick(row_now,keys) IS DISTINCT FROM e->'after' THEN RAISE EXCEPTION 'Undo target changed' USING ERRCODE='P0001'; END IF;
     row_new:=private.profile_write(entity,u,item,e->'before',false);
     deltas:=deltas||jsonb_build_array(private.profile_delta(entity,item,(e->'before')||jsonb_build_object('id',item,'user_id',u)));
     inverse_effects:=inverse_effects||jsonb_build_array(jsonb_build_object('kind','patch','entity',entity,'id',item,'before',e->'after','after',e->'before'));
    ELSIF e->>'kind'='add' THEN
     IF row_now IS DISTINCT FROM e->'after' THEN RAISE EXCEPTION 'Undo target changed' USING ERRCODE='P0001'; END IF;
     EXECUTE format('DELETE FROM public.%I WHERE id=$1 AND user_id=$2',entity) USING item,u;
     deltas:=deltas||jsonb_build_array(private.profile_delta(entity,item,NULL));
     inverse_effects:=inverse_effects||jsonb_build_array(jsonb_build_object('kind','remove','entity',entity,'id',item,'before',row_now,'after',NULL));
    ELSIF e->>'kind'='remove' THEN
     EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE id=$1)',entity) INTO occupied USING item;
     IF occupied THEN RAISE EXCEPTION 'Undo target changed' USING ERRCODE='P0001'; END IF;
     row_new:=private.profile_write(entity,u,item,e->'before',true);
     deltas:=deltas||jsonb_build_array(private.profile_delta(entity,item,row_new));
     inverse_effects:=inverse_effects||jsonb_build_array(jsonb_build_object('kind','add','entity',entity,'id',item,'before',NULL,'after',row_new));
    ELSE RAISE EXCEPTION 'Unsupported undo record' USING ERRCODE='P0001'; END IF;
   END LOOP;
   rev:=rev+1; UPDATE private.profile_revisions SET revision=rev WHERE user_id=u;
   UPDATE private.profile_operations SET undone_by=p_operation_id WHERE user_id=u AND operation_id=p_original_operation_id;
  EXCEPTION WHEN raise_exception OR check_violation OR unique_violation OR foreign_key_violation OR no_data_found THEN
   state:='conflict'; code:='UNDO_TARGET_CHANGED'; deltas:='[]'; inverse_effects:='[]';
  END;
  PERFORM set_config('nsso.journal_actor',coalesce(old_marker,''),true);
 END IF;
 result:=jsonb_build_object('status',state,'operationId',p_operation_id,'revision',rev,'changes',deltas);
 IF code IS NOT NULL THEN result:=result||jsonb_build_object('code',code); END IF;
 INSERT INTO private.profile_operations(user_id,operation_id,request_hash,operation_kind,status,expected_revision,revision,original_operation_id,effects,result)
 VALUES(u,p_operation_id,h,'undo',state,p_expected_revision,rev,p_original_operation_id,inverse_effects,result);
 RETURN result;
END $_$;


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
-- Name: validate_profile_values(text, jsonb, boolean); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.validate_profile_values(entity text, p jsonb, is_add boolean) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $_$
DECLARE k text; v jsonb; s text; lim integer; required text[]; nullable text[]; item jsonb;
BEGIN
 required:=CASE entity WHEN 'links' THEN ARRAY['link_name','link_url'] WHEN 'contacts' THEN ARRAY['method','value']
 WHEN 'experiences' THEN ARRAY['company_name','job_title'] WHEN 'qualifications' THEN ARRAY['institution','qualification_name']
 WHEN 'projects' THEN ARRAY['project_name','contribution'] WHEN 'products' THEN ARRAY['name'] ELSE '{}'::text[] END;
 nullable:=CASE entity WHEN 'profile' THEN ARRAY['full_name','headline','bio','profile_pic_url']
 WHEN 'contacts' THEN ARRAY['custom_method_name'] WHEN 'experiences' THEN ARRAY['start_year','end_year','description']
 WHEN 'qualifications' THEN ARRAY['start_year','end_year'] WHEN 'projects' THEN ARRAY['description','project_photo_url','project_url']
 WHEN 'products' THEN ARRAY['price','image_url','description','purchase_link','headline','tagline','intro_text','value_proposition','video_url'] ELSE '{}'::text[] END;
 IF private.profile_fields(entity) IS NULL OR NOT private.profile_keys(p,private.profile_fields(entity),CASE WHEN is_add THEN required ELSE '{}'::text[] END)
 OR p='{}'::jsonb THEN RAISE EXCEPTION 'Invalid profile field set' USING ERRCODE='22023'; END IF;
 FOR k,v IN SELECT key,value FROM jsonb_each(p) LOOP
  IF v='null'::jsonb THEN
   IF k=ANY(nullable) THEN CONTINUE; END IF;
   RAISE EXCEPTION 'Profile field cannot be null' USING ERRCODE='22023';
  END IF;
  IF k IN ('start_year','end_year') THEN
   IF jsonb_typeof(v)<>'number' OR v::text !~ '^[0-9]{4}$' OR (v::text)::integer NOT BETWEEN 1000 AND 3000 THEN RAISE EXCEPTION 'Invalid year' USING ERRCODE='22023'; END IF;
  ELSIF k IN ('purchase_link_active','paypal_active','sales_page_active','sales_page_published') THEN
   IF jsonb_typeof(v)<>'boolean' THEN RAISE EXCEPTION 'Invalid toggle' USING ERRCODE='22023'; END IF;
  ELSIF k='benefits' THEN
   IF jsonb_typeof(v)<>'array' OR jsonb_array_length(v)>50 THEN RAISE EXCEPTION 'Invalid benefits' USING ERRCODE='22023'; END IF;
   FOR item IN SELECT value FROM jsonb_array_elements(v) LOOP
    IF jsonb_typeof(item)<>'string' OR length(item#>>'{}')>2000 THEN RAISE EXCEPTION 'Invalid benefit' USING ERRCODE='22023'; END IF;
   END LOOP;
  ELSIF k='testimonials' THEN
   IF jsonb_typeof(v)<>'array' OR jsonb_array_length(v)>50 THEN RAISE EXCEPTION 'Invalid testimonials' USING ERRCODE='22023'; END IF;
   FOR item IN SELECT value FROM jsonb_array_elements(v) LOOP
    IF NOT private.profile_keys(item,ARRAY['name','text'],ARRAY['name','text']) OR jsonb_typeof(item->'name')<>'string' OR jsonb_typeof(item->'text')<>'string'
    OR length(item->>'name')>300 OR length(item->>'text')>4000 THEN RAISE EXCEPTION 'Invalid testimonial' USING ERRCODE='22023'; END IF;
   END LOOP;
  ELSE
   IF jsonb_typeof(v)<>'string' THEN RAISE EXCEPTION 'Invalid profile text' USING ERRCODE='22023'; END IF;
   s:=v#>>'{}'; lim:=CASE WHEN k IN ('bio','description','intro_text','value_proposition') THEN 32768
    WHEN k IN ('profile_pic_url','link_url','project_photo_url','project_url','image_url','purchase_link','video_url') THEN 4096
    WHEN k='headline' THEN 120 WHEN k='tagline' THEN 500 WHEN k='price' THEN 200 WHEN k='value' THEN 2000 WHEN k='custom_method_name' THEN 100 ELSE 300 END;
   IF length(s)>lim THEN RAISE EXCEPTION 'Profile text is too long' USING ERRCODE='22023'; END IF;
   IF k IN ('profile_pic_url','link_url','project_photo_url','project_url','image_url','purchase_link','video_url') AND NOT private.profile_web_url(s) THEN RAISE EXCEPTION 'Invalid web URL' USING ERRCODE='22023'; END IF;
   IF k='method' AND NOT(s=ANY(ARRAY['Email','Phone','WhatsApp','Telegram','Signal','WeChat','Line','Discord','X','Instagram','LinkedIn','YouTube','TikTok','Twitch','Facebook','Snapchat','Pinterest','Reddit','GitHub','GitLab','Medium','Substack','Patreon','Ko-fi','Buy Me a Coffee','PayPal','Cash App','Venmo','Zelle','Location','Other'])) THEN RAISE EXCEPTION 'Invalid contact method' USING ERRCODE='22023'; END IF;
  END IF;
 END LOOP;
END $_$;


--
-- Name: validate_retrieval_request(public.vector, double precision, integer, text, text[], integer, public.vector); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.validate_retrieval_request(q public.vector, threshold double precision, result_count integer, query text DEFAULT NULL::text, files text[] DEFAULT NULL::text[], candidates integer DEFAULT NULL::integer, profile public.vector DEFAULT NULL::public.vector) RETURNS void
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO ''
    AS $$ BEGIN
 IF q IS NULL OR public.vector_dims(q)<>768 OR (profile IS NOT NULL AND public.vector_dims(profile)<>768)
 OR threshold IS NULL OR NOT(threshold BETWEEN -1 AND 1) OR result_count IS NULL OR result_count NOT BETWEEN 1 AND 20
 OR (query IS NOT NULL AND length(query)>4096) OR (files IS NOT NULL AND (cardinality(files)>50 OR EXISTS(SELECT 1 FROM unnest(files) f WHERE f IS NULL OR length(f)>1024)))
 OR (candidates IS NOT NULL AND (candidates NOT BETWEEN 1 AND 100 OR candidates<result_count)) THEN
 RAISE EXCEPTION 'Invalid retrieval bounds' USING ERRCODE='22023'; END IF;
END $$;


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
-- Name: apply_profile_operation(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apply_profile_operation(p_operation jsonb) RETURNS jsonb
    LANGUAGE sql
    SET search_path TO ''
    AS $$ SELECT private.apply_profile_operation(p_operation) $$;


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
-- Name: consume_nsso_request_limit(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.consume_nsso_request_limit(p_scope text, p_subject_hash text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
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
END $_$;


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
-- Name: get_profile_operation(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_profile_operation(p_operation_id uuid) RETURNS jsonb
    LANGUAGE sql
    SET search_path TO ''
    AS $$ SELECT private.profile_operation_status(p_operation_id) $$;


--
-- Name: get_profile_snapshot(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_profile_snapshot() RETURNS jsonb
    LANGUAGE sql
    SET search_path TO ''
    AS $$ SELECT private.profile_snapshot() $$;


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
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
BEGIN
 IF query_text IS NULL THEN RAISE EXCEPTION 'Invalid retrieval bounds' USING ERRCODE='22023'; END IF;
 PERFORM private.validate_retrieval_request(query_embedding,match_threshold,match_count,query_text,filter_files);
    RETURN QUERY
    WITH vector_results AS (
        SELECT 
            ak.id,
            ak.content,
            ak.metadata,
            (1 - (ak.embedding <=> query_embedding))::double precision as similarity
        FROM public.agent_knowledge ak
        WHERE (filter_files IS NULL OR (ak.metadata->>'source') = ANY(filter_files))
    ),
    keyword_results AS (
        SELECT 
            ak.id,
            ts_rank(ak.content_tsvector, plainto_tsquery('english', query_text))::double precision as keyword_score
        FROM public.agent_knowledge ak
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
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
BEGIN
 IF query_text IS NULL OR candidate_count IS NULL THEN RAISE EXCEPTION 'Invalid retrieval bounds' USING ERRCODE='22023'; END IF;
 PERFORM private.validate_retrieval_request(query_embedding,match_threshold,match_count,query_text,filter_files,candidate_count,profile_embedding);
    RETURN QUERY
    WITH vector_candidates AS (
        SELECT 
            ak.id,
            ak.content,
            ak.metadata,
            ak.embedding,
            ak.content_tsvector,
            (1 - (ak.embedding <=> query_embedding))::double precision as similarity
        FROM public.agent_knowledge ak
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
-- Name: match_documents(public.vector, double precision, integer, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.match_documents(query_embedding public.vector, match_threshold double precision, match_count integer, filter_files text[] DEFAULT NULL::text[]) RETURNS TABLE(id uuid, content text, metadata jsonb, similarity double precision)
    LANGUAGE plpgsql STABLE
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
begin
 PERFORM private.validate_retrieval_request(query_embedding,match_threshold,match_count,NULL,filter_files);
  return query
  select
    agent_knowledge.id,
    agent_knowledge.content,
    agent_knowledge.metadata,
    1 - (agent_knowledge.embedding <=> query_embedding) as similarity
  FROM public.agent_knowledge
  where 1 - (agent_knowledge.embedding <=> query_embedding) > match_threshold
  and (
    filter_files is null 
    or 
    (agent_knowledge.metadata->>'source') = any(filter_files)
  )
  order by agent_knowledge.embedding <=> query_embedding
  limit match_count;
end;
$$;


--
-- Name: nsso_security_health(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.nsso_security_health() RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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
-- Name: record_nsso_runtime_signal(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_nsso_runtime_signal(p_code text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$ BEGIN
 IF p_code NOT IN ('rate_denied','rate_unavailable','privilege_denied','mfa_required','payment_rejected','budget_unavailable','upstream_failed','request_rejected') THEN RAISE EXCEPTION 'Invalid signal' USING ERRCODE='22023'; END IF;
 INSERT INTO private.runtime_signals VALUES(p_code,date_trunc('hour',now()),1) ON CONFLICT(code,window_start) DO UPDATE SET count=private.runtime_signals.count+1;
 DELETE FROM private.runtime_signals WHERE window_start<now()-interval '30 days';
END $$;


--
-- Name: register_profile_media(uuid, text, text, text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.register_profile_media(p_actor_id uuid, p_bucket_id text, p_object_name text, p_content_type text, p_bytes bigint) RETURNS jsonb
    LANGUAGE sql
    SET search_path TO ''
    AS $$ SELECT private.register_profile_media(p_actor_id,p_bucket_id,p_object_name,p_content_type,p_bytes) $$;


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
-- Name: save_product_payment_operation(uuid, uuid, uuid, bigint, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_product_payment_operation(p_user_id uuid, p_product_id uuid, p_operation_id uuid, p_expected_revision bigint, p_html text, p_config jsonb) RETURNS jsonb
    LANGUAGE sql
    SET search_path TO ''
    AS $$ SELECT private.save_product_payment_operation(p_user_id,p_product_id,p_operation_id,p_expected_revision,p_html,p_config) $$;


--
-- Name: undo_profile_operation(uuid, uuid, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.undo_profile_operation(p_operation_id uuid, p_original_operation_id uuid, p_expected_revision bigint) RETURNS jsonb
    LANGUAGE sql
    SET search_path TO ''
    AS $$ SELECT private.undo_profile_operation(p_operation_id,p_original_operation_id,p_expected_revision) $$;


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
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
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
-- Name: media_assets; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.media_assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    bucket_id text NOT NULL,
    object_name text NOT NULL,
    object_id uuid NOT NULL,
    content_type text NOT NULL,
    bytes bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT media_assets_bytes_check CHECK (((bytes >= 1) AND (bytes <= 5242880))),
    CONSTRAINT media_assets_content_type_check CHECK ((content_type = 'image/jpeg'::text))
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
-- Name: profile_operations; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.profile_operations (
    user_id uuid NOT NULL,
    operation_id uuid NOT NULL,
    request_hash text NOT NULL,
    operation_kind text NOT NULL,
    status text NOT NULL,
    expected_revision bigint,
    revision bigint NOT NULL,
    original_operation_id uuid,
    undone_by uuid,
    effects jsonb DEFAULT '[]'::jsonb NOT NULL,
    result jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT profile_operations_operation_kind_check CHECK ((operation_kind = ANY (ARRAY['apply'::text, 'undo'::text, 'payment'::text, 'external'::text]))),
    CONSTRAINT profile_operations_status_check CHECK ((status = ANY (ARRAY['applied'::text, 'conflict'::text, 'rejected'::text])))
);


--
-- Name: profile_revisions; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.profile_revisions (
    user_id uuid NOT NULL,
    revision bigint DEFAULT 0 NOT NULL,
    CONSTRAINT profile_revisions_revision_check CHECK (((revision >= 0) AND (revision <= '9007199254740991'::bigint)))
);


--
-- Name: request_limits; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.request_limits (
    scope text NOT NULL,
    subject_hash text NOT NULL,
    window_start timestamp with time zone NOT NULL,
    requests integer NOT NULL,
    CONSTRAINT request_limits_requests_check CHECK ((requests >= 0))
);


--
-- Name: TABLE request_limits; Type: COMMENT; Schema: private; Owner: -
--

COMMENT ON TABLE private.request_limits IS 'HMAC-only endpoint counters, no IPs or content; two-day rolling retention. Service-only atomic per-subject and shared limits.';


--
-- Name: runtime_signals; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.runtime_signals (
    code text NOT NULL,
    window_start timestamp with time zone NOT NULL,
    count bigint DEFAULT 0 NOT NULL
);


--
-- Name: TABLE runtime_signals; Type: COMMENT; Schema: private; Owner: -
--

COMMENT ON TABLE private.runtime_signals IS 'Hourly aggregate operational counts; no actor IDs, URLs, prompts or payloads; thirty-day rolling retention.';


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
    display_order integer DEFAULT 0,
    CONSTRAINT contacts_method_check CHECK ((method = ANY (ARRAY['Email'::text, 'Phone'::text, 'WhatsApp'::text, 'Telegram'::text, 'Signal'::text, 'WeChat'::text, 'Line'::text, 'Discord'::text, 'X'::text, 'Instagram'::text, 'LinkedIn'::text, 'YouTube'::text, 'TikTok'::text, 'Twitch'::text, 'Facebook'::text, 'Snapchat'::text, 'Pinterest'::text, 'Reddit'::text, 'GitHub'::text, 'GitLab'::text, 'Medium'::text, 'Substack'::text, 'Patreon'::text, 'Ko-fi'::text, 'Buy Me a Coffee'::text, 'PayPal'::text, 'Cash App'::text, 'Venmo'::text, 'Zelle'::text, 'Location'::text, 'Other'::text])))
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
-- Name: media_assets media_assets_bucket_id_object_name_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.media_assets
    ADD CONSTRAINT media_assets_bucket_id_object_name_key UNIQUE (bucket_id, object_name);


--
-- Name: media_assets media_assets_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.media_assets
    ADD CONSTRAINT media_assets_pkey PRIMARY KEY (id);


--
-- Name: permission_audit permission_audit_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.permission_audit
    ADD CONSTRAINT permission_audit_pkey PRIMARY KEY (id);


--
-- Name: profile_operations profile_operations_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.profile_operations
    ADD CONSTRAINT profile_operations_pkey PRIMARY KEY (user_id, operation_id);


--
-- Name: profile_revisions profile_revisions_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.profile_revisions
    ADD CONSTRAINT profile_revisions_pkey PRIMARY KEY (user_id);


--
-- Name: request_limits request_limits_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.request_limits
    ADD CONSTRAINT request_limits_pkey PRIMARY KEY (scope, subject_hash, window_start);


--
-- Name: runtime_signals runtime_signals_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.runtime_signals
    ADD CONSTRAINT runtime_signals_pkey PRIMARY KEY (code, window_start);


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
-- Name: media_assets_owner; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX media_assets_owner ON private.media_assets USING btree (user_id, created_at DESC);


--
-- Name: profile_operations_owner_created; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX profile_operations_owner_created ON private.profile_operations USING btree (user_id, created_at DESC);


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
-- Name: contacts nsso_profile_external_journal; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER nsso_profile_external_journal AFTER INSERT OR DELETE OR UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION private.track_external_profile_write();


--
-- Name: experiences nsso_profile_external_journal; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER nsso_profile_external_journal AFTER INSERT OR DELETE OR UPDATE ON public.experiences FOR EACH ROW EXECUTE FUNCTION private.track_external_profile_write();


--
-- Name: links nsso_profile_external_journal; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER nsso_profile_external_journal AFTER INSERT OR DELETE OR UPDATE ON public.links FOR EACH ROW EXECUTE FUNCTION private.track_external_profile_write();


--
-- Name: products nsso_profile_external_journal; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER nsso_profile_external_journal AFTER INSERT OR DELETE OR UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION private.track_external_profile_write();


--
-- Name: profiles nsso_profile_external_journal; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER nsso_profile_external_journal AFTER INSERT OR DELETE OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION private.track_external_profile_write();


--
-- Name: projects nsso_profile_external_journal; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER nsso_profile_external_journal AFTER INSERT OR DELETE OR UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION private.track_external_profile_write();


--
-- Name: qualifications nsso_profile_external_journal; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER nsso_profile_external_journal AFTER INSERT OR DELETE OR UPDATE ON public.qualifications FOR EACH ROW EXECUTE FUNCTION private.track_external_profile_write();


--
-- Name: contacts nsso_profile_statement_lock; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER nsso_profile_statement_lock BEFORE INSERT OR DELETE OR UPDATE ON public.contacts FOR EACH STATEMENT EXECUTE FUNCTION private.lock_external_profile_write();


--
-- Name: experiences nsso_profile_statement_lock; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER nsso_profile_statement_lock BEFORE INSERT OR DELETE OR UPDATE ON public.experiences FOR EACH STATEMENT EXECUTE FUNCTION private.lock_external_profile_write();


--
-- Name: links nsso_profile_statement_lock; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER nsso_profile_statement_lock BEFORE INSERT OR DELETE OR UPDATE ON public.links FOR EACH STATEMENT EXECUTE FUNCTION private.lock_external_profile_write();


--
-- Name: products nsso_profile_statement_lock; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER nsso_profile_statement_lock BEFORE INSERT OR DELETE OR UPDATE ON public.products FOR EACH STATEMENT EXECUTE FUNCTION private.lock_external_profile_write();


--
-- Name: profiles nsso_profile_statement_lock; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER nsso_profile_statement_lock BEFORE INSERT OR DELETE OR UPDATE ON public.profiles FOR EACH STATEMENT EXECUTE FUNCTION private.lock_external_profile_write();


--
-- Name: projects nsso_profile_statement_lock; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER nsso_profile_statement_lock BEFORE INSERT OR DELETE OR UPDATE ON public.projects FOR EACH STATEMENT EXECUTE FUNCTION private.lock_external_profile_write();


--
-- Name: qualifications nsso_profile_statement_lock; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER nsso_profile_statement_lock BEFORE INSERT OR DELETE OR UPDATE ON public.qualifications FOR EACH STATEMENT EXECUTE FUNCTION private.lock_external_profile_write();


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
-- Name: media_assets media_assets_user_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.media_assets
    ADD CONSTRAINT media_assets_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profile_operations profile_operations_user_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.profile_operations
    ADD CONSTRAINT profile_operations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profile_revisions profile_revisions_user_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.profile_revisions
    ADD CONSTRAINT profile_revisions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


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
-- Name: media_assets; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.media_assets ENABLE ROW LEVEL SECURITY;

--
-- Name: permission_audit; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.permission_audit ENABLE ROW LEVEL SECURITY;

--
-- Name: profile_operations; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.profile_operations ENABLE ROW LEVEL SECURITY;

--
-- Name: profile_revisions; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.profile_revisions ENABLE ROW LEVEL SECURITY;

--
-- Name: request_limits; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.request_limits ENABLE ROW LEVEL SECURITY;

--
-- Name: runtime_signals; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.runtime_signals ENABLE ROW LEVEL SECURITY;

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
-- Name: FUNCTION apply_profile_change(p_user_id uuid, c jsonb); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.apply_profile_change(p_user_id uuid, c jsonb) FROM PUBLIC;


--
-- Name: FUNCTION apply_profile_operation(p_operation jsonb); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.apply_profile_operation(p_operation jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION private.apply_profile_operation(p_operation jsonb) TO authenticated;


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
-- Name: FUNCTION lock_external_profile_write(); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.lock_external_profile_write() FROM PUBLIC;


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
-- Name: FUNCTION profile_delta(entity text, p_id uuid, p_row jsonb); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.profile_delta(entity text, p_id uuid, p_row jsonb) FROM PUBLIC;


--
-- Name: FUNCTION profile_fields(entity text); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.profile_fields(entity text) FROM PUBLIC;


--
-- Name: FUNCTION profile_keys(p jsonb, allowed text[], required text[]); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.profile_keys(p jsonb, allowed text[], required text[]) FROM PUBLIC;


--
-- Name: FUNCTION profile_lock(p_user_id uuid); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.profile_lock(p_user_id uuid) FROM PUBLIC;


--
-- Name: FUNCTION profile_operation_quota(p_user_id uuid); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.profile_operation_quota(p_user_id uuid) FROM PUBLIC;


--
-- Name: FUNCTION profile_operation_status(p_operation_id uuid); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.profile_operation_status(p_operation_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION private.profile_operation_status(p_operation_id uuid) TO authenticated;


--
-- Name: FUNCTION profile_pick(p jsonb, keys text[]); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.profile_pick(p jsonb, keys text[]) FROM PUBLIC;


--
-- Name: FUNCTION profile_row(entity text, p_user_id uuid, p_id uuid); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.profile_row(entity text, p_user_id uuid, p_id uuid) FROM PUBLIC;


--
-- Name: FUNCTION profile_snapshot(); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.profile_snapshot() FROM PUBLIC;
GRANT ALL ON FUNCTION private.profile_snapshot() TO authenticated;


--
-- Name: FUNCTION profile_web_url(v text); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.profile_web_url(v text) FROM PUBLIC;


--
-- Name: FUNCTION profile_write(entity text, p_user_id uuid, p_id uuid, values_json jsonb, is_insert boolean); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.profile_write(entity text, p_user_id uuid, p_id uuid, values_json jsonb, is_insert boolean) FROM PUBLIC;


--
-- Name: FUNCTION register_profile_media(p_actor_id uuid, p_bucket_id text, p_object_name text, p_content_type text, p_bytes bigint); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.register_profile_media(p_actor_id uuid, p_bucket_id text, p_object_name text, p_content_type text, p_bytes bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION private.register_profile_media(p_actor_id uuid, p_bucket_id text, p_object_name text, p_content_type text, p_bytes bigint) TO service_role;


--
-- Name: FUNCTION register_referral(p_referral_code text); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.register_referral(p_referral_code text) FROM PUBLIC;
GRANT ALL ON FUNCTION private.register_referral(p_referral_code text) TO authenticated;


--
-- Name: FUNCTION save_product_payment_operation(p_user_id uuid, p_product_id uuid, p_operation_id uuid, p_expected_revision bigint, p_html text, p_config jsonb); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.save_product_payment_operation(p_user_id uuid, p_product_id uuid, p_operation_id uuid, p_expected_revision bigint, p_html text, p_config jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION private.save_product_payment_operation(p_user_id uuid, p_product_id uuid, p_operation_id uuid, p_expected_revision bigint, p_html text, p_config jsonb) TO service_role;


--
-- Name: FUNCTION track_external_profile_write(); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.track_external_profile_write() FROM PUBLIC;


--
-- Name: FUNCTION undo_profile_operation(p_operation_id uuid, p_original_operation_id uuid, p_expected_revision bigint); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.undo_profile_operation(p_operation_id uuid, p_original_operation_id uuid, p_expected_revision bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION private.undo_profile_operation(p_operation_id uuid, p_original_operation_id uuid, p_expected_revision bigint) TO authenticated;


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
-- Name: FUNCTION validate_profile_values(entity text, p jsonb, is_add boolean); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.validate_profile_values(entity text, p jsonb, is_add boolean) FROM PUBLIC;


--
-- Name: FUNCTION validate_retrieval_request(q public.vector, threshold double precision, result_count integer, query text, files text[], candidates integer, profile public.vector); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.validate_retrieval_request(q public.vector, threshold double precision, result_count integer, query text, files text[], candidates integer, profile public.vector) FROM PUBLIC;
GRANT ALL ON FUNCTION private.validate_retrieval_request(q public.vector, threshold double precision, result_count integer, query text, files text[], candidates integer, profile public.vector) TO service_role;


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
-- Name: FUNCTION apply_profile_operation(p_operation jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.apply_profile_operation(p_operation jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.apply_profile_operation(p_operation jsonb) TO authenticated;


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
-- Name: FUNCTION consume_nsso_request_limit(p_scope text, p_subject_hash text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.consume_nsso_request_limit(p_scope text, p_subject_hash text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.consume_nsso_request_limit(p_scope text, p_subject_hash text) TO service_role;


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
-- Name: FUNCTION get_profile_operation(p_operation_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_profile_operation(p_operation_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_profile_operation(p_operation_id uuid) TO authenticated;


--
-- Name: FUNCTION get_profile_snapshot(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_profile_snapshot() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_profile_snapshot() TO authenticated;


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
-- Name: FUNCTION match_documents(query_embedding public.vector, match_threshold double precision, match_count integer, filter_files text[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.match_documents(query_embedding public.vector, match_threshold double precision, match_count integer, filter_files text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.match_documents(query_embedding public.vector, match_threshold double precision, match_count integer, filter_files text[]) TO service_role;


--
-- Name: FUNCTION nsso_security_health(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.nsso_security_health() FROM PUBLIC;
GRANT ALL ON FUNCTION public.nsso_security_health() TO service_role;


--
-- Name: FUNCTION process_daily_feed_aggregation(target_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.process_daily_feed_aggregation(target_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.process_daily_feed_aggregation(target_user_id uuid) TO service_role;


--
-- Name: FUNCTION record_nsso_runtime_signal(p_code text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.record_nsso_runtime_signal(p_code text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_nsso_runtime_signal(p_code text) TO service_role;


--
-- Name: FUNCTION register_profile_media(p_actor_id uuid, p_bucket_id text, p_object_name text, p_content_type text, p_bytes bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.register_profile_media(p_actor_id uuid, p_bucket_id text, p_object_name text, p_content_type text, p_bytes bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.register_profile_media(p_actor_id uuid, p_bucket_id text, p_object_name text, p_content_type text, p_bytes bigint) TO service_role;


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
-- Name: FUNCTION save_product_payment_operation(p_user_id uuid, p_product_id uuid, p_operation_id uuid, p_expected_revision bigint, p_html text, p_config jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.save_product_payment_operation(p_user_id uuid, p_product_id uuid, p_operation_id uuid, p_expected_revision bigint, p_html text, p_config jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_product_payment_operation(p_user_id uuid, p_product_id uuid, p_operation_id uuid, p_expected_revision bigint, p_html text, p_config jsonb) TO service_role;


--
-- Name: FUNCTION undo_profile_operation(p_operation_id uuid, p_original_operation_id uuid, p_expected_revision bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.undo_profile_operation(p_operation_id uuid, p_original_operation_id uuid, p_expected_revision bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.undo_profile_operation(p_operation_id uuid, p_original_operation_id uuid, p_expected_revision bigint) TO authenticated;


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
-- Name: TABLE media_assets; Type: ACL; Schema: private; Owner: -
--

GRANT ALL ON TABLE private.media_assets TO service_role;


--
-- Name: TABLE permission_audit; Type: ACL; Schema: private; Owner: -
--

GRANT ALL ON TABLE private.permission_audit TO service_role;


--
-- Name: SEQUENCE permission_audit_id_seq; Type: ACL; Schema: private; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE private.permission_audit_id_seq TO service_role;


--
-- Name: TABLE profile_operations; Type: ACL; Schema: private; Owner: -
--

GRANT ALL ON TABLE private.profile_operations TO service_role;


--
-- Name: TABLE profile_revisions; Type: ACL; Schema: private; Owner: -
--

GRANT ALL ON TABLE private.profile_revisions TO service_role;


--
-- Name: TABLE agent_knowledge; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.agent_knowledge TO service_role;


--
-- Name: TABLE contacts; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.contacts TO anon;
GRANT SELECT ON TABLE public.contacts TO authenticated;
GRANT ALL ON TABLE public.contacts TO service_role;


--
-- Name: TABLE experiences; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.experiences TO anon;
GRANT SELECT ON TABLE public.experiences TO authenticated;
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
GRANT SELECT ON TABLE public.links TO authenticated;
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


--
-- Name: COLUMN products.id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(id) ON TABLE public.products TO anon;
GRANT SELECT(id) ON TABLE public.products TO authenticated;


--
-- Name: COLUMN products.user_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(user_id) ON TABLE public.products TO anon;
GRANT SELECT(user_id) ON TABLE public.products TO authenticated;


--
-- Name: COLUMN products.name; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(name) ON TABLE public.products TO anon;
GRANT SELECT(name) ON TABLE public.products TO authenticated;


--
-- Name: COLUMN products.price; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(price) ON TABLE public.products TO anon;
GRANT SELECT(price) ON TABLE public.products TO authenticated;


--
-- Name: COLUMN products.image_url; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(image_url) ON TABLE public.products TO anon;
GRANT SELECT(image_url) ON TABLE public.products TO authenticated;


--
-- Name: COLUMN products.description; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(description) ON TABLE public.products TO anon;
GRANT SELECT(description) ON TABLE public.products TO authenticated;


--
-- Name: COLUMN products.purchase_link; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(purchase_link) ON TABLE public.products TO anon;
GRANT SELECT(purchase_link) ON TABLE public.products TO authenticated;


--
-- Name: COLUMN products.purchase_link_active; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(purchase_link_active) ON TABLE public.products TO anon;
GRANT SELECT(purchase_link_active) ON TABLE public.products TO authenticated;


--
-- Name: COLUMN products.paypal_active; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(paypal_active) ON TABLE public.products TO anon;
GRANT SELECT(paypal_active) ON TABLE public.products TO authenticated;


--
-- Name: COLUMN products.created_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(created_at) ON TABLE public.products TO anon;
GRANT SELECT(created_at) ON TABLE public.products TO authenticated;


--
-- Name: COLUMN products.sales_page_active; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(sales_page_active) ON TABLE public.products TO anon;
GRANT SELECT(sales_page_active) ON TABLE public.products TO authenticated;


--
-- Name: COLUMN products.payment_config; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(payment_config) ON TABLE public.products TO anon;
GRANT SELECT(payment_config) ON TABLE public.products TO authenticated;


--
-- Name: COLUMN products.sales_page_published; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(sales_page_published) ON TABLE public.products TO anon;
GRANT SELECT(sales_page_published) ON TABLE public.products TO authenticated;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: COLUMN profiles.user_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(user_id) ON TABLE public.profiles TO anon;
GRANT SELECT(user_id) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.full_name; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(full_name) ON TABLE public.profiles TO anon;
GRANT SELECT(full_name) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.headline; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(headline) ON TABLE public.profiles TO anon;
GRANT SELECT(headline) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.bio; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(bio) ON TABLE public.profiles TO anon;
GRANT SELECT(bio) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.profile_pic_url; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(profile_pic_url) ON TABLE public.profiles TO anon;
GRANT SELECT(profile_pic_url) ON TABLE public.profiles TO authenticated;


--
-- Name: TABLE projects; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.projects TO anon;
GRANT SELECT ON TABLE public.projects TO authenticated;
GRANT ALL ON TABLE public.projects TO service_role;


--
-- Name: TABLE qualifications; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.qualifications TO anon;
GRANT SELECT ON TABLE public.qualifications TO authenticated;
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
CREATE POLICY "nsso_avatar_delete" ON storage.objects AS PERMISSIVE FOR DELETE TO "authenticated" USING (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text) AND ((( SELECT auth.uid() AS uid) = owner) OR ((( SELECT auth.uid() AS uid))::text = owner_id))));
CREATE POLICY "nsso_portfolio_delete" ON storage.objects AS PERMISSIVE FOR DELETE TO "authenticated" USING (((bucket_id = 'portfolio-assets'::text) AND ((owner = ( SELECT auth.uid() AS uid)) OR (owner_id = (( SELECT auth.uid() AS uid))::text))));
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('avatars','avatars',true,5242880,ARRAY['image/jpeg','image/png','image/webp','image/gif','image/avif']);
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('portfolio-assets','portfolio-assets',true,10485760,ARRAY['image/jpeg','image/png','image/webp','image/gif','image/avif']);
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('razinflix_posters','razinflix_posters',true,5242880,ARRAY['image/jpeg','image/png','image/webp','image/gif','image/avif']);
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
ALTER DEFAULT PRIVILEGES IN SCHEMA private REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
