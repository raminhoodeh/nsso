-- Forward-only containment. Existing customer rows and uploaded objects are retained.
-- Apply the compatible application adapters before restricting legacy column grants.
-- Trusted memberships are provisioned separately from an approved private manifest;
-- public.users.user_type is deliberately NEVER used as a source of authority.
BEGIN;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;
REVOKE CREATE ON SCHEMA public FROM PUBLIC,anon,authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA private REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
-- API actors never need table maintenance or anonymous write privileges.
REVOKE TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON ALL TABLES IN SCHEMA public FROM PUBLIC,anon,authenticated;
REVOKE INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public FROM PUBLIC,anon;

CREATE TABLE private.app_permissions (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission text NOT NULL CHECK (permission IN ('nsso:admin', 'razinflix:manage')),
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, permission)
);
CREATE TABLE private.permission_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid,
  target_user_id uuid NOT NULL,
  permission text NOT NULL,
  granted boolean NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE private.account_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  auth_provider text,
  referral_code text UNIQUE,
  referred_by_code text,
  paypal_me_slug text,
  deity_fast_mode boolean NOT NULL DEFAULT false,
  legacy_user_type text, -- Forensic value only; NEVER an authority source.
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.app_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.permission_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.account_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA private TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA private TO service_role;

-- Copy historical values intact; subsequent account reads use this private record.
INSERT INTO private.account_settings(user_id,email,auth_provider,referral_code,referred_by_code,paypal_me_slug,deity_fast_mode,legacy_user_type,created_at)
SELECT u.id,a.email,coalesce(a.raw_app_meta_data->>'provider',u.auth_provider,'email'),
       u.referral_code,u.referred_by_code,u.paypal_me_slug,coalesce(u.deity_fast_mode,false),u.user_type,coalesce(u.created_at,now())
FROM public.users u JOIN auth.users a ON a.id=u.id;

