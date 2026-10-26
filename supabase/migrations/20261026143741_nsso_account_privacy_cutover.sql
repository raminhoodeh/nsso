-- Final privacy cutover after all callers use explicit public identity or /api/me.
-- Rollback means a corrected forward migration/application; do not restore the
-- former broad grants or the untrusted legacy authority model.
BEGIN;
DROP TRIGGER nsso_sync_legacy_account_settings ON public.users;
DROP FUNCTION private.sync_legacy_account_settings();
DROP POLICY nsso_legacy_users_insert ON public.users;
DROP POLICY nsso_legacy_users_update ON public.users;
REVOKE ALL ON public.users FROM PUBLIC,anon,authenticated;
-- Revoke existing per-column grants as well: removing a table grant alone does
-- not remove the temporary column grants from the compatibility phase.
REVOKE ALL(id,email,auth_provider,username,user_type,is_premium,created_at,referral_code,paypal_me_slug,referred_by_code,deity_fast_mode)
 ON public.users FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.ensure_account_for(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
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

CREATE OR REPLACE FUNCTION private.update_account_settings(p_patch jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ BEGIN
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
END $$;

DROP FUNCTION public.generate_referral_code();
ALTER TABLE public.users
 DROP COLUMN email,DROP COLUMN auth_provider,DROP COLUMN user_type,
 DROP COLUMN referral_code,DROP COLUMN paypal_me_slug,DROP COLUMN referred_by_code,DROP COLUMN deity_fast_mode;
GRANT SELECT(id,username,is_premium,created_at) ON public.users TO anon,authenticated;
REVOKE ALL ON public.profiles FROM PUBLIC,anon,authenticated;
REVOKE ALL(user_id,full_name,headline,bio,profile_pic_url,embedding) ON public.profiles FROM PUBLIC,anon,authenticated;
GRANT SELECT(user_id,full_name,headline,bio,profile_pic_url) ON public.profiles TO anon,authenticated;
GRANT INSERT(user_id,full_name,headline,bio,profile_pic_url),UPDATE(full_name,headline,bio,profile_pic_url) ON public.profiles TO authenticated;
COMMENT ON TABLE public.users IS 'Public identity only. Account preferences, contact email and historical referral metadata live in private.account_settings; authority lives in private.app_permissions.';
NOTIFY pgrst,'reload schema';
COMMIT;
