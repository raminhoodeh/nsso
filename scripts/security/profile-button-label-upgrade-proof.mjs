/** Genuine old-shape journal receipts exercised across the additive label DDL.
 * Guarded local synthetic stacks only. Every row, receipt, DDL and actor setting
 * rolls back together; this helper never accepts a cloud endpoint or credentials.
 */
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

export function verifyButtonLabelUpgrade({ sql, repo, owner }) {
    const directory = resolve(repo, 'supabase/migrations')
    const readMigration = suffix => {
        const files = readdirSync(directory).filter(name => name.endsWith('_' + suffix + '.sql'))
        assert.equal(files.length, 1)
        return readFileSync(resolve(directory, files[0]), 'utf8').replace(/^BEGIN;$/m, '').replace(/^COMMIT;$/m, '')
    }
    const migration = readMigration('product_button_labels')
    const previousMigration = readMigration('product_secondary_purchase_link')
    const literal = value => "'" + String(value).replaceAll("'", "''") + "'"
    const u = literal(owner.id) + '::uuid'
    const result = sql(`BEGIN;
      ALTER TABLE public.products DROP COLUMN purchase_button_label, DROP COLUMN secondary_purchase_button_label;
      SELECT set_config('request.jwt.claim.sub',${literal(owner.id)},true);
      CREATE TEMP TABLE button_label_upgrade_fixture(label text,payload jsonb,result jsonb,original uuid,item uuid);
      CREATE TEMP TABLE button_label_upgrade_acl AS
       SELECT p.oid,p.proacl,p.prosecdef,p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='private' AND p.proname IN ('profile_fields','validate_profile_values','product_details','undo_profile_operation');

      -- A receipt predating both the second URL and the new labels must remain
      -- undoable too, without silently discarding subsequently written values.
      ALTER TABLE public.products DROP COLUMN secondary_purchase_link;
      DO $proof$ DECLARE payload jsonb; result jsonb; v_original uuid:=gen_random_uuid(); BEGIN
       payload:=jsonb_build_object('version',1,'operationId',v_original,'expectedRevision',private.profile_lock(${u}),
        'changes',jsonb_build_array(jsonb_build_object('kind','product.add','values',jsonb_build_object('name','Legacy pre-destination offering'))));
       result:=public.apply_profile_operation(payload);
       IF result->>'status'<>'applied' OR (result#>'{changes,0,row}') ?| ARRAY['secondary_purchase_link','purchase_button_label','secondary_purchase_button_label']
        THEN RAISE EXCEPTION 'Pre-destination receipt fixture failed'; END IF;
       INSERT INTO button_label_upgrade_fixture VALUES('pre_destination',payload,result,v_original,(result#>>'{changes,0,id}')::uuid);
      END $proof$;
      ${previousMigration}
      DO $proof$ DECLARE v_label text; payload jsonb; result jsonb; v_original uuid; v_item uuid; BEGIN
       FOREACH v_label IN ARRAY ARRAY['untouched','primary_changed','secondary_changed','blank_changed','removed','patched'] LOOP
        v_original:=gen_random_uuid();
        payload:=jsonb_build_object('version',1,'operationId',v_original,'expectedRevision',private.profile_lock(${u}),
         'changes',jsonb_build_array(jsonb_build_object('kind','product.add','values',jsonb_build_object(
          'name','Legacy offering '||v_label,'purchase_link','https://example.test/legacy','secondary_purchase_link','https://example.test/alternative'))));
        result:=public.apply_profile_operation(payload);
        IF result->>'status'<>'applied' OR (result#>'{changes,0,row}') ?| ARRAY['purchase_button_label','secondary_purchase_button_label']
         THEN RAISE EXCEPTION 'Old-shape label receipt fixture failed'; END IF;
        v_item:=(result#>>'{changes,0,id}')::uuid;
        INSERT INTO button_label_upgrade_fixture VALUES(v_label,payload,result,v_original,v_item);
        IF v_label IN ('removed','patched') THEN
         v_original:=gen_random_uuid();
         result:=public.apply_profile_operation(jsonb_build_object('version',1,'operationId',v_original,'expectedRevision',private.profile_lock(${u}),
          'changes',jsonb_build_array(CASE WHEN v_label='removed' THEN jsonb_build_object('kind','product.remove','id',v_item)
           ELSE jsonb_build_object('kind','product.patch','id',v_item,'patch',jsonb_build_object('purchase_link','https://example.test/legacy-edited')) END)));
         IF result->>'status'<>'applied' THEN RAISE EXCEPTION 'Old-shape remove/patch fixture failed'; END IF;
         UPDATE button_label_upgrade_fixture f SET original=v_original WHERE f.label=v_label;
        END IF;
       END LOOP;
      END $proof$;
      CREATE TEMP TABLE button_label_upgrade_rows AS SELECT id,to_jsonb(p) AS content FROM public.products p;
      CREATE TEMP TABLE button_label_upgrade_receipts AS SELECT user_id,operation_id,to_jsonb(o) AS content FROM private.profile_operations o;
      ${migration}
      DO $proof$ DECLARE fixture button_label_upgrade_fixture%ROWTYPE; result jsonb; before_row jsonb; v_field text; v_value text; BEGIN
       IF EXISTS(SELECT 1 FROM button_label_upgrade_rows b FULL JOIN public.products p USING(id)
        WHERE b.content IS DISTINCT FROM to_jsonb(p)-ARRAY['purchase_button_label','secondary_purchase_button_label']
         OR p.purchase_button_label IS NOT NULL OR p.secondary_purchase_button_label IS NOT NULL)
        THEN RAISE EXCEPTION 'Label migration rewrote existing product content'; END IF;
       IF EXISTS(SELECT 1 FROM button_label_upgrade_receipts b FULL JOIN private.profile_operations o USING(user_id,operation_id)
        WHERE b.content IS DISTINCT FROM to_jsonb(o)) THEN RAISE EXCEPTION 'Label migration rewrote immutable receipts'; END IF;
       IF EXISTS(SELECT 1 FROM button_label_upgrade_acl b JOIN pg_proc p USING(oid)
        WHERE (b.proacl,b.prosecdef,b.proconfig) IS DISTINCT FROM (p.proacl,p.prosecdef,p.proconfig)) THEN RAISE EXCEPTION 'Label migration changed helper authority'; END IF;
       IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='products'
        AND column_name IN ('purchase_button_label','secondary_purchase_button_label') AND data_type='text' AND is_nullable='YES' AND column_default IS NULL)<>2
        THEN RAISE EXCEPTION 'Nullable label contract missing'; END IF;
       FOREACH v_field IN ARRAY ARRAY['purchase_button_label','secondary_purchase_button_label'] LOOP
        IF NOT has_column_privilege('anon','public.products',v_field,'SELECT') OR NOT has_column_privilege('authenticated','public.products',v_field,'SELECT')
         OR has_column_privilege('anon','public.products',v_field,'INSERT') OR has_column_privilege('authenticated','public.products',v_field,'INSERT')
         OR has_column_privilege('anon','public.products',v_field,'UPDATE') OR has_column_privilege('authenticated','public.products',v_field,'UPDATE')
         THEN RAISE EXCEPTION 'Label field privilege broadened'; END IF;
       END LOOP;
       FOR fixture IN SELECT * FROM button_label_upgrade_fixture LOOP
        IF public.apply_profile_operation(fixture.payload) IS DISTINCT FROM fixture.result THEN RAISE EXCEPTION 'Historical label replay changed'; END IF;
        IF public.get_profile_operation(fixture.original) IS DISTINCT FROM (SELECT content->'result' FROM button_label_upgrade_receipts WHERE user_id=${u} AND operation_id=fixture.original)
         THEN RAISE EXCEPTION 'Historical label operation status changed'; END IF;
        IF fixture.label IN ('primary_changed','secondary_changed','blank_changed') THEN
         v_field:=CASE WHEN fixture.label='secondary_changed' THEN 'secondary_purchase_button_label' ELSE 'purchase_button_label' END;
         v_value:=CASE WHEN fixture.label='blank_changed' THEN '' ELSE 'Keep newer button text' END;
         result:=public.apply_profile_operation(jsonb_build_object('version',1,'operationId',gen_random_uuid(),'expectedRevision',private.profile_lock(${u}),
          'changes',jsonb_build_array(jsonb_build_object('kind','product.patch','id',fixture.item,'patch',jsonb_build_object(v_field,v_value)))));
         IF result->>'status'<>'applied' THEN RAISE EXCEPTION 'New label patch failed'; END IF;
        END IF;
        result:=public.undo_profile_operation(gen_random_uuid(),fixture.original,private.profile_lock(${u}));
        IF fixture.label IN ('primary_changed','secondary_changed','blank_changed') THEN
         IF result->>'code' IS DISTINCT FROM 'UNDO_TARGET_CHANGED' OR (SELECT to_jsonb(p)->>v_field FROM public.products p WHERE id=fixture.item) IS DISTINCT FROM v_value
          THEN RAISE EXCEPTION 'Historical Undo lost newer button text'; END IF;
        ELSIF result->>'status' IS DISTINCT FROM 'applied' THEN RAISE EXCEPTION 'Historical Undo was blocked by nullable labels';
        ELSIF fixture.label IN ('untouched','pre_destination') AND EXISTS(SELECT 1 FROM public.products WHERE id=fixture.item)
         THEN RAISE EXCEPTION 'Historical add Undo did not remove its row';
        ELSIF fixture.label='removed' THEN
         SELECT effects#>'{0,before}' INTO before_row FROM private.profile_operations WHERE user_id=${u} AND operation_id=fixture.original;
         IF (SELECT to_jsonb(p)-ARRAY['purchase_button_label','secondary_purchase_button_label'] FROM public.products p WHERE id=fixture.item) IS DISTINCT FROM before_row
          OR (SELECT purchase_button_label IS NOT NULL OR secondary_purchase_button_label IS NOT NULL FROM public.products WHERE id=fixture.item)
          THEN RAISE EXCEPTION 'Historical remove Undo changed content'; END IF;
        ELSIF fixture.label='patched' AND (SELECT purchase_link FROM public.products WHERE id=fixture.item) IS DISTINCT FROM 'https://example.test/legacy'
         THEN RAISE EXCEPTION 'Historical patch Undo changed content';
        END IF;
       END LOOP;
      END $proof$;
      SELECT 'button-label-upgrade-replay-undo-preserved';
      ROLLBACK;`)
    assert.match(result, /button-label-upgrade-replay-undo-preserved/)
}
