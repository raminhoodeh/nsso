-- Additive journal contract. Deploy all manual/model writers against these RPCs
-- before the separate direct-write grant cutover. No production data is reset.
BEGIN;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS display_order integer DEFAULT 0;
ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS contacts_method_check;
ALTER TABLE public.contacts ADD CONSTRAINT contacts_method_check CHECK(method=ANY(ARRAY[
 'Email','Phone','WhatsApp','Telegram','Signal','WeChat','Line','Discord','X','Instagram','LinkedIn','YouTube','TikTok','Twitch','Facebook','Snapchat','Pinterest','Reddit','GitHub','GitLab','Medium','Substack','Patreon','Ko-fi','Buy Me a Coffee','PayPal','Cash App','Venmo','Zelle','Location','Other']));
CREATE TABLE private.profile_revisions (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 revision bigint NOT NULL DEFAULT 0 CHECK(revision BETWEEN 0 AND 9007199254740991)
);
CREATE TABLE private.profile_operations (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 operation_id uuid NOT NULL,
 request_hash text NOT NULL,
 operation_kind text NOT NULL CHECK(operation_kind IN ('apply','undo','payment','external')),
 status text NOT NULL CHECK(status IN ('applied','conflict','rejected')),
 expected_revision bigint,
 revision bigint NOT NULL,
 original_operation_id uuid,
 undone_by uuid,
 effects jsonb NOT NULL DEFAULT '[]',
 result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,operation_id)
);
CREATE INDEX profile_operations_owner_created ON private.profile_operations(user_id,created_at DESC);
ALTER TABLE private.profile_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.profile_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.profile_revisions,private.profile_operations FROM PUBLIC,anon,authenticated;
GRANT ALL ON private.profile_revisions,private.profile_operations TO service_role;

CREATE FUNCTION private.profile_keys(p jsonb,allowed text[],required text[] DEFAULT '{}')
RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=''
AS $$ SELECT CASE WHEN jsonb_typeof(p)='object' THEN
 NOT EXISTS(SELECT 1 FROM jsonb_object_keys(p) k WHERE NOT(k=ANY(allowed))) AND p ?& required ELSE false END $$;
CREATE FUNCTION private.profile_web_url(v text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=''
AS $$ DECLARE authority text; pieces text[]; port text; BEGIN
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
END $$;
CREATE FUNCTION private.profile_fields(entity text)
RETURNS text[] LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=''
AS $$ SELECT CASE entity
 WHEN 'profile' THEN ARRAY['full_name','headline','bio','profile_pic_url']
 WHEN 'links' THEN ARRAY['link_name','link_url']
 WHEN 'contacts' THEN ARRAY['method','value','custom_method_name']
 WHEN 'experiences' THEN ARRAY['company_name','job_title','start_year','end_year','description']
 WHEN 'qualifications' THEN ARRAY['institution','qualification_name','start_year','end_year']
 WHEN 'projects' THEN ARRAY['project_name','contribution','description','project_photo_url','project_url']
 WHEN 'products' THEN ARRAY['name','price','image_url','description','purchase_link','purchase_link_active','paypal_active','sales_page_active','sales_page_published','headline','tagline','intro_text','value_proposition','video_url','benefits','testimonials'] END $$;
CREATE FUNCTION private.validate_profile_values(entity text,p jsonb,is_add boolean)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $$
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
END $$;

CREATE FUNCTION private.profile_lock(p_user_id uuid)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ DECLARE v bigint; BEGIN
 -- Account provisioning already takes719 before its profile INSERT triggers730.
 -- Every journal/status/payment/manual path must take those locks in that order.
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,719));
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,730));
 INSERT INTO private.profile_revisions(user_id) VALUES(p_user_id) ON CONFLICT DO NOTHING;
 SELECT revision INTO v FROM private.profile_revisions WHERE user_id=p_user_id FOR UPDATE; RETURN v;
