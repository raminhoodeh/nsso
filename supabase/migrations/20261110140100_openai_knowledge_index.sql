-- Versioned vector space. Original text/metadata/old vectors remain intact for recovery.
create table public.agent_knowledge_openai_v1 (
 id uuid primary key references public.agent_knowledge(id) on delete cascade,
 content_hash text not null check(length(content_hash)=32),
 model text not null default 'text-embedding-3-small' check(model='text-embedding-3-small'),
 embedding public.vector(1536) not null,
 embedded_at timestamptz not null default now()
);
alter table public.agent_knowledge_openai_v1 enable row level security;
revoke all on public.agent_knowledge_openai_v1 from public,anon,authenticated;
grant select,insert,update,delete on public.agent_knowledge_openai_v1 to service_role;
create index agent_knowledge_openai_v1_cosine on public.agent_knowledge_openai_v1 using hnsw(embedding public.vector_cosine_ops);
CREATE OR REPLACE FUNCTION public.intelligent_search_openai_v1(query_embedding public.vector, query_text text, profile_embedding public.vector DEFAULT NULL::public.vector, match_threshold double precision DEFAULT 0.5, match_count integer DEFAULT 8, filter_files text[] DEFAULT NULL::text[], candidate_count integer DEFAULT 40)
 RETURNS TABLE(id uuid, content text, metadata jsonb, similarity double precision, profile_similarity double precision, keyword_score double precision, combined_score double precision)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO pg_catalog, public, pg_temp
AS $function$
BEGIN
 IF query_text IS NULL OR query_embedding IS NULL OR candidate_count IS NULL OR match_count IS NULL OR match_threshold IS NULL THEN RAISE EXCEPTION 'Invalid retrieval bounds' USING ERRCODE='22023'; END IF;
 IF public.vector_dims(query_embedding) <> 1536 OR (profile_embedding IS NOT NULL AND public.vector_dims(profile_embedding)<>1536)
 OR length(query_text)>4000 OR match_count NOT BETWEEN 1 AND 20 OR candidate_count NOT BETWEEN 1 AND 100
 OR match_threshold<0 OR match_threshold>1 OR (filter_files IS NOT NULL AND cardinality(filter_files)>30)
 THEN RAISE EXCEPTION 'Invalid retrieval bounds' USING ERRCODE='22023'; END IF;
    RETURN QUERY
    WITH vector_candidates AS (
        SELECT
            ak.id,
            ak.content,
            ak.metadata,
            idx.embedding as embedding,
            ak.content_tsvector,
            (1 - (idx.embedding <=> query_embedding))::double precision as similarity
        FROM public.agent_knowledge ak JOIN public.agent_knowledge_openai_v1 idx ON idx.id=ak.id
        AND idx.content_hash=md5(ak.content || coalesce(ak.metadata::text,''))
        WHERE (filter_files IS NULL OR (ak.metadata->>'source') = ANY(filter_files))
          AND (1 - (idx.embedding <=> query_embedding)) > (match_threshold - 0.1)
        ORDER BY similarity DESC
        LIMIT candidate_count
    ),
    keyword_scores AS (
        SELECT
            vc.id,
            ts_rank(vc.content_tsvector, plainto_tsquery('english', query_text))::double precision as kw_score
        FROM vector_candidates vc
        WHERE vc.content_tsvector @@ plainto_tsquery('english', query_text)
    )
    SELECT
        vc.id,
        vc.content,
        vc.metadata,
        vc.similarity,
        CASE
            WHEN profile_embedding IS NOT NULL THEN (1 - (vc.embedding <=> profile_embedding))::double precision
            ELSE 0::double precision
        END as profile_similarity,
        COALESCE(ks.kw_score, 0.0)::double precision as keyword_score,
        CASE
            WHEN profile_embedding IS NOT NULL THEN
                ((vc.similarity * 0.6) +
                 ((1 - (vc.embedding <=> profile_embedding)) * 0.2) +
                 (COALESCE(ks.kw_score, 0.0) * 0.2))::double precision
            ELSE
                ((vc.similarity * 0.7) + (COALESCE(ks.kw_score, 0.0) * 0.3))::double precision
        END as combined_score
    FROM vector_candidates vc
    LEFT JOIN keyword_scores ks ON vc.id = ks.id
    WHERE
        vc.similarity > (match_threshold - 0.05)
    ORDER BY combined_score DESC
    LIMIT match_count;
END;
$function$
;

