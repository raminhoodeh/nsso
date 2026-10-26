-- Deploy the RPC readers/payment editor and privately backfill validated legacy
-- payment configs BEFORE this grant cutover. No legacy HTML is interpreted here.
BEGIN;
REVOKE ALL ON public.products FROM PUBLIC,anon,authenticated;
GRANT SELECT(id,user_id,name,price,image_url,description,purchase_link,purchase_link_active,paypal_active,payment_config,created_at,sales_page_active,sales_page_published)
 ON public.products TO anon,authenticated;
GRANT INSERT(id,user_id,name,price,image_url,description,purchase_link,purchase_link_active,paypal_active,sales_page_active,sales_page_published,headline,tagline,intro_text,value_proposition,video_url,benefits,testimonials,success_url)
 ON public.products TO authenticated;
GRANT UPDATE(name,price,image_url,description,purchase_link,purchase_link_active,paypal_active,sales_page_active,sales_page_published,headline,tagline,intro_text,value_proposition,video_url,benefits,testimonials,success_url)
 ON public.products TO authenticated;
GRANT DELETE ON public.products TO authenticated;
-- Own-row RLS still applies; identity/created_at/payment configuration are server-owned.
COMMENT ON COLUMN public.products.paypal_html IS 'Legacy source retained for owner repair and private migration; never public-rendered or browser-writable.';
COMMENT ON COLUMN public.products.payment_config IS 'Validated inert PayPal data; writable only by the guarded payment server endpoint.';
NOTIFY pgrst,'reload schema';
COMMIT;
