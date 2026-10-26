-- Additive product DTO contract. Existing pages retain their legacy publication
-- state (NULL); only newly created pages default to unpublished.
BEGIN;
ALTER TABLE public.products ADD COLUMN payment_config jsonb;
ALTER TABLE public.products ADD COLUMN sales_page_published boolean;
ALTER TABLE public.products ALTER COLUMN sales_page_published SET DEFAULT false;

CREATE FUNCTION private.valid_paypal_config(p jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=''
AS $$
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
END $$;
-- The CHECK must reject NULL validation results as well as false.
ALTER TABLE public.products ADD CONSTRAINT products_payment_config_valid CHECK(private.valid_paypal_config(payment_config) IS TRUE);
REVOKE ALL ON FUNCTION private.valid_paypal_config(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.valid_paypal_config(jsonb) TO authenticated,service_role;

CREATE FUNCTION private.product_details(p_product_id uuid)
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
 IF v_owner THEN result:=result||jsonb_build_object('paypal_html',p.paypal_html,'success_url',p.success_url); END IF;
 RETURN result;
END $$;
CREATE FUNCTION private.own_products()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$ DECLARE result jsonb; BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(private.product_details(p.id) ORDER BY p.created_at),'[]'::jsonb) INTO result FROM public.products p WHERE user_id=auth.uid();
 RETURN result;
END $$;
CREATE FUNCTION public.get_product_details(p_product_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT private.product_details(p_product_id) $$;
CREATE FUNCTION public.get_own_products()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT private.own_products() $$;
REVOKE ALL ON FUNCTION private.product_details(uuid),private.own_products(),public.get_product_details(uuid),public.get_own_products() FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA private TO anon;
GRANT EXECUTE ON FUNCTION private.product_details(uuid),public.get_product_details(uuid) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION private.own_products(),public.get_own_products() TO authenticated;
GRANT EXECUTE ON FUNCTION private.product_details(uuid),private.own_products(),public.get_product_details(uuid),public.get_own_products() TO service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
