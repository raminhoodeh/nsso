/** Rehearse the forward migration against synthetic legacy rows, then roll back. */
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

export function verifyInsertionUpgrade({ sql, repo, owner }) {
    const directory=resolve(repo,'supabase/migrations')
    const files=readdirSync(directory).filter(name=>name.endsWith('_profile_insertion_positions.sql'))
    assert.equal(files.length,1)
    const migration=readFileSync(resolve(directory,files[0]),'utf8').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'')
    const literal=value=>"'"+String(value).replaceAll("'","''")+"'"
    const u=literal(owner.id)+'::uuid'
    // This runs ONLY inside the already-guarded local synthetic database.
    // Rollback restores all constraints, ranks, receipts and function definitions.
    const result=sql(`BEGIN;
      ALTER TABLE public.products DROP COLUMN display_order;
      ALTER TABLE public.links ALTER COLUMN display_order DROP NOT NULL;
      ALTER TABLE public.contacts ALTER COLUMN display_order DROP NOT NULL;
      ALTER TABLE public.experiences ALTER COLUMN display_order DROP NOT NULL;
      ALTER TABLE public.qualifications ALTER COLUMN display_order DROP NOT NULL;
      ALTER TABLE public.projects ALTER COLUMN display_order DROP NOT NULL;
      INSERT INTO public.links(user_id,link_name,link_url,display_order) VALUES(${u},'Legacy first','',-3),(${u},'Legacy second','',NULL),(${u},'Legacy third','',NULL);
      INSERT INTO public.contacts(user_id,method,value,display_order) VALUES(${u},'Email','legacy@example.invalid',NULL);
      INSERT INTO public.experiences(user_id,company_name,job_title,start_year,display_order) VALUES(${u},'Legacy older','Builder',2020,NULL),(${u},'Legacy newer','Builder',2026,NULL);
      INSERT INTO public.qualifications(user_id,institution,qualification_name,end_year,display_order) VALUES(${u},'Legacy older','Course',2020,NULL),(${u},'Legacy newer','Course',2026,NULL);
      INSERT INTO public.projects(user_id,project_name,contribution,display_order) VALUES(${u},'Legacy project','Creator',NULL);
      INSERT INTO public.products(user_id,name,created_at) VALUES(${u},'Legacy oldest','2020-01-01'),(${u},'Legacy latest','2026-01-01');
      CREATE TEMP TABLE legacy_order(entity text,ids jsonb,content jsonb);
      DO $proof$ DECLARE entity text; ordering text; BEGIN
       FOREACH entity IN ARRAY ARRAY['links','contacts','experiences','qualifications','projects','products'] LOOP
        ordering:=CASE entity WHEN 'experiences' THEN 'display_order ASC NULLS LAST,start_year DESC NULLS FIRST,created_at,id'
         WHEN 'qualifications' THEN 'display_order ASC NULLS LAST,end_year DESC NULLS FIRST,created_at,id'
         WHEN 'projects' THEN 'display_order ASC NULLS LAST,created_at DESC,id' WHEN 'products' THEN 'created_at DESC,id' ELSE 'display_order ASC NULLS LAST,created_at,id' END;
        EXECUTE format('INSERT INTO legacy_order SELECT %L,jsonb_agg(id ORDER BY %s),jsonb_agg(to_jsonb(t)-''display_order'' ORDER BY id) FROM public.%I t WHERE user_id=$1',entity,ordering,entity) USING ${u};
       END LOOP;
      END $proof$;
      ${migration}
      DO $proof$ DECLARE v_entity text; ordering text; ids jsonb; content jsonb; prior legacy_order%ROWTYPE; BEGIN
       FOREACH v_entity IN ARRAY ARRAY['links','contacts','experiences','qualifications','projects','products'] LOOP
        SELECT * INTO prior FROM legacy_order l WHERE l.entity=v_entity;
        ordering:=CASE v_entity WHEN 'experiences' THEN 'display_order,start_year DESC NULLS FIRST,created_at,id'
         WHEN 'qualifications' THEN 'display_order,end_year DESC NULLS FIRST,created_at,id'
         WHEN 'projects' THEN 'display_order,created_at DESC,id' WHEN 'products' THEN 'display_order,created_at DESC,id' ELSE 'display_order,created_at,id' END;
        EXECUTE format('SELECT jsonb_agg(id ORDER BY %s),jsonb_agg(to_jsonb(t)-''display_order'' ORDER BY id) FROM public.%I t WHERE user_id=$1',ordering,v_entity) INTO ids,content USING ${u};
        IF ids IS DISTINCT FROM prior.ids OR content IS DISTINCT FROM prior.content THEN RAISE EXCEPTION 'Legacy order/content changed for %',v_entity; END IF;
       END LOOP;
      END $proof$;
      SELECT 'legacy-order-content-preserved';
      ROLLBACK;`)
    assert.match(result,/legacy-order-content-preserved/)
}
