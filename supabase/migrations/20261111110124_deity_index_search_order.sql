-- Preserve grounding and permissions; expose the distance operator to the HNSW planner.
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
        ORDER BY idx.embedding <=> query_embedding ASC
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

