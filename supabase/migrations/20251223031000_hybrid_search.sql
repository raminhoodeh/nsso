-- Add BM25 full-text search alongside vector search for hybrid RAG
-- This improves retrieval quality by combining semantic (vector) and keyword (BM25) matching

-- Add tsvector column for full-text search
ALTER TABLE agent_knowledge ADD COLUMN IF NOT EXISTS content_tsvector tsvector;

-- Create GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS agent_knowledge_fts_idx ON agent_knowledge USING gin(content_tsvector);

-- Function to auto-update tsvector on insert/update
CREATE OR REPLACE FUNCTION update_content_tsvector()
RETURNS TRIGGER AS $$
BEGIN
    NEW.content_tsvector = to_tsvector('english', NEW.content);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to keep tsvector in sync
DROP TRIGGER IF EXISTS agent_knowledge_tsvector_update ON agent_knowledge;
CREATE TRIGGER agent_knowledge_tsvector_update
BEFORE INSERT OR UPDATE ON agent_knowledge
FOR EACH ROW EXECUTE FUNCTION update_content_tsvector();

-- Backfill existing records
UPDATE agent_knowledge SET content_tsvector = to_tsvector('english', content) WHERE content_tsvector IS NULL;

-- Hybrid search function that combines vector similarity + keyword matching
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
    similarity float,
    keyword_score float,
    combined_score float
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
            1 - (ak.embedding <=> query_embedding) as similarity
        FROM agent_knowledge ak
        WHERE (filter_files IS NULL OR (ak.metadata->>'source') = ANY(filter_files))
    ),
    keyword_results AS (
        SELECT 
            ak.id,
            ts_rank(ak.content_tsvector, plainto_tsquery('english', query_text)) as keyword_score
        FROM agent_knowledge ak
        WHERE (filter_files IS NULL OR (ak.metadata->>'source') = ANY(filter_files))
          AND ak.content_tsvector @@ plainto_tsquery('english', query_text)
    )
    SELECT 
        vr.id,
        vr.content,
        vr.metadata,
        vr.similarity,
        COALESCE(kr.keyword_score, 0) as keyword_score,
        -- Weighted combination: 70% semantic, 30% keyword
        (vr.similarity * 0.7 + COALESCE(kr.keyword_score, 0) * 0.3) as combined_score
    FROM vector_results vr
    LEFT JOIN keyword_results kr ON vr.id = kr.id
    WHERE vr.similarity > match_threshold
    ORDER BY combined_score DESC
    LIMIT match_count;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION hybrid_search(vector(768), text, float, int, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION hybrid_search(vector(768), text, float, int, text[]) TO anon;
