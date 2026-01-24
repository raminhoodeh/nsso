-- Increase timeout for this session to allow index build to complete
SET statement_timeout = 0;
-- Increase memory for index creation (needed > 35MB, setting to 64MB)
SET maintenance_work_mem = '64MB';

-- DROPPING HNSW attempt if it partially exists
DROP INDEX IF EXISTS agent_knowledge_embedding_idx;

-- Add IVFFlat index to agent_knowledge
-- This builds much faster than HNSW, avoiding the HTTP timeout.
-- 'lists' determines the number of clusters. 100 is a good default for < 100k rows.

CREATE INDEX IF NOT EXISTS agent_knowledge_embedding_idx 
ON agent_knowledge 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
