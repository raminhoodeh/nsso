-- Atomic top/bottom creation for every profile-editor collection.
-- Existing offerings keep their relative order; no customer rows are rewritten.
BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE public.products ADD COLUMN display_order integer NOT NULL DEFAULT 0;
GRANT SELECT(display_order) ON public.products TO anon,authenticated;

-- Preserve legacy NULLS LAST order before making ranks total. Only missing
-- ranks change; names, URLs and authored content are never rewritten.
DO $ranks$
DECLARE entity text; ordering text;
BEGIN
 FOREACH entity IN ARRAY ARRAY['links','contacts','experiences','qualifications','projects'] LOOP
  ordering:=CASE entity WHEN 'experiences' THEN 'display_order ASC NULLS LAST,start_year DESC NULLS FIRST,created_at,id'
   WHEN 'qualifications' THEN 'display_order ASC NULLS LAST,end_year DESC NULLS FIRST,created_at,id'
   WHEN 'projects' THEN 'display_order ASC NULLS LAST,created_at DESC,id' ELSE 'display_order ASC NULLS LAST,created_at,id' END;
  EXECUTE format('WITH ranked AS (SELECT id,coalesce(max(display_order) OVER (PARTITION BY user_id),-1)+row_number() OVER (PARTITION BY user_id ORDER BY %s) AS rank FROM public.%I) UPDATE public.%I t SET display_order=ranked.rank FROM ranked WHERE t.id=ranked.id AND t.display_order IS NULL',ordering,entity,entity);
  EXECUTE format('ALTER TABLE public.%I ALTER COLUMN display_order SET NOT NULL',entity);
 END LOOP;
END $ranks$;

CREATE OR REPLACE FUNCTION private.apply_profile_change(p_user_id uuid,c jsonb)
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
   IF NOT private.profile_keys(c,ARRAY['kind','values','position'],ARRAY['kind','values']) OR (c ? 'position' AND (jsonb_typeof(c->'position') IS DISTINCT FROM 'string' OR c->>'position' NOT IN ('top','bottom'))) THEN RAISE EXCEPTION 'Invalid add' USING ERRCODE='22023'; END IF; p_id:=gen_random_uuid();
  ELSE
   IF NOT private.profile_keys(c,CASE WHEN action='patch' THEN ARRAY['kind','id','patch'] ELSE ARRAY['kind','id'] END,CASE WHEN action='patch' THEN ARRAY['kind','id','patch'] ELSE ARRAY['kind','id'] END)
    OR jsonb_typeof(c->'id')<>'string' OR c->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'Invalid item ID' USING ERRCODE='22023'; END IF;
   p_id:=(c->>'id')::uuid;
  END IF;
  IF action='add' THEN
   patch:=c->'values'; PERFORM private.validate_profile_values(entity,patch,true);
   patch:=patch||jsonb_build_object('id',p_id,'user_id',p_user_id);
   -- profile_lock holds placement, write, receipt and revision in one transaction.
   -- No client-supplied order or second reorder request is trusted.
   IF coalesce(c->>'position',CASE WHEN entity='products' THEN 'top' ELSE 'bottom' END)='top' THEN
    EXECUTE format('SELECT coalesce(min(display_order),1)-1 FROM public.%I WHERE user_id=$1',entity) INTO ord USING p_user_id;
   ELSE
    EXECUTE format('SELECT coalesce(max(display_order),-1)+1 FROM public.%I WHERE user_id=$1',entity) INTO ord USING p_user_id;
   END IF;
   patch:=patch||jsonb_build_object('display_order',ord);
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

CREATE OR REPLACE FUNCTION private.profile_snapshot()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ DECLARE u uuid:=auth.uid(); rev bigint; result jsonb; entity text; rows jsonb; ordering text; BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 PERFORM private.ensure_account_for(u); rev:=private.profile_lock(u);
 result:=jsonb_build_object('revision',rev,'profile',private.profile_row('profile',u,u));
 FOREACH entity IN ARRAY ARRAY['links','contacts','experiences','qualifications','projects','products'] LOOP
  IF entity='products' THEN
   SELECT coalesce(jsonb_agg(private.product_details(p.id) ORDER BY display_order,created_at DESC,id),'[]'::jsonb) INTO rows FROM public.products p WHERE user_id=u;
  ELSE
   ordering:=CASE entity WHEN 'experiences' THEN 'display_order ASC NULLS LAST,start_year DESC NULLS FIRST,created_at,id'
    WHEN 'qualifications' THEN 'display_order ASC NULLS LAST,end_year DESC NULLS FIRST,created_at,id'
    WHEN 'projects' THEN 'display_order ASC NULLS LAST,created_at DESC,id' ELSE 'display_order ASC NULLS LAST,created_at,id' END;
   EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY %s),''[]''::jsonb) FROM public.%I t WHERE user_id=$1',ordering,entity) INTO rows USING u;
  END IF; result:=result||jsonb_build_object(entity,rows);
 END LOOP; RETURN result;
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
   'description',p.description,'purchase_link',p.purchase_link,'purchase_link_active',p.purchase_link_active,
   'paypal_active',p.paypal_active,'created_at',p.created_at,'sales_page_active',p.sales_page_active,
   'sales_page_published',p.sales_page_published,'payment_config',p.payment_config,'headline',p.headline,
   'tagline',p.tagline,'intro_text',p.intro_text,'value_proposition',p.value_proposition,'video_url',p.video_url,
   'benefits',p.benefits,'testimonials',p.testimonials);
 IF v_owner THEN result:=result||jsonb_build_object('paypal_html',p.paypal_html,'success_url',p.success_url,'display_order',p.display_order); END IF;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION private.own_products()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$ DECLARE result jsonb; BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(private.product_details(p.id) ORDER BY p.display_order,p.created_at DESC,p.id),'[]'::jsonb) INTO result FROM public.products p WHERE user_id=auth.uid();
 RETURN result;
END $$;
-- Replacements retain existing ACLs. No new access to private writers.
NOTIFY pgrst,'reload schema';
COMMIT;
