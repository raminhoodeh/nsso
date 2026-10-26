-- Payment operations are not undoable: keep identity/hash/status/revision receipts,
-- not copies of seller button source/config. Current products and encrypted
-- migration originals are untouched. Historical applied migrations stay immutable.
BEGIN;
CREATE OR REPLACE FUNCTION private.save_product_payment_operation(p_user_id uuid,p_product_id uuid,p_operation_id uuid,p_expected_revision bigint,p_html text,p_config jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE rev bigint; h text; previous private.profile_operations%ROWTYPE; owned uuid;
 result jsonb; state text:='applied'; code text; old_marker text;
BEGIN
 IF p_user_id IS NULL OR p_product_id IS NULL OR p_operation_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision NOT BETWEEN 0 AND 9007199254740991 OR p_html IS NULL OR length(p_html)>32768 OR private.valid_paypal_config(p_config) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Invalid payment operation' USING ERRCODE='22023'; END IF;
 h:=encode(sha256(convert_to(jsonb_build_object('kind','payment','id',p_product_id,'expectedRevision',p_expected_revision,'html',p_html,'config',p_config)::text,'UTF8')),'hex'); rev:=private.profile_lock(p_user_id);
 SELECT * INTO previous FROM private.profile_operations WHERE user_id=p_user_id AND operation_id=p_operation_id;
 IF FOUND THEN
  IF previous.request_hash=h THEN RETURN previous.result; END IF;
  RETURN jsonb_build_object('status','conflict','operationId',p_operation_id,'revision',rev,'changes','[]'::jsonb,'code','OPERATION_ID_REUSED');
 END IF;
 IF NOT private.profile_operation_quota(p_user_id) THEN RETURN jsonb_build_object('status','rejected','operationId',p_operation_id,'revision',rev,'changes','[]'::jsonb,'code','RATE_LIMITED'); END IF;
 SELECT id INTO owned FROM public.products WHERE id=p_product_id AND user_id=p_user_id FOR UPDATE;
 IF owned IS NULL THEN state:='rejected'; code:='ITEM_UNAVAILABLE';
 ELSIF rev<>p_expected_revision THEN state:='conflict'; code:='REVISION_CONFLICT';
 ELSE
  old_marker:=current_setting('nsso.journal_actor',true); PERFORM set_config('nsso.journal_actor',p_user_id::text,true);
  UPDATE public.products SET paypal_html=p_html,payment_config=p_config WHERE id=p_product_id AND user_id=p_user_id;
  PERFORM set_config('nsso.journal_actor',coalesce(old_marker,''),true);
  rev:=rev+1; UPDATE private.profile_revisions SET revision=rev WHERE user_id=p_user_id;
 END IF;
 result:=jsonb_build_object('status',state,'operationId',p_operation_id,'revision',rev,'changes','[]'::jsonb);
 IF code IS NOT NULL THEN result:=result||jsonb_build_object('code',code); END IF;
 INSERT INTO private.profile_operations(user_id,operation_id,request_hash,operation_kind,status,expected_revision,revision,effects,result)
 VALUES(p_user_id,p_operation_id,h,'payment',state,p_expected_revision,rev,'[]'::jsonb,result);
 RETURN result;
END $$;
-- CREATE OR REPLACE retains the existing service-only ACL; restate it explicitly.
REVOKE ALL ON FUNCTION private.save_product_payment_operation(uuid,uuid,uuid,bigint,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.save_product_payment_operation(uuid,uuid,uuid,bigint,text,jsonb) TO service_role;

-- Redact duplicate payloads only, preserving replay hashes, identities, original
-- outcome/revision, timestamps and every non-payment Undo/audit record.
UPDATE private.profile_operations
 SET effects='[]'::jsonb, result=jsonb_set(result,'{changes}','[]'::jsonb,true)
 WHERE operation_kind='payment'
 AND (effects IS DISTINCT FROM '[]'::jsonb OR result->'changes' IS DISTINCT FROM '[]'::jsonb);
NOTIFY pgrst,'reload schema';
COMMIT;
