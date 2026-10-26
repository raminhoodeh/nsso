-- Preserve supported Auth deletion without recreating child journal FKs.
-- No user is deleted by this migration. Historical applied files stay immutable.
BEGIN;
CREATE OR REPLACE FUNCTION private.ensure_account_for(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ DECLARE a auth.users%ROWTYPE; v_code text; BEGIN
 SELECT * INTO a FROM auth.users WHERE id=p_user_id FOR KEY SHARE;
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

CREATE OR REPLACE FUNCTION private.profile_lock(p_user_id uuid)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ DECLARE v bigint; BEGIN
 -- All runtime paths acquire the parent key before719/730. Auth DELETE can
 -- then finish without competing with a child journal FK insert.
 PERFORM 1 FROM auth.users WHERE id=p_user_id FOR KEY SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Account unavailable' USING ERRCODE='42501'; END IF;
 -- Account provisioning already takes719 before its profile INSERT triggers730.
 -- Every journal/status/payment/manual path must take those locks in that order.
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,719));
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,730));
 INSERT INTO private.profile_revisions(user_id) VALUES(p_user_id) ON CONFLICT DO NOTHING;
 SELECT revision INTO v FROM private.profile_revisions WHERE user_id=p_user_id FOR UPDATE; RETURN v;
END $$;

CREATE OR REPLACE FUNCTION private.lock_external_profile_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ BEGIN
 IF TG_OP='DELETE' AND auth.uid() IS NOT NULL AND NOT EXISTS(SELECT 1 FROM auth.users WHERE id=auth.uid()) THEN RETURN NULL; END IF;
 IF auth.uid() IS NOT NULL AND current_setting('nsso.journal_actor',true) IS DISTINCT FROM auth.uid()::text THEN PERFORM private.profile_lock(auth.uid()); END IF;
 RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION private.track_external_profile_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE u uuid; entity text:=CASE WHEN TG_TABLE_NAME='profiles' THEN 'profile' ELSE TG_TABLE_NAME END;
 before_row jsonb; after_row jsonb; before_patch jsonb; after_patch jsonb; item uuid; rev bigint; op uuid; effect jsonb; delta jsonb; h text; result jsonb;
BEGIN
 IF TG_OP<>'INSERT' THEN before_row:=to_jsonb(OLD)-'embedding'; END IF;
 IF TG_OP<>'DELETE' THEN after_row:=to_jsonb(NEW)-'embedding'; END IF;
 u:=coalesce((after_row->>'user_id')::uuid,(before_row->>'user_id')::uuid);
 -- Only genuine Auth-parent cascades are omitted. Ordinary owner removals keep
 -- their before-image/revision/Undo contract while their Auth parent exists.
 IF TG_OP='DELETE' AND NOT EXISTS(SELECT 1 FROM auth.users WHERE id=u) THEN RETURN NULL; END IF;
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

NOTIFY pgrst,'reload schema';
COMMIT;
