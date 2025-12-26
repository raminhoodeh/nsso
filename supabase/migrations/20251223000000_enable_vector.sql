-- Enable the vector extension
create extension if not exists vector;

-- Create the table for storing agent context
create table if not exists agent_knowledge (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  metadata jsonb,
  embedding vector(768) -- using 768 dimensions for Gemini embeddings (or likely 768 for text-embedding-004)
);

-- Create a function to search for matching documents
create or replace function match_documents (
  query_embedding vector(768),
  match_threshold float,
  match_count int
) returns table (
  id uuid,
  content text,
  metadata jsonb,
  similarity float
) language plpgsql stable as $$
begin
  return query
  select
    agent_knowledge.id,
    agent_knowledge.content,
    agent_knowledge.metadata,
    1 - (agent_knowledge.embedding <=> query_embedding) as similarity
  from agent_knowledge
  where 1 - (agent_knowledge.embedding <=> query_embedding) > match_threshold
  order by agent_knowledge.embedding <=> query_embedding
  limit match_count;
end;
$$;
