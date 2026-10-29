-- Optional second destination shares the existing purchase-link visibility toggle.
-- NULL preserves existing products; no customer content or historical receipts change.
BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE public.products ADD COLUMN secondary_purchase_link text;
GRANT SELECT(secondary_purchase_link) ON public.products TO anon,authenticated;

CREATE OR REPLACE FUNCTION private.profile_fields(entity text)
RETURNS text[] LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=''
AS $$ SELECT CASE entity
 WHEN 'profile' THEN ARRAY['full_name','headline','bio','profile_pic_url']
 WHEN 'links' THEN ARRAY['link_name','link_url']
 WHEN 'contacts' THEN ARRAY['method','value','custom_method_name']
 WHEN 'experiences' THEN ARRAY['company_name','job_title','start_year','end_year','description']
 WHEN 'qualifications' THEN ARRAY['institution','qualification_name','start_year','end_year']
 WHEN 'projects' THEN ARRAY['project_name','contribution','description','project_photo_url','project_url']
 WHEN 'products' THEN ARRAY['name','price','image_url','description','purchase_link','secondary_purchase_link','purchase_link_active','paypal_active','sales_page_active','sales_page_published','headline','tagline','intro_text','value_proposition','video_url','benefits','testimonials'] END $$;

CREATE OR REPLACE FUNCTION private.validate_profile_values(entity text,p jsonb,is_add boolean)
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
 WHEN 'products' THEN ARRAY['price','image_url','description','purchase_link','secondary_purchase_link','headline','tagline','intro_text','value_proposition','video_url'] ELSE '{}'::text[] END;
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
    WHEN k IN ('profile_pic_url','link_url','project_photo_url','project_url','image_url','purchase_link','secondary_purchase_link','video_url') THEN 4096
    WHEN k='headline' THEN 120 WHEN k='tagline' THEN 500 WHEN k='price' THEN 200 WHEN k='value' THEN 2000 WHEN k='custom_method_name' THEN 100 ELSE 300 END;
   IF length(s)>lim THEN RAISE EXCEPTION 'Profile text is too long' USING ERRCODE='22023'; END IF;
   IF k IN ('profile_pic_url','link_url','project_photo_url','project_url','image_url','purchase_link','secondary_purchase_link','video_url') AND NOT private.profile_web_url(s) THEN RAISE EXCEPTION 'Invalid web URL' USING ERRCODE='22023'; END IF;
   IF k='method' AND NOT(s=ANY(ARRAY['Email','Phone','WhatsApp','Telegram','Signal','WeChat','Line','Discord','X','Instagram','LinkedIn','YouTube','TikTok','Twitch','Facebook','Snapchat','Pinterest','Reddit','GitHub','GitLab','Medium','Substack','Patreon','Ko-fi','Buy Me a Coffee','PayPal','Cash App','Venmo','Zelle','Location','Other'])) THEN RAISE EXCEPTION 'Invalid contact method' USING ERRCODE='22023'; END IF;
  END IF;
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION private.product_details(p_product_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$ DECLARE p public.products%ROWTYPE; v_owner boolean; result jsonb; BEGIN
 SELECT * INTO p FROM public.products WHERE id=p_product_id;
 IF NOT FOUND THEN RETURN NULL; END IF;
 v_owner:=auth.uid() IS NOT NULL AND auth.uid()=p.user_id;
 IF NOT v_owner AND p.sales_page_published IS FALSE THEN RETURN NULL; END IF;
 -- Enumerate the public contract so future internal columns cannot leak by default.
 result:=jsonb_build_object('id',p.id,'user_id',p.user_id,'name',p.name,'price',p.price,'image_url',p.image_url,
   'description',p.description,'purchase_link',p.purchase_link,'secondary_purchase_link',p.secondary_purchase_link,'purchase_link_active',p.purchase_link_active,
   'paypal_active',p.paypal_active,'created_at',p.created_at,'sales_page_active',p.sales_page_active,
   'sales_page_published',p.sales_page_published,'payment_config',p.payment_config,'headline',p.headline,
   'tagline',p.tagline,'intro_text',p.intro_text,'value_proposition',p.value_proposition,'video_url',p.video_url,
   'benefits',p.benefits,'testimonials',p.testimonials);
 IF v_owner THEN result:=result||jsonb_build_object('paypal_html',p.paypal_html,'success_url',p.success_url,'display_order',p.display_order); END IF;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION private.undo_profile_operation(p_operation_id uuid,p_original_operation_id uuid,p_expected_revision bigint)
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
     -- A receipt from before the nullable column existed represents an absent
     -- second destination. Do not rewrite receipts or treat a later URL as absent.
     row_new:=e->'after';
     IF entity='products' AND NOT (row_new ? 'secondary_purchase_link') THEN
      row_new:=row_new||jsonb_build_object('secondary_purchase_link',NULL);
     END IF;
     IF row_now IS DISTINCT FROM row_new THEN RAISE EXCEPTION 'Undo target changed' USING ERRCODE='P0001'; END IF;
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
-- CREATE OR REPLACE retains helper/Undo ACLs and the existing public RPC boundary.
-- No direct browser INSERT/UPDATE privilege or private product field is added.
NOTIFY pgrst,'reload schema';
COMMIT;