CREATE FUNCTION public.has_app_permission(p_user_id uuid,p_permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $$ SELECT EXISTS(SELECT 1 FROM private.app_permissions WHERE user_id=p_user_id AND permission=p_permission) $$;
REVOKE ALL ON FUNCTION public.has_app_permission(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.has_app_permission(uuid,text) TO service_role;

CREATE FUNCTION private.account_dto(p_user_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
 SELECT jsonb_build_object('id',u.id,'username',u.username,'email',a.email,
   'auth_provider',coalesce(a.raw_app_meta_data->>'provider',s.auth_provider,'email'),
   'user_type',CASE WHEN EXISTS(SELECT 1 FROM private.app_permissions ap WHERE ap.user_id=u.id AND ap.permission='nsso:admin') THEN 'admin' ELSE 'standard' END,
   'permissions',coalesce((SELECT jsonb_agg(ap.permission ORDER BY ap.permission) FROM private.app_permissions ap WHERE ap.user_id=u.id),'[]'::jsonb),
   'is_premium',true,'created_at',u.created_at,'referral_code',s.referral_code,
   'paypal_me_slug',s.paypal_me_slug,'referred_by_code',s.referred_by_code,'deity_fast_mode',s.deity_fast_mode)
 FROM public.users u JOIN auth.users a ON a.id=u.id JOIN private.account_settings s ON s.user_id=u.id WHERE u.id=p_user_id
$$;

CREATE FUNCTION private.ensure_account_for(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE a auth.users%ROWTYPE; v_code text;
BEGIN
 SELECT * INTO a FROM auth.users WHERE id=p_user_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Account identity missing' USING ERRCODE='23503'; END IF;
 -- Serialize bootstrap across the trigger and concurrent callback requests.
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,719));
 v_code := 'NS'||upper(replace(a.id::text,'-',''));
 INSERT INTO public.users(id,email,auth_provider,username,is_premium,referral_code)
 VALUES(a.id,coalesce(a.email,a.id::text||'@account.invalid'),coalesce(a.raw_app_meta_data->>'provider','email'),
        'user_'||substr(replace(a.id::text,'-',''),1,24),true,v_code) ON CONFLICT(id) DO NOTHING;
 INSERT INTO public.profiles(user_id) VALUES(a.id) ON CONFLICT(user_id) DO NOTHING;
 INSERT INTO private.account_settings(user_id,email,auth_provider,referral_code)
 VALUES(a.id,a.email,coalesce(a.raw_app_meta_data->>'provider','email'),v_code)
 ON CONFLICT(user_id) DO UPDATE SET email=excluded.email,auth_provider=excluded.auth_provider,
   referral_code=coalesce(private.account_settings.referral_code,excluded.referral_code),updated_at=now();
END;
$$;

CREATE FUNCTION private.ensure_current_account()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 PERFORM private.ensure_account_for(auth.uid()); RETURN private.account_dto(auth.uid());
END $$;
CREATE FUNCTION private.get_current_account()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$ BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 RETURN private.account_dto(auth.uid());
END $$;
CREATE FUNCTION private.update_account_settings(p_patch jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF p_patch IS NULL OR jsonb_typeof(p_patch)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_patch) k WHERE k NOT IN ('paypal_me_slug','deity_fast_mode')) THEN
   RAISE EXCEPTION 'Unsupported account setting' USING ERRCODE='22023'; END IF;
 IF p_patch ? 'deity_fast_mode' AND jsonb_typeof(p_patch->'deity_fast_mode')<>'boolean' THEN
   RAISE EXCEPTION 'Invalid preference' USING ERRCODE='22023'; END IF;
 IF p_patch ? 'paypal_me_slug' AND NOT (p_patch->'paypal_me_slug'='null'::jsonb OR (jsonb_typeof(p_patch->'paypal_me_slug')='string' AND (p_patch->>'paypal_me_slug') ~ '^[A-Za-z0-9_-]{0,50}$')) THEN
   RAISE EXCEPTION 'Invalid PayPal username' USING ERRCODE='22023'; END IF;
 PERFORM private.ensure_account_for(auth.uid());
 UPDATE private.account_settings SET
   paypal_me_slug=CASE WHEN p_patch ? 'paypal_me_slug' THEN nullif(p_patch->>'paypal_me_slug','') ELSE paypal_me_slug END,
   deity_fast_mode=CASE WHEN p_patch ? 'deity_fast_mode' THEN (p_patch->>'deity_fast_mode')::boolean ELSE deity_fast_mode END,
   updated_at=now() WHERE user_id=auth.uid();
 -- Temporary write-through keeps old deployed clients coherent during hand-off.
 UPDATE public.users u SET paypal_me_slug=s.paypal_me_slug,deity_fast_mode=s.deity_fast_mode
 FROM private.account_settings s WHERE s.user_id=auth.uid() AND u.id=s.user_id;
 RETURN private.account_dto(auth.uid());
END $$;

CREATE FUNCTION private.claim_profile_username(p_username text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ DECLARE v_username text:=lower(p_username); BEGIN
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
END $$;

CREATE FUNCTION public.ensure_current_account() RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.ensure_current_account() $$;
CREATE FUNCTION public.get_current_account() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT private.get_current_account() $$;
CREATE FUNCTION public.update_account_settings(p_patch jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.update_account_settings(p_patch) $$;
CREATE FUNCTION public.claim_profile_username(p_username text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.claim_profile_username(p_username) $$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ BEGIN PERFORM private.ensure_account_for(NEW.id); RETURN NEW; END $$;

CREATE FUNCTION private.sync_legacy_account_settings()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ BEGIN
 UPDATE private.account_settings SET paypal_me_slug=NEW.paypal_me_slug,
   deity_fast_mode=coalesce(NEW.deity_fast_mode,false),updated_at=now() WHERE user_id=NEW.id;
 RETURN NEW;
END $$;
CREATE TRIGGER nsso_sync_legacy_account_settings AFTER UPDATE OF paypal_me_slug,deity_fast_mode ON public.users
 FOR EACH ROW EXECUTE FUNCTION private.sync_legacy_account_settings();

CREATE FUNCTION private.admin_list_accounts(p_actor_id uuid,p_offset integer,p_limit integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
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
CREATE FUNCTION private.admin_set_permission(p_actor_id uuid,p_user_id uuid,p_permission text,p_granted boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
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
CREATE FUNCTION public.admin_list_accounts(p_actor_id uuid,p_offset integer DEFAULT 0,p_limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT private.admin_list_accounts(p_actor_id,p_offset,p_limit) $$;
CREATE FUNCTION public.admin_set_permission(p_actor_id uuid,p_user_id uuid,p_permission text,p_granted boolean)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.admin_set_permission(p_actor_id,p_user_id,p_permission,p_granted) $$;

CREATE FUNCTION private.register_referral(p_referral_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
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
CREATE FUNCTION public.register_referral(p_referral_code text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.register_referral(p_referral_code) $$;

CREATE FUNCTION private.connect_my_nsso(p_connected_user_id uuid,p_location_name text,p_location_lat double precision,p_location_long double precision)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
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
CREATE FUNCTION public.connect_my_nsso(p_connected_user_id uuid,p_location_name text DEFAULT '',p_location_lat double precision DEFAULT NULL,p_location_long double precision DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.connect_my_nsso(p_connected_user_id,p_location_name,p_location_lat,p_location_long) $$;
REVOKE ALL ON public.my_nsso FROM PUBLIC,anon,authenticated;
GRANT SELECT,DELETE ON public.my_nsso TO authenticated;
GRANT UPDATE(notes,location_name,location_lat,location_long,updated_at) ON public.my_nsso TO authenticated;

-- No browser can create financial history or unverified referral relationships.
DROP POLICY IF EXISTS referrals_insert_system ON public.referrals;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.referrals FROM PUBLIC,anon,authenticated;
DROP POLICY IF EXISTS subs_insert ON public.subscriptions;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.subscriptions FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.webhook_events FROM PUBLIC,anon,authenticated;

-- Immediate write containment, retaining old legitimate callback/preferences/
-- username flows until the compatible application has deployed.
DROP POLICY IF EXISTS service_role_users_update ON public.users;
DROP POLICY IF EXISTS users_update ON public.users;
DROP POLICY IF EXISTS users_insert ON public.users;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.users FROM PUBLIC,anon,authenticated;
GRANT INSERT(id,email,auth_provider,username,is_premium) ON public.users TO authenticated;
GRANT UPDATE(username,is_premium,paypal_me_slug,deity_fast_mode) ON public.users TO authenticated;
CREATE POLICY nsso_legacy_users_insert ON public.users FOR INSERT TO authenticated WITH CHECK((SELECT auth.uid())=id);
CREATE POLICY nsso_legacy_users_update ON public.users FOR UPDATE TO authenticated USING((SELECT auth.uid())=id) WITH CHECK((SELECT auth.uid())=id);
UPDATE public.users SET is_premium=true WHERE is_premium IS DISTINCT FROM true;
ALTER TABLE public.users ALTER COLUMN is_premium SET DEFAULT true;
ALTER TABLE public.users ADD CONSTRAINT users_free_access CHECK(is_premium IS TRUE);

-- Personal library remains publicly readable; only guarded server endpoints write.
ALTER TABLE public.razinflix_films ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.razinflix_films FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.razinflix_films TO anon,authenticated;
DROP POLICY IF EXISTS "Allow public read access" ON public.razinflix_films;
CREATE POLICY nsso_films_public_read ON public.razinflix_films FOR SELECT TO anon,authenticated USING(true);

-- The source corpus and raw retrieval endpoints are server-only. Guest chat uses
-- the existing budgeted server client and does not require direct corpus access.
DROP POLICY IF EXISTS allow_public_read ON public.agent_knowledge;
REVOKE ALL ON public.agent_knowledge FROM PUBLIC,anon,authenticated;
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN ('hybrid_search','intelligent_search','match_documents','get_agent_context','process_daily_feed_aggregation','generate_referral_code') LOOP
   EXECUTE 'REVOKE ALL ON FUNCTION '||f.signature||' FROM PUBLIC, anon, authenticated';
   EXECUTE 'GRANT EXECUTE ON FUNCTION '||f.signature||' TO service_role';
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.get_user_earnings_stats(user_uuid uuid)
RETURNS TABLE(referral_code text,active_referrals bigint,expected_earnings numeric,paypal_me_slug text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ BEGIN
 IF auth.uid() IS NULL OR auth.uid()<>user_uuid THEN RAISE EXCEPTION 'Own account required' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT s.referral_code,count(r.id) FILTER(WHERE r.subscription_status='active'),0::numeric,s.paypal_me_slug
 FROM private.account_settings s LEFT JOIN public.referrals r ON r.referrer_user_id=s.user_id
 WHERE s.user_id=auth.uid() GROUP BY s.user_id,s.referral_code,s.paypal_me_slug;
END $$;
CREATE OR REPLACE FUNCTION public.get_referred_users_details()
RETURNS TABLE(full_name text,username text,status text,activated_at timestamptz,is_premium boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT p.full_name,u.username,r.subscription_status,coalesce(r.activated_at,r.created_at),true
 FROM public.referrals r JOIN public.users u ON u.id=r.referred_user_id LEFT JOIN public.profiles p ON p.user_id=u.id
 WHERE r.referrer_user_id=auth.uid() ORDER BY r.created_at DESC;
END $$;
REVOKE ALL ON FUNCTION public.get_user_earnings_stats(uuid),public.get_referred_users_details() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_user_earnings_stats(uuid),public.get_referred_users_details() TO authenticated;

-- Serialize each user's aggregation and delete only rows captured by this command.
CREATE OR REPLACE FUNCTION public.process_daily_feed_aggregation(target_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
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

-- Harden all retained legacy privileged functions against caller search_path.
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.prosecdef LOOP
   EXECUTE 'ALTER FUNCTION '||f.signature||' SET search_path=public,pg_temp';
 END LOOP;
END $$;
-- Explicitly qualified definitions can use an entirely empty path.
ALTER FUNCTION public.handle_new_user() SET search_path='';
ALTER FUNCTION public.get_user_earnings_stats(uuid) SET search_path='';
ALTER FUNCTION public.get_referred_users_details() SET search_path='';

-- Drop every old avatar mutation policy, including permissive duplicates whose
-- OR combination previously bypassed the narrower owner checks.
DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_catalog.pg_policies WHERE schemaname='storage' AND tablename='objects' AND cmd IN ('INSERT','UPDATE','DELETE','ALL')
   AND (coalesce(qual,'')||coalesce(with_check,'')) LIKE '%avatars%' LOOP
   EXECUTE format('DROP POLICY %I ON storage.objects',p.policyname);
 END LOOP;
END $$;
CREATE POLICY nsso_avatar_insert ON storage.objects FOR INSERT TO authenticated
 WITH CHECK(bucket_id='avatars' AND (storage.foldername(name))[1]=(SELECT auth.uid())::text);
CREATE POLICY nsso_avatar_update ON storage.objects FOR UPDATE TO authenticated
 USING(bucket_id='avatars' AND (storage.foldername(name))[1]=(SELECT auth.uid())::text AND ((SELECT auth.uid())=owner OR (SELECT auth.uid())::text=owner_id))
 WITH CHECK(bucket_id='avatars' AND (storage.foldername(name))[1]=(SELECT auth.uid())::text AND ((SELECT auth.uid())=owner OR (SELECT auth.uid())::text=owner_id));
CREATE POLICY nsso_avatar_delete ON storage.objects FOR DELETE TO authenticated
 USING(bucket_id='avatars' AND (storage.foldername(name))[1]=(SELECT auth.uid())::text AND ((SELECT auth.uid())=owner OR (SELECT auth.uid())::text=owner_id));
DROP POLICY IF EXISTS "Authenticated users can upload to portfolio-assets" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own portfolio-assets" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own portfolio-assets" ON storage.objects;
CREATE POLICY nsso_portfolio_insert ON storage.objects FOR INSERT TO authenticated
 WITH CHECK(bucket_id='portfolio-assets' AND ((storage.foldername(name))[1]=(SELECT auth.uid())::text OR EXISTS(
   SELECT 1 FROM storage.objects existing WHERE existing.bucket_id=objects.bucket_id AND existing.name=objects.name
     AND (existing.owner=(SELECT auth.uid()) OR existing.owner_id=(SELECT auth.uid())::text))));
CREATE POLICY nsso_portfolio_update ON storage.objects FOR UPDATE TO authenticated
 USING(bucket_id='portfolio-assets' AND (owner=(SELECT auth.uid()) OR owner_id=(SELECT auth.uid())::text))
 WITH CHECK(bucket_id='portfolio-assets' AND (owner=(SELECT auth.uid()) OR owner_id=(SELECT auth.uid())::text)
   AND ((storage.foldername(name))[1]=(SELECT auth.uid())::text OR EXISTS(
     SELECT 1 FROM storage.objects existing WHERE existing.bucket_id=objects.bucket_id AND existing.name=objects.name
       AND (existing.owner=(SELECT auth.uid()) OR existing.owner_id=(SELECT auth.uid())::text))));
CREATE POLICY nsso_portfolio_delete ON storage.objects FOR DELETE TO authenticated
 USING(bucket_id='portfolio-assets' AND (owner=(SELECT auth.uid()) OR owner_id=(SELECT auth.uid())::text));
-- Limits apply to new writes; all existing objects/URLs are retained. The live
-- metadata inventory fits these limits (largest existing image: 5,252,800 bytes).
UPDATE storage.buckets SET file_size_limit=CASE WHEN id='portfolio-assets' THEN 10485760 ELSE 5242880 END,
 allowed_mime_types=ARRAY['image/jpeg','image/png','image/webp','image/gif','image/avif']
 WHERE id IN ('avatars','portfolio-assets','razinflix_posters');

-- Existing public trigger functions need no direct API execution.
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.prorettype='pg_catalog.trigger'::regtype LOOP
   EXECUTE 'REVOKE ALL ON FUNCTION '||f.signature||' FROM PUBLIC,anon,authenticated';
 END LOOP;
END $$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.ensure_current_account(),private.get_current_account(),private.update_account_settings(jsonb),private.claim_profile_username(text),private.register_referral(text),private.connect_my_nsso(uuid,text,double precision,double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION private.admin_list_accounts(uuid,integer,integer),private.admin_set_permission(uuid,uuid,text,boolean) TO service_role;
REVOKE ALL ON FUNCTION public.ensure_current_account(),public.get_current_account(),public.update_account_settings(jsonb),public.claim_profile_username(text),public.register_referral(text),public.connect_my_nsso(uuid,text,double precision,double precision),public.admin_list_accounts(uuid,integer,integer),public.admin_set_permission(uuid,uuid,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_current_account(),public.get_current_account(),public.update_account_settings(jsonb),public.claim_profile_username(text),public.register_referral(text),public.connect_my_nsso(uuid,text,double precision,double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_accounts(uuid,integer,integer),public.admin_set_permission(uuid,uuid,text,boolean) TO service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