END $$;
CREATE FUNCTION private.profile_pick(p jsonb,keys text[])
RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=''
AS $$ SELECT coalesce(jsonb_object_agg(k,p->k),'{}'::jsonb) FROM unnest(keys) k $$;
CREATE FUNCTION private.profile_operation_quota(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT count(*) FILTER(WHERE created_at>=now()-interval '1 minute')<240 AND count(*)<6000
 FROM private.profile_operations WHERE user_id=p_user_id AND created_at>=now()-interval '1 day' $$;
CREATE FUNCTION private.profile_row(entity text,p_user_id uuid,p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ DECLARE r jsonb; tbl text; BEGIN
 IF entity='profile' THEN
  SELECT jsonb_build_object('user_id',user_id,'full_name',full_name,'headline',headline,'bio',bio,'profile_pic_url',profile_pic_url) INTO r FROM public.profiles WHERE user_id=p_user_id FOR UPDATE;
 ELSE
  IF private.profile_fields(entity) IS NULL THEN RAISE EXCEPTION 'Invalid entity' USING ERRCODE='22023'; END IF;
  EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1 AND user_id=$2 FOR UPDATE',entity) INTO r USING p_id,p_user_id;
 END IF; RETURN r;
END $$;
CREATE FUNCTION private.profile_write(entity text,p_user_id uuid,p_id uuid,values_json jsonb,is_insert boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ DECLARE cols text; assignments text; r jsonb; tbl text:=CASE WHEN entity='profile' THEN 'profiles' ELSE entity END;
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
END $$;
CREATE FUNCTION private.profile_delta(entity text,p_id uuid,p_row jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=''
AS $$ SELECT jsonb_build_object('entity',entity,'id',p_id,'row',p_row) $$;

CREATE FUNCTION private.apply_profile_change(p_user_id uuid,c jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
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
END $$;

CREATE FUNCTION private.profile_snapshot()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ DECLARE u uuid:=auth.uid(); rev bigint; result jsonb; entity text; rows jsonb; ordering text; BEGIN
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
END $$;
CREATE FUNCTION private.profile_operation_status(p_operation_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ DECLARE u uuid:=auth.uid(); r jsonb; rev bigint; BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 rev:=private.profile_lock(u); SELECT result INTO r FROM private.profile_operations WHERE user_id=u AND operation_id=p_operation_id;
 RETURN coalesce(r,jsonb_build_object('status','not_found','operationId',p_operation_id,'revision',rev));
END $$;
CREATE FUNCTION private.apply_profile_operation(p_operation jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
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
END $$;

CREATE FUNCTION private.undo_profile_operation(p_operation_id uuid,p_original_operation_id uuid,p_expected_revision bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
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
END $$;

-- Legacy/manual writes still participate during the staged source deployment.
-- Authenticated statement locks are acquired before row locks to avoid inversions.
CREATE FUNCTION private.lock_external_profile_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ BEGIN
 IF auth.uid() IS NOT NULL AND current_setting('nsso.journal_actor',true) IS DISTINCT FROM auth.uid()::text THEN PERFORM private.profile_lock(auth.uid()); END IF;
 RETURN NULL;
END $$;
CREATE FUNCTION private.track_external_profile_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
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
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['profiles','links','contacts','experiences','qualifications','projects','products'] LOOP
  EXECUTE format('CREATE TRIGGER nsso_profile_statement_lock BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION private.lock_external_profile_write()',t);
  EXECUTE format('CREATE TRIGGER nsso_profile_external_journal AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.track_external_profile_write()',t);
 END LOOP;
END $$;

CREATE FUNCTION private.save_product_payment_operation(p_user_id uuid,p_product_id uuid,p_operation_id uuid,p_expected_revision bigint,p_html text,p_config jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ DECLARE rev bigint; h text; previous private.profile_operations%ROWTYPE; before_row jsonb; after_row jsonb; result jsonb; state text:='applied'; code text; old_marker text; effects jsonb:='[]'; deltas jsonb:='[]'; BEGIN
 IF p_user_id IS NULL OR p_product_id IS NULL OR p_operation_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision NOT BETWEEN 0 AND 9007199254740991 OR p_html IS NULL OR length(p_html)>32768 OR private.valid_paypal_config(p_config) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Invalid payment operation' USING ERRCODE='22023'; END IF;
 h:=encode(sha256(convert_to(jsonb_build_object('kind','payment','id',p_product_id,'expectedRevision',p_expected_revision,'html',p_html,'config',p_config)::text,'UTF8')),'hex'); rev:=private.profile_lock(p_user_id);
 SELECT * INTO previous FROM private.profile_operations WHERE user_id=p_user_id AND operation_id=p_operation_id;
 IF FOUND THEN
  IF previous.request_hash=h THEN RETURN previous.result; END IF;
  RETURN jsonb_build_object('status','conflict','operationId',p_operation_id,'revision',rev,'changes','[]'::jsonb,'code','OPERATION_ID_REUSED');
 END IF;
 IF NOT private.profile_operation_quota(p_user_id) THEN RETURN jsonb_build_object('status','rejected','operationId',p_operation_id,'revision',rev,'changes','[]'::jsonb,'code','RATE_LIMITED'); END IF;
 before_row:=private.profile_row('products',p_user_id,p_product_id);
 IF before_row IS NULL THEN state:='rejected'; code:='ITEM_UNAVAILABLE';
 ELSIF rev<>p_expected_revision THEN state:='conflict'; code:='REVISION_CONFLICT';
 ELSE
  old_marker:=current_setting('nsso.journal_actor',true); PERFORM set_config('nsso.journal_actor',p_user_id::text,true);
  UPDATE public.products SET paypal_html=p_html,payment_config=p_config WHERE id=p_product_id AND user_id=p_user_id RETURNING to_jsonb(products) INTO after_row;
  PERFORM set_config('nsso.journal_actor',coalesce(old_marker,''),true);
  effects:=jsonb_build_array(jsonb_build_object('kind','patch','entity','products','id',p_product_id,'before',private.profile_pick(before_row,ARRAY['paypal_html','payment_config']),'after',private.profile_pick(after_row,ARRAY['paypal_html','payment_config'])));
  deltas:=jsonb_build_array(private.profile_delta('products',p_product_id,private.profile_pick(after_row,ARRAY['paypal_html','payment_config'])||jsonb_build_object('id',p_product_id,'user_id',p_user_id)));
  rev:=rev+1; UPDATE private.profile_revisions SET revision=rev WHERE user_id=p_user_id;
 END IF;
 result:=jsonb_build_object('status',state,'operationId',p_operation_id,'revision',rev,'changes',deltas);
 IF code IS NOT NULL THEN result:=result||jsonb_build_object('code',code); END IF;
 INSERT INTO private.profile_operations(user_id,operation_id,request_hash,operation_kind,status,expected_revision,revision,effects,result)
 VALUES(p_user_id,p_operation_id,h,'payment',state,p_expected_revision,rev,effects,result); RETURN result;
END $$;

CREATE FUNCTION public.get_profile_snapshot() RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.profile_snapshot() $$;
CREATE FUNCTION public.get_profile_operation(p_operation_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.profile_operation_status(p_operation_id) $$;
CREATE FUNCTION public.apply_profile_operation(p_operation jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.apply_profile_operation(p_operation) $$;
CREATE FUNCTION public.undo_profile_operation(p_operation_id uuid,p_original_operation_id uuid,p_expected_revision bigint) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.undo_profile_operation(p_operation_id,p_original_operation_id,p_expected_revision) $$;
CREATE FUNCTION public.save_product_payment_operation(p_user_id uuid,p_product_id uuid,p_operation_id uuid,p_expected_revision bigint,p_html text,p_config jsonb)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.save_product_payment_operation(p_user_id,p_product_id,p_operation_id,p_expected_revision,p_html,p_config) $$;
-- Revoke only this migration's helpers; existing anonymous product DTO grants
-- must remain intact. Do not rely on inherited/default function privileges.
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname=ANY(ARRAY[
 'profile_keys','profile_web_url','profile_fields','validate_profile_values','profile_lock','profile_pick','profile_operation_quota','profile_row','profile_write','profile_delta','apply_profile_change','profile_snapshot','profile_operation_status','apply_profile_operation','undo_profile_operation','lock_external_profile_write','track_external_profile_write','save_product_payment_operation']) LOOP
  EXECUTE 'REVOKE ALL ON FUNCTION '||f.signature||' FROM PUBLIC,anon,authenticated';
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.get_profile_snapshot(),public.get_profile_operation(uuid),public.apply_profile_operation(jsonb),public.undo_profile_operation(uuid,uuid,bigint),public.save_product_payment_operation(uuid,uuid,uuid,bigint,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.profile_snapshot(),private.profile_operation_status(uuid),private.apply_profile_operation(jsonb),private.undo_profile_operation(uuid,uuid,bigint),public.get_profile_snapshot(),public.get_profile_operation(uuid),public.apply_profile_operation(jsonb),public.undo_profile_operation(uuid,uuid,bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION private.save_product_payment_operation(uuid,uuid,uuid,bigint,text,jsonb),public.save_product_payment_operation(uuid,uuid,uuid,bigint,text,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
