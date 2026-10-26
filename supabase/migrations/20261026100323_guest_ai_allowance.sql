-- Shared paid-AI accounting. Version matches the applied production migration ledger.
-- Only the backend service role can access these objects.
create table public.nsso_chat_budget_daily (
  usage_day date not null,
  subject text not null,
  used_micros bigint not null default 0 check (used_micros >= 0),
  primary key (usage_day, subject)
);
create table public.nsso_chat_budget_requests (
  id uuid primary key,
  usage_day date not null,
  ip_hash text not null check (ip_hash ~ '^[a-f0-9]{64}$'),
  route text not null check (route in ('chat', 'places', 'editorial')),
  reserved_micros bigint not null check (reserved_micros between 0 and 100000),
  charged_micros bigint,
  settled boolean not null default false,
  confirmed boolean not null default false,
  created_at timestamptz not null default now()
);
create index nsso_chat_budget_requests_ip_time on public.nsso_chat_budget_requests (ip_hash, created_at);
create index nsso_chat_budget_requests_time on public.nsso_chat_budget_requests (created_at);
alter table public.nsso_chat_budget_daily enable row level security;
alter table public.nsso_chat_budget_requests enable row level security;
revoke all on public.nsso_chat_budget_daily, public.nsso_chat_budget_requests from public, anon, authenticated;
grant select, insert, update, delete on public.nsso_chat_budget_daily, public.nsso_chat_budget_requests to service_role;

create function public.reserve_nsso_chat_budget(p_ip_hash text, p_request_id uuid, p_route text, p_micros bigint)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  d date := (now() at time zone 'Asia/Dubai')::date;
  reset_at timestamptz;
  r public.nsso_chat_budget_requests%rowtype;
  delta bigint;
  ip_used bigint;
  global_used bigint;
begin
  if p_ip_hash is null or p_ip_hash !~ '^[a-f0-9]{64}$' or p_request_id is null
    or p_route is null or p_route not in ('chat','places','editorial') or p_micros is null or p_micros not between 1 and 100000 then
    raise exception 'Invalid budget reservation';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(739204, 1);
  select * into r from public.nsso_chat_budget_requests where id = p_request_id;
  if found then
    if r.ip_hash <> p_ip_hash or r.route <> p_route or r.settled then
      return jsonb_build_object('allowed',false,'code','chat_budget_unavailable');
    end if;
    d := r.usage_day;
  end if;
  reset_at := (d + 1)::timestamp at time zone 'Asia/Dubai';
  delta := greatest(0, p_micros - coalesce(r.reserved_micros,0));
  select coalesce(max(used_micros),0) into global_used from public.nsso_chat_budget_daily where usage_day=d and subject='global';
  select coalesce(max(used_micros),0) into ip_used from public.nsso_chat_budget_daily where usage_day=d and subject=p_ip_hash;
  if ip_used + delta > 300000 then
    return jsonb_build_object('allowed',false,'code','daily_ip_allowance_exhausted','reset_at',reset_at);
  end if;
  -- A $3 shared backstop limits distributed/IP-rotation abuse; it is not a per-key Google cap.
  if global_used + delta > 3000000 then
    return jsonb_build_object('allowed',false,'code','daily_shared_allowance_exhausted','reset_at',reset_at);
  end if;
  if r.id is null then
    if (select count(*) from public.nsso_chat_budget_requests where ip_hash=p_ip_hash and created_at>now()-interval '1 minute') >= 6
      or (select count(*) from public.nsso_chat_budget_requests where ip_hash=p_ip_hash and not settled and created_at>now()-interval '2 minutes') >= 2
      or (select count(*) from public.nsso_chat_budget_requests where not settled and created_at>now()-interval '2 minutes') >= 8 then
      return jsonb_build_object('allowed',false,'code','chat_busy');
    end if;
    insert into public.nsso_chat_budget_requests(id,usage_day,ip_hash,route,reserved_micros) values(p_request_id,d,p_ip_hash,p_route,p_micros);
    -- Technical accounting only: retain 30 days, never alter application/user data.
    delete from public.nsso_chat_budget_requests where created_at < now()-interval '30 days';
    delete from public.nsso_chat_budget_daily where usage_day < d-30;
  else
    update public.nsso_chat_budget_requests set reserved_micros=greatest(reserved_micros,p_micros) where id=p_request_id;
  end if;
  insert into public.nsso_chat_budget_daily(usage_day,subject,used_micros) values(d,'global',delta),(d,p_ip_hash,delta)
    on conflict(usage_day,subject) do update set used_micros=public.nsso_chat_budget_daily.used_micros+excluded.used_micros;
  return jsonb_build_object('allowed',true,'reset_at',reset_at);
end;
$$;

create function public.finish_nsso_chat_budget(p_request_id uuid, p_micros bigint, p_confirmed boolean)
returns void language plpgsql security invoker set search_path = '' as $$
declare r public.nsso_chat_budget_requests%rowtype; charged bigint;
begin
  if p_micros is null or p_micros < 0 or p_micros > 100000 then raise exception 'Invalid budget settlement'; end if;
  perform pg_catalog.pg_advisory_xact_lock(739204,1);
  select * into r from public.nsso_chat_budget_requests where id=p_request_id;
  if not found or r.settled then return; end if;
  charged := case when p_confirmed then p_micros else r.reserved_micros end;
  update public.nsso_chat_budget_daily set used_micros=greatest(0,used_micros+charged-r.reserved_micros)
    where usage_day=r.usage_day and subject in ('global',r.ip_hash);
  update public.nsso_chat_budget_requests set settled=true, confirmed=coalesce(p_confirmed,false),charged_micros=charged where id=p_request_id;
end;
$$;
revoke all on function public.reserve_nsso_chat_budget(text,uuid,text,bigint), public.finish_nsso_chat_budget(uuid,bigint,boolean) from public,anon,authenticated;
grant execute on function public.reserve_nsso_chat_budget(text,uuid,text,bigint), public.finish_nsso_chat_budget(uuid,bigint,boolean) to service_role;
