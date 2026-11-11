-- Use exact search for small sources and bounded indexed search for large scopes.
-- Empty sources return without scanning the vector graph. Relevance is applied after ranking.
CREATE INDEX IF NOT EXISTS agent_knowledge_source_idx ON public.agent_knowledge ((metadata->>'source'));
CREATE OR REPLACE FUNCTION public.intelligent_search_openai_v1(query_embedding public.vector, query_text text, profile_embedding public.vector DEFAULT NULL::public.vector, match_threshold double precision DEFAULT 0.5, match_count integer DEFAULT 8, filter_files text[] DEFAULT NULL::text[], candidate_count integer DEFAULT 40)
 RETURNS TABLE(id uuid, content text, metadata jsonb, similarity double precision, profile_similarity double precision, keyword_score double precision, combined_score double precision)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO pg_catalog, public, pg_temp
AS $function$
DECLARE eligible_count integer; small_scope boolean := false;
BEGIN
 IF query_text IS NULL OR query_embedding IS NULL OR candidate_count IS NULL OR match_count IS NULL OR match_threshold IS NULL THEN RAISE EXCEPTION 'Invalid retrieval bounds' USING ERRCODE='22023'; END IF;
 IF public.vector_dims(query_embedding) <> 1536 OR (profile_embedding IS NOT NULL AND public.vector_dims(profile_embedding)<>1536)
 OR length(query_text)>4000 OR match_count NOT BETWEEN 1 AND 20 OR candidate_count NOT BETWEEN 1 AND 100
 OR match_threshold<0 OR match_threshold>1 OR (filter_files IS NOT NULL AND cardinality(filter_files)>30)
 THEN RAISE EXCEPTION 'Invalid retrieval bounds' USING ERRCODE='22023'; END IF;
    IF filter_files IS NOT NULL THEN
        SELECT count(*) INTO eligible_count FROM (
            SELECT 1 FROM public.agent_knowledge scoped WHERE (scoped.metadata->>'source') = ANY(filter_files) LIMIT 2049
        ) eligible;
        IF eligible_count = 0 THEN RETURN; END IF;
        small_scope := eligible_count <= 2048;
    END IF;
    PERFORM query_embedding <=> query_embedding;
    PERFORM set_config('hnsw.ef_search', '100', true);
    PERFORM set_config('hnsw.iterative_scan', 'strict_order', true);
    RETURN QUERY
    WITH eligible_ids AS MATERIALIZED (
        SELECT ak.id FROM public.agent_knowledge ak
        WHERE small_scope AND (ak.metadata->>'source') = ANY(filter_files)
    ), indexed_candidates AS MATERIALIZED (
        (
        SELECT idx.id, idx.embedding,
            (1 - (idx.embedding <=> query_embedding))::double precision AS similarity
        FROM public.agent_knowledge_openai_v1 idx
        WHERE NOT small_scope AND (SELECT ak.id FROM public.agent_knowledge ak
            WHERE ak.id=idx.id
              AND idx.content_hash=md5(ak.content || coalesce(ak.metadata::text,''))
              AND (filter_files IS NULL OR (ak.metadata->>'source') = ANY(filter_files))
            LIMIT 1) IS NOT NULL
        ORDER BY idx.embedding <=> query_embedding ASC
        LIMIT candidate_count)
        UNION ALL
        (SELECT idx.id, idx.embedding,
            (1 - (idx.embedding <=> query_embedding))::double precision AS similarity
        FROM eligible_ids eligible
        JOIN public.agent_knowledge_openai_v1 idx ON idx.id=eligible.id
        JOIN public.agent_knowledge ak ON ak.id=idx.id
        WHERE small_scope AND idx.content_hash=md5(ak.content || coalesce(ak.metadata::text,''))
        ORDER BY similarity DESC
        LIMIT candidate_count)
    ), vector_candidates AS (
        SELECT
            ak.id,
            ak.content,
            ak.metadata,
            idx.embedding as embedding,
            ak.content_tsvector,
            (1 - (idx.embedding <=> query_embedding))::double precision as similarity
        FROM indexed_candidates idx
        JOIN public.agent_knowledge ak ON ak.id=idx.id
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

