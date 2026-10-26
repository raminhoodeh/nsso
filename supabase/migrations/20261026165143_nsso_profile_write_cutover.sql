-- Apply only AFTER every editor/model consumer uses the journal gateway and the
-- service-only payment RPC. Historical rows and public read policies remain.
BEGIN;
DO $$ DECLARE t text; cols text; BEGIN
 FOREACH t IN ARRAY ARRAY['profiles','links','contacts','experiences','qualifications','projects','products'] LOOP
  EXECUTE format('REVOKE INSERT,UPDATE,DELETE ON public.%I FROM PUBLIC,anon,authenticated',t);
  SELECT string_agg(format('%I',attname),',' ORDER BY attnum) INTO cols FROM pg_attribute
   WHERE attrelid=format('public.%I',t)::regclass AND attnum>0 AND NOT attisdropped;
  EXECUTE format('REVOKE INSERT(%1$s),UPDATE(%1$s) ON public.%2$I FROM PUBLIC,anon,authenticated',cols,t);
 END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