REVOKE ALL ON FUNCTION public.intelligent_search_openai_v1(query_embedding public.vector, query_text text, profile_embedding public.vector, match_threshold double precision, match_count integer, filter_files text[], candidate_count integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.intelligent_search_openai_v1(query_embedding public.vector, query_text text, profile_embedding public.vector, match_threshold double precision, match_count integer, filter_files text[], candidate_count integer) TO service_role;

-- Bounded resumable backfill source. Hash uses canonical Postgres JSON, never client serialization.
create function public.nsso_openai_index_batch(p_after uuid default null,p_limit integer default 128)
returns table(id uuid,content text,metadata jsonb,content_hash text)
language plpgsql stable security invoker set search_path=pg_catalog,public,pg_temp as $$
begin
 if p_limit is null or p_limit not between 1 and 128 then raise exception 'Invalid backfill limit'; end if;
 return query select ak.id,ak.content,ak.metadata,md5(ak.content||coalesce(ak.metadata::text,''))
 from public.agent_knowledge ak left join public.agent_knowledge_openai_v1 idx on idx.id=ak.id
 where (p_after is null or ak.id>p_after) and (idx.id is null or idx.content_hash<>md5(ak.content||coalesce(ak.metadata::text,'')))
 order by ak.id limit p_limit;
end; $$;
revoke all on function public.nsso_openai_index_batch(uuid,integer) from public,anon,authenticated;
grant execute on function public.nsso_openai_index_batch(uuid,integer) to service_role;

-- Terminal per-content claims survive monthly resets and accounting-log pruning.
create table public.nsso_openai_ingestion_claims (
 operation_hash text primary key check(operation_hash ~ '^[a-f0-9]{64}$'),
 request_id uuid not null, claimed_at timestamptz not null default now()
);
alter table public.nsso_openai_ingestion_claims enable row level security;
revoke all on public.nsso_openai_ingestion_claims from public,anon,authenticated;
grant select,insert,delete on public.nsso_openai_ingestion_claims to service_role;
create function public.claim_nsso_openai_ingestion(p_operation_hashes text[],p_request_id uuid)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public,pg_temp as $$
begin
 if p_request_id is null or p_operation_hashes is null or cardinality(p_operation_hashes) not between 1 and 128
 or exists(select 1 from unnest(p_operation_hashes) h where h is null or h !~ '^[a-f0-9]{64}$')
 or (select count(distinct h) from unnest(p_operation_hashes) h)<>cardinality(p_operation_hashes)
 then raise exception 'Invalid operation claim'; end if;
 perform pg_advisory_xact_lock(739204,2);
 if not exists(select 1 from public.nsso_chat_budget_requests where id=p_request_id and route='ingestion' and not settled)
 then raise exception 'Reservation required'; end if;
 if exists(select 1 from public.nsso_openai_ingestion_claims where operation_hash=any(p_operation_hashes))
 then return jsonb_build_object('claimed',false); end if;
 insert into public.nsso_openai_ingestion_claims(operation_hash,request_id) select h,p_request_id from unnest(p_operation_hashes) h;
 return jsonb_build_object('claimed',true);
end; $$;
revoke all on function public.claim_nsso_openai_ingestion(text[],uuid) from public,anon,authenticated;
grant execute on function public.claim_nsso_openai_ingestion(text[],uuid) to service_role;

create function public.commit_nsso_openai_index_batch(p_rows jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public,pg_temp as $$
declare r jsonb; source_hash text; v public.vector; n integer:=0;
begin
 if p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 128
 then raise exception 'Invalid index batch'; end if;
 if (select count(distinct value->>'id') from jsonb_array_elements(p_rows))<>jsonb_array_length(p_rows)
 then raise exception 'Duplicate index row'; end if;
 for r in select value from jsonb_array_elements(p_rows) order by value->>'id' loop
   select md5(content||coalesce(metadata::text,'')) into source_hash from public.agent_knowledge where id=(r->>'id')::uuid for update;
   if source_hash is null or source_hash is distinct from r->>'content_hash' then raise exception 'Index source changed'; end if;
   v:=(r->'embedding')::text::public.vector;
   if v is null or public.vector_dims(v)<>1536 then raise exception 'Invalid index vector'; end if;
   insert into public.agent_knowledge_openai_v1(id,content_hash,embedding) values((r->>'id')::uuid,source_hash,v)
   on conflict(id) do update set content_hash=excluded.content_hash,embedding=excluded.embedding,embedded_at=now();
   n:=n+1;
 end loop;
 return jsonb_build_object('committed',n);
end; $$;
revoke all on function public.commit_nsso_openai_index_batch(jsonb) from public,anon,authenticated;
grant execute on function public.commit_nsso_openai_index_batch(jsonb) to service_role;
