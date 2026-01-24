-- Add embedding column to user profiles for "Intelligent Retrieval" functionality
-- This allows us to store a vector representation of the user's background/context.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'embedding') THEN
        ALTER TABLE profiles ADD COLUMN embedding vector(768);
    END IF;
END $$;

-- Create the intelligent_search function
-- This function performs a "Soft-Filter" and "Semantic Re-Ranking" search.
-- 1. Candidate Generation: Finds broad matches based on the user's query.
-- 2. Re-Ranking: Adjusts scores based on similarity to the user's profile/context.

CREATE OR REPLACE FUNCTION intelligent_search(
    query_embedding vector(768),
    query_text text,
    profile_embedding vector(768) DEFAULT NULL, -- Optional user context vector
    match_threshold float DEFAULT 0.5,
    match_count int DEFAULT 8,
    filter_files text[] DEFAULT NULL,
    candidate_count int DEFAULT 40 -- Number of candidates to consider for re-ranking
) RETURNS TABLE (
    id uuid,
    content text,
    metadata jsonb,
    similarity double precision,
    profile_similarity double precision,
    keyword_score double precision,
    combined_score double precision
) 
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    RETURN QUERY
    WITH vector_candidates AS (
        -- Step 1: Broad Candidate Generation using Query Embedding
        -- We fetch more than we need (candidate_count) to have a pool for re-ranking
        SELECT 
            ak.id,
            ak.content,
            ak.metadata,
            ak.embedding,
            ak.content_tsvector,
            (1 - (ak.embedding <=> query_embedding))::double precision as similarity
        FROM agent_knowledge ak
        WHERE (filter_files IS NULL OR (ak.metadata->>'source') = ANY(filter_files))
          -- Lower threshold for candidates to ensure we don't filter out potentially relevant but "distant" matches
          AND (1 - (ak.embedding <=> query_embedding)) > (match_threshold - 0.1) 
        ORDER BY similarity DESC
        LIMIT candidate_count
    ),
    keyword_scores AS (
        -- Step 2: Calculate Keyword Scores for Candidates
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
        -- Calculate Profile Similarity (if profile_embedding is provided)
        CASE 
            WHEN profile_embedding IS NOT NULL THEN (1 - (vc.embedding <=> profile_embedding))::double precision
            ELSE 0::double precision
        END as profile_similarity,
        COALESCE(ks.kw_score, 0.0)::double precision as keyword_score,
        -- Calculate Final Weighted Score
        -- Formula:
        -- If Profile Exists: 60% Query Sim + 20% Profile Sim + 20% Keyword
        -- If No Profile: 70% Query Sim + 30% Keyword
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
        -- Final filter ensures reasonable relevance
        vc.similarity > (match_threshold - 0.05)
    ORDER BY combined_score DESC
    LIMIT match_count;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION intelligent_search(vector(768), text, vector(768), float, int, text[], int) TO authenticated;
GRANT EXECUTE ON FUNCTION intelligent_search(vector(768), text, vector(768), float, int, text[], int) TO anon;
