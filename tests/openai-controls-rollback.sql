-- Coordinator release verification AFTER both OpenAI migrations are applied.
-- Run as one connection, with AI quiesced. No provider calls or persistent writes.
-- If an assertion raises, explicitly ROLLBACK/close that connection.
begin;
set local lock_timeout='3s';
set local statement_timeout='25s';
set local role service_role;
select pg_advisory_xact_lock(739204,1);
select pg_advisory_xact_lock(739204,2);
do $$
declare
  ip text:=repeat('c',64);
  request_id uuid:=gen_random_uuid();
  claim_request uuid:=gen_random_uuid();
  denied_request uuid:=gen_random_uuid();
  source_id uuid:=gen_random_uuid();
  source_hash text;
  operation_hash text:=repeat('d',64);
  m date:=date_trunc('month',now() at time zone 'UTC')::date;
  d date:=(now() at time zone 'Asia/Dubai')::date;
  answer jsonb;
  n bigint;
  rejected boolean;
  vector_values jsonb:=to_jsonb(array_fill(0.01::real,array[1536]));
  rows_value jsonb;
begin
  if exists(select 1 from pg_class where oid in ('public.nsso_ai_control'::regclass,'public.nsso_ai_budget_monthly'::regclass,'public.agent_knowledge_openai_v1'::regclass,'public.nsso_openai_ingestion_claims'::regclass) and not relrowsecurity) then raise exception 'RLS disabled'; end if;
  if has_table_privilege('anon','public.agent_knowledge_openai_v1','SELECT') or has_function_privilege('authenticated','public.claim_nsso_openai_ingestion(text[],uuid)','EXECUTE') or has_function_privilege('anon','public.reserve_nsso_chat_budget(text,uuid,text,bigint)','EXECUTE') then raise exception 'Public ACL leak'; end if;
  if (select count(*) from public.nsso_chat_budget_requests where not settled and created_at>now()-interval '2 minutes')>5 then raise exception 'Verification requires quiescent AI requests'; end if;
  update public.nsso_ai_control set blocked=false,reason=null where id;
  insert into public.nsso_ai_budget_monthly(usage_month,used_micros) values(m,4999990)
    on conflict(usage_month) do update set used_micros=excluded.used_micros;
  insert into public.nsso_chat_budget_daily(usage_day,subject,used_micros) values(d,'global',0),(d,ip,0)
    on conflict(usage_day,subject) do update set used_micros=0;
  answer:=public.reserve_nsso_chat_budget(ip,request_id,'ingestion',20);
  if answer->>'code'<>'monthly_allowance_exhausted' then raise exception 'Monthly cap did not reject maximum before work'; end if;
  update public.nsso_ai_budget_monthly set used_micros=4999970 where usage_month=m;
  answer:=public.reserve_nsso_chat_budget(ip,request_id,'ingestion',20);
  if answer->>'allowed'<>'true' then raise exception 'Reservation failed: %',answer; end if;
  answer:=public.reserve_nsso_chat_budget(ip,denied_request,'ingestion',20);
  if answer->>'code'<>'monthly_allowance_exhausted' then raise exception 'Second reservation can overdraw'; end if;
  perform public.finish_nsso_chat_budget(request_id,5,true);
  perform public.finish_nsso_chat_budget(request_id,0,true);
  select used_micros into n from public.nsso_ai_budget_monthly where usage_month=m;
  if n<>4999975 then raise exception 'Settlement is not idempotent'; end if;

  -- Existing daily caps remain in force under the new monthly gate.
  update public.nsso_ai_budget_monthly set used_micros=0 where usage_month=m;
  update public.nsso_chat_budget_daily set used_micros=299999 where usage_day=d and subject=ip;
  answer:=public.reserve_nsso_chat_budget(ip,denied_request,'ingestion',2);
  if answer->>'code'<>'daily_ip_allowance_exhausted' then raise exception 'Daily IP cap regressed'; end if;
  update public.nsso_chat_budget_daily set used_micros=case when subject='global' then 2999999 else 0 end where usage_day=d and subject in('global',ip);
  answer:=public.reserve_nsso_chat_budget(ip,denied_request,'ingestion',2);
  if answer->>'code'<>'daily_shared_allowance_exhausted' then raise exception 'Daily shared cap regressed'; end if;
  update public.nsso_chat_budget_daily set used_micros=0 where usage_day=d and subject in('global',ip);

  -- A separately claimed ingestion operation cannot be replayed.
  answer:=public.reserve_nsso_chat_budget(ip,claim_request,'ingestion',100);
  if answer->>'allowed'<>'true' then raise exception 'Ingestion reservation failed'; end if;
  answer:=public.claim_nsso_openai_ingestion(array[operation_hash],claim_request);
  if answer->>'claimed'<>'true' then raise exception 'Initial ingestion claim failed'; end if;
  answer:=public.claim_nsso_openai_ingestion(array[operation_hash],claim_request);
  if answer->>'claimed'<>'false' then raise exception 'Ingestion operation was replayed'; end if;
  rejected:=false;
  begin perform public.claim_nsso_openai_ingestion(array[repeat('e',64)],gen_random_uuid()); exception when others then rejected:=true; end;
  if not rejected then raise exception 'Claim did not require a live reservation'; end if;

  -- Synthetic source only; original production rows are never modified.
  insert into public.agent_knowledge(id,content,metadata,embedding)
    values(source_id,'Synthetic OpenAI rollback verification source.',jsonb_build_object('source','__codex_openai_rollback_fixture__'),null);
  select md5(content||coalesce(metadata::text,'')) into source_hash from public.agent_knowledge where id=source_id;
  rows_value:=jsonb_build_array(jsonb_build_object('id',source_id,'content_hash',source_hash,'embedding',vector_values));
  answer:=public.commit_nsso_openai_index_batch(rows_value);
  if answer->>'committed'<>'1' then raise exception 'Index commit count mismatch'; end if;
  if (select model from public.agent_knowledge_openai_v1 where id=source_id)<>'text-embedding-3-small' then raise exception 'Index model mismatch'; end if;
  rejected:=false;
  begin perform public.commit_nsso_openai_index_batch(rows_value||rows_value); exception when others then rejected:=true; end;
  if not rejected then raise exception 'Duplicate index ID accepted'; end if;
  rejected:=false;
  begin perform public.commit_nsso_openai_index_batch(jsonb_build_array(jsonb_build_object('id',source_id,'content_hash',source_hash,'embedding',to_jsonb(array_fill(0.01::real,array[768]))))); exception when others then rejected:=true; end;
  if not rejected then raise exception 'Old vector dimension accepted'; end if;
  update public.agent_knowledge set content='Changed synthetic source after embedding.' where id=source_id;
  rejected:=false;
  begin perform public.commit_nsso_openai_index_batch(rows_value); exception when others then rejected:=true; end;
  if not rejected then raise exception 'Stale source hash committed'; end if;
  select count(*) into n from public.agent_knowledge ak join public.agent_knowledge_openai_v1 idx on idx.id=ak.id and idx.content_hash=md5(ak.content||coalesce(ak.metadata::text,'')) where ak.id=source_id;
  if n<>0 then raise exception 'Stale vector remains eligible'; end if;
  if (select embedding is not null from public.agent_knowledge where id=source_id) then raise exception 'Original vector was overwritten'; end if;

  -- Request-start month ownership survives settlement across a boundary.
  update public.nsso_chat_budget_requests set usage_month=(m-interval '1 month')::date where id=claim_request;
  insert into public.nsso_ai_budget_monthly(usage_month,used_micros) values((m-interval '1 month')::date,100) on conflict(usage_month) do update set used_micros=100;
  perform public.finish_nsso_chat_budget(claim_request,10,true);
  if (select used_micros from public.nsso_ai_budget_monthly where usage_month=(m-interval '1 month')::date)<>10 then raise exception 'Settlement charged wrong UTC month'; end if;

  -- Credible overrun above request maximum is accounted and held, not lost.
  answer:=public.reserve_nsso_chat_budget(ip,denied_request,'ingestion',20);
  if answer->>'allowed'<>'true' then raise exception 'Overrun fixture reservation failed'; end if;
  perform public.finish_nsso_chat_budget(denied_request,500001,true);
  if not (select blocked from public.nsso_ai_control where id) then raise exception 'Usage overrun did not create manual hold'; end if;
  if (select charged_micros from public.nsso_chat_budget_requests where id=denied_request)<>500001 then raise exception 'Actual overrun was not recorded'; end if;
  answer:=public.reserve_nsso_chat_budget(ip,gen_random_uuid(),'ingestion',1);
  if answer->>'allowed'<>'false' then raise exception 'Manual hold allowed new work'; end if;
  raise notice 'NSSO rollback assertions passed: ACL/RLS, monthly/daily caps, idempotent/UTC settlement, claims, fresh shadow-vector commit, hash/dimension/duplicate rejection, actual-overrun hold.';
end;
$$;
rollback;

-- TWO-CONNECTION CONCURRENCY PROOF, while production AI is quiesced:
-- A: begin; set local role service_role;
--    select public.reserve_nsso_chat_budget(repeat('f',64),gen_random_uuid(),'ingestion',1);
--    select pg_sleep(3); rollback;
-- Start B within 1 second while A sleeps:
-- B: begin; set local role service_role;
--    DO $test$ begin
--      if pg_try_advisory_xact_lock(739204,1) then raise exception 'Expected budget lock held by A'; end if;
--    end $test$; rollback;
-- For claims repeat with A calling pg_advisory_xact_lock(739204,2), B trying that key.
-- A always rolls back: this proves serialization without persistent synthetic spend.
