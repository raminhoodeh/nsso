-- Self-service deletion fences profile writes and in-flight media before bytes
-- are removed through the supported Storage API and Auth's hard-delete API.
-- This migration deletes no customer data and never edits Storage catalog rows.
BEGIN;
CREATE TABLE private.profile_deletion_receipts (
 operation_id uuid PRIMARY KEY,
 actor_hash text NOT NULL CHECK(actor_hash ~ '^[a-f0-9]{64}$'),
 completed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE private.profile_deletions (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 operation_id uuid NOT NULL UNIQUE REFERENCES private.profile_deletion_receipts(operation_id),
 actor_hash text NOT NULL CHECK(actor_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE private.profile_media_uploads (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 bucket_id text NOT NULL CHECK(bucket_id IN ('avatars','portfolio-assets')),
 object_name text NOT NULL,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '120 seconds',
 UNIQUE(bucket_id,object_name)
);
CREATE INDEX profile_deletion_receipts_actor ON private.profile_deletion_receipts(actor_hash);
CREATE INDEX profile_deletions_actor_hash ON private.profile_deletions(actor_hash);
CREATE INDEX profile_media_uploads_actor ON private.profile_media_uploads(user_id,expires_at);
ALTER TABLE private.profile_deletion_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.profile_deletions ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.profile_media_uploads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.profile_deletion_receipts,private.profile_deletions,private.profile_media_uploads FROM PUBLIC,anon,authenticated;
GRANT ALL ON private.profile_deletion_receipts,private.profile_deletions,private.profile_media_uploads TO service_role;

CREATE OR REPLACE FUNCTION private.ensure_account_for(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ DECLARE a auth.users%ROWTYPE; v_code text; BEGIN
 SELECT * INTO a FROM auth.users WHERE id=p_user_id FOR KEY SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Account identity missing' USING ERRCODE='23503'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,719));
 IF EXISTS(SELECT 1 FROM private.profile_deletions WHERE user_id=p_user_id) THEN RAISE EXCEPTION 'Account deletion in progress' USING ERRCODE='42501'; END IF;
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
 PERFORM 1 FROM auth.users WHERE id=p_user_id FOR KEY SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Account unavailable' USING ERRCODE='42501'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,719));
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,730));
 IF EXISTS(SELECT 1 FROM private.profile_deletions WHERE user_id=p_user_id) THEN RAISE EXCEPTION 'Account deletion in progress' USING ERRCODE='42501'; END IF;
 INSERT INTO private.profile_revisions(user_id) VALUES(p_user_id) ON CONFLICT DO NOTHING;
 SELECT revision INTO v FROM private.profile_revisions WHERE user_id=p_user_id FOR UPDATE; RETURN v;
END $$;

CREATE FUNCTION private.reserve_profile_media(p_actor_id uuid,p_bucket_id text,p_object_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ DECLARE lease private.profile_media_uploads%ROWTYPE; kind text; BEGIN
 IF p_actor_id IS NULL OR p_bucket_id IS NULL OR p_object_name IS NULL OR length(p_object_name)>200
 OR p_object_name !~ ('^'||p_actor_id::text||'/(avatar|project|product)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]jpg$') THEN
 RAISE EXCEPTION 'Invalid media reservation' USING ERRCODE='22023'; END IF;
 kind:=split_part(p_object_name,'/',2);
 IF (kind='avatar' AND p_bucket_id<>'avatars') OR (kind<>'avatar' AND p_bucket_id<>'portfolio-assets') THEN RAISE EXCEPTION 'Invalid media bucket' USING ERRCODE='22023'; END IF;
 PERFORM private.profile_lock(p_actor_id);
 INSERT INTO private.profile_media_uploads(user_id,bucket_id,object_name) VALUES(p_actor_id,p_bucket_id,p_object_name)
 ON CONFLICT(bucket_id,object_name) DO NOTHING;
 SELECT * INTO lease FROM private.profile_media_uploads WHERE bucket_id=p_bucket_id AND object_name=p_object_name;
 IF lease.user_id<>p_actor_id THEN RAISE EXCEPTION 'Media actor unavailable' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('accountId',p_actor_id,'bucket',p_bucket_id,'objectName',p_object_name,'leaseId',lease.id);
END $$;
CREATE FUNCTION public.reserve_profile_media(p_actor_id uuid,p_bucket_id text,p_object_name text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $$ SELECT private.reserve_profile_media(p_actor_id,p_bucket_id,p_object_name) $$;

CREATE FUNCTION private.finish_profile_media_upload(p_actor_id uuid,p_bucket_id text,p_object_name text,p_definite boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ BEGIN
 -- An uncertain Storage/registration response keeps the reservation until its
 -- safety window passes. A later deletion inventories the exact actor namespace.
 IF p_definite IS TRUE THEN DELETE FROM private.profile_media_uploads WHERE user_id=p_actor_id AND bucket_id=p_bucket_id AND object_name=p_object_name; END IF;
 RETURN jsonb_build_object('finished',p_definite IS TRUE);
END $$;
CREATE FUNCTION public.finish_profile_media_upload(p_actor_id uuid,p_bucket_id text,p_object_name text,p_definite boolean)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $$ SELECT private.finish_profile_media_upload(p_actor_id,p_bucket_id,p_object_name,p_definite) $$;

CREATE OR REPLACE FUNCTION private.register_profile_media(p_actor_id uuid,p_bucket_id text,p_object_name text,p_content_type text,p_bytes bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE kind text; stored storage.objects%ROWTYPE; asset private.media_assets%ROWTYPE;
BEGIN
 IF p_actor_id IS NULL OR p_bucket_id IS NULL OR p_object_name IS NULL OR p_content_type IS DISTINCT FROM 'image/jpeg'
 OR p_bytes IS NULL OR p_bytes NOT BETWEEN 1 AND 5242880 OR length(p_object_name)>200
 OR p_object_name !~ ('^'||p_actor_id::text||'/(avatar|project|product)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]jpg$') THEN
 RAISE EXCEPTION 'Invalid media registration' USING ERRCODE='22023'; END IF;
 kind:=split_part(p_object_name,'/',2);
 IF (kind='avatar' AND p_bucket_id<>'avatars') OR (kind<>'avatar' AND p_bucket_id<>'portfolio-assets') THEN RAISE EXCEPTION 'Invalid media bucket' USING ERRCODE='22023'; END IF;
 PERFORM private.profile_lock(p_actor_id);
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
END $$;

CREATE FUNCTION private.prepare_profile_deletion(p_actor_id uuid,p_operation_id uuid,p_actor_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE fence private.profile_deletions%ROWTYPE; blocked bigint; assets jsonb; wait_seconds integer; receipt private.profile_deletion_receipts%ROWTYPE;
BEGIN
 IF p_actor_id IS NULL OR p_operation_id IS NULL OR p_actor_hash IS NULL OR p_actor_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid deletion request' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM auth.users WHERE id=p_actor_id FOR KEY SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Account unavailable' USING ERRCODE='42501'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_actor_id::text,719));
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_actor_id::text,730));
 -- Share the permission-management lock and exclude admins already fenced.
 -- Two simultaneous self-deletions cannot both count the other as available.
 PERFORM pg_catalog.pg_advisory_xact_lock(719,721);
 IF EXISTS(SELECT 1 FROM private.app_permissions WHERE user_id=p_actor_id AND permission='nsso:admin')
 AND NOT EXISTS(SELECT 1 FROM private.app_permissions p JOIN auth.users a ON a.id=p.user_id
 WHERE p.permission='nsso:admin' AND p.user_id<>p_actor_id AND a.email_confirmed_at IS NOT NULL
 AND lower(a.email) IN ('raminhoodeh@gmail.com','troy@nsso.me')
 AND NOT EXISTS(SELECT 1 FROM private.profile_deletions d WHERE d.user_id=p.user_id)) THEN
 RETURN jsonb_build_object('accountId',p_actor_id,'operationId',p_operation_id,'status','blocked','reason','LAST_ADMIN','assets','[]'::jsonb,'blockedCount',0); END IF;
 -- Never delete shared app assets, even when a historical Storage owner is the
 -- requesting account. Contradictory ownership is also a support-only blocker.
 SELECT count(*) INTO blocked FROM storage.objects s
 WHERE (s.owner=p_actor_id OR s.owner_id=p_actor_id::text
 OR (s.bucket_id IN ('avatars','portfolio-assets') AND split_part(s.name,'/',1)=p_actor_id::text)
 OR EXISTS(SELECT 1 FROM private.media_assets m WHERE m.user_id=p_actor_id AND m.bucket_id=s.bucket_id AND m.object_name=s.name AND m.object_id=s.id))
 AND (s.bucket_id NOT IN ('avatars','portfolio-assets')
 OR (split_part(s.name,'/',1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' AND split_part(s.name,'/',1)<>p_actor_id::text)
 OR (s.owner IS NOT NULL AND s.owner<>p_actor_id)
 OR coalesce(s.owner_id,'') NOT IN ('',p_actor_id::text));
 IF blocked>0 THEN RETURN jsonb_build_object('accountId',p_actor_id,'operationId',p_operation_id,'status','blocked','reason','SHARED_MEDIA','assets','[]'::jsonb,'blockedCount',blocked); END IF;
 SELECT * INTO receipt FROM private.profile_deletion_receipts WHERE operation_id=p_operation_id;
 IF FOUND AND receipt.actor_hash<>p_actor_hash THEN RAISE EXCEPTION 'Deletion identifier already used' USING ERRCODE='23505'; END IF;
 INSERT INTO private.profile_deletion_receipts(operation_id,actor_hash) VALUES(p_operation_id,p_actor_hash) ON CONFLICT(operation_id) DO NOTHING;
 SELECT * INTO fence FROM private.profile_deletions WHERE user_id=p_actor_id;
 IF FOUND THEN
 IF fence.actor_hash<>p_actor_hash THEN RAISE EXCEPTION 'Deletion actor mismatch' USING ERRCODE='42501'; END IF;
 ELSE
 INSERT INTO private.profile_deletions(user_id,operation_id,actor_hash) VALUES(p_actor_id,p_operation_id,p_actor_hash) RETURNING * INTO fence;
 END IF;
 SELECT CASE WHEN count(*)>0 THEN greatest(1,ceil(extract(epoch FROM max(expires_at)-clock_timestamp()))::integer) ELSE NULL END INTO wait_seconds
 FROM private.profile_media_uploads WHERE user_id=p_actor_id AND expires_at>clock_timestamp();
 IF wait_seconds IS NOT NULL THEN RETURN jsonb_build_object('accountId',p_actor_id,'operationId',p_operation_id,'status','busy','assets','[]'::jsonb,'retryAfterSeconds',wait_seconds); END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('bucket',item.bucket_id,'objectName',item.name) ORDER BY item.bucket_id,item.name),'[]'::jsonb) INTO assets
 FROM (SELECT s.bucket_id,s.name FROM storage.objects s
 WHERE s.bucket_id IN ('avatars','portfolio-assets')
 AND (s.owner IS NULL OR s.owner=p_actor_id) AND coalesce(s.owner_id,'') IN ('',p_actor_id::text)
 AND (s.owner=p_actor_id OR s.owner_id=p_actor_id::text OR split_part(s.name,'/',1)=p_actor_id::text
 OR EXISTS(SELECT 1 FROM private.media_assets m WHERE m.user_id=p_actor_id AND m.bucket_id=s.bucket_id AND m.object_name=s.name AND m.object_id=s.id))
 ORDER BY s.bucket_id,s.name LIMIT 200) item;
 RETURN jsonb_build_object('accountId',p_actor_id,'operationId',p_operation_id,'status','ready','assets',assets);
END $$;
CREATE FUNCTION public.prepare_profile_deletion(p_actor_id uuid,p_operation_id uuid,p_actor_hash text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $$ SELECT private.prepare_profile_deletion(p_actor_id,p_operation_id,p_actor_hash) $$;

CREATE FUNCTION private.get_profile_deletion_receipt(p_operation_id uuid,p_actor_hash text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=''
AS $$ SELECT jsonb_build_object('found',EXISTS(SELECT 1 FROM private.profile_deletion_receipts WHERE operation_id=p_operation_id AND actor_hash=p_actor_hash),
 'completed',EXISTS(SELECT 1 FROM private.profile_deletion_receipts WHERE operation_id=p_operation_id AND actor_hash=p_actor_hash AND completed_at IS NOT NULL)) $$;
CREATE FUNCTION public.get_profile_deletion_receipt(p_operation_id uuid,p_actor_hash text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $$ SELECT private.get_profile_deletion_receipt(p_operation_id,p_actor_hash) $$;
CREATE FUNCTION private.complete_profile_deletion(p_operation_id uuid,p_actor_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ BEGIN
 -- The guarded server verifies Auth absence before calling this service-only
 -- technical receipt endpoint. No identity, email or profile payload is kept.
 IF NOT EXISTS(SELECT 1 FROM private.profile_deletion_receipts WHERE operation_id=p_operation_id AND actor_hash=p_actor_hash) THEN RAISE EXCEPTION 'Deletion receipt unavailable' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM private.profile_deletions WHERE actor_hash=p_actor_hash) THEN RAISE EXCEPTION 'Deletion identity still exists' USING ERRCODE='42501'; END IF;
 UPDATE private.profile_deletion_receipts SET completed_at=coalesce(completed_at,now()) WHERE actor_hash=p_actor_hash;
 RETURN jsonb_build_object('completed',true);
END $$;
CREATE FUNCTION public.complete_profile_deletion(p_operation_id uuid,p_actor_hash text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $$ SELECT private.complete_profile_deletion(p_operation_id,p_actor_hash) $$;

CREATE FUNCTION private.cleanup_deleted_profile_legacy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ BEGIN
 DELETE FROM public.user_links WHERE user_id=OLD.id::text;
 DELETE FROM public.user_contacts WHERE profile_id=OLD.id;
 UPDATE private.permission_audit SET actor_id=NULL WHERE actor_id=OLD.id;
 UPDATE private.permission_audit SET target_user_id='00000000-0000-0000-0000-000000000000'::uuid WHERE target_user_id=OLD.id;
 RETURN OLD;
END $$;
CREATE TRIGGER nsso_cleanup_deleted_profile_legacy AFTER DELETE ON auth.users FOR EACH ROW EXECUTE FUNCTION private.cleanup_deleted_profile_legacy();

CREATE OR REPLACE FUNCTION private.admin_set_permission(p_actor_id uuid,p_user_id uuid,p_permission text,p_granted boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ BEGIN
 PERFORM pg_catalog.pg_advisory_xact_lock(719,721);
 IF NOT EXISTS(SELECT 1 FROM private.app_permissions WHERE user_id=p_actor_id AND permission='nsso:admin') THEN
 RAISE EXCEPTION 'Administrator permission required' USING ERRCODE='42501'; END IF;
 IF p_permission NOT IN ('nsso:admin','razinflix:manage') OR p_granted IS NULL THEN RAISE EXCEPTION 'Invalid permission' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user_id) THEN RAISE EXCEPTION 'Account not found' USING ERRCODE='23503'; END IF;
 IF p_permission='nsso:admin' AND p_granted AND EXISTS(SELECT 1 FROM private.profile_deletions WHERE user_id=p_user_id) THEN
 RAISE EXCEPTION 'Cannot grant administrator access to a deleting account' USING ERRCODE='23514'; END IF;
 IF NOT p_granted AND p_permission='nsso:admin' AND EXISTS(SELECT 1 FROM private.app_permissions WHERE user_id=p_user_id AND permission=p_permission)
 AND NOT EXISTS(SELECT 1 FROM private.app_permissions p JOIN auth.users a ON a.id=p.user_id
 WHERE p.permission='nsso:admin' AND p.user_id<>p_user_id AND a.email_confirmed_at IS NOT NULL
 AND lower(a.email) IN ('raminhoodeh@gmail.com','troy@nsso.me')
 AND NOT EXISTS(SELECT 1 FROM private.profile_deletions d WHERE d.user_id=p.user_id)) THEN
 RAISE EXCEPTION 'Cannot remove the last administrator' USING ERRCODE='23514'; END IF;
 IF p_granted THEN INSERT INTO private.app_permissions(user_id,permission,granted_by) VALUES(p_user_id,p_permission,p_actor_id) ON CONFLICT DO NOTHING;
 ELSE DELETE FROM private.app_permissions WHERE user_id=p_user_id AND permission=p_permission; END IF;
 INSERT INTO private.permission_audit(actor_id,target_user_id,permission,granted) VALUES(p_actor_id,p_user_id,p_permission,p_granted);
 RETURN jsonb_build_object('success',true);
END $$;
-- These obsolete tables are no longer used by NSSO. A still-valid JWT must not
-- recreate their FK-less data after its Auth identity has been deleted.
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.user_links,public.user_contacts FROM PUBLIC,anon,authenticated;

DO $$ DECLARE signature text; BEGIN
 FOREACH signature IN ARRAY ARRAY[
 'reserve_profile_media(uuid,text,text)','finish_profile_media_upload(uuid,text,text,boolean)',
 'prepare_profile_deletion(uuid,uuid,text)','get_profile_deletion_receipt(uuid,text)','complete_profile_deletion(uuid,text)'
 ] LOOP
 EXECUTE 'REVOKE ALL ON FUNCTION private.'||signature||',public.'||signature||' FROM PUBLIC,anon,authenticated';
 EXECUTE 'GRANT EXECUTE ON FUNCTION private.'||signature||',public.'||signature||' TO service_role';
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION private.cleanup_deleted_profile_legacy() FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
