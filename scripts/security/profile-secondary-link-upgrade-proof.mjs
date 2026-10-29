/** Rehearse nullable-column upgrades against genuine old-shape journal receipts.
 * Called only by verify-fresh-project's guarded local synthetic stack. All DDL,
 * receipts, actor claims and fixture content are rolled back in one transaction.
 */
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

export function verifySecondaryPurchaseLinkUpgrade({ sql, repo, owner }) {
    const directory=resolve(repo,'supabase/migrations')
    const files=readdirSync(directory).filter(name=>name.endsWith('_product_secondary_purchase_link.sql'))
    assert.equal(files.length,1)
    const migration=readFileSync(resolve(directory,files[0]),'utf8').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'')
    const literal=value=>"'"+String(value).replaceAll("'","''")+"'"
    const u=literal(owner.id)+'::uuid'
    const result=sql(`BEGIN;
      ALTER TABLE public.products DROP COLUMN secondary_purchase_link;
      SELECT set_config('request.jwt.claim.sub',${literal(owner.id)},true);
      CREATE TEMP TABLE secondary_upgrade_fixture(label text,payload jsonb,result jsonb,original uuid,item uuid);
      CREATE TEMP TABLE secondary_upgrade_acl AS
       SELECT p.oid,p.proacl,p.prosecdef,p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='private' AND p.proname IN ('profile_fields','validate_profile_values','product_details','undo_profile_operation');
      DO $proof$ DECLARE v_label text; payload jsonb; result jsonb; v_original uuid; v_item uuid; BEGIN
       FOREACH v_label IN ARRAY ARRAY['untouched','changed','removed','patched'] LOOP
        v_original:=gen_random_uuid();
        payload:=jsonb_build_object('version',1,'operationId',v_original,'expectedRevision',private.profile_lock(${u}),
         'changes',jsonb_build_array(jsonb_build_object('kind','product.add','values',jsonb_build_object('name','Legacy course '||v_label,'purchase_link','https://example.test/legacy'))));
        result:=public.apply_profile_operation(payload);
        IF result->>'status'<>'applied' OR (result#>'{changes,0,row}') ? 'secondary_purchase_link' THEN RAISE EXCEPTION 'Old-shape receipt fixture failed'; END IF;
        v_item:=(result#>>'{changes,0,id}')::uuid;
        INSERT INTO secondary_upgrade_fixture VALUES(v_label,payload,result,v_original,v_item);
        IF v_label IN ('removed','patched') THEN
         v_original:=gen_random_uuid();
         result:=public.apply_profile_operation(jsonb_build_object('version',1,'operationId',v_original,'expectedRevision',private.profile_lock(${u}),
          'changes',jsonb_build_array(CASE WHEN v_label='removed' THEN jsonb_build_object('kind','product.remove','id',v_item)
           ELSE jsonb_build_object('kind','product.patch','id',v_item,'patch',jsonb_build_object('purchase_link','https://example.test/legacy-edited')) END)));
         IF result->>'status'<>'applied' THEN RAISE EXCEPTION 'Old-shape remove/patch fixture failed'; END IF;
         UPDATE secondary_upgrade_fixture f SET original=v_original WHERE f.label=v_label;
        END IF;
       END LOOP;
      END $proof$;
      CREATE TEMP TABLE secondary_upgrade_rows AS SELECT id,to_jsonb(p) AS content FROM public.products p;
      CREATE TEMP TABLE secondary_upgrade_receipts AS SELECT user_id,operation_id,to_jsonb(o) AS content FROM private.profile_operations o;
      ${migration}
      DO $proof$ DECLARE fixture secondary_upgrade_fixture%ROWTYPE; result jsonb; before_row jsonb; BEGIN
       IF EXISTS(SELECT 1 FROM secondary_upgrade_rows b FULL JOIN public.products p USING(id)
        WHERE b.content IS DISTINCT FROM to_jsonb(p)-'secondary_purchase_link' OR p.secondary_purchase_link IS NOT NULL)
        THEN RAISE EXCEPTION 'Migration rewrote existing product content'; END IF;
       IF EXISTS(SELECT 1 FROM secondary_upgrade_receipts b FULL JOIN private.profile_operations o USING(user_id,operation_id)
        WHERE b.content IS DISTINCT FROM to_jsonb(o)) THEN RAISE EXCEPTION 'Migration rewrote immutable receipts'; END IF;
       IF EXISTS(SELECT 1 FROM secondary_upgrade_acl b JOIN pg_proc p USING(oid)
        WHERE (b.proacl,b.prosecdef,b.proconfig) IS DISTINCT FROM (p.proacl,p.prosecdef,p.proconfig)) THEN RAISE EXCEPTION 'Migration changed helper authority'; END IF;
       IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products'
        AND column_name='secondary_purchase_link' AND data_type='text' AND is_nullable='YES' AND column_default IS NULL) THEN RAISE EXCEPTION 'Nullable text contract missing'; END IF;
       FOR fixture IN SELECT * FROM secondary_upgrade_fixture LOOP
        IF public.apply_profile_operation(fixture.payload) IS DISTINCT FROM fixture.result THEN RAISE EXCEPTION 'Historical replay changed'; END IF;
        IF public.get_profile_operation(fixture.original) IS DISTINCT FROM (SELECT content->'result' FROM secondary_upgrade_receipts WHERE user_id=${u} AND operation_id=fixture.original)
         THEN RAISE EXCEPTION 'Historical operation status changed'; END IF;
        IF fixture.label='changed' THEN
         result:=public.apply_profile_operation(jsonb_build_object('version',1,'operationId',gen_random_uuid(),'expectedRevision',private.profile_lock(${u}),
          'changes',jsonb_build_array(jsonb_build_object('kind','product.patch','id',fixture.item,'patch',jsonb_build_object('secondary_purchase_link','https://example.test/newer')))));
         IF result->>'status'<>'applied' THEN RAISE EXCEPTION 'New destination patch failed'; END IF;
        END IF;
        result:=public.undo_profile_operation(gen_random_uuid(),fixture.original,private.profile_lock(${u}));
        IF fixture.label='changed' THEN
         IF result->>'code' IS DISTINCT FROM 'UNDO_TARGET_CHANGED' OR (SELECT secondary_purchase_link FROM public.products WHERE id=fixture.item) IS DISTINCT FROM 'https://example.test/newer'
          THEN RAISE EXCEPTION 'Historical Undo lost a newer destination'; END IF;
        ELSIF result->>'status' IS DISTINCT FROM 'applied' THEN RAISE EXCEPTION 'Historical Undo was blocked by a nullable column';
        ELSIF fixture.label='untouched' AND EXISTS(SELECT 1 FROM public.products WHERE id=fixture.item) THEN RAISE EXCEPTION 'Historical add Undo did not remove its row';
        ELSIF fixture.label='removed' THEN
         SELECT effects#>'{0,before}' INTO before_row FROM private.profile_operations WHERE user_id=${u} AND operation_id=fixture.original;
         IF (SELECT to_jsonb(p)-'secondary_purchase_link' FROM public.products p WHERE id=fixture.item) IS DISTINCT FROM before_row
          OR (SELECT secondary_purchase_link FROM public.products WHERE id=fixture.item) IS NOT NULL THEN RAISE EXCEPTION 'Historical remove Undo changed content'; END IF;
        ELSIF fixture.label='patched' AND (SELECT purchase_link FROM public.products WHERE id=fixture.item) IS DISTINCT FROM 'https://example.test/legacy'
         THEN RAISE EXCEPTION 'Historical patch Undo changed content';
        END IF;
       END LOOP;
      END $proof$;
      SELECT 'secondary-link-upgrade-replay-undo-preserved';
      ROLLBACK;`)
    assert.match(result,/secondary-link-upgrade-replay-undo-preserved/)
}
