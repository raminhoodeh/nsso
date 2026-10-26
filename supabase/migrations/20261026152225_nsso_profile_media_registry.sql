-- Registration follows server-validated JPEG upload. It never edits Storage
-- catalog ownership or deletes uploaded bytes after an uncertain response.
BEGIN;
CREATE TABLE private.media_assets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 bucket_id text NOT NULL,
 object_name text NOT NULL,
 object_id uuid NOT NULL,
 content_type text NOT NULL CHECK(content_type='image/jpeg'),
 bytes bigint NOT NULL CHECK(bytes BETWEEN 1 AND 5242880),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(bucket_id,object_name)
);
CREATE INDEX media_assets_owner ON private.media_assets(user_id,created_at DESC);
ALTER TABLE private.media_assets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.media_assets FROM PUBLIC,anon,authenticated;
GRANT ALL ON private.media_assets TO service_role;
CREATE FUNCTION private.register_profile_media(p_actor_id uuid,p_bucket_id text,p_object_name text,p_content_type text,p_bytes bigint)
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
END $$;
CREATE FUNCTION public.register_profile_media(p_actor_id uuid,p_bucket_id text,p_object_name text,p_content_type text,p_bytes bigint)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $$ SELECT private.register_profile_media(p_actor_id,p_bucket_id,p_object_name,p_content_type,p_bytes) $$;
REVOKE ALL ON FUNCTION private.register_profile_media(uuid,text,text,text,bigint),public.register_profile_media(uuid,text,text,text,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.register_profile_media(uuid,text,text,text,bigint),public.register_profile_media(uuid,text,text,text,bigint) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
