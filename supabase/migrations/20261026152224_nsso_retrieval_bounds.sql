BEGIN;

CREATE FUNCTION private.validate_retrieval_request(q public.vector,threshold double precision,result_count integer,query text DEFAULT NULL,files text[] DEFAULT NULL,candidates integer DEFAULT NULL,profile public.vector DEFAULT NULL)
RETURNS void LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$ BEGIN
 IF q IS NULL OR public.vector_dims(q)<>768 OR (profile IS NOT NULL AND public.vector_dims(profile)<>768)
 OR threshold IS NULL OR NOT(threshold BETWEEN -1 AND 1) OR result_count IS NULL OR result_count NOT BETWEEN 1 AND 20
 OR (query IS NOT NULL AND length(query)>4096) OR (files IS NOT NULL AND (cardinality(files)>50 OR EXISTS(SELECT 1 FROM unnest(files) f WHERE f IS NULL OR length(f)>1024)))
 OR (candidates IS NOT NULL AND (candidates NOT BETWEEN 1 AND 100 OR candidates<result_count)) THEN
 RAISE EXCEPTION 'Invalid retrieval bounds' USING ERRCODE='22023'; END IF;
END $$;
REVOKE ALL ON FUNCTION private.validate_retrieval_request(public.vector,double precision,integer,text,text[],integer,public.vector) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.validate_retrieval_request(public.vector,double precision,integer,text,text[],integer,public.vector) TO service_role;

CREATE OR REPLACE FUNCTION public.hybrid_search(query_embedding public.vector, query_text text, match_threshold double precision, match_count integer, filter_files text[] DEFAULT NULL::text[])
 RETURNS TABLE(id uuid, content text, metadata jsonb, similarity double precision, keyword_score double precision, combined_score double precision)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO pg_catalog, public, pg_temp
AS $function$
BEGIN
 IF query_text IS NULL THEN RAISE EXCEPTION 'Invalid retrieval bounds' USING ERRCODE='22023'; END IF;
 PERFORM private.validate_retrieval_request(query_embedding,match_threshold,match_count,query_text,filter_files);
    RETURN QUERY
    WITH vector_results AS (
        SELECT 
            ak.id,
            ak.content,
            ak.metadata,
            (1 - (ak.embedding <=> query_embedding))::double precision as similarity
        FROM public.agent_knowledge ak
        WHERE (filter_files IS NULL OR (ak.metadata->>'source') = ANY(filter_files))
    ),
    keyword_results AS (
        SELECT 
            ak.id,
            ts_rank(ak.content_tsvector, plainto_tsquery('english', query_text))::double precision as keyword_score
        FROM public.agent_knowledge ak
        WHERE (filter_files IS NULL OR (ak.metadata->>'source') = ANY(filter_files))
          AND ak.content_tsvector @@ plainto_tsquery('english', query_text)
    )
    SELECT 
        vr.id,
        vr.content,
        vr.metadata,
        vr.similarity,
        COALESCE(kr.keyword_score, 0.0)::double precision as keyword_score,
        ((vr.similarity * 0.7) + (COALESCE(kr.keyword_score, 0.0) * 0.3))::double precision as combined_score
    FROM vector_results vr
    LEFT JOIN keyword_results kr ON vr.id = kr.id
    WHERE vr.similarity > match_threshold
    ORDER BY combined_score DESC
    LIMIT match_count;
END;
$function$
;

REVOKE ALL ON FUNCTION public.hybrid_search(query_embedding public.vector, query_text text, match_threshold double precision, match_count integer, filter_files text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hybrid_search(query_embedding public.vector, query_text text, match_threshold double precision, match_count integer, filter_files text[]) TO service_role;

-- The defaulted four-argument form also accepts existing three-argument calls.
-- Keeping both overloads makes PostgREST return PGRST203 for those requests.
DROP FUNCTION public.match_documents(public.vector,double precision,integer);

CREATE OR REPLACE FUNCTION public.match_documents(query_embedding public.vector, match_threshold double precision, match_count integer, filter_files text[] DEFAULT NULL::text[])
 RETURNS TABLE(id uuid, content text, metadata jsonb, similarity double precision)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO pg_catalog, public, pg_temp
AS $function$
begin
 PERFORM private.validate_retrieval_request(query_embedding,match_threshold,match_count,NULL,filter_files);
  return query
  select
    agent_knowledge.id,
    agent_knowledge.content,
    agent_knowledge.metadata,
    1 - (agent_knowledge.embedding <=> query_embedding) as similarity
  FROM public.agent_knowledge
  where 1 - (agent_knowledge.embedding <=> query_embedding) > match_threshold
  and (
    filter_files is null 
    or 
    (agent_knowledge.metadata->>'source') = any(filter_files)
  )
  order by agent_knowledge.embedding <=> query_embedding
  limit match_count;
end;
$function$
;

REVOKE ALL ON FUNCTION public.match_documents(query_embedding public.vector, match_threshold double precision, match_count integer, filter_files text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.match_documents(query_embedding public.vector, match_threshold double precision, match_count integer, filter_files text[]) TO service_role;

CREATE OR REPLACE FUNCTION public.intelligent_search(query_embedding public.vector, query_text text, profile_embedding public.vector DEFAULT NULL::public.vector, match_threshold double precision DEFAULT 0.5, match_count integer DEFAULT 8, filter_files text[] DEFAULT NULL::text[], candidate_count integer DEFAULT 40)
 RETURNS TABLE(id uuid, content text, metadata jsonb, similarity double precision, profile_similarity double precision, keyword_score double precision, combined_score double precision)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO pg_catalog, public, pg_temp
AS $function$
BEGIN
 IF query_text IS NULL OR candidate_count IS NULL THEN RAISE EXCEPTION 'Invalid retrieval bounds' USING ERRCODE='22023'; END IF;
 PERFORM private.validate_retrieval_request(query_embedding,match_threshold,match_count,query_text,filter_files,candidate_count,profile_embedding);
    RETURN QUERY
    WITH vector_candidates AS (
        SELECT 
            ak.id,
            ak.content,
            ak.metadata,
            ak.embedding,
            ak.content_tsvector,
            (1 - (ak.embedding <=> query_embedding))::double precision as similarity
        FROM public.agent_knowledge ak
        WHERE (filter_files IS NULL OR (ak.metadata->>'source') = ANY(filter_files))
          AND (1 - (ak.embedding <=> query_embedding)) > (match_threshold - 0.1) 
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

REVOKE ALL ON FUNCTION public.intelligent_search(query_embedding public.vector, query_text text, profile_embedding public.vector, match_threshold double precision, match_count integer, filter_files text[], candidate_count integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.intelligent_search(query_embedding public.vector, query_text text, profile_embedding public.vector, match_threshold double precision, match_count integer, filter_files text[], candidate_count integer) TO service_role;

CREATE OR REPLACE FUNCTION public.update_content_tsvector()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO pg_catalog, public, pg_temp
AS $function$
BEGIN
    NEW.content_tsvector = to_tsvector('english', NEW.content);
    RETURN NEW;
END;
$function$
;

NOTIFY pgrst,'reload schema';

COMMIT;
