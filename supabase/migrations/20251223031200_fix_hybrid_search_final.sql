-- Drop the old function first to ensure clean recreation
DROP FUNCTION IF EXISTS hybrid_search(vector(768), text, float, int, text[]);

-- Recreate with correct double precision types
CREATE OR REPLACE FUNCTION hybrid_search(
    query_embedding vector(768),
    query_text text,
    match_threshold float,
    match_count int,
    filter_files text[] default null
) RETURNS TABLE (
    id uuid,
    content text,
    metadata jsonb,
    similarity double precision,
    keyword_score double precision,
    combined_score double precision
) 
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    RETURN QUERY
    WITH vector_results AS (
        SELECT 
            ak.id,
            ak.content,
            ak.metadata,
            (1 - (ak.embedding <=> query_embedding))::double precision as similarity
        FROM agent_knowledge ak
        WHERE (filter_files IS NULL OR (ak.metadata->>'source') = ANY(filter_files))
    ),
    keyword_results AS (
        SELECT 
            ak.id,
            ts_rank(ak.content_tsvector, plainto_tsquery('english', query_text))::double precision as keyword_score
        FROM agent_knowledge ak
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
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION hybrid_search(vector(768), text, float, int, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION hybrid_search(vector(768), text, float, int, text[]) TO anon;
